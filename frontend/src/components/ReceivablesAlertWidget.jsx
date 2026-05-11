import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency } from "@/lib/api";

// 3 reminder slots throughout the day (local time).
const ALERT_SLOTS = ["10:00", "15:00", "18:30"];

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Notifications widget:
 *  1) Triggers an in-app modal popup at 10:00 / 15:00 / 18:30 listing pending
 *     installments (only when there is actually something pending — completed
 *     or paid items don't trigger).
 *  2) Renders a small "🔔 Enable notifications" floating button that subscribes
 *     the current device to Web Push. Only owner / gerente are pushed when a
 *     vehicle is marked sold, but anyone with receivables access can subscribe.
 */
export default function ReceivablesAlertWidget({ t, role, onGoToReceivables }) {
  const [popup, setPopup] = useState(null); // { overdue_list, today_list, week_list }
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "default");
  const [subscribed, setSubscribed] = useState(false);
  const lastSlotKeyRef = useRef(null);

  // === (1) In-app reminder loop =============================================
  useEffect(() => {
    let alive = true;

    const check = async () => {
      if (!alive) return;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const hhmm = `${hh}:${mm}`;
      if (!ALERT_SLOTS.includes(hhmm)) return;

      const today = now.toISOString().slice(0, 10);
      const key = `rec-alert-${today}-${hhmm}`;
      if (lastSlotKeyRef.current === key) return;
      if (localStorage.getItem(key)) return;

      try {
        const r = await api.get("/receivables/summary");
        const s = r.data || {};
        // Only show when there is something actually pending.
        const total = (s.overdue_list?.length || 0) + (s.today_list?.length || 0) + (s.week_list?.length || 0);
        if (total > 0) {
          setPopup(s);
        }
        localStorage.setItem(key, "1");
        lastSlotKeyRef.current = key;
      } catch {/* silent */}
    };

    // Run once immediately (lets the user open the app at 10:05 and still see
    // today's alert if they hadn't been online at exactly 10:00).
    const catchUp = async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      // Find the most recent slot earlier than now we haven't shown yet
      for (let i = ALERT_SLOTS.length - 1; i >= 0; i--) {
        const slot = ALERT_SLOTS[i];
        const [sh, sm] = slot.split(":").map(Number);
        const slotDate = new Date(now);
        slotDate.setHours(sh, sm, 0, 0);
        if (slotDate <= now) {
          const key = `rec-alert-${today}-${slot}`;
          if (!localStorage.getItem(key)) {
            try {
              const r = await api.get("/receivables/summary");
              const s = r.data || {};
              const total = (s.overdue_list?.length || 0) + (s.today_list?.length || 0) + (s.week_list?.length || 0);
              if (total > 0) {
                if (!alive) return;
                setPopup(s);
              }
              localStorage.setItem(key, "1");
            } catch {/* silent */}
          }
          break;
        }
      }
    };
    catchUp();

    const id = setInterval(check, 30 * 1000); // every 30s
    return () => { alive = false; clearInterval(id); };
  }, []);

  // === (2) Push subscription ================================================
  // Check if the current device already has an active subscription
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let alive = true;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (alive) setSubscribed(!!sub);
      } catch {/* silent */}
    })();
    return () => { alive = false; };
  }, []);

  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error(t("push_not_supported"));
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error(t("push_permission_denied"));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Grab the VAPID public key from the backend
      const keyRes = await api.get("/push/vapid-public-key");
      const publicKey = keyRes.data.public_key;
      if (!publicKey) {
        toast.error(t("push_not_supported"));
        return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const subJson = sub.toJSON();
      await api.post("/push/subscribe", {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        expirationTime: subJson.expirationTime || null,
      });
      setSubscribed(true);
      toast.success(t("push_enabled"));
    } catch (e) {
      console.error("[push] enable failed", e);
      toast.error(t("error_generic"));
    }
  };

  const disablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try { await api.post("/push/unsubscribe", { endpoint: sub.endpoint }); } catch {/* silent */}
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success(t("push_disabled"));
    } catch (e) {
      console.error("[push] disable failed", e);
    }
  };

  // Owners + managers see the toggle (they receive the sold-car push).
  const canSubscribe = role === "owner" || role === "gerente";
  const supported = typeof Notification !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  return (
    <>
      {/* In-app reminder popup */}
      {popup && (
        <ReminderPopup popup={popup} t={t} onClose={() => setPopup(null)} onGoTo={() => { setPopup(null); onGoToReceivables?.(); }} />
      )}

      {/* Push-toggle button — discreet, top right */}
      {canSubscribe && supported && (
        <button
          data-testid="push-toggle"
          onClick={subscribed ? disablePush : enablePush}
          title={subscribed ? t("push_disable_hint") : t("push_enable_hint")}
          className={`fixed top-4 right-4 z-30 w-10 h-10 border flex items-center justify-center transition-colors ${
            subscribed
              ? "border-success/40 text-success bg-success/10 hover:bg-success hover:text-white"
              : permission === "denied"
              ? "border-warning/40 text-warning bg-warning/10"
              : "border-border text-text-secondary bg-background hover:border-primary hover:text-primary"
          }`}
        >
          {subscribed ? <Bell size={16} /> : <BellOff size={16} />}
        </button>
      )}
    </>
  );
}

function formatDate(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function ReminderPopup({ popup, t, onClose, onGoTo }) {
  const groups = [
    { key: "overdue_list", label: t("rec_overdue"), accent: "text-primary border-primary" },
    { key: "today_list", label: t("rec_due_today"), accent: "text-warning border-warning" },
    { key: "week_list", label: t("rec_due_week"), accent: "text-info border-info" },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center px-4">
      <div className="bg-background border border-primary w-full max-w-lg max-h-[80vh] overflow-auto" data-testid="rec-alert-popup">
        <div className="bg-primary/10 border-b border-primary px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-primary animate-pulse" />
            <h2 className="font-display font-black text-lg uppercase tracking-tight">{t("rec_reminder_title")}</h2>
          </div>
          <button type="button" data-testid="rec-alert-close" onClick={onClose}>
            <X size={18} className="text-text-secondary hover:text-primary" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {groups.map((g) => {
            const list = popup[g.key] || [];
            if (list.length === 0) return null;
            const total = list.reduce((s, it) => s + (it.amount || 0), 0);
            return (
              <div key={g.key} className={`border-l-4 ${g.accent} pl-3`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`label-eyebrow ${g.accent.split(" ")[0]}`}>{g.label} ({list.length})</span>
                  <span className="font-display font-bold text-sm">{formatCurrency(total)}</span>
                </div>
                <ul className="space-y-1">
                  {list.slice(0, 8).map((it, i) => (
                    <li key={i} className="text-xs text-text-secondary flex justify-between gap-2">
                      <span className="truncate">{it.customer_name} · {formatDate(it.due_date)}</span>
                      <span className="font-mono font-bold text-white shrink-0">{formatCurrency(it.amount)}</span>
                    </li>
                  ))}
                  {list.length > 8 && (
                    <li className="text-[10px] text-text-secondary italic">+{list.length - 8} {t("rec_more")}</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border p-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-border hover:border-primary text-[11px] font-display font-bold uppercase tracking-widest transition-colors">{t("rec_alert_dismiss")}</button>
          <button data-testid="rec-alert-open" onClick={onGoTo} className="bg-primary hover:bg-primary-hover text-white px-4 py-2 text-[11px] font-display font-bold uppercase tracking-widest transition-colors">{t("rec_alert_open")}</button>
        </div>
      </div>
    </div>
  );
}
