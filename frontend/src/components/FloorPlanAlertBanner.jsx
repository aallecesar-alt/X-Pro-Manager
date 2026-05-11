import { AlertTriangle, Calendar } from "lucide-react";

/**
 * Floor Plan alert banner — shows pending Floor Plan payments grouped by
 * "Vencidas / Vencem Hoje / Vence Amanhã". Owner-only view.
 *
 * Props:
 *  - alerts: { overdue: [], today: [], tomorrow: [], total: 0 }
 *  - t: i18n translation function
 *  - onGoTo: optional callback (when shown inside Overview as a CTA)
 *  - compact: if true, hides the CTA and uses tighter spacing (for the
 *             Financial page where the user is already in the right area).
 */
export default function FloorPlanAlertBanner({ alerts, onGoTo, t, compact = false }) {
  if (!alerts || !alerts.total) return null;

  const formatBRL = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalAmount =
    [...(alerts.overdue || []), ...(alerts.today || []), ...(alerts.tomorrow || [])]
      .reduce((s, p) => s + (p.amount || 0), 0);

  const buckets = [
    { id: "overdue", label: t("fp_alerts_overdue"), items: alerts.overdue || [], cls: "border-primary text-primary bg-primary/15", icon: AlertTriangle },
    { id: "today", label: t("fp_alerts_today"), items: alerts.today || [], cls: "border-warning text-warning bg-warning/15", icon: Calendar },
    { id: "tomorrow", label: t("fp_alerts_tomorrow"), items: alerts.tomorrow || [], cls: "border-amber-500 text-amber-400 bg-amber-500/10", icon: Calendar },
  ].filter(b => b.items.length > 0);

  return (
    <div data-testid="fp-alert-banner" className={`border border-primary bg-primary/5 ${compact ? "mb-6" : "mb-8"}`}>
      <div className="px-4 py-3 border-b border-primary/30 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center shrink-0 ${(alerts.overdue || []).length > 0 ? "animate-pulse" : ""}`}>
            <AlertTriangle size={20} className="text-primary" />
          </div>
          <div>
            <p className="font-display font-black uppercase tracking-tight text-primary">
              {alerts.total} {t("fp_alerts_pending_total")}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">{t("fp_alerts_hint")} · Total {formatBRL(totalAmount)}</p>
          </div>
        </div>
        {!compact && onGoTo && (
          <button
            type="button"
            data-testid="fp-alert-go"
            onClick={onGoTo}
            className="px-4 py-2 text-[11px] font-display font-bold uppercase tracking-widest border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
          >
            {t("fp_alerts_go")}
          </button>
        )}
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {buckets.map(b => {
          const Icon = b.icon;
          const sum = b.items.reduce((s, p) => s + (p.amount || 0), 0);
          return (
            <div key={b.id} className={`border ${b.cls} p-3`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} />
                <p className="label-eyebrow">{b.label}</p>
                <span className="ml-auto font-display font-black text-lg">{b.items.length}</span>
              </div>
              <p className="font-display font-bold mb-2">{formatBRL(sum)}</p>
              <ul className="space-y-1">
                {b.items.slice(0, 4).map((p, i) => (
                  <li key={i} className="text-[11px] text-text-secondary truncate">
                    {p.bank} · {p.vehicle_label || "—"} · {formatBRL(p.amount)}
                  </li>
                ))}
                {b.items.length > 4 && (
                  <li className="text-[10px] text-text-secondary italic">+ {b.items.length - 4}</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
