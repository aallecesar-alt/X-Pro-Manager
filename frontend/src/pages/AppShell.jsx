import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Car, LayoutDashboard, Package, TrendingUp, TrendingDown, Truck, Users, Settings, LogOut, Plus, Search, Edit2, Trash2, X, Check, Copy, RefreshCw, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, FileText, Paperclip, Upload, Download, Image as ImageIcon, File as FileIcon, CheckCircle2, Clock, DollarSign, LayoutGrid, List, Trophy, Medal, Sparkles, Calendar, Headphones, UserPlus, AlertTriangle, Crown, Wrench, ShieldCheck, History, Key, ListChecks, HandCoins, Printer, Flame, Timer, Activity, Star, ArrowUpRight, ArrowDownRight, Award, BarChart3, Gem, Hourglass, ClipboardList, Gauge } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, PUBLIC_API_BASE } from "@/lib/api";
import VehicleScheduleModal from "@/components/VehicleScheduleModal";
import InlineSchedule from "@/components/InlineSchedule";
import DealershipProfileSection from "@/components/DealershipProfileSection";
import { useAuth } from "@/context/AuthContext";
import { useI18n, LANG_OPTIONS } from "@/lib/i18n.jsx";
import PhotoUploader from "@/components/PhotoUploader";
import ExpenseManager from "@/components/ExpenseManager";
import Financial from "@/pages/Financial";
import LeadsPage from "@/pages/LeadsPage";
import PostSales from "@/pages/PostSales";
import CreditApplications from "@/pages/CreditApplications";
import Receivables from "@/pages/Receivables";
import ReceivablesAlertWidget from "@/components/ReceivablesAlertWidget";
import { Menu as MenuIcon } from "lucide-react";
import VehicleHistoryModal from "@/components/VehicleHistoryModal";
import ChatWidget from "@/components/ChatWidget";
import InstallPrompt from "@/components/InstallPrompt";
import NameWithAvatar, { useTeamPhotos } from "@/components/NameWithAvatar";
import ImportInventoryPageModal from "@/components/ImportInventoryPageModal";
import Avatar from "@/components/Avatar";
import { uploadProfilePhoto } from "@/lib/uploadPhoto";

const STATUS_COLUMNS = [
  { id: "in_stock", color: "border-blue-500" },
  { id: "reserved", color: "border-warning" },
  { id: "sold", color: "border-success" },
];

export default function AppShell() {
  const { t, lang, setLang } = useI18n();
  const { user, dealership, logout, refreshDealership, refreshUser } = useAuth();
  const isSalesperson = user?.role === "salesperson";
  const isBdc = user?.role === "bdc";
  const isOwner = user?.role === "owner";
  const isManager = user?.role === "gerente";
  const isStaff = isOwner || isManager;

  // Apply per-dealership theme (e.g. X-Pro Motors gets a light "showroom" theme).
  // Detection: dealership.theme = "xpro" OR name contains "x-pro" / "xpro".
  useEffect(() => {
    const root = document.documentElement;
    const explicit = (dealership?.theme || "").toLowerCase();
    const byName = (dealership?.name || "").toLowerCase().replace(/[-_\s]/g, "");
    const useXpro = explicit === "xpro" || byName.includes("xpromotors");
    if (useXpro) {
      root.setAttribute("data-theme", "xpro");
    } else {
      root.removeAttribute("data-theme");
    }
    return () => root.removeAttribute("data-theme");
  }, [dealership?.theme, dealership?.name]);
  const [tab, setTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer state
  // Desktop: when the user collapses the sidebar it shows only icons. Hover
  // expands it back temporarily. Persisted in localStorage so the choice sticks
  // across reloads.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "1"; } catch { return false; }
  });
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarExpanded = !sidebarCollapsed || sidebarHovered; // visual expanded state on desktop
  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [salespeople, setSalespeople] = useState([]);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [historyVid, setHistoryVid] = useState(null);
  const [importPageOpen, setImportPageOpen] = useState(false);
  const [fpAlerts, setFpAlerts] = useState({ overdue: [], today: [], tomorrow: [], total: 0 });
  const [recAlerts, setRecAlerts] = useState({ alert_count: 0, total_remaining: 0 });
  const [team, setTeam] = useState([]);  // members list for delivery-schedule assignees
  const [scheduleAlertCount, setScheduleAlertCount] = useState(0);

  // Auto-load Floor Plan alerts for owner+gerente every 5 minutes
  useEffect(() => {
    if (!isStaff) return;
    let alive = true;
    const fetchAlerts = async () => {
      try {
        const r = await api.get("/floor-plans/alerts");
        if (alive) setFpAlerts(r.data || { overdue: [], today: [], tomorrow: [], total: 0 });
      } catch {/* silent */}
    };
    fetchAlerts();
    const id = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [isStaff]);

  // Auto-load Receivables summary (overdue + due today badge) every 5 minutes
  // Also refetch when switching to overview/receivables tab so the user always
  // sees fresh numbers right after creating/paying installments.
  useEffect(() => {
    let alive = true;
    const userPerms = user?.permissions || [];
    const canAccessRec = isOwner || userPerms.includes("receivables");
    if (!canAccessRec) return;
    const fetchRec = async () => {
      try {
        const r = await api.get("/receivables/summary");
        if (alive) setRecAlerts(r.data || { alert_count: 0, total_remaining: 0 });
      } catch {/* silent */}
    };
    fetchRec();
    const id = setInterval(fetchRec, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [isOwner, user, tab]);

  const userPerms = user?.permissions || [];
  const canAccess = (tabId) => isOwner || userPerms.includes(tabId);
  const stuckCount = isStaff ? (deliveries || []).filter(v => v.stuck_alert).length : 0;
  const allTabs = [
    { id: "overview", label: t("dashboard"), icon: LayoutDashboard },
    { id: "inventory", label: t("inventory"), icon: Package },
    { id: "pipeline", label: t("pipeline"), icon: TrendingUp },
    { id: "delivery", label: t("delivery"), icon: Truck },
    { id: "leads", label: t("leads_title"), icon: Headphones },
    { id: "salespeople", label: t("salespeople"), icon: Users },
    { id: "financial", label: t("financial"), icon: DollarSign },
    { id: "post_sales", label: t("post_sales_tab"), icon: ShieldCheck },
    { id: "applications", label: t("applications_tab"), icon: FileText },
    { id: "receivables", label: t("receivables_tab"), icon: HandCoins },
    { id: "settings", label: t("settings"), icon: Settings, ownerOnly: true },
  ];
  const tabs = allTabs.filter(tb => tb.ownerOnly ? isOwner : canAccess(tb.id));

  // Auto-pick a valid initial tab once we know what the user can access
  useEffect(() => {
    if (!user) return;
    const tabIds = tabs.map(tb => tb.id);
    if (tabIds.length && !tabIds.includes(tab)) setTab(tabIds[0]);
    // eslint-disable-next-line
  }, [user, userPerms.join(",")]);

  const reload = async () => {
    try {
      // Build requests dynamically based on what user can access
      const calls = [];
      const labels = [];
      if (canAccess("overview")) { calls.push(api.get("/stats")); labels.push("stats"); }
      if (canAccess("inventory")) { calls.push(api.get("/vehicles", { params: { search: search || undefined } })); labels.push("vehicles"); }
      if (canAccess("delivery")) { calls.push(api.get("/delivery")); labels.push("deliveries"); }
      // Salespeople list is needed for leads form too
      if (canAccess("salespeople") || canAccess("leads")) { calls.push(api.get("/salespeople")); labels.push("salespeople"); }
      // Team members (for delivery-schedule assignees) — anyone with delivery_schedule perm
      if (canAccess("delivery") || canAccess("delivery_schedule") || isOwner) { calls.push(api.get("/team").catch(() => ({ data: { members: [] } }))); labels.push("team"); }
      // Schedule alerts badge (for staff + yard/salesperson with delivery_schedule perm)
      if (canAccess("delivery") || isOwner) { calls.push(api.get("/delivery-schedules/alerts").catch(() => ({ data: { count: 0 } }))); labels.push("scheduleAlerts"); }
      const results = await Promise.allSettled(calls);
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (labels[i] === "stats") setStats(r.value.data);
          else if (labels[i] === "vehicles") setVehicles(r.value.data);
          else if (labels[i] === "deliveries") setDeliveries(r.value.data);
          else if (labels[i] === "salespeople") setSalespeople(r.value.data);
          else if (labels[i] === "team") setTeam(r.value.data?.members || []);
          else if (labels[i] === "scheduleAlerts") setScheduleAlertCount(r.value.data?.count || 0);
        }
      });
    } catch { toast.error(t("error_generic")); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [search]);

  const onDelete = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/vehicles/${id}`); toast.success(t("saved")); reload(); }
    catch { toast.error(t("error_generic")); }
  };

  const updateStatus = async (id, status, extra = {}) => {
    try {
      await api.put(`/vehicles/${id}`, { status, ...extra });
      toast.success(t("saved"));
      reload();
    } catch { toast.error(t("error_generic")); }
  };

  return (
    <div data-testid="app-shell" className="min-h-screen text-white flex">
      {/* Mobile top bar — hidden on desktop */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-background/95 backdrop-blur-sm border-b border-border z-30 flex items-center justify-between px-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src={dealership?.logo_url || "/intercar-logo.png"} alt="" className="w-8 h-8 object-contain" />
          <p className="font-display font-black uppercase text-sm truncate">{dealership?.name || "Intercar"}</p>
        </div>
        <button
          data-testid="mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          className="p-2 border border-border hover:border-primary"
          aria-label="Menu"
        >
          <MenuIcon size={20} />
        </button>
      </div>

      {/* Mobile backdrop when sidebar is open */}
      {sidebarOpen && (
        <div
          data-testid="mobile-backdrop"
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        data-testid="sidebar"
        onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={`group/sidebar border-r border-border min-h-screen flex flex-col bg-background backdrop-blur-sm
          fixed lg:relative inset-y-0 left-0 z-50 transition-[width,transform] duration-200 lg:flex-shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          ${sidebarExpanded ? "w-64" : "w-16"}`}
      >
        {/* Desktop-only collapse toggle (the arrow) */}
        <button
          type="button"
          data-testid="sidebar-collapse-toggle"
          onClick={toggleSidebarCollapse}
          title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          className="hidden lg:flex absolute top-6 -right-3 z-10 w-6 h-6 items-center justify-center bg-background border border-border hover:border-primary hover:text-primary text-text-secondary transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        <div className={`border-b border-border bg-stripes-overlay ${sidebarExpanded ? "p-6" : "p-3"}`}>
          <div className={`flex items-center gap-3 ${sidebarExpanded ? "" : "justify-center"}`}>
            <div className={`relative shrink-0 ${sidebarExpanded ? "w-12 h-12" : "w-10 h-10"}`}>
              <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full" />
              <img
                src={dealership?.logo_url || "/intercar-logo.png"}
                alt={dealership?.name || "Logo"}
                className="relative w-full h-full object-contain drop-shadow-lg"
              />
            </div>
            {sidebarExpanded && (
              <div className="min-w-0">
                <p className="font-display font-black uppercase text-sm truncate tracking-tight">{dealership?.name || "..."}</p>
                <p className="label-eyebrow text-[10px] truncate">{user?.email}</p>
              </div>
            )}
          </div>
        </div>

        {/* Logged-in user profile chip with editable avatar — only when expanded */}
        {sidebarExpanded && <UserProfileChip user={user} t={t} onPhotoChanged={refreshUser} />}

        <nav className={`flex-1 space-y-1 ${sidebarExpanded ? "p-3" : "p-2"}`}>
          {tabs.map((tb) => {
            const showStuckBadge = tb.id === "delivery" && isStaff && stuckCount > 0;
            const showFpBadge = tb.id === "financial" && isStaff && fpAlerts.total > 0;
            const showRecBadge = tb.id === "receivables" && recAlerts.alert_count > 0;
            const badgeCount = showStuckBadge ? stuckCount : showFpBadge ? fpAlerts.total : showRecBadge ? recAlerts.alert_count : 0;
            return (
              <button
                key={tb.id}
                data-testid={`nav-${tb.id}`}
                onClick={() => { setTab(tb.id); setSidebarOpen(false); }}
                title={tb.label}
                className={`w-full flex items-center font-display uppercase tracking-wider font-semibold transition-colors relative ${
                  sidebarExpanded ? "gap-3 px-4 py-3 text-sm" : "justify-center px-2 py-3 text-sm"
                } ${
                  tab === tb.id ? "bg-primary text-white" : "text-text-secondary hover:bg-surface hover:text-white"
                }`}
              >
                <span className="relative shrink-0">
                  <tb.icon size={16} />
                  {/* Mini badge over the icon when collapsed */}
                  {!sidebarExpanded && badgeCount > 0 && (
                    <span
                      data-testid={`nav-${tb.id}-mini-badge`}
                      className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-1 rounded-full bg-primary text-white text-[8px] font-black flex items-center justify-center shadow-[0_0_8px_rgba(217,45,32,0.6)]"
                    >
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </span>
                {sidebarExpanded && <span className="flex-1 text-left whitespace-nowrap overflow-hidden">{tb.label}</span>}
                {sidebarExpanded && showStuckBadge && (
                  <span
                    data-testid="nav-delivery-stuck-badge"
                    className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_10px_rgba(217,45,32,0.6)]"
                    title={`${stuckCount} ${stuckCount === 1 ? "carro" : "carros"}`}
                  >
                    {stuckCount}
                  </span>
                )}
                {sidebarExpanded && showFpBadge && (
                  <span
                    data-testid="nav-financial-fp-badge"
                    className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_10px_rgba(217,45,32,0.6)] animate-pulse"
                    title={`${fpAlerts.total} pagamento(s) Floor Plan`}
                  >
                    {fpAlerts.total}
                  </span>
                )}
                {sidebarExpanded && showRecBadge && (
                  <span
                    data-testid="nav-receivables-badge"
                    className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_10px_rgba(217,45,32,0.6)] animate-pulse"
                    title={`${recAlerts.alert_count} parcela(s) atrasada(s) ou vencendo hoje`}
                  >
                    {recAlerts.alert_count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={`border-t border-border space-y-3 ${sidebarExpanded ? "p-3" : "p-2"}`}>
          {sidebarExpanded && (
            <div className="flex gap-1" data-testid="lang-switcher-shell">
              {LANG_OPTIONS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  data-testid={`shell-lang-${l.code}`}
                  className={`flex-1 h-8 text-[10px] font-display font-bold uppercase border transition-colors ${
                    lang === l.code ? "border-primary text-primary" : "border-border text-text-secondary hover:text-white"
                  }`}
                >
                  {l.flag}
                </button>
              ))}
            </div>
          )}
          <button
            data-testid="logout-btn"
            onClick={logout}
            title={t("sign_out")}
            className={`w-full flex items-center text-xs text-text-secondary hover:text-primary transition-colors ${
              sidebarExpanded ? "gap-2 px-4 py-2" : "justify-center px-2 py-2"
            }`}
          >
            <LogOut size={14} /> {sidebarExpanded && t("sign_out")}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-4 lg:p-8 overflow-auto pt-20 lg:pt-8 min-w-0">
        {tab === "overview" && canAccess("overview") && <Overview stats={stats} dealership={dealership} t={t} isSalesperson={isSalesperson} isBdc={isBdc} fpAlerts={isStaff ? fpAlerts : null} recAlerts={canAccess("receivables") ? recAlerts : null} onGoToFinancial={() => setTab("financial")} onGoToReceivables={() => setTab("receivables")} />}
        {tab === "inventory" && canAccess("inventory") && (
          <Inventory
            vehicles={vehicles} t={t} search={search} setSearch={setSearch} isSalesperson={isSalesperson}
            onAdd={() => setEditing("new")} onImport={() => setImportOpen(true)} onImportPage={isOwner ? () => setImportPageOpen(true) : null}
            onEdit={(v) => setEditing(v)} onDelete={onDelete}
            onHistory={setHistoryVid}
          />
        )}
        {tab === "pipeline" && canAccess("pipeline") && <Pipeline vehicles={vehicles} t={t} onMove={updateStatus} onEdit={(v) => setEditing(v)} onHistory={setHistoryVid} />}
        {tab === "delivery" && canAccess("delivery") && <Delivery deliveries={deliveries} vehicles={vehicles} team={team} currentUser={user} scheduleAlertCount={scheduleAlertCount} salespeople={salespeople} t={t} onReload={reload} isStaff={isStaff} onHistory={setHistoryVid} />}
        {tab === "leads" && canAccess("leads") && <LeadsPage t={t} role={user?.role || "owner"} currentSpId={user?.salesperson_id || ""} salespeople={salespeople} />}
        {tab === "salespeople" && canAccess("salespeople") && <SalespeopleTab salespeople={salespeople} t={t} onReload={reload} isSalesperson={isSalesperson} currentSpId={user?.salesperson_id || ""} />}
        {tab === "financial" && canAccess("financial") && <Financial t={t} fpAlerts={isOwner ? fpAlerts : null} />}
        {tab === "post_sales" && canAccess("post_sales") && <PostSales t={t} />}
        {tab === "applications" && canAccess("applications") && <CreditApplications />}
        {tab === "receivables" && canAccess("receivables") && <Receivables t={t} />}
        {tab === "settings" && isOwner && <SettingsTab dealership={dealership} t={t} onRefresh={refreshDealership} />}

        {editing && (
          <VehicleForm t={t} vehicle={editing === "new" || (editing && editing.__prefill) ? null : editing} prefill={editing && editing.__prefill ? editing : null} salespeople={salespeople} isSalesperson={isSalesperson} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
        )}

        {importOpen && (
          <ImportUrlModal
            t={t}
            onClose={() => setImportOpen(false)}
            onImported={(data) => {
              setImportOpen(false);
              setEditing({ __prefill: true, ...data });
            }}
          />
        )}
      </main>
      {historyVid && <VehicleHistoryModal vehicleId={historyVid} onClose={() => setHistoryVid(null)} />}
      {importPageOpen && <ImportInventoryPageModal t={t} onClose={() => setImportPageOpen(false)} onImported={() => reload()} />}
      <ChatWidget />
      <InstallPrompt />
      <ReceivablesAlertWidget t={t} role={user?.role} onGoToReceivables={() => setTab("receivables")} />
    </div>
  );
}

function UserProfileChip({ user, t, onPhotoChanged }) {
  const [uploading, setUploading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  if (!user) return null;
  const onPick = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { photo_url, photo_public_id } = await uploadProfilePhoto(file);
      await api.put("/me/photo", { photo_url, photo_public_id });
      toast.success(t("saved"));
      onPhotoChanged && onPhotoChanged();
    } catch (err) {
      toast.error(err.message || t("error_generic"));
    } finally { setUploading(false); }
  };
  const roleLabel = user.role === "owner"
    ? t("owner_role")
    : user.role === "bdc"
    ? "BDC"
    : user.role === "gerente"
    ? t("manager")
    : user.role === "geral"
    ? t("general_role")
    : t("salesperson");
  return (
    <div className="px-4 py-3 border-b border-border flex items-center gap-3">
      <label className="relative cursor-pointer group" title={t("change_photo")}>
        <Avatar src={user.photo_url} name={user.full_name || user.email} size="lg" testid="sidebar-avatar" />
        <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? <span className="text-[10px] text-white">...</span> : <Upload size={14} className="text-white" />}
        </div>
        <input data-testid="sidebar-photo-input" type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} disabled={uploading} />
      </label>
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold text-sm truncate">{user.full_name || user.email}</p>
        <p className="text-[10px] uppercase tracking-wider text-text-secondary">{roleLabel}</p>
        <button
          type="button"
          data-testid="open-change-password"
          onClick={() => setPwOpen(true)}
          className="text-[10px] uppercase tracking-wider text-text-secondary hover:text-primary inline-flex items-center gap-1 mt-0.5 transition-colors"
        >
          <Key size={9} /> {t("change_password_link")}
        </button>
      </div>
      {pwOpen && <ChangePasswordModal t={t} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function ChangePasswordModal({ t, onClose }) {
  const [current_password, setCurrent] = useState("");
  const [new_password, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (new_password !== confirm) {
      toast.error(t("change_password_mismatch"));
      return;
    }
    if (new_password.length < 6) {
      toast.error(t("change_password_too_short"));
      return;
    }
    setSaving(true);
    try {
      await api.post("/me/change-password", { current_password, new_password });
      toast.success(t("change_password_success"));
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-start justify-center overflow-auto py-12 px-4" data-testid="change-password-modal">
      <form onSubmit={submit} className="bg-background border border-border w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight inline-flex items-center gap-2">
            <Key size={18} /> {t("change_password_title")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <p className="text-sm text-text-secondary">{t("change_password_intro")}</p>

        <div>
          <label className="label-eyebrow block mb-2">{t("change_password_current")}</label>
          <input
            data-testid="cp-current"
            required
            type={show ? "text" : "password"}
            value={current_password}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("change_password_new")}</label>
          <input
            data-testid="cp-new"
            required
            type={show ? "text" : "password"}
            minLength={6}
            value={new_password}
            onChange={(e) => setNew(e.target.value)}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("change_password_confirm")}</label>
          <input
            data-testid="cp-confirm"
            required
            type={show ? "text" : "password"}
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-text-secondary">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          {t("change_password_show")}
        </label>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="cp-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest text-white transition-colors">{saving ? "..." : t("save")}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}





// FloorPlanAlertBanner moved to /components/FloorPlanAlertBanner.jsx — used inside Financial.jsx.



// ============================================================
// PodiumCard — Top 3 leaderboard winner card with metallic gold/silver/bronze treatment
// ============================================================
function PodiumCard({ rank, row, accent, featured = false, t }) {
  const PRESETS = {
    gold: {
      borderClass: "border-yellow-400/50",
      gradient: "linear-gradient(180deg, rgba(250,204,21,0.18) 0%, rgba(202,138,4,0.05) 70%, rgba(0,0,0,0) 100%)",
      color: "text-yellow-400",
      glow: "shadow-[0_0_40px_-10px_rgba(250,204,21,0.4)]",
      ribbon: t?.("vendedor_do_mes") || "VENDEDOR DO MÊS",
    },
    silver: {
      borderClass: "border-slate-300/40",
      gradient: "linear-gradient(180deg, rgba(203,213,225,0.14) 0%, rgba(100,116,139,0.04) 70%, rgba(0,0,0,0) 100%)",
      color: "text-slate-300",
      glow: "",
      ribbon: "",
    },
    bronze: {
      borderClass: "border-amber-700/40",
      gradient: "linear-gradient(180deg, rgba(180,83,9,0.18) 0%, rgba(120,53,15,0.04) 70%, rgba(0,0,0,0) 100%)",
      color: "text-amber-600",
      glow: "",
      ribbon: "",
    },
  };
  const cfg = PRESETS[accent] || PRESETS.silver;
  const Icon = rank === 1 ? Crown : Medal;

  return (
    <div
      data-testid={`lb-podium-${rank}`}
      className={`relative border ${cfg.borderClass} ${cfg.glow} ${featured ? "py-7 px-3" : "py-5 px-3"} flex flex-col items-center text-center ${featured ? "" : "mt-4"}`}
      style={{ background: cfg.gradient }}
    >
      {/* Ribbon for #1 */}
      {featured && cfg.ribbon && (
        <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 ${cfg.color} text-[9px] tracking-[0.2em] font-display font-black bg-background border ${cfg.borderClass} px-2.5 py-1 whitespace-nowrap`}>
          ★ {cfg.ribbon} ★
        </div>
      )}

      {/* Icon */}
      <Icon size={featured ? 28 : 22} className={`${cfg.color} mb-2`} />

      {/* Avatar */}
      <Avatar
        src={row.photo_url}
        name={row.salesperson_name}
        size={featured ? "xl" : "lg"}
        ring={featured}
      />

      {/* Name */}
      <p className={`mt-2.5 font-display font-bold uppercase ${featured ? "text-sm" : "text-xs"} truncate w-full tracking-wide`}>
        {row.salesperson_name}
      </p>

      {/* Count */}
      <p className={`font-display font-black ${featured ? "text-5xl mt-2" : "text-3xl mt-1.5"} ${cfg.color} leading-none`}>
        {row.count}
      </p>
      <p className="text-[9px] uppercase tracking-[0.2em] text-text-secondary mt-1">
        {(t?.("sales_count") || "Vendas")}
      </p>

      {/* Rank pill at bottom */}
      <div className={`mt-3 inline-flex items-center gap-1 border ${cfg.borderClass} ${cfg.color} text-[9px] font-display font-black tracking-widest px-2 py-0.5`}>
        #{rank}º LUGAR
      </div>
    </div>
  );
}

function Overview({ stats, dealership, t, isSalesperson, isBdc, fpAlerts, recAlerts, onGoToFinancial, onGoToReceivables }) {
  const [leaderboard, setLeaderboard] = useState({ rows: [], total_sold: 0 });
  const [promotion, setPromotion] = useState(null);
  const [editingPromo, setEditingPromo] = useState(false);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api.get("/leaderboard"),
      api.get("/promotion"),
      api.get("/overview-insights").catch(() => ({ data: null })),
    ])
      .then(([lb, pm, ins]) => {
        if (!cancel) {
          setLeaderboard(lb.data);
          setPromotion(pm.data);
          setInsights(ins.data);
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  const reloadPromo = async () => {
    try { const r = await api.get("/promotion"); setPromotion(r.data); } catch { /* noop */ }
  };

  // Show count cards only when we have stats (user has /stats access via inventory permission OR is owner)
  const hasStats = !!stats;
  const cards = hasStats ? [
    { label: t("in_stock"), value: stats.in_stock, icon: Package },
    { label: t("reserved"), value: stats.reserved, icon: Clock },
    { label: t("sold"), value: stats.sold, icon: CheckCircle2 },
  ] : [];

  // Build the last 6 months bucket so the chart always shows 6 bars
  const sourceMonthly = (stats && stats.monthly_sales) || [];
  const monthMap = new Map(sourceMonthly.map(m => [m.month, m]));
  const monthly = [];
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.push(monthMap.get(key) || { month: key, count: 0 });
  }
  const maxBar = Math.max(...monthly.map(m => m.count || 0), 1);
  const totalSixMonths = monthly.reduce((s, m) => s + (m.count || 0), 0);
  const monthLabel = today.toLocaleString(undefined, { month: "long", year: "numeric" });

  // Weekday heatmap (last 90 days) — comes from /overview-insights
  const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const weekdayCounts = insights?.weekday_counts || [0, 0, 0, 0, 0, 0, 0];
  const heatMax = Math.max(...weekdayCounts, 1);
  const heatColor = (n) => {
    if (n <= 0) return "rgba(212, 175, 55, 0.06)";
    const intensity = Math.min(n / heatMax, 1);
    const alpha = 0.15 + intensity * 0.85;
    return `rgba(212, 175, 55, ${alpha.toFixed(2)})`;
  };
  const bestWeekday = weekdayCounts.reduce((acc, v, i) => v > acc.v ? { v, i } : acc, { v: -1, i: 0 });
  const showHeatmap = !!insights;

  return (
    <div data-testid="overview-tab">
      {/* Hero with subtle shield watermark */}
      <div className="mb-6 lg:mb-10 bg-shield-watermark border border-border bg-surface/30 p-5 lg:p-8 relative overflow-hidden" style={{ "--shield-url": `url('${dealership?.logo_url || "/intercar-logo.png"}')` }}>
        <div className="bg-stripes-overlay absolute inset-0 opacity-50" />
        <div className="relative">
          <p className="label-eyebrow text-primary mb-2">{t("dashboard")} · {monthLabel}</p>
          <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl uppercase tracking-tighter mb-2">{t("overview")}</h1>
        </div>
      </div>

      {/* KPI cards (hidden when user has no stats access — e.g. BDC) */}
      {hasStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border border-border mb-10">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} data-testid={`stat-${i}`} className="bg-background p-6 relative overflow-hidden group">
                <Icon size={64} className="absolute -bottom-4 -right-4 text-text-secondary/5 group-hover:text-primary/10 transition-colors" />
                <p className="label-eyebrow mb-3 relative">{c.label}</p>
                <p className="font-display font-black text-3xl text-white relative">{c.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Weekday heatmap REMOVED per user request */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-border border border-border mb-10">
        {/* Leaderboard — professional podium + list */}
        <div className="bg-background p-6 lg:col-span-2 relative overflow-hidden">
          {/* Background flair */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between mb-6 relative">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-primary/10 border border-primary/40 flex items-center justify-center">
                <Trophy size={20} className="text-primary" />
              </div>
              <div>
                <p className="label-eyebrow text-primary">{t("leaderboard_title")}</p>
                <p className="text-[10px] text-text-secondary uppercase tracking-widest mt-0.5">{monthLabel}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display font-black text-3xl">{leaderboard.total_sold}</p>
              <p className="text-[10px] text-text-secondary uppercase tracking-widest">{t("sales_count")}</p>
            </div>
          </div>

          {leaderboard.rows.length === 0 || leaderboard.total_sold === 0 ? (
            <div className="text-center py-14 border border-dashed border-border relative">
              <Trophy size={36} className="mx-auto text-text-secondary/30 mb-3" />
              <p className="text-text-secondary text-sm">{t("leaderboard_empty")}</p>
            </div>
          ) : (
            <div className="relative">
              {/* Podium for top 3 (or 1-2 if less) */}
              {leaderboard.rows.length >= 3 ? (
                <div className="grid grid-cols-3 gap-3 mb-5 items-end">
                  <PodiumCard rank={2} row={leaderboard.rows[1]} accent="silver" t={t} />
                  <PodiumCard rank={1} row={leaderboard.rows[0]} accent="gold" featured t={t} />
                  <PodiumCard rank={3} row={leaderboard.rows[2]} accent="bronze" t={t} />
                </div>
              ) : (
                <div className={`grid ${leaderboard.rows.length === 2 ? "grid-cols-2" : "grid-cols-1 max-w-xs mx-auto"} gap-3 mb-5`}>
                  {leaderboard.rows.slice(0, 2).map((r, i) => (
                    <PodiumCard
                      key={r.salesperson_id || i}
                      rank={r.rank}
                      row={r}
                      accent={r.rank === 1 ? "gold" : "silver"}
                      featured={r.rank === 1}
                      t={t}
                    />
                  ))}
                </div>
              )}

              {/* Rest of leaderboard (ranks 4+) — REMOVED per user request */}
            </div>
          )}
        </div>

        {/* Weekly Promotion — notebook page */}
        <div className="bg-background p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <p className="label-eyebrow text-primary">{t("weekly_promo_title")}</p>
            </div>
            {!isSalesperson && (
              <button
                data-testid="edit-promotion"
                onClick={() => setEditingPromo(true)}
                className="w-7 h-7 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                title={t("edit")}
              >
                <Edit2 size={12} />
              </button>
            )}
          </div>
          {!promotion?.title && !promotion?.description && !promotion?.image_url ? (
            <div data-testid="promo-empty" className="notebook-paper py-12 px-16 min-h-[320px] flex flex-col items-center justify-center text-center">
              <p className="notebook-handwriting text-4xl mb-2 italic" style={{ color: '#9ca3af' }}>
                {t("no_promotion")}
              </p>
              {!isSalesperson && (
                <button
                  data-testid="add-promotion-cta"
                  onClick={() => setEditingPromo(true)}
                  className="notebook-handwriting text-3xl mt-4 underline decoration-2 underline-offset-4 transition-colors hover:opacity-80"
                  style={{ color: '#d92d20' }}
                >
                  {t("create_promotion")} →
                </button>
              )}
            </div>
          ) : (
            <div data-testid="promotion-card" className="notebook-paper py-8 px-16 min-h-[320px]">
              {promotion.image_url && (
                <div className="aspect-video bg-white/30 overflow-hidden mb-4 rotate-[-1.5deg] shadow-md mt-2 mx-2">
                  <img src={promotion.image_url} alt={promotion.title} className="w-full h-full object-cover" />
                </div>
              )}
              {promotion.title && (
                <p className="notebook-handwriting text-6xl font-bold mb-4 leading-none" style={{ color: '#d92d20' }}>
                  {promotion.title}
                </p>
              )}
              {promotion.description && (
                <p className="notebook-handwriting text-4xl whitespace-pre-line" style={{ color: '#1e3a8a' }}>
                  {promotion.description}
                </p>
              )}
              {promotion.valid_until && (
                <p className="notebook-handwriting text-2xl mt-6 inline-flex items-center gap-2" style={{ color: '#dc2626' }}>
                  <Calendar size={18} /> {t("valid_until")}: {promotion.valid_until}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Performance mensal — REDESENHADO (gráfico de área + barras + sparkline) ===== */}
      {hasStats && (
        <div data-testid="monthly-performance" className="border border-border bg-background p-6 lg:p-8 relative overflow-hidden">
          {/* Ambient backdrop */}
          <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-gold/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between mb-6 relative flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-primary/10 border border-primary/40 flex items-center justify-center">
                <BarChart3 size={18} className="text-primary" />
              </div>
              <div>
                <p className="label-eyebrow text-primary">{t("monthly_performance")}</p>
                <p className="text-[10px] text-text-secondary uppercase tracking-widest mt-0.5">Últimos 6 meses</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-widest text-text-secondary">Total no período</p>
                <p className="font-display font-black text-2xl text-white leading-none">{totalSixMonths}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-widest text-text-secondary">Mês atual</p>
                <p className="font-display font-black text-2xl text-primary leading-none">{monthly[monthly.length - 1]?.count || 0}</p>
              </div>
            </div>
          </div>

          {monthly.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">—</p>
          ) : (
            <div className="relative">
              {/* Chart area with horizontal grid lines */}
              <div className="relative h-56 px-1 pt-4 pb-1">
                {/* Y-axis grid lines (4 levels) */}
                <div className="absolute inset-x-0 inset-y-4 flex flex-col justify-between pointer-events-none">
                  {[1, 0.75, 0.5, 0.25, 0].map((level, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-[9px] text-text-secondary/60 font-mono w-6 text-right">
                        {Math.round(maxBar * level)}
                      </span>
                      <div className="flex-1 border-t border-border/40 border-dashed" />
                    </div>
                  ))}
                </div>

                {/* Area path (SVG) behind bars */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${monthly.length * 100} 100`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#D92D20" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#D92D20" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#D4AF37" />
                      <stop offset="100%" stopColor="#F1C950" />
                    </linearGradient>
                  </defs>
                  {(() => {
                    const points = monthly.map((m, i) => {
                      const x = i * 100 + 50;
                      const y = 100 - Math.max(((m.count || 0) / maxBar) * 100, 1);
                      return [x, y];
                    });
                    const pathLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
                    const pathArea = pathLine + ` L${points[points.length - 1][0]},100 L${points[0][0]},100 Z`;
                    return (
                      <>
                        <path d={pathArea} fill="url(#areaGrad)" />
                        <path d={pathLine} fill="none" stroke="url(#lineGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        {points.map((p, i) => (
                          <circle
                            key={i}
                            cx={p[0]}
                            cy={p[1]}
                            r={i === points.length - 1 ? 3 : 2}
                            fill={i === points.length - 1 ? "#F1C950" : "#D4AF37"}
                            stroke="#0A0A0A"
                            strokeWidth="1.2"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </>
                    );
                  })()}
                </svg>

                {/* Bars overlay */}
                <div className="absolute inset-x-0 inset-y-4 flex items-end gap-2 pl-8 pr-1">
                  {monthly.map((m, idx) => {
                    const h = Math.max(((m.count || 0) / maxBar) * 100, 1.5);
                    const isCurrent = idx === monthly.length - 1;
                    const prevCount = idx > 0 ? (monthly[idx - 1].count || 0) : null;
                    const delta = prevCount === null ? null : (m.count || 0) - prevCount;
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center h-full justify-end relative group">
                        {/* Tooltip */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface border border-border px-2 py-1 text-[10px] whitespace-nowrap z-10 pointer-events-none">
                          <p className="font-display font-bold text-white">{m.count || 0} {t("sales_count")?.toLowerCase()}</p>
                          {delta !== null && delta !== 0 && (
                            <p className={`text-[9px] ${delta > 0 ? "text-success" : "text-primary"}`}>
                              {delta > 0 ? "+" : ""}{delta} vs mês ant.
                            </p>
                          )}
                        </div>
                        {/* Bar */}
                        <div
                          className="w-full max-w-[44px] transition-all duration-300 ease-out group-hover:scale-y-105 origin-bottom relative"
                          style={{
                            height: `${h}%`,
                            background: isCurrent
                              ? "linear-gradient(180deg, #F87171 0%, #D92D20 60%, #991B1B 100%)"
                              : "linear-gradient(180deg, rgba(217, 45, 32, 0.4) 0%, rgba(120, 20, 14, 0.35) 100%)",
                            boxShadow: isCurrent ? "0 -2px 24px -4px rgba(217, 45, 32, 0.55)" : "none",
                            borderTop: isCurrent ? "1px solid #F1C950" : "none",
                          }}
                        >
                          {/* Value label */}
                          <span
                            className={`absolute -top-5 left-1/2 -translate-x-1/2 font-display font-black text-xs ${
                              isCurrent ? "text-white" : "text-text-secondary"
                            }`}
                          >
                            {m.count || 0}
                          </span>
                          {/* Top shine */}
                          {isCurrent && (
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* X-axis labels with delta vs previous */}
              <div className="flex gap-2 pl-8 pr-1 mt-2">
                {monthly.map((m, idx) => {
                  const isCurrent = idx === monthly.length - 1;
                  const [yr, mo] = m.month.split("-");
                  const labelDate = new Date(parseInt(yr), parseInt(mo) - 1, 1);
                  const monthName = labelDate.toLocaleString(undefined, { month: "short" }).replace(".", "");
                  return (
                    <div key={m.month} className="flex-1 text-center">
                      <p className={`font-display font-bold text-[10px] uppercase tracking-wider ${isCurrent ? "text-primary" : "text-text-secondary"}`}>
                        {monthName}
                      </p>
                      <p className="font-mono text-[9px] text-text-secondary/60">/{m.month.slice(2, 4)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {editingPromo && !isSalesperson && (
        <PromotionForm
          promotion={promotion}
          t={t}
          onClose={() => setEditingPromo(false)}
          onSaved={() => { setEditingPromo(false); reloadPromo(); }}
        />
      )}
    </div>
  );
}

function PromotionForm({ promotion, t, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: promotion?.title || "",
    description: promotion?.description || "",
    image_url: promotion?.image_url || "",
    valid_until: promotion?.valid_until || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onImage = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error(t("file_too_large")); return; }
    try {
      const sig = (await api.get("/cloudinary/signature", { params: { folder: "promotions/" } })).data;
      const fd = new FormData();
      fd.append("file", file); fd.append("api_key", sig.api_key); fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature); fd.append("folder", sig.folder);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: "POST", body: fd });
      const json = await res.json();
      if (!json.secure_url) throw new Error("upload failed");
      set("image_url", json.secure_url);
      toast.success(t("saved"));
    } catch (err) { toast.error(err.message || t("error_generic")); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/promotion", form);
      toast.success(t("saved"));
      onSaved();
    } catch { toast.error(t("error_generic")); }
    finally { setSaving(false); }
  };

  const clearAll = async () => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.put("/promotion", { title: "", description: "", image_url: "", valid_until: "" });
      toast.success(t("saved"));
      onSaved();
    } catch { toast.error(t("error_generic")); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={submit} className="bg-background border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-eyebrow text-primary mb-1">{t("weekly_promo_title")}</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">{promotion?.title ? t("edit") : t("create_promotion")}</h2>
          </div>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("promo_image")}</label>
          {form.image_url ? (
            <div className="relative aspect-video bg-surface overflow-hidden border border-border">
              <img src={form.image_url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => set("image_url", "")}
                className="absolute top-2 right-2 w-8 h-8 bg-black/70 text-white hover:bg-primary flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label data-testid="promo-image-label" className="cursor-pointer border border-dashed border-border hover:border-primary aspect-video flex flex-col items-center justify-center gap-2 text-text-secondary hover:text-primary transition-colors">
              <Upload size={20} />
              <span className="text-xs uppercase tracking-wider">{t("upload_image")}</span>
              <input data-testid="promo-image" type="file" accept="image/*" onChange={(e) => onImage(e.target.files?.[0])} className="hidden" />
            </label>
          )}
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("title")}</label>
          <input
            data-testid="promo-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("promo_title_placeholder")}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("description")}</label>
          <textarea
            data-testid="promo-desc"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
            placeholder={t("promo_desc_placeholder")}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("valid_until")} <span className="text-text-secondary normal-case">({t("optional")})</span></label>
          <input
            data-testid="promo-until"
            type="date"
            value={form.valid_until}
            onChange={(e) => set("valid_until", e.target.value)}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          />
        </div>

        <div className="flex justify-between gap-3 pt-4 border-t border-border">
          {(promotion?.title || promotion?.description || promotion?.image_url) ? (
            <button type="button" data-testid="promo-clear" onClick={clearAll} className="text-xs font-display font-bold uppercase tracking-widest text-text-secondary hover:text-primary inline-flex items-center gap-2">
              <Trash2 size={12} /> {t("delete")}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
            <button type="submit" data-testid="promo-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
              <Check size={14} /> {saving ? "..." : t("save")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Inventory({ vehicles, t, search, setSearch, onAdd, onImport, onImportPage, onEdit, onDelete, onHistory, isSalesperson }) {
  const [view, setView] = useState(() => localStorage.getItem("inventory_view") || "grid");
  const [statusFilter, setStatusFilter] = useState("all");
  const [makeFilter, setMakeFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [bodyFilter, setBodyFilter] = useState("");
  const setViewSticky = (v) => { setView(v); localStorage.setItem("inventory_view", v); };

  // Sold vehicles disappear from inventory — they live in Esteira de Entrega + Financeiro
  // Sorted alphabetically by Marca (Make), then Model.
  const activeVehicles = vehicles
    .filter(v => v.status !== "sold")
    .slice()
    .sort((a, b) => {
      const ma = (a.make || "").toLowerCase();
      const mb = (b.make || "").toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb);
      return (a.model || "").toLowerCase().localeCompare((b.model || "").toLowerCase());
    });

  // Build dropdown options dynamically from current stock.
  // Models depend on the picked make so users see only relevant options.
  const allMakes = Array.from(new Set(activeVehicles.map(v => (v.make || "").trim()).filter(Boolean))).sort();
  // Body types: fixed canonical list so users always see every option.
  const allBodies = ["Sedan", "SUV", "Truck", "Coupe", "Hatch", "Convertible", "Wagon", "Van"];
  const modelsForMake = Array.from(new Set(
    activeVehicles
      .filter(v => !makeFilter || (v.make || "").toLowerCase() === makeFilter.toLowerCase())
      .map(v => (v.model || "").trim()).filter(Boolean)
  )).sort();

  const counts = {
    all: activeVehicles.length,
    in_stock: activeVehicles.filter(v => v.status === "in_stock").length,
    reserved: activeVehicles.filter(v => v.status === "reserved").length,
  };

  const filtered = activeVehicles.filter(v => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (makeFilter && (v.make || "").toLowerCase() !== makeFilter.toLowerCase()) return false;
    if (modelFilter && (v.model || "").toLowerCase() !== modelFilter.toLowerCase()) return false;
    if (bodyFilter && (v.body_type || "").toLowerCase() !== bodyFilter.toLowerCase()) return false;
    return true;
  });

  const hasFilters = makeFilter || modelFilter || bodyFilter;
  const clearFilters = () => { setMakeFilter(""); setModelFilter(""); setBodyFilter(""); };

  return (
    <div data-testid="inventory-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("inventory")}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("inventory")}</h1>
        </div>
        {!isSalesperson && (
          <div className="flex gap-2 flex-wrap">
            {onImportPage && (
              <button data-testid="import-inventory-page-btn" onClick={onImportPage} className="border border-border hover:border-primary hover:text-primary transition-colors px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2">
                <ListChecks size={14} /> {t("import_inv_btn")}
              </button>
            )}
            <button data-testid="import-url" onClick={onImport} className="border border-border hover:border-primary hover:text-primary transition-colors px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2">
              <Download size={14} className="rotate-180" /> {t("import_from_url")}
            </button>
            <button data-testid="add-vehicle" onClick={onAdd} className="bg-primary hover:bg-primary-hover px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2">
              <Plus size={14} /> {t("add_vehicle")}
            </button>
          </div>
        )}
      </div>

      {/* Search + dropdown filters + View toggle */}
      <div className="flex flex-wrap gap-3 mb-3">
        <div className="border border-border flex items-center px-4 h-12 flex-1 min-w-[280px]">
          <Search size={16} className="text-text-secondary mr-3" />
          <input data-testid="inventory-search" type="text" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent w-full focus:outline-none text-sm" />
        </div>
        <select
          data-testid="filter-make"
          value={makeFilter}
          onChange={(e) => { setMakeFilter(e.target.value); setModelFilter(""); }}
          className="bg-surface border border-border focus:border-primary focus:outline-none px-3 h-12 text-sm min-w-[140px]"
        >
          <option value="">{t("filter_all_makes")}</option>
          {allMakes.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          data-testid="filter-model"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          disabled={modelsForMake.length === 0}
          className="bg-surface border border-border focus:border-primary focus:outline-none px-3 h-12 text-sm min-w-[140px] disabled:opacity-50"
        >
          <option value="">{t("filter_all_models")}</option>
          {modelsForMake.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          data-testid="filter-body"
          value={bodyFilter}
          onChange={(e) => setBodyFilter(e.target.value)}
          className="bg-surface border border-border focus:border-primary focus:outline-none px-3 h-12 text-sm min-w-[140px]"
        >
          <option value="">{t("filter_all_bodies")}</option>
          {allBodies.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex border border-border h-12">
          <button
            data-testid="view-grid"
            onClick={() => setViewSticky("grid")}
            title="Grid"
            className={`w-12 flex items-center justify-center transition-colors ${view === "grid" ? "bg-primary text-white" : "text-text-secondary hover:text-white"}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            data-testid="view-list"
            onClick={() => setViewSticky("list")}
            title="List"
            className={`w-12 flex items-center justify-center transition-colors ${view === "list" ? "bg-primary text-white" : "text-text-secondary hover:text-white"}`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2 items-center mb-5">
          <span className="text-[10px] uppercase tracking-widest text-text-secondary">{t("active_filters")}:</span>
          {makeFilter && (
            <button onClick={() => { setMakeFilter(""); setModelFilter(""); }} data-testid="chip-make" className="inline-flex items-center gap-1.5 border border-primary text-primary px-2 py-1 text-[11px] font-display font-bold uppercase tracking-wider hover:bg-primary/10">
              {makeFilter} <X size={11} />
            </button>
          )}
          {modelFilter && (
            <button onClick={() => setModelFilter("")} data-testid="chip-model" className="inline-flex items-center gap-1.5 border border-primary text-primary px-2 py-1 text-[11px] font-display font-bold uppercase tracking-wider hover:bg-primary/10">
              {modelFilter} <X size={11} />
            </button>
          )}
          {bodyFilter && (
            <button onClick={() => setBodyFilter("")} data-testid="chip-body" className="inline-flex items-center gap-1.5 border border-primary text-primary px-2 py-1 text-[11px] font-display font-bold uppercase tracking-wider hover:bg-primary/10">
              {bodyFilter} <X size={11} />
            </button>
          )}
          <button onClick={clearFilters} data-testid="chip-clear" className="text-[11px] uppercase tracking-widest text-text-secondary hover:text-primary">
            {t("clear_filters")}
          </button>
        </div>
      )}

      {/* Status filter pills (sold cars are excluded — they live in Esteira de Entrega + Financeiro) */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: "all", label: t("all_time") },
          { id: "in_stock", label: t("in_stock") },
          { id: "reserved", label: t("reserved") },
        ].map(s => (
          <button
            key={s.id}
            data-testid={`inv-filter-${s.id}`}
            onClick={() => setStatusFilter(s.id)}
            className={`px-4 py-2 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
              statusFilter === s.id ? "border-primary text-primary bg-primary/10" : "border-border text-text-secondary hover:text-white"
            }`}
          >
            {s.label} <span className="ml-1 text-text-secondary">({counts[s.id]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="border border-dashed border-border text-text-secondary text-sm text-center py-16">{t("no_vehicles")}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((v) => (
            <VehicleCard key={v.id} v={v} t={t} onEdit={onEdit} onDelete={onDelete} onHistory={onHistory} isSalesperson={isSalesperson} />
          ))}
        </div>
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="text-left p-3 label-eyebrow w-20"></th>
                <th className="text-left p-3 label-eyebrow">{t("make")}/{t("model")}</th>
                <th className="text-left p-3 label-eyebrow">{t("year")}</th>
                <th className="text-left p-3 label-eyebrow">
                  <span className="inline-flex items-center gap-1"><Gauge size={11} /> Milhas</span>
                </th>
                <th className="text-left p-3 label-eyebrow">{t("vin")}</th>
                <th className="text-left p-3 label-eyebrow">{t("sale_price")}</th>
                <th className="text-left p-3 label-eyebrow">{t("status")}</th>
                <th className="text-right p-3 label-eyebrow"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} data-testid={`row-${v.id}`} className="border-b border-border hover:bg-surface transition-colors">
                  <td className="p-2">
                    {v.images?.[0] ? (
                      <img src={v.images[0]} alt={`${v.make} ${v.model}`} className="w-16 h-12 object-cover" />
                    ) : (
                      <img src="/no-photo-placeholder.png" alt="" className="w-16 h-12 object-cover" />
                    )}
                  </td>
                  <td className="p-3"><p className="font-display font-bold">{v.make} {v.model}</p><p className="text-xs text-text-secondary">{v.color}</p></td>
                  <td className="p-3">{v.year}</td>
                  <td className="p-3 font-mono text-xs">
                    {v.mileage > 0 ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Gauge size={11} />
                        {Number(v.mileage).toLocaleString("en-US")}
                        <span className="text-text-secondary text-[10px]">mi</span>
                      </span>
                    ) : <span className="text-text-secondary">—</span>}
                  </td>
                  <td className="p-3 font-mono text-xs">{v.vin || "—"}</td>
                  <td className="p-3 font-display font-bold">{formatCurrency(v.sale_price)}</td>
                  <td className="p-3"><StatusPill status={v.status} t={t} /></td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      {onHistory && (
                        <button data-testid={`history-${v.id}`} onClick={() => onHistory(v.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors" title={t("vehicle_history")}><History size={14} /></button>
                      )}
                      <button data-testid={`edit-${v.id}`} onClick={() => onEdit(v)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Edit2 size={14} /></button>
                      {!isSalesperson && (
                        <button data-testid={`delete-${v.id}`} onClick={() => onDelete(v.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VehicleCard({ v, t, onEdit, onDelete, onHistory, isSalesperson }) {
  const photoCount = v.images?.length || 0;
  return (
    <div data-testid={`card-grid-${v.id}`} className="group border border-border bg-surface overflow-hidden hover:border-primary transition-colors">
      <button
        type="button"
        onClick={() => onEdit(v)}
        className="block w-full aspect-[4/3] bg-background relative overflow-hidden"
      >
        {v.images?.[0] ? (
          <img src={v.images[0]} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-secondary">
            <Car size={28} />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 scale-75 origin-top-left"><StatusPill status={v.status} t={t} /></div>
        {photoCount > 1 && (
          <span className="absolute top-1.5 right-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 inline-flex items-center gap-0.5">
            <ImageIcon size={9} /> {photoCount}
          </span>
        )}
      </button>

      <div className="p-2.5">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold uppercase truncate text-xs leading-tight">{v.make} {v.model}</p>
            <p className="text-[10px] text-text-secondary truncate">{v.year}{v.color ? ` · ${v.color}` : ""}</p>
            <p className="text-[10px] truncate inline-flex items-center gap-1 mt-0.5">
              <Gauge size={10} className="text-primary shrink-0" />
              {v.mileage > 0 ? (
                <>
                  <span className="font-mono text-white">{Number(v.mileage).toLocaleString("en-US")}</span>
                  <span className="text-text-secondary/70">mi</span>
                </>
              ) : (
                <span className="text-text-secondary">— mi</span>
              )}
            </p>
          </div>
          <div className="flex gap-0.5 shrink-0">
            {onHistory && (
              <button
                data-testid={`history-${v.id}`}
                onClick={(e) => { e.stopPropagation(); onHistory(v.id); }}
                className="w-6 h-6 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                title={t("vehicle_history")}
              >
                <History size={11} />
              </button>
            )}
            <button
              data-testid={`edit-${v.id}`}
              onClick={(e) => { e.stopPropagation(); onEdit(v); }}
              className="w-6 h-6 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
              title={t("edit")}
            >
              <Edit2 size={11} />
            </button>
            {!isSalesperson && (
              <button
                data-testid={`delete-${v.id}`}
                onClick={(e) => { e.stopPropagation(); onDelete(v.id); }}
                className="w-6 h-6 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                title={t("delete")}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="font-display font-black text-sm text-primary leading-none">{formatCurrency(v.sale_price)}</p>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, t }) {
  const cls = status === "sold" ? "border-success text-success" : status === "reserved" ? "border-warning text-warning" : "border-blue-500 text-blue-400";
  return <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${cls}`}>{t(status)}</span>;
}

function Pipeline({ vehicles, t, onMove, onEdit, onHistory }) {
  return (
    <div data-testid="pipeline-tab">
      <p className="label-eyebrow text-primary mb-2">{t("pipeline")}</p>
      <h1 className="font-display font-black text-4xl uppercase tracking-tighter mb-10">{t("sales")}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_COLUMNS.map((col) => {
          const list = vehicles.filter((v) => v.status === col.id);
          return (
            <div key={col.id} data-testid={`column-${col.id}`} className={`border-t-2 ${col.color} bg-surface min-h-[400px]`}>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <span className="font-display font-bold uppercase text-sm tracking-wider">{t(col.id)}</span>
                <span className="bg-background border border-border px-2 py-0.5 text-xs">{list.length}</span>
              </div>
              <div className="p-3 space-y-2">
                {list.map((v) => (
                  <div key={v.id} data-testid={`card-${v.id}`} className="bg-background border border-border p-3 hover:border-primary transition-colors">
                    <p className="font-display font-bold text-sm">{v.make} {v.model}</p>
                    <p className="text-xs text-text-secondary mb-3">{v.year} · {v.plate || v.color}</p>
                    <p className="font-display font-bold text-primary">{formatCurrency(v.sale_price)}</p>
                    {v.status === "sold" && v.sold_price > 0 && <p className="text-xs text-success mt-1">→ {formatCurrency(v.sold_price)}</p>}
                    <div className="mt-3 flex gap-1 flex-wrap">
                      {STATUS_COLUMNS.filter((c) => c.id !== v.status).map((c) => (
                        <button
                          key={c.id}
                          data-testid={`move-${v.id}-${c.id}`}
                          onClick={() => {
                            if (c.id === "sold") onEdit(v);
                            else onMove(v.id, c.id);
                          }}
                          className="text-[10px] px-2 py-1 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors"
                        >
                          → {t(c.id)}
                        </button>
                      ))}
                      <button onClick={() => onEdit(v)} className="text-[10px] px-2 py-1 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors">{t("edit")}</button>
                      {onHistory && (
                        <button onClick={() => onHistory(v.id)} className="text-[10px] px-2 py-1 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors inline-flex items-center gap-1" title={t("vehicle_history")}>
                          <History size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {list.length === 0 && <p className="text-text-secondary text-xs text-center py-8">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsTab({ dealership, t, onRefresh }) {
  const [copied, setCopied] = useState(false);
  if (!dealership) return null;
  const apiUrl = `${PUBLIC_API_BASE}/inventory?token=${dealership.api_token}`;
  const copy = () => {
    navigator.clipboard.writeText(apiUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t("copied"));
  };
  const regen = async () => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.post("/dealership/regenerate-token"); await onRefresh(); toast.success(t("saved")); }
    catch { toast.error(t("error_generic")); }
  };

  return (
    <div data-testid="settings-tab" className="max-w-3xl">
      <p className="label-eyebrow text-primary mb-2">{t("settings")}</p>
      <h1 className="font-display font-black text-4xl uppercase tracking-tighter mb-10">{dealership.name}</h1>

      {/* Dealership profile editor — logo, name, address, phone, website, theme */}
      <DealershipProfileSection dealership={dealership} onRefresh={onRefresh} t={t} />

      <div className="border border-border p-6">
        <p className="label-eyebrow text-primary mb-2">{t("public_api")}</p>
        <p className="text-text-secondary text-sm mb-6">{t("api_description")}</p>

        <label className="label-eyebrow block mb-2">Endpoint URL</label>
        <div className="flex gap-2 mb-4">
          <input data-testid="api-url" readOnly value={apiUrl} className="flex-1 bg-surface border border-border px-4 h-11 text-xs font-mono" />
          <button data-testid="copy-url" onClick={copy} className="px-4 border border-border hover:border-primary hover:text-primary transition-colors text-xs uppercase tracking-wider inline-flex items-center gap-2">
            <Copy size={14} /> {copied ? t("copied") : t("copy")}
          </button>
        </div>

        <button data-testid="regen-token" onClick={regen} className="text-xs px-4 py-2 border border-border hover:border-primary hover:text-primary transition-colors uppercase tracking-wider inline-flex items-center gap-2">
          <RefreshCw size={14} /> {t("regenerate")}
        </button>
      </div>

      {/* Team management (salespeople + BDC + permissions) */}
      <TeamSection t={t} />
    </div>
  );
}

const PERMISSION_LABELS = {
  overview: { key: "dashboard", icon: "🏠" },
  inventory: { key: "inventory", icon: "📦" },
  pipeline: { key: "pipeline", icon: "🚗" },
  delivery: { key: "delivery", icon: "🚚" },
  leads: { key: "leads_title", icon: "📞" },
  salespeople: { key: "salespeople", icon: "🏆" },
  financial: { key: "financial", icon: "💰" },
  post_sales: { key: "post_sales_tab", icon: "🛠️" },
  applications: { key: "applications_tab", icon: "📝" },
  receivables: { key: "receivables_tab", icon: "💵" },
};

function TeamMemberAvatarUploader({ member, t, onChanged, disabled = false }) {
  const [uploading, setUploading] = useState(false);
  const photoMap = useTeamPhotos();
  const onPick = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { photo_url, photo_public_id } = await uploadProfilePhoto(file);
      await api.put(`/team/${member.id}/photo`, { photo_url, photo_public_id });
      toast.success(t("saved"));
      photoMap.refresh && photoMap.refresh();
      onChanged && onChanged();
    } catch (err) {
      toast.error(err.message || t("error_generic"));
    } finally { setUploading(false); }
  };
  return (
    <label className={`relative ${disabled ? "" : "cursor-pointer group"} shrink-0`} title={disabled ? "" : t("change_photo")}>
      <Avatar src={member.photo_url} name={member.full_name} size="lg" testid={`team-avatar-${member.id}`} />
      {!disabled && (
        <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? <span className="text-[10px] text-white">...</span> : <Upload size={14} className="text-white" />}
        </div>
      )}
      <input data-testid={`team-photo-input-${member.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} disabled={uploading || disabled} />
    </label>
  );
}

function TeamSection({ t }) {
  const { user: currentUser } = useAuth();
  const [team, setTeam] = useState({ members: [], all_permissions: [], role_defaults: {} });
  const [salespeople, setSalespeople] = useState([]);
  const [editingMember, setEditingMember] = useState(null); // {} new, member edit
  const [savingPerms, setSavingPerms] = useState(null); // memberId being saved

  const reload = async () => {
    try {
      const [tm, sp] = await Promise.all([api.get("/team"), api.get("/salespeople")]);
      setTeam(tm.data);
      setSalespeople(sp.data);
    } catch { /* noop */ }
  };
  useEffect(() => { reload(); }, []);

  const togglePerm = async (member, permKey) => {
    const current = member.effective_permissions || [];
    const next = current.includes(permKey) ? current.filter(p => p !== permKey) : [...current, permKey];
    setSavingPerms(member.id);
    try {
      await api.put(`/team/${member.id}`, { permissions: next });
      reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setSavingPerms(null); }
  };

  const remove = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/team/${id}`); toast.success(t("saved")); reload(); }
    catch { toast.error(t("error_generic")); }
  };

  return (
    <div className="border border-border p-6 mt-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="label-eyebrow text-primary mb-1">{t("team_title")}</p>
          <p className="text-text-secondary text-sm">{t("team_hint")}</p>
        </div>
        <button
          data-testid="add-team"
          type="button"
          onClick={() => setEditingMember({})}
          className="bg-primary hover:bg-primary-hover px-4 py-2.5 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
        >
          <UserPlus size={14} /> {t("add_team_member")}
        </button>
      </div>

      {team.members.length === 0 ? (
        <p className="text-text-secondary text-sm border border-dashed border-border py-8 text-center">{t("no_team_members")}</p>
      ) : (
        <div className="space-y-3">
          {team.members.map(m => {
            const perms = m.effective_permissions || [];
            const isSaving = savingPerms === m.id;
            const isSelf = currentUser?.id === m.id;
            const isOwnerRow = m.role === "owner";
            return (
              <div key={m.id} data-testid={`team-row-${m.id}`} className={`border border-border p-4 ${isSaving ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <TeamMemberAvatarUploader member={m} t={t} onChanged={reload} disabled={isSelf} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-bold uppercase">{m.full_name}</p>
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 border ${
                          m.role === "owner"
                            ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                            : m.role === "bdc"
                            ? "border-cyan-500 text-cyan-400 bg-cyan-500/10"
                            : m.role === "gerente"
                            ? "border-amber-500 text-amber-400 bg-amber-500/10"
                            : m.role === "geral"
                            ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                            : "border-primary text-primary bg-primary/10"
                        }`}>
                          {m.role === "owner" ? t("owner_role") : m.role === "bdc" ? "BDC" : m.role === "gerente" ? t("manager") : m.role === "geral" ? t("general_role") : t("salesperson")}
                        </span>
                        {isSelf && (
                          <span className="text-[9px] uppercase tracking-widest text-text-secondary">{t("self_badge")}</span>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary font-mono">{m.email}</p>
                      {m.salesperson_name && <p className="text-xs text-text-secondary mt-1">→ {m.salesperson_name}</p>}
                    </div>
                  </div>
                  {!isSelf && (
                    <div className="inline-flex gap-1">
                      <button onClick={() => setEditingMember(m)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors" title={t("edit")}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => remove(m.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors" title={t("delete")}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {isOwnerRow ? (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs text-text-secondary">{t("owner_full_access_note")}</p>
                  </div>
                ) : (
                  <div className="border-t border-border pt-3">
                    <p className="label-eyebrow text-[10px] mb-2">{t("permissions_label")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {team.all_permissions.map(p => {
                        const meta = PERMISSION_LABELS[p] || { key: p, icon: "·" };
                        const enabled = perms.includes(p);
                        return (
                        <button
                          key={p}
                          type="button"
                          data-testid={`perm-${m.id}-${p}`}
                          onClick={() => togglePerm(m, p)}
                          disabled={isSaving}
                          className={`px-2.5 py-1.5 text-xs font-display font-bold uppercase tracking-wider border transition-colors inline-flex items-center gap-1.5 ${
                            enabled
                              ? "border-success text-success bg-success/10"
                              : "border-border text-text-secondary hover:border-primary"
                          }`}
                        >
                          <span className="text-base leading-none">{meta.icon}</span>
                          {t(meta.key)}
                          {enabled && <Check size={11} />}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingMember && (
        <TeamMemberForm
          member={editingMember.id ? editingMember : null}
          allPermissions={team.all_permissions}
          roleDefaults={team.role_defaults}
          salespeople={salespeople}
          existingTeam={team.members}
          t={t}
          onClose={() => setEditingMember(null)}
          onSaved={() => { setEditingMember(null); reload(); }}
        />
      )}
    </div>
  );
}

function TeamMemberForm({ member, allPermissions, roleDefaults, salespeople, existingTeam, t, onClose, onSaved }) {
  const isEdit = !!member;
  const photoMap = useTeamPhotos();
  const [form, setForm] = useState({
    full_name: member?.full_name || "",
    email: member?.email || "",
    password: "",
    role: member?.role || "salesperson",
    salesperson_id: member?.salesperson_id || "",
    permissions: member?.effective_permissions || roleDefaults?.salesperson || [],
    photo_url: member?.photo_url || "",
    photo_public_id: member?.photo_public_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (perm) => {
    setForm(f => {
      const has = f.permissions.includes(perm);
      return { ...f, permissions: has ? f.permissions.filter(p => p !== perm) : [...f.permissions, perm] };
    });
  };

  // Apply role defaults when user changes role (only when creating)
  const applyRoleDefaults = (newRole) => {
    set("role", newRole);
    if (!isEdit) set("permissions", roleDefaults[newRole] || []);
  };

  // Handles both create (upload now, save URL on submit) and edit (upload + persist immediately).
  const onPickPhoto = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { photo_url, photo_public_id } = await uploadProfilePhoto(file);
      setForm(f => ({ ...f, photo_url, photo_public_id }));
      if (isEdit) {
        await api.put(`/team/${member.id}/photo`, { photo_url, photo_public_id });
        photoMap.refresh && photoMap.refresh();
        toast.success(t("saved"));
      }
    } catch (err) {
      toast.error(err.message || t("error_generic"));
    } finally { setUploadingPhoto(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        const upd = {
          full_name: form.full_name,
          email: form.email,
          permissions: form.permissions,
        };
        if (form.password) upd.password = form.password;
        await api.put(`/team/${member.id}`, upd);
      } else {
        // Backend now auto-creates the salespeople record when role=salesperson and no salesperson_id is given
        await api.post("/team", form);
      }
      toast.success(t("saved"));
      photoMap.refresh && photoMap.refresh();
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={submit} className="bg-background border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight">
            {isEdit ? t("edit_team_member") : t("add_team_member")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        {!isEdit && (
          <div>
            <label className="label-eyebrow block mb-2">{t("role")}</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "salesperson", icon: Trophy, label: t("salesperson") },
                { id: "bdc", icon: Headphones, label: "BDC" },
                { id: "gerente", icon: Crown, label: t("manager") },
                { id: "geral", icon: Wrench, label: t("general_role") },
                { id: "owner", icon: ShieldCheck, label: t("owner_role"), full: true },
              ].map(({ id, icon: Icon, label, full }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`role-${id}`}
                  onClick={() => applyRoleDefaults(id)}
                  className={`flex items-center justify-center gap-2 px-4 py-3 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${full ? "col-span-2" : ""} ${
                    form.role === id ? "border-primary text-primary bg-primary/10" : "border-border text-text-secondary hover:border-primary/60"
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            {form.role === "owner" && (
              <p className="text-[11px] text-text-secondary mt-2">{t("owner_role_hint")}</p>
            )}
          </div>
        )}

        {/* Photo + Name side-by-side (Monday-style) */}
        <div>
          <label className="label-eyebrow block mb-2">{t("full_name")}</label>
          <div className="flex items-center gap-3">
            <label
              className="relative cursor-pointer group shrink-0"
              title={t("change_photo")}
              data-testid="tm-photo-picker"
            >
              <Avatar
                src={form.photo_url}
                name={form.full_name || t("full_name")}
                size="lg"
                testid="tm-photo-preview"
              />
              <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                {uploadingPhoto
                  ? <span className="text-[10px] text-white">...</span>
                  : <Upload size={14} className="text-white" />}
              </div>
              <input
                data-testid="tm-photo-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickPhoto(e.target.files?.[0])}
                disabled={uploadingPhoto || saving}
              />
            </label>
            <input
              data-testid="tm-name"
              required
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder={t("full_name")}
              className="flex-1 bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            />
          </div>
          <p className="text-[11px] text-text-secondary mt-1.5">{t("team_photo_hint")}</p>
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("email")}</label>
          <input data-testid="tm-email" required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">
            {t("password")} {isEdit && <span className="text-text-secondary normal-case">({t("leave_blank_to_keep")})</span>}
          </label>
          <input data-testid="tm-password" type="password" required={!isEdit} value={form.password} onChange={(e) => set("password", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
        </div>

        <div>
          <p className="label-eyebrow mb-2">{t("permissions_label")}</p>
          <p className="text-xs text-text-secondary mb-3">{t("permissions_hint")}</p>
          <div className="grid grid-cols-2 gap-2">
            {allPermissions.map(p => {
              const meta = PERMISSION_LABELS[p] || { key: p, icon: "·" };
              const enabled = form.permissions.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  data-testid={`tm-perm-${p}`}
                  onClick={() => toggle(p)}
                  className={`flex items-center gap-2 px-3 py-2.5 border transition-colors text-sm ${
                    enabled
                      ? "border-success text-success bg-success/10"
                      : "border-border text-text-secondary hover:border-primary/60"
                  }`}
                >
                  <span className="text-lg leading-none">{meta.icon}</span>
                  <span className="font-display font-bold uppercase text-xs tracking-wider flex-1 text-left">{t(meta.key)}</span>
                  {enabled ? <Check size={14} /> : <span className="w-3.5 h-3.5 border border-current rounded-sm" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="tm-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors">
            {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function VehicleForm({ vehicle, prefill, salespeople = [], isSalesperson, onClose, onSaved, t }) {
  const isEdit = !!vehicle;
  const initial = vehicle || {
    make: prefill?.make || "", model: prefill?.model || "", year: prefill?.year || 2024, color: "", vin: prefill?.vin || "",
    transmission: "Automatic", fuel_type: "Gasoline", body_type: "Sedan",
    purchase_price: 0, sale_price: prefill?.price || 0, expenses: 0, description: prefill?.description || "",
    images: [], status: "in_stock", buyer_name: "", buyer_phone: "", buyer_email: "", buyer_address: "", payment_method: "", sold_price: 0, bank_name: "",
    trade_in_make: "", trade_in_model: "", trade_in_year: 0, trade_in_value: 0, trade_in_payoff_amount: 0, trade_in_payoff_bank: "",
    salesperson_id: "", salesperson_name: "",
    commission_amount: 0, commission_paid: false,
  };
  const [form, setForm] = useState(initial);
  const [photos, setPhotos] = useState(
    vehicle?.images?.length
      ? vehicle.images
      : (prefill?.images?.length ? prefill.images : (prefill?.image ? [prefill.image] : []))
  );
  const [expenseItems, setExpenseItems] = useState(vehicle?.expense_items || []);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const numFields = [
    "year", "purchase_price", "sale_price", "expenses", "sold_price", "commission_amount",
    // sold-financing breakdown — must be numeric so deletes (empty string) save as 0
    "down_payment", "bank_check_amount", "registration_cost",
    "trade_in_year", "trade_in_value", "trade_in_payoff_amount",
  ];
  // Free-text fields that must always be sent as a string (empty when cleared)
  const strFields = [
    "make", "model", "color", "plate", "vin", "transmission", "fuel_type", "body_type",
    "description", "buyer_name", "buyer_phone", "buyer_email", "buyer_address", "payment_method", "bank_name",
    "trade_in_make", "trade_in_model", "trade_in_payoff_bank",
    "salesperson_id", "salesperson_name",
  ];

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, images: photos };
    // Force numeric fields. Number("") === NaN → fall back to 0 so the backend
    // doesn't reject the whole payload with 422.
    numFields.forEach((k) => { payload[k] = Number(payload[k]) || 0; });
    // Force string fields to actual strings so empty values save as "" (clearing
    // the field). Without this, clearing buyer_name leaves the previous value.
    strFields.forEach((k) => {
      if (payload[k] === undefined || payload[k] === null) payload[k] = "";
      else if (typeof payload[k] !== "string") payload[k] = String(payload[k]);
    });
    if (isSalesperson) {
      // Salespeople cannot edit cost/profit fields. Backend also strips these.
      delete payload.purchase_price;
      delete payload.expenses;
      delete payload.expense_items;
      delete payload.commission_amount;
      delete payload.commission_paid;
    } else {
      payload.expense_items = expenseItems;
      payload.expenses = expenseItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    }
    try {
      if (isEdit) await api.put(`/vehicles/${vehicle.id}`, payload);
      else await api.post("/vehicles", payload);
      toast.success(t("saved"));
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || t("error_generic")); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-3xl p-8 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-2xl uppercase tracking-tight">{isEdit ? t("edit") : t("add_vehicle")}</h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Input label={t("make")} value={form.make} set={(v) => set("make", v)} testid="f-make" required />
          <Input label={t("model")} value={form.model} set={(v) => set("model", v)} testid="f-model" required />
          <Input label={t("year")} type="number" value={form.year} set={(v) => set("year", v)} testid="f-year" required />
          <Input label={t("color")} value={form.color} set={(v) => set("color", v)} testid="f-color" />
          <Input label={t("vin")} value={form.vin} set={(v) => set("vin", v)} testid="f-vin" />
          <Select label={t("transmission")} value={form.transmission} set={(v) => set("transmission", v)} options={["Automatic", "Manual"]} testid="f-trans" />
          <Select label={t("fuel_type")} value={form.fuel_type} set={(v) => set("fuel_type", v)} options={["Gasoline", "Diesel", "Hybrid", "Electric", "Flex"]} testid="f-fuel" />
          <Select label={t("body_type")} value={form.body_type} set={(v) => set("body_type", v)} options={["Sedan", "SUV", "Truck", "Coupe", "Hatch", "Convertible", "Wagon", "Van"]} testid="f-body" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          <Input label={t("sale_price")} type="number" value={form.sale_price} set={(v) => set("sale_price", v)} testid="f-sale" />
        </div>

        {!isSalesperson && (
          <div className="pt-4 border-t border-border">
            <ExpenseManager items={expenseItems} onChange={setExpenseItems} t={t} />
          </div>
        )}

        <Select label={t("status")} value={form.status} set={(v) => set("status", v)} options={["in_stock", "reserved", "sold"]} testid="f-status" />

        {form.status === "sold" && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t("buyer_name")} value={form.buyer_name} set={(v) => set("buyer_name", v)} testid="f-buyer-name" />
              <Input label={t("buyer_phone")} value={form.buyer_phone} set={(v) => set("buyer_phone", v)} testid="f-buyer-phone" />
              <Input label={t("buyer_email") || "Email do comprador"} type="email" value={form.buyer_email || ""} set={(v) => set("buyer_email", v)} testid="f-buyer-email" />
              <Input label={t("buyer_address") || "Endereço do comprador"} value={form.buyer_address || ""} set={(v) => set("buyer_address", v)} testid="f-buyer-address" />
              <Input label={t("payment_method")} value={form.payment_method} set={(v) => set("payment_method", v)} testid="f-payment" />
              <Input label={t("bank_name_label")} value={form.bank_name || ""} set={(v) => set("bank_name", v)} testid="f-bank" />
            </div>

            {/* Sale breakdown: down payment + bank check − registration → final sold price */}
            <div className="bg-success/5 border border-success/30 p-4 space-y-3">
              <p className="label-eyebrow text-success">{t("sale_breakdown")}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input label={`💵 ${t("down_payment")}`} type="number" value={form.down_payment ?? ""} set={(v) => {
                  set("down_payment", v);
                  const dp = Number(v) || 0;
                  const bc = Number(form.bank_check_amount) || 0;
                  const ti = Number(form.trade_in_value) || 0;
                  const reg = Number(form.registration_cost) || 0;
                  const final = dp + bc + ti - reg;
                  set("sold_price", final > 0 ? Number(final.toFixed(2)) : 0);
                }} testid="f-down-payment" />
                <Input label={`🏦 ${t("bank_check_amount")}`} type="number" value={form.bank_check_amount ?? ""} set={(v) => {
                  set("bank_check_amount", v);
                  const bc = Number(v) || 0;
                  const dp = Number(form.down_payment) || 0;
                  const ti = Number(form.trade_in_value) || 0;
                  const reg = Number(form.registration_cost) || 0;
                  const final = dp + bc + ti - reg;
                  set("sold_price", final > 0 ? Number(final.toFixed(2)) : 0);
                }} testid="f-bank-check" />
                <Input label={`🧾 ${t("registration_cost")}`} type="number" value={form.registration_cost ?? ""} set={(v) => {
                  set("registration_cost", v);
                  const reg = Number(v) || 0;
                  const dp = Number(form.down_payment) || 0;
                  const bc = Number(form.bank_check_amount) || 0;
                  const ti = Number(form.trade_in_value) || 0;
                  const final = dp + bc + ti - reg;
                  set("sold_price", final > 0 ? Number(final.toFixed(2)) : 0);
                }} testid="f-registration" />
              </div>
            </div>

            {/* TRADE-IN (Veículo na troca) — auto-creates a new stock vehicle on save */}
            <div data-testid="trade-in-section" className="bg-warning/5 border border-warning/30 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="label-eyebrow text-warning">🔄 Veículo na troca</p>
                {Number(form.trade_in_value) > 0 && (
                  <p className="text-[10px] uppercase tracking-widest text-text-secondary">
                    Soma como pagamento → vai pro estoque após salvar
                  </p>
                )}
                {form.trade_in_vehicle_id && (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-success text-success bg-success/10 inline-flex items-center gap-1">
                    <Check size={10} /> Já no estoque
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input label="Marca" value={form.trade_in_make || ""} set={(v) => set("trade_in_make", v)} testid="f-ti-make" />
                <Input label="Modelo" value={form.trade_in_model || ""} set={(v) => set("trade_in_model", v)} testid="f-ti-model" />
                <Input label="Ano" type="number" value={form.trade_in_year || ""} set={(v) => set("trade_in_year", v)} testid="f-ti-year" />
                <Input label="💰 Valor avaliado" type="number" value={form.trade_in_value ?? ""} set={(v) => {
                  set("trade_in_value", v);
                  const ti = Number(v) || 0;
                  const dp = Number(form.down_payment) || 0;
                  const bc = Number(form.bank_check_amount) || 0;
                  const reg = Number(form.registration_cost) || 0;
                  const final = dp + bc + ti - reg;
                  set("sold_price", final > 0 ? Number(final.toFixed(2)) : 0);
                }} testid="f-ti-value" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input label="Saldo devedor no banco" type="number" value={form.trade_in_payoff_amount ?? ""} set={(v) => set("trade_in_payoff_amount", v)} testid="f-ti-payoff" />
                <Input label="Banco financiador" value={form.trade_in_payoff_bank || ""} set={(v) => set("trade_in_payoff_bank", v)} testid="f-ti-payoff-bank" />
              </div>
              {Number(form.trade_in_payoff_amount) > 0 && (
                <p className="text-[11px] text-text-secondary italic">
                  ⚠️ A quitação de R$ {Number(form.trade_in_payoff_amount).toLocaleString("pt-BR")} será lançada automaticamente como despesa do veículo no estoque.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label={t("sold_price")} type="number" value={form.sold_price} set={(v) => set("sold_price", v)} testid="f-sold-price" />
              {/* Salesperson selector — owner only. Salespeople auto-assign themselves on save */}
              {!isSalesperson && (
                <div>
                  <label className="label-eyebrow block mb-2">{t("salesperson")}</label>
                  <select
                    data-testid="f-salesperson"
                    value={form.salesperson_id || ""}
                    onChange={(e) => {
                      const sp = salespeople.find(s => s.id === e.target.value);
                      set("salesperson_id", e.target.value);
                      set("salesperson_name", sp ? sp.name : "");
                      if (sp && !Number(form.commission_amount)) {
                        set("commission_amount", sp.commission_amount || 0);
                      }
                    }}
                    className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
                  >
                    <option value="">{t("select_salesperson")}</option>
                    {salespeople.filter(s => s.active !== false).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="label-eyebrow block mb-2">{t("description")}</label>
          <textarea data-testid="f-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-4 py-2 text-sm resize-none" />
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("images")}</label>
          <PhotoUploader value={photos} onChange={setPhotos} folder="vehicles" t={t} />
        </div>

        {/* Receipts — always visible for any saved sold vehicle, so receipts can be reprinted at any time */}
        {vehicle && vehicle.id && vehicle.status === "sold" && (
          <ReceiptsPanel v={vehicle} t={t} />
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-6 py-3 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="f-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-6 py-3 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <Check size={14} /> {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Delivery({ deliveries, vehicles = [], team = [], currentUser, scheduleAlertCount = 0, salespeople: deliveriesSalespeople = [], t, onReload, isStaff = false, onHistory }) {
  const [editing, setEditing] = useState(null); // vehicle being edited (step or notes)
  const [editMode, setEditMode] = useState("step"); // "step" | "notes"
  const [filesOpen, setFilesOpen] = useState(null); // { vehicle, step }
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [progVehicle, setProgVehicle] = useState(null);  // car-scoped programação modal

  const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];
  // Color per step (mimics screenshot: red→pink→blue→purple→green)
  const STEP_COLORS = {
    1: "bg-primary border-primary",
    2: "bg-pink-600 border-pink-600",
    3: "bg-pink-500 border-pink-500",
    4: "bg-purple-600 border-purple-600",
    5: "bg-blue-600 border-blue-600",
    6: "bg-blue-700 border-blue-700",
    7: "bg-blue-900 border-blue-900",
    8: "bg-success border-success",
  };

  const stuckCount = deliveries.filter(v => v.stuck_alert).length;
  // Split into active (steps 1-7) and delivered (step 8). Delivered go into a collapsible section.
  const activeDeliveries = deliveries.filter(v => (v.delivery_step || 0) < 8);
  const deliveredDeliveries = deliveries.filter(v => (v.delivery_step || 0) === 8);
  const visibleActive = (isStaff && alertsOnly) ? activeDeliveries.filter(v => v.stuck_alert) : activeDeliveries;

  const advance = async (v) => {
    const nextStep = Math.min((v.delivery_step || 1) + 1, 8);
    try {
      await api.put(`/vehicles/${v.id}`, { delivery_step: nextStep });
      toast.success(t("saved"));
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  const goBack = async (v) => {
    const prevStep = Math.max((v.delivery_step || 1) - 1, 1);
    if (prevStep === v.delivery_step) return;
    try {
      // Clear delivered_at if going back from step 8
      const payload = { delivery_step: prevStep };
      if ((v.delivery_step || 0) === 8) payload.delivered_at = null;
      await api.put(`/vehicles/${v.id}`, payload);
      toast.success(t("saved"));
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  const toggleBankContract = async (v) => {
    try {
      await api.put(`/vehicles/${v.id}`, { bank_contract_signed: !v.bank_contract_signed });
      toast.success(v.bank_contract_signed ? t("bank_contract_unmarked") : t("bank_contract_marked"));
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  const reopenDelivery = async (v) => {
    if (!window.confirm(t("reopen_delivery_confirm"))) return;
    try {
      await api.put(`/vehicles/${v.id}`, { delivery_step: 7, delivered_at: null });
      toast.success(t("delivery_reopened"));
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  return (
    <div data-testid="delivery-tab">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("delivery_pipeline_title")}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("delivery")}</h1>
        </div>
        {scheduleAlertCount > 0 && (
          <span
            data-testid="schedule-alert-chip-header"
            className="inline-flex items-center gap-2 px-3 py-2 border border-primary bg-primary/10 text-primary text-[10px] font-display font-bold uppercase tracking-widest animate-pulse"
            title="Programação de entrega com tarefas pendentes a menos de 24h"
          >
            <ClipboardList size={12} />
            {scheduleAlertCount} programação{scheduleAlertCount === 1 ? "" : "ões"} urgente{scheduleAlertCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Stuck alerts banner — owner + gerente only */}
      {isStaff && stuckCount > 0 && (
        <div
          data-testid="stuck-alert-banner"
          className="border border-primary bg-primary/10 p-4 mb-6 flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-black uppercase tracking-tight text-primary">
              {stuckCount} {stuckCount === 1 ? t("stuck_alert_title_one") : t("stuck_alert_title_many")}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">{t("stuck_alert_hint")}</p>
          </div>
          <button
            type="button"
            data-testid="toggle-stuck-only"
            onClick={() => setAlertsOnly(v => !v)}
            className={`px-4 py-2 text-[11px] font-display font-bold uppercase tracking-widest border transition-colors shrink-0 ${
              alertsOnly
                ? "bg-primary text-white border-primary"
                : "border-primary text-primary hover:bg-primary/10"
            }`}
          >
            {alertsOnly ? t("show_all") : t("show_only_stuck")}
          </button>
        </div>
      )}

      {/* Step legend */}
      <div className="flex flex-wrap gap-3 mb-8 p-4 border border-border bg-surface">
        {STEPS.map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${STEP_COLORS[n].split(" ")[0]}`} />
            <span className="text-xs text-text-secondary">{n}. {t(`step_${n}`)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {visibleActive.length === 0 && (
          <p className="text-text-secondary text-center py-16 border border-dashed border-border">
            {alertsOnly ? t("no_stuck_deliveries") : t("no_deliveries")}
          </p>
        )}

        {visibleActive.map((v) => {
          const step = v.delivery_step || 1;
          const isDelivered = step === 8;
          const isStuck = isStaff && v.stuck_alert;
          return (
            <div
              key={v.id}
              data-testid={`delivery-${v.id}`}
              className={`border bg-surface p-5 ${isStuck ? "border-primary shadow-[0_0_0_1px_theme(colors.primary.DEFAULT)]" : "border-border"}`}
            >
              <div className="flex flex-wrap items-start gap-5">
                {/* Photo */}
                <div className="w-32 h-24 bg-background border border-border overflow-hidden flex-shrink-0 relative">
                  {v.images?.[0] ? (
                    <img src={v.images[0]} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover" />
                  ) : (
                    <img src="/no-photo-placeholder.png" alt="" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-[200px]">
                  <p className="font-display font-bold text-lg">{v.year} {v.make} {v.model}</p>
                  <p className="text-sm text-text-secondary">{v.buyer_name || "—"}</p>
                  <p className={`text-sm font-display font-bold mt-1 ${isDelivered ? "text-success" : "text-primary"}`}>
                    {t(`step_${step}`)}
                  </p>
                  {isStuck && (
                    <span
                      data-testid={`stuck-chip-${v.id}`}
                      className="inline-flex items-center gap-1 mt-2 px-2 py-1 border border-primary bg-primary/15 text-primary text-[10px] font-display font-bold uppercase tracking-widest"
                    >
                      <AlertTriangle size={11} />
                      {t("stuck_days_chip").replace("{d}", v.days_in_step)}
                    </span>
                  )}
                </div>

                {/* Step navigation buttons */}
                <div className="flex gap-1.5 items-stretch flex-wrap">
                  {/* Bank contract signed toggle */}
                  <button
                    type="button"
                    data-testid={`bank-contract-${v.id}`}
                    onClick={() => toggleBankContract(v)}
                    title={v.bank_contract_signed ? t("bank_contract_signed_on") : t("bank_contract_pending")}
                    className={`px-3 h-12 inline-flex items-center gap-1.5 border text-[10px] uppercase tracking-wider font-display font-bold transition-colors ${
                      v.bank_contract_signed
                        ? "bg-success/15 border-success text-success hover:bg-success hover:text-white"
                        : "border-border text-text-secondary hover:border-warning hover:text-warning"
                    }`}
                  >
                    {v.bank_contract_signed ? <Check size={14} /> : <FileText size={14} />}
                    <span className="hidden sm:inline">{t("bank_contract_short")}</span>
                  </button>
                  {step > 1 && (
                    <button
                      data-testid={`back-${v.id}`}
                      onClick={() => goBack(v)}
                      className="border border-border hover:border-warning hover:text-warning w-12 h-12 flex items-center justify-center transition-colors"
                      title={t("back_step")}
                    >
                      <ChevronLeft size={24} />
                    </button>
                  )}
                  {!isDelivered && (
                    <button
                      data-testid={`advance-${v.id}`}
                      onClick={() => advance(v)}
                      className="bg-primary hover:bg-primary-hover w-12 h-12 flex items-center justify-center text-white transition-colors"
                      title={t("advance_step")}
                    >
                      <ChevronRight size={24} />
                    </button>
                  )}
                </div>
              </div>

              {/* Step indicator */}
              <div className="flex items-center mt-5 mb-4">
                {STEPS.map((n, i) => {
                  const completed = n < step;
                  const current = n === step;
                  const fileCount = (v.step_files?.[String(n)] || []).length;
                  const hasNotes = !!(v.step_notes?.[String(n)]);
                  return (
                    <div key={n} className="flex items-center flex-1 last:flex-none">
                      <button
                        type="button"
                        data-testid={`step-${v.id}-${n}`}
                        onClick={() => setFilesOpen({ vehicle: v, step: n })}
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all hover:scale-110 cursor-pointer ${
                          completed ? `${STEP_COLORS[n]} text-white` :
                          current ? `${STEP_COLORS[n]} text-white ring-4 ring-primary/30` :
                          "bg-background border-border text-text-secondary hover:border-primary"
                        }`}
                        title={`${t(`step_${n}`)}${fileCount ? ` · ${fileCount} ${t("files").toLowerCase()}` : ""}${hasNotes ? ` · ${t("notes").toLowerCase()}` : ""}`}
                      >
                        {completed ? <Check size={14} /> : n}
                        {fileCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center border-2 border-background">
                            {fileCount}
                          </span>
                        )}
                        {hasNotes && fileCount === 0 && (
                          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-warning border-2 border-background" />
                        )}
                      </button>
                      {i < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 ${n < step ? STEP_COLORS[n].split(" ")[0] : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Meta info pills */}
              <div className="flex flex-wrap gap-2 mb-4 items-center">
                {v.salesperson_name && (
                  <div className="inline-flex items-center gap-2 border border-border px-2 py-1 text-xs">
                    <span className="text-text-secondary uppercase tracking-wider text-[10px]">{t("salesperson")}:</span>
                    <NameWithAvatar name={v.salesperson_name} size="xs" className="font-display font-bold" />
                  </div>
                )}
                {v.buyer_name && <Pill label={t("buyer_name")} value={v.buyer_name} />}
                {v.bank_name && <Pill label={t("bank")} value={v.bank_name} />}
                {v.payment_method && <Pill label={t("payment_method")} value={v.payment_method} />}
              </div>

              {/* Step 8 — Delivery photos preview */}
              {(() => {
                const deliveryPhotos = (v.step_files?.["8"] || []).filter(f => (f.type || "").startsWith("image/"));
                if (deliveryPhotos.length === 0) return null;
                return (
                  <div className="mb-4 border border-success/40 bg-success/5 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="label-eyebrow text-success">{t("delivery_photos")} · {deliveryPhotos.length} {t("photos_count")}</p>
                      <button
                        type="button"
                        data-testid={`open-delivery-photos-${v.id}`}
                        onClick={() => setFilesOpen({ vehicle: v, step: 8 })}
                        className="text-[10px] text-success hover:underline uppercase tracking-wider"
                      >
                        {t("view")} →
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {deliveryPhotos.slice(0, 10).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setFilesOpen({ vehicle: v, step: 8 })}
                          className="w-16 h-16 flex-shrink-0 bg-background overflow-hidden border border-border hover:border-success transition-colors"
                        >
                          <img src={p.data_url} alt={p.name} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Receipts panel — visible from step 2 onward */}
              {step >= 2 && <ReceiptsPanel v={v} t={t} />}

              {/* Inline programação de entrega */}
              <InlineSchedule
                vehicle={v}
                onOpenModal={() => setProgVehicle(v)}
              />

              {/* Actions */}
              <div className={`grid grid-cols-1 ${onHistory ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-2`}>
                <button
                  data-testid={`edit-step-${v.id}`}
                  onClick={() => { setEditing(v); setEditMode("step"); }}
                  className="border border-border hover:border-primary hover:text-primary transition-colors py-2.5 text-xs font-display font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2"
                >
                  <Edit2 size={14} /> {t("edit_step")}
                </button>
                <button
                  data-testid={`notes-${v.id}`}
                  onClick={() => { setEditing(v); setEditMode("notes"); }}
                  className="border border-border hover:border-primary hover:text-primary transition-colors py-2.5 text-xs font-display font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2"
                >
                  <FileText size={14} /> {t("notes")}
                </button>
                {onHistory && (
                  <button
                    data-testid={`delivery-history-${v.id}`}
                    onClick={() => onHistory(v.id)}
                    className="border border-border hover:border-primary hover:text-primary transition-colors py-2.5 text-xs font-display font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2"
                  >
                    <History size={14} /> {t("vehicle_history")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Collapsible "Já entregues" (delivered) section — hidden by default */}
      {deliveredDeliveries.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            data-testid="toggle-delivered"
            onClick={() => setShowDelivered(s => !s)}
            className="w-full flex items-center justify-between gap-3 py-3 px-4 border border-border bg-surface hover:border-success/60 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-success/15 border border-success/40 flex items-center justify-center shrink-0">
                <CheckCircle2 size={16} className="text-success" />
              </div>
              <div className="text-left min-w-0">
                <p className="font-display font-black uppercase tracking-tight text-sm">{t("delivered_section_title")}</p>
                <p className="text-[11px] text-text-secondary">{deliveredDeliveries.length} {deliveredDeliveries.length === 1 ? t("delivered_section_one") : t("delivered_section_many")}</p>
              </div>
            </div>
            <ChevronRight
              size={18}
              className={`text-text-secondary group-hover:text-success transition-transform shrink-0 ${showDelivered ? "rotate-90" : ""}`}
            />
          </button>

          {showDelivered && (
            <div data-testid="delivered-list" className="mt-3 space-y-3">
              {deliveredDeliveries.map((v) => (
                <div
                  key={v.id}
                  data-testid={`delivered-${v.id}`}
                  className="border border-border bg-surface/40 p-4 flex flex-wrap items-center gap-4 hover:border-success/60 transition-colors"
                >
                  {(v.images && v.images[0]) && (
                    <img src={v.images[0]} alt="" className="w-20 h-16 object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold uppercase truncate">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {v.buyer_name || "—"}
                      {v.salesperson_name && (
                        <span className="ml-2 text-text-secondary/70">· {v.salesperson_name}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1.5 border border-success text-success bg-success/10 px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-widest">
                      <CheckCircle2 size={11} /> {t("delivered_label")}
                    </span>
                    {v.delivered_at && (
                      <p className="text-[10px] text-text-secondary mt-1">
                        {new Date(v.delivered_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid={`delivered-reopen-${v.id}`}
                      onClick={() => reopenDelivery(v)}
                      title={t("reopen_delivery")}
                      className="border border-warning/40 text-warning hover:bg-warning hover:text-black transition-colors p-2 inline-flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-widest"
                    >
                      <RefreshCw size={13} />
                      <span className="hidden sm:inline">{t("reopen_delivery")}</span>
                    </button>
                    <button
                      type="button"
                      data-testid={`delivered-files-${v.id}`}
                      onClick={() => setFilesOpen({ vehicle: v, step: 8 })}
                      title={t("delivery_photos")}
                      className="border border-border hover:border-primary hover:text-primary transition-colors p-2"
                    >
                      <ImageIcon size={14} />
                    </button>
                    {onHistory && (
                      <button
                        type="button"
                        data-testid={`delivered-history-${v.id}`}
                        onClick={() => onHistory(v.id)}
                        title={t("vehicle_history")}
                        className="border border-border hover:border-primary hover:text-primary transition-colors p-2"
                      >
                        <History size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <DeliveryEditModal
          vehicle={editing}
          mode={editMode}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onReload(); }}
        />
      )}

      {filesOpen && (
        <StepFilesModal
          vehicle={filesOpen.vehicle}
          step={filesOpen.step}
          t={t}
          onClose={() => setFilesOpen(null)}
          onChanged={onReload}
        />
      )}

      {progVehicle && (
        <VehicleScheduleModal
          vehicle={progVehicle}
          team={team}
          currentUser={currentUser}
          t={t}
          onClose={() => setProgVehicle(null)}
        />
      )}
    </div>
  );
}

function Pill({ label, value }) {
  return (
    <span className="bg-background border border-border px-3 py-1 text-xs">
      <span className="text-text-secondary">{label}:</span> <span className="font-medium">{value}</span>
    </span>
  );
}

function ReceiptsPanel({ v, t }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/vehicles/${v.id}/receipts`);
      setReceipts(r.data || []);
    } catch {
      setReceipts([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [v.id]);

  const totalReceived = receipts.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const openPdf = async (rid) => {
    try {
      const res = await api.get(`/receipts/${rid}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error(t("error_generic"));
    }
  };

  const removeReceipt = async (rid) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/receipts/${rid}`);
      toast.success(t("saved"));
      reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    }
  };

  return (
    <div className="mb-4 border border-border bg-background" data-testid={`receipts-panel-${v.id}`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          <p className="label-eyebrow text-primary">{t("receipts")}</p>
          {receipts.length > 0 && (
            <>
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-border text-text-secondary">{receipts.length}</span>
              <span className="text-[10px] uppercase tracking-widest text-success font-display font-bold">+ {formatCurrency(totalReceived)}</span>
            </>
          )}
        </div>
        <button
          data-testid={`new-receipt-${v.id}`}
          onClick={() => setCreating(true)}
          className="text-[10px] uppercase tracking-widest px-3 py-1.5 bg-success/15 border border-success/40 text-success hover:bg-success hover:text-white inline-flex items-center gap-1 transition-colors font-display font-bold"
        >
          <Plus size={11} /> {t("new_receipt")}
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-text-secondary text-center py-4">…</p>
      ) : receipts.length === 0 ? (
        <p className="text-xs text-text-secondary text-center py-4">{t("no_receipts_yet")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {receipts.map(r => (
            <li key={r.id} data-testid={`receipt-${r.id}`} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-surface/40 transition-colors">
              <span className="font-mono text-text-secondary">#{r.receipt_no}</span>
              <span className="font-display font-bold text-success">{formatCurrency(r.amount)}</span>
              <span className="text-text-secondary truncate flex-1">
                {r.payment_method || "—"}
                {r.created_at && <span className="ml-2">· {new Date(r.created_at).toLocaleDateString()}</span>}
                {r.issued_by_name && <span className="ml-2">· {r.issued_by_name}</span>}
              </span>
              <button
                data-testid={`open-receipt-${r.id}`}
                onClick={() => openPdf(r.id)}
                title={t("open_pdf")}
                className="w-7 h-7 border border-success/40 text-success hover:bg-success hover:text-white flex items-center justify-center transition-colors"
              >
                <Printer size={12} />
              </button>
              <button
                data-testid={`del-receipt-${r.id}`}
                onClick={() => removeReceipt(r.id)}
                title={t("delete")}
                className="w-7 h-7 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewReceiptModal
          vehicle={v}
          t={t}
          onClose={() => setCreating(false)}
          onCreated={(rid) => { setCreating(false); reload(); openPdf(rid); }}
        />
      )}
    </div>
  );
}

function NewReceiptModal({ vehicle, t, onClose, onCreated }) {
  const [form, setForm] = useState({
    amount: "",
    payment_method: "Cash",
    customer_name: vehicle.buyer_name || "",
    customer_phone: vehicle.buyer_phone || "",
    customer_address: "",
    non_refundable_amount: 499,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!Number(form.amount) || Number(form.amount) <= 0) {
      toast.error(t("receipt_amount_required"));
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/vehicles/${vehicle.id}/receipts`, {
        vehicle_id: vehicle.id,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_address: form.customer_address,
        non_refundable_amount: Number(form.non_refundable_amount) || 499,
        notes: form.notes,
      });
      toast.success(t("receipt_created"));
      onCreated(res.data.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4">
      <form onSubmit={submit} className="bg-background border border-success w-full max-w-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-eyebrow text-success mb-1">{t("new_receipt")}</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h2>
          </div>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label-eyebrow block mb-2">{t("receipt_amount")}</label>
            <input
              data-testid="rcp-amount"
              type="number" min="0" step="0.01" required autoFocus
              value={form.amount}
              onChange={e => set("amount", e.target.value)}
              className="w-full bg-surface border border-success focus:border-success focus:outline-none px-3 h-14 text-lg font-display font-black"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">{t("payment_method")}</label>
            <select data-testid="rcp-method" value={form.payment_method} onChange={e => set("payment_method", e.target.value)}
              className="w-full bg-surface border border-border focus:border-success focus:outline-none px-3 h-11 text-sm">
              <option>Cash</option><option>Check</option><option>Card</option><option>Transfer</option><option>Zelle</option><option>Other</option>
            </select>
          </div>
          <div>
            <label className="label-eyebrow block mb-2">{t("non_refundable_amount")}</label>
            <input
              data-testid="rcp-nonref" type="number" min="0" step="0.01"
              value={form.non_refundable_amount}
              onChange={e => set("non_refundable_amount", e.target.value)}
              className="w-full bg-surface border border-border focus:border-success focus:outline-none px-3 h-11 text-sm"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">{t("buyer_name")}</label>
            <input data-testid="rcp-name" value={form.customer_name} onChange={e => set("customer_name", e.target.value)}
              className="w-full bg-surface border border-border focus:border-success focus:outline-none px-3 h-11 text-sm" />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">{t("buyer_phone")}</label>
            <input data-testid="rcp-phone" value={form.customer_phone} onChange={e => set("customer_phone", e.target.value)}
              className="w-full bg-surface border border-border focus:border-success focus:outline-none px-3 h-11 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="label-eyebrow block mb-2">{t("address")}</label>
            <input data-testid="rcp-address" value={form.customer_address} onChange={e => set("customer_address", e.target.value)}
              className="w-full bg-surface border border-border focus:border-success focus:outline-none px-3 h-11 text-sm" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="rcp-submit" disabled={saving}
            className="bg-success hover:opacity-90 disabled:opacity-50 text-white px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <Check size={14} /> {saving ? "..." : t("create_and_print")}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeliveryEditModal({ vehicle, mode, t, onClose, onSaved }) {
  const [step, setStep] = useState(vehicle.delivery_step || 1);
  const [bank, setBank] = useState(vehicle.bank_name || "");
  const [notes, setNotes] = useState(vehicle.delivery_notes || "");
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = mode === "step"
        ? { delivery_step: Number(step), bank_name: bank }
        : { delivery_notes: notes };
      await api.put(`/vehicles/${vehicle.id}`, payload);
      toast.success(t("saved"));
      onSaved();
    } catch { toast.error(t("error_generic")); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            {mode === "step" ? t("edit_step") : t("notes")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <p className="text-sm text-text-secondary">{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.buyer_name}</p>

        {mode === "step" ? (
          <>
            <div>
              <label className="label-eyebrow block mb-2">{t("status")}</label>
              <select
                data-testid="modal-step"
                value={step}
                onChange={(e) => setStep(e.target.value)}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n}. {t(`step_${n}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-eyebrow block mb-2">{t("bank_name_label")}</label>
              <input
                data-testid="modal-bank"
                type="text"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="label-eyebrow block mb-2">{t("delivery_notes")}</label>
            <textarea
              data-testid="modal-notes"
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm resize-none"
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="modal-save" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <Check size={14} /> {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function InlineSalespersonSelect({ value, salespeople, onChange, t, testid }) {
  const [editing, setEditing] = useState(false);
  const current = salespeople.find(s => s.id === value);

  if (editing) {
    return (
      <select
        data-testid={testid}
        autoFocus
        value={value || ""}
        onChange={(e) => { setEditing(false); onChange(e.target.value); }}
        onBlur={() => setEditing(false)}
        className="w-44 bg-surface border border-primary focus:outline-none px-2 h-8 text-sm font-display font-bold"
      >
        <option value="">— {t("unassigned")} —</option>
        {salespeople.filter(s => s.active !== false).map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    );
  }
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 hover:text-primary transition-colors text-left group"
      title={t("change_salesperson")}
    >
      {current ? (
        <NameWithAvatar
          name={current.name}
          photoUrl={current.photo_url}
          size="sm"
          className={`border-b border-dashed border-text-secondary/40 group-hover:border-primary font-display font-bold`}
        />
      ) : (
        <span className="border-b border-dashed border-text-secondary/40 group-hover:border-primary text-warning text-xs uppercase tracking-wider">
          {t("unassigned")}
        </span>
      )}
      <Edit2 size={10} className="opacity-50" />
    </button>
  );
}


function InlineMoneyEdit({ value, onSave, testid }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? 0));

  const commit = () => {
    setEditing(false);
    if (Number(draft) !== Number(value)) onSave(draft);
  };

  if (editing) {
    return (
      <input
        data-testid={testid}
        type="number"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(String(value ?? 0)); setEditing(false); }
        }}
        className="w-24 bg-surface border border-primary focus:outline-none px-2 h-8 text-sm font-display font-bold text-right"
      />
    );
  }
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={() => { setDraft(String(value ?? 0)); setEditing(true); }}
      className="font-display font-bold hover:text-primary transition-colors border-b border-dashed border-text-secondary/40 hover:border-primary inline-flex items-center gap-1"
      title="Click to edit"
    >
      <DollarSign size={11} className="opacity-60" />
      {formatCurrency(Number(value) || 0)}
    </button>
  );
}

function SalespeopleTab({ salespeople, t, onReload, isSalesperson, currentSpId }) {
  const [editingSp, setEditingSp] = useState(null);
  const [credsFor, setCredsFor] = useState(null); // salesperson object whose credentials are being edited
  const [periodFilter, setPeriodFilter] = useState("all");
  const [selectedSp, setSelectedSp] = useState(isSalesperson ? (currentSpId || "all") : "all");
  const [report, setReport] = useState({ rows: [], by_salesperson: [], total_sales: 0, total_revenue: 0, total_profit: 0 });
  const [credentialsMap, setCredentialsMap] = useState({}); // { spId: {has_login, login_email} }
  const [showBySp, setShowBySp] = useState(false); // collapsible "Por vendedor" table

  const loadReport = async () => {
    const params = {};
    const now = new Date();
    if (periodFilter === "this_month") {
      params.year = now.getFullYear();
      params.month = now.getMonth() + 1;
    } else if (periodFilter === "last_month") {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      params.year = lm.getFullYear();
      params.month = lm.getMonth() + 1;
    }
    try {
      const r = await api.get("/sales-report", { params });
      setReport(r.data);
    } catch { /* noop */ }
  };

  const loadCreds = async () => {
    if (isSalesperson) return;
    try {
      const r = await api.get("/salespeople/credentials");
      setCredentialsMap(r.data || {});
    } catch { /* noop */ }
  };

  useEffect(() => { loadReport(); /* eslint-disable-next-line */ }, [periodFilter, salespeople.length]);
  useEffect(() => { loadCreds(); /* eslint-disable-next-line */ }, [salespeople.length]);

  const removeSp = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/salespeople/${id}`);
      toast.success(t("saved"));
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  const togglePaid = async (vehicle_id, currentlyPaid) => {
    if (isSalesperson) return; // read-only for salespeople
    try {
      await api.put(`/vehicles/${vehicle_id}`, { commission_paid: !currentlyPaid });
      toast.success(t("saved"));
      loadReport();
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  const updateCommissionAmount = async (vehicle_id, value) => {
    if (isSalesperson) return;
    const n = Number(value);
    if (Number.isNaN(n) || n < 0) { toast.error(t("error_generic")); return; }
    try {
      await api.put(`/vehicles/${vehicle_id}`, { commission_amount: n });
      toast.success(t("saved"));
      loadReport();
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  const updateSalesperson = async (vehicle_id, sp_id) => {
    if (isSalesperson) return;
    const sp = salespeople.find(s => s.id === sp_id);
    const payload = {
      salesperson_id: sp_id || "",
      salesperson_name: sp ? sp.name : "",
    };
    // When switching to a real salesperson, snapshot their default commission if current row has 0
    try {
      const v = await api.get(`/vehicles/${vehicle_id}`).then(r => r.data);
      if (sp && (Number(v.commission_amount) || 0) === 0) {
        payload.commission_amount = Number(sp.commission_amount) || 0;
      }
    } catch { /* noop */ }
    try {
      await api.put(`/vehicles/${vehicle_id}`, payload);
      toast.success(t("saved"));
      loadReport();
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  // Salespeople list visible to current viewer
  const visibleSalespeople = isSalesperson
    ? salespeople.filter(s => s.id === currentSpId)
    : salespeople;

  return (
    <div data-testid="salespeople-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("salespeople")}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("sales_report")}</h1>
        </div>
        {!isSalesperson && (
          <button
            data-testid="add-salesperson"
            onClick={() => setEditingSp({})}
            className="bg-primary hover:bg-primary-hover px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
          >
            <Plus size={14} /> {t("add_salesperson")}
          </button>
        )}
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: "all", label: t("all_time") },
          { id: "this_month", label: t("this_month") },
          { id: "last_month", label: t("last_month") },
        ].map((p) => (
          <button
            key={p.id}
            data-testid={`filter-${p.id}`}
            onClick={() => setPeriodFilter(p.id)}
            className={`px-4 py-2 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
              periodFilter === p.id ? "border-primary text-primary" : "border-border text-text-secondary hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Top-level stats */}
      <div className={`grid grid-cols-2 ${isSalesperson ? "md:grid-cols-3" : "md:grid-cols-4"} gap-px bg-border border border-border mb-8`}>
        <div className="bg-background p-5">
          <p className="label-eyebrow mb-2">{t("sales_count")}</p>
          <p className="font-display font-black text-2xl">{report.total_sales}</p>
        </div>
        {!isSalesperson && (
          <div className="bg-background p-5">
            <p className="label-eyebrow mb-2">{t("total_revenue")}</p>
            <p className="font-display font-black text-2xl text-primary">{formatCurrency(report.total_revenue)}</p>
          </div>
        )}
        <div className="bg-background p-5">
          <p className="label-eyebrow mb-2">{t("commission_paid")}</p>
          <p className="font-display font-black text-2xl text-success">{formatCurrency(report.total_commission_paid || 0)}</p>
        </div>
        <div className="bg-background p-5">
          <p className="label-eyebrow mb-2">{t("commission_pending")}</p>
          <p className="font-display font-black text-2xl text-warning">{formatCurrency(report.total_commission_pending || 0)}</p>
        </div>
      </div>

      {/* Salespeople list with their performance — collapsible to keep page tidy */}
      <div className="border border-border mb-10">
        <button
          type="button"
          data-testid="toggle-by-salesperson"
          onClick={() => setShowBySp(s => !s)}
          className="w-full bg-surface px-4 py-3 border-b border-border flex items-center justify-between gap-3 hover:bg-surface/70 transition-colors group"
        >
          <span className="flex items-center gap-3">
            <Users size={16} className="text-primary" />
            <span className="label-eyebrow text-primary">{t("by_salesperson")}</span>
            <span className="text-[10px] uppercase tracking-widest px-2 py-1 border border-border text-text-secondary group-hover:border-primary group-hover:text-primary transition-colors">
              {visibleSalespeople.length}
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-text-secondary group-hover:text-primary transition-colors">
            {showBySp ? t("collapse") : t("expand")}
            {showBySp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {showBySp && (
          visibleSalespeople.length === 0 && report.by_salesperson.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-12">{t("no_salespeople")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left p-3 label-eyebrow">{t("salesperson")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("commission_amount")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("sales_count")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("commission_paid")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("commission_pending")}</th>
                  {!isSalesperson && <th className="text-left p-3 label-eyebrow">{t("login_email")}</th>}
                <th className="text-right p-3 label-eyebrow"></th>
              </tr>
            </thead>
            <tbody>
              {visibleSalespeople.map((sp) => {
                const stats = report.by_salesperson.find(b => b.salesperson_id === sp.id) || { count: 0, commission_paid_total: 0, commission_pending_total: 0, commission_paid_count: 0, commission_pending_count: 0 };
                const cred = credentialsMap[sp.id];
                return (
                  <tr
                    key={sp.id}
                    data-testid={`sp-row-${sp.id}`}
                    onClick={() => setSelectedSp(sp.id)}
                    className={`border-b border-border cursor-pointer transition-colors ${selectedSp === sp.id ? "bg-primary/10" : "hover:bg-surface"}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={sp.photo_url} name={sp.name} size="md" />
                        <div className="min-w-0">
                          <p className="font-display font-bold">{sp.name}</p>
                          <p className="text-xs text-text-secondary">{sp.phone || sp.email || ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-display font-bold">{formatCurrency(sp.commission_amount || 0)}</td>
                    <td className="p-3 text-right font-display font-bold">{stats.count}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <CheckCircle2 size={14} className="text-success" />
                        <span className="font-display font-bold text-success">{formatCurrency(stats.commission_paid_total)}</span>
                        {stats.commission_paid_count > 0 && <span className="text-xs text-text-secondary">({stats.commission_paid_count})</span>}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <Clock size={14} className="text-warning" />
                        <span className="font-display font-bold text-warning">{formatCurrency(stats.commission_pending_total)}</span>
                        {stats.commission_pending_count > 0 && <span className="text-xs text-text-secondary">({stats.commission_pending_count})</span>}
                      </div>
                    </td>
                    {!isSalesperson && (
                      <td className="p-3 text-xs">
                        {cred?.has_login ? (
                          <span className="text-success font-mono" data-testid={`sp-login-${sp.id}`}>{cred.login_email}</span>
                        ) : (
                          <span className="text-text-secondary uppercase tracking-wider">{t("no_login")}</span>
                        )}
                      </td>
                    )}
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {!isSalesperson && (
                          <button
                            data-testid={`creds-sp-${sp.id}`}
                            onClick={() => setCredsFor(sp)}
                            title={cred?.has_login ? t("edit_login") : t("set_login")}
                            className={`w-8 h-8 border flex items-center justify-center transition-colors ${cred?.has_login ? "border-success text-success hover:bg-success/10" : "border-border hover:border-primary hover:text-primary"}`}
                          >
                            <Users size={14} />
                          </button>
                        )}
                        {!isSalesperson && (
                          <>
                            <button data-testid={`edit-sp-${sp.id}`} onClick={() => setEditingSp(sp)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Edit2 size={14} /></button>
                            <button data-testid={`del-sp-${sp.id}`} onClick={() => removeSp(sp.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Unassigned row — owner only */}
              {!isSalesperson && report.by_salesperson.find(b => !b.salesperson_id) && (() => {
                const u = report.by_salesperson.find(b => !b.salesperson_id);
                return (
                  <tr className="border-b border-border bg-warning/5">
                    <td className="p-3">
                      <p className="font-display font-bold text-warning">{t("unassigned")}</p>
                    </td>
                    <td className="p-3">—</td>
                    <td className="p-3 text-right font-display font-bold">{u.count}</td>
                    <td className="p-3 text-right">—</td>
                    <td className="p-3 text-right">—</td>
                    <td></td>
                    <td></td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
          )
        )}
      </div>

      {/* Detailed sales spreadsheet */}
      <div className="border border-border">
        <div className="bg-surface px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
          <p className="label-eyebrow text-primary">{t("detailed_sales")}</p>
        </div>

        {/* Salesperson filter pills — owner only (salesperson sees only their own sales) */}
        {!isSalesperson && (
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border bg-surface/30">
            <button
              type="button"
              data-testid="filter-sp-all"
              onClick={() => setSelectedSp("all")}
              className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
                selectedSp === "all" ? "border-primary text-primary bg-primary/10" : "border-border text-text-secondary hover:text-white"
              }`}
            >
              {t("all_time")} ({report.rows.length})
            </button>
            {salespeople.map((sp) => {
              const cnt = report.rows.filter(r => r.salesperson_id === sp.id).length;
              return (
                <button
                  key={sp.id}
                  type="button"
                  data-testid={`filter-sp-${sp.id}`}
                  onClick={() => setSelectedSp(sp.id)}
                  className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
                    selectedSp === sp.id ? "border-primary text-primary bg-primary/10" : "border-border text-text-secondary hover:text-white"
                  }`}
                >
                  {sp.name} ({cnt})
                </button>
              );
            })}
            {report.rows.some(r => !r.salesperson_id) && (
              <button
                type="button"
                data-testid="filter-sp-unassigned"
                onClick={() => setSelectedSp("unassigned")}
                className={`px-3 py-1.5 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
                  selectedSp === "unassigned" ? "border-warning text-warning bg-warning/10" : "border-border text-text-secondary hover:text-white"
                }`}
              >
                {t("unassigned")} ({report.rows.filter(r => !r.salesperson_id).length})
              </button>
            )}
          </div>
        )}

        {(() => {
          const filteredRows = report.rows.filter((r) => {
            if (isSalesperson) return true; // backend already filters to own sales
            if (selectedSp === "all") return true;
            if (selectedSp === "unassigned") return !r.salesperson_id;
            return r.salesperson_id === selectedSp;
          });
          // Subtotals for the filtered selection
          const subtotalRevenue = filteredRows.reduce((s, r) => s + r.sold_price, 0);
          const paidCount = filteredRows.filter(r => r.commission_paid).length;
          const pendingCount = filteredRows.filter(r => !r.commission_paid).length;
          const selectedSpName = selectedSp === "all" ? t("all_time") : selectedSp === "unassigned" ? t("unassigned") : (salespeople.find(p => p.id === selectedSp)?.name || "");

          return (
            <>
              {/* Subtotals card when a specific salesperson is selected — owner view only */}
              {!isSalesperson && selectedSp !== "all" && filteredRows.length > 0 && (
                <div className="px-4 py-3 border-b border-border bg-surface/50 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="label-eyebrow mb-1">{selectedSpName}</p>
                    <p className="font-display font-bold">{filteredRows.length} {t("sales_count")}</p>
                  </div>
                  <div>
                    <p className="label-eyebrow mb-1">{t("total_revenue")}</p>
                    <p className="font-display font-bold text-primary">{formatCurrency(subtotalRevenue)}</p>
                  </div>
                  <div>
                    <p className="label-eyebrow mb-1">{t("commission_paid")}</p>
                    <p className="font-display font-bold text-success">{paidCount}</p>
                  </div>
                  <div>
                    <p className="label-eyebrow mb-1">{t("commission_pending")}</p>
                    <p className="font-display font-bold text-warning">{pendingCount}</p>
                  </div>
                </div>
              )}

              {filteredRows.length === 0 ? (
                <p className="text-text-secondary text-sm text-center py-12">—</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="text-left p-3 label-eyebrow">{t("day_of_month")}</th>
                        <th className="text-left p-3 label-eyebrow">{t("sale_date")}</th>
                        <th className="text-left p-3 label-eyebrow">{t("make")}/{t("model")}</th>
                        <th className="text-left p-3 label-eyebrow">{t("buyer_name")}</th>
                        {!isSalesperson && <th className="text-left p-3 label-eyebrow">{t("salesperson")}</th>}
                        <th className="text-right p-3 label-eyebrow">{t("sold_price")}</th>
                        <th className="text-right p-3 label-eyebrow">{t("commission_amount")}</th>
                        <th className="text-center p-3 label-eyebrow">{t("paid")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => (
                        <tr key={r.vehicle_id} data-testid={`sale-${r.vehicle_id}`} className="border-b border-border hover:bg-surface transition-colors">
                          <td className="p-3 font-display font-black text-primary text-2xl text-center w-16">{r.day || "—"}</td>
                          <td className="p-3 text-xs text-text-secondary">{r.sold_at ? new Date(r.sold_at).toLocaleDateString() : "—"}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {r.image && <img src={r.image} alt="" className="w-10 h-8 object-cover" />}
                              <div>
                                <p className="font-display font-bold">{r.make} {r.model}</p>
                                <p className="text-xs text-text-secondary">{r.year}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{r.buyer_name || "—"}</td>
                          {!isSalesperson && (
                            <td className="p-3">
                              <InlineSalespersonSelect
                                value={r.salesperson_id || ""}
                                salespeople={salespeople}
                                onChange={(spId) => updateSalesperson(r.vehicle_id, spId)}
                                t={t}
                                testid={`change-sp-${r.vehicle_id}`}
                              />
                            </td>
                          )}
                          <td className="p-3 text-right font-display font-bold">{formatCurrency(r.sold_price)}</td>
                          <td className="p-3 text-right">
                            {isSalesperson ? (
                              <span className="font-display font-bold">{formatCurrency(r.commission_amount || 0)}</span>
                            ) : (
                              <InlineMoneyEdit
                                value={r.commission_amount || 0}
                                onSave={(val) => updateCommissionAmount(r.vehicle_id, val)}
                                testid={`commission-edit-${r.vehicle_id}`}
                              />
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              data-testid={`toggle-paid-${r.vehicle_id}`}
                              onClick={() => !isSalesperson && togglePaid(r.vehicle_id, r.commission_paid)}
                              disabled={isSalesperson}
                              title={isSalesperson ? "" : (r.commission_paid ? t("mark_unpaid") : t("mark_paid"))}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border transition-colors text-xs font-display font-bold uppercase tracking-wider ${
                                r.commission_paid
                                  ? "border-success text-success hover:bg-success/10"
                                  : "border-warning text-warning hover:bg-warning/10"
                              } ${isSalesperson ? "cursor-default" : ""}`}
                            >
                              {r.commission_paid ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                              {r.commission_paid ? t("paid") : t("pending")}
                            </button>
                            {r.commission_paid && r.commission_paid_at && (
                              <p data-testid={`paid-at-${r.vehicle_id}`} className="text-[10px] text-text-secondary mt-1">
                                {new Date(r.commission_paid_at).toLocaleDateString()}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {editingSp && (
        <SalespersonForm sp={editingSp.id ? editingSp : null} t={t} onClose={() => setEditingSp(null)} onSaved={() => { setEditingSp(null); onReload(); }} />
      )}

      {credsFor && (
        <SalespersonCredentialsModal
          sp={credsFor}
          t={t}
          existing={credentialsMap[credsFor.id]}
          onClose={() => setCredsFor(null)}
          onSaved={() => { setCredsFor(null); loadCreds(); }}
        />
      )}
    </div>
  );
}

function SalespersonForm({ sp, t, onClose, onSaved }) {
  const [form, setForm] = useState(sp || { name: "", commission_amount: 0, phone: "", email: "", active: true });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, commission_amount: Number(form.commission_amount) || 0 };
    try {
      if (sp) await api.put(`/salespeople/${sp.id}`, payload);
      else await api.post("/salespeople", payload);
      toast.success(t("saved"));
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || t("error_generic")); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight">{sp ? t("edit") : t("add_salesperson")}</h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <Input label={t("salesperson_name")} value={form.name} set={(v) => set("name", v)} required testid="sp-name" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={t("commission_amount")} type="number" value={form.commission_amount} set={(v) => set("commission_amount", v)} testid="sp-commission" />
          <Input label={t("phone")} value={form.phone} set={(v) => set("phone", v)} testid="sp-phone" />
        </div>
        <Input label={t("email")} type="email" value={form.email} set={(v) => set("email", v)} testid="sp-email" />
        <label className="flex items-center gap-2 cursor-pointer">
          <input data-testid="sp-active" type="checkbox" checked={form.active !== false} onChange={(e) => set("active", e.target.checked)} className="w-4 h-4 accent-primary" />
          <span className="label-eyebrow">{t("active")}</span>
        </label>
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="sp-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <Check size={14} /> {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function SalespersonCredentialsModal({ sp, t, existing, onClose, onSaved }) {
  const [email, setEmail] = useState(existing?.login_email || sp.email || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t("error_generic"));
      return;
    }
    setSaving(true);
    try {
      await api.post(`/salespeople/${sp.id}/credentials`, { email, password });
      toast.success(t("saved"));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm(t("confirm_revoke_login"))) return;
    setSaving(true);
    try {
      await api.delete(`/salespeople/${sp.id}/credentials`);
      toast.success(t("saved"));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-eyebrow text-primary mb-1">{sp.name}</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {existing?.has_login ? t("edit_login") : t("set_login")}
            </h2>
          </div>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed border-l-2 border-primary pl-3">
          {t("salesperson_login_hint")}
        </p>
        <Input label={t("login_email")} type="email" value={email} set={setEmail} required testid="creds-email" />
        <Input label={t("new_password")} type="password" value={password} set={setPassword} required testid="creds-password" />
        <div className="flex justify-between gap-3 pt-4 border-t border-border">
          {existing?.has_login ? (
            <button type="button" data-testid="creds-revoke" onClick={revoke} disabled={saving} className="px-5 py-2.5 border border-primary text-primary hover:bg-primary/10 disabled:opacity-50 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
              <Trash2 size={14} /> {t("revoke_login")}
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
            <button type="submit" data-testid="creds-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
              <Check size={14} /> {saving ? "..." : t("save")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function StepFilesModal({ vehicle, step, t, onClose, onChanged }) {
  const [files, setFiles] = useState(vehicle.step_files?.[String(step)] || []);
  const [notes, setNotes] = useState(vehicle.step_notes?.[String(step)] || "");
  const [savedNotes, setSavedNotes] = useState(vehicle.step_notes?.[String(step)] || "");
  const [uploading, setUploading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [previewing, setPreviewing] = useState(null);

  const refresh = async () => {
    try {
      const r = await api.get(`/vehicles/${vehicle.id}`);
      setFiles(r.data.step_files?.[String(step)] || []);
      const n = r.data.step_notes?.[String(step)] || "";
      setNotes(n);
      setSavedNotes(n);
    } catch { /* noop */ }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      // Merge with existing step_notes from vehicle (other steps untouched)
      const existing = { ...(vehicle.step_notes || {}) };
      existing[String(step)] = notes;
      await api.put(`/vehicles/${vehicle.id}`, { step_notes: existing });
      setSavedNotes(notes);
      toast.success(t("saved"));
      onChanged();
    } catch { toast.error(t("error_generic")); }
    finally { setSavingNotes(false); }
  };

  const handleUpload = async (fileList) => {
    if (!fileList?.length) return;
    setUploading(true);
    for (const file of fileList) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(t("file_too_large"));
        continue;
      }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await api.post(`/vehicles/${vehicle.id}/step-files/${step}`, {
          name: file.name, type: file.type || "application/octet-stream",
          data_url: dataUrl, size: file.size,
        });
        toast.success(t("saved"));
      } catch (err) {
        toast.error(err.response?.data?.detail || t("error_generic"));
      }
    }
    setUploading(false);
    await refresh();
    onChanged();
  };

  const remove = async (fileId) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/vehicles/${vehicle.id}/step-files/${step}/${fileId}`);
      toast.success(t("saved"));
      await refresh();
      onChanged();
    } catch { toast.error(t("error_generic")); }
  };

  const isImage = (f) => (f.type || "").startsWith("image/");
  const formatSize = (b) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil((b || 0) / 1024)} KB`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <div className="bg-background border border-border w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <p className="label-eyebrow text-primary mb-1">{step === 8 ? t("delivery_photos") : `${t("upload_for_step")} ${step}`}</p>
            <h2 className="font-display font-bold text-xl uppercase tracking-tight">{t(`step_${step}`)}</h2>
            <p className="text-xs text-text-secondary mt-1">{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.buyer_name}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        {step === 8 && (
          <div className="px-6 pt-5 -mb-2">
            <p className="text-xs text-text-secondary leading-relaxed border-l-2 border-success pl-3">
              {t("delivery_photos_hint")}
            </p>
          </div>
        )}

        {/* Notes section */}
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between mb-3">
            <label className="label-eyebrow text-primary">{t("step_notes_label")}</label>
            {notes !== savedNotes && (
              <button
                type="button"
                data-testid="save-step-notes"
                onClick={saveNotes}
                disabled={savingNotes}
                className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-4 py-1.5 text-[10px] font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2"
              >
                <Check size={12} /> {savingNotes ? "..." : t("save_notes")}
              </button>
            )}
          </div>
          <textarea
            data-testid="step-notes-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("step_notes_placeholder")}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm resize-none"
          />
        </div>

        {/* Upload area */}
        <div className="p-6">
          <label
            data-testid="upload-dropzone"
            htmlFor={`upload-${step}`}
            className="block border-2 border-dashed border-border hover:border-primary transition-colors p-8 text-center cursor-pointer"
          >
            <Upload size={28} className="mx-auto text-text-secondary mb-3" />
            <p className="text-sm text-text-secondary">{t("drag_drop")}</p>
            <p className="text-xs text-text-secondary mt-1">PNG, JPG, PDF · {t("file_too_large").replace("(", "").replace(")", "").toLowerCase()}</p>
          </label>
          <input
            id={`upload-${step}`}
            data-testid="upload-input"
            type="file"
            multiple
            accept="image/*,application/pdf,.pdf,.doc,.docx"
            onChange={(e) => handleUpload(Array.from(e.target.files || []))}
            className="hidden"
          />
          {uploading && <p className="text-center text-text-secondary text-sm mt-3">...</p>}
        </div>

        {/* Files list */}
        <div className="px-6 pb-6 max-h-96 overflow-y-auto">
          {files.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-8">{t("no_files_yet")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {files.map((f) => (
                <div key={f.id} data-testid={`file-${f.id}`} className="border border-border bg-surface p-3 flex gap-3 items-start">
                  {isImage(f) && f.data_url ? (
                    <button
                      type="button"
                      onClick={() => setPreviewing(f)}
                      className="w-16 h-16 bg-background flex-shrink-0 overflow-hidden cursor-pointer"
                    >
                      <img src={f.data_url} alt={f.name} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-16 h-16 bg-background flex-shrink-0 flex items-center justify-center">
                      <FileIcon size={24} className="text-text-secondary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={f.name}>{f.name}</p>
                    <p className="text-xs text-text-secondary">{formatSize(f.size)}</p>
                    <div className="flex gap-1 mt-2">
                      <a
                        href={f.data_url}
                        download={f.name}
                        data-testid={`download-${f.id}`}
                        className="text-[10px] px-2 py-1 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors inline-flex items-center gap-1"
                      >
                        <Download size={11} /> {t("download")}
                      </a>
                      <button
                        data-testid={`del-file-${f.id}`}
                        onClick={() => remove(f.id)}
                        className="text-[10px] px-2 py-1 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 flex justify-end">
          <button onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
        </div>
      </div>

      {previewing && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-8" onClick={() => setPreviewing(null)}>
          <button onClick={() => setPreviewing(null)} className="absolute top-6 right-6 text-white"><X size={28} /></button>
          <img src={previewing.data_url} alt={previewing.name} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}

function ImportUrlModal({ t, onClose, onImported }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const fetchUrl = async (e) => {
    e?.preventDefault();
    if (!url) return;
    setLoading(true);
    setPreview(null);
    try {
      const r = await api.post("/vehicles/import-url", { url });
      const data = r.data.extracted;
      if (!data.image && !data.title) {
        toast.error(t("import_failed"));
      } else {
        setPreview(data);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("import_failed"));
    } finally { setLoading(false); }
  };

  const useThis = () => {
    onImported(preview);
    toast.success(t("import_success"));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <div className="bg-background border border-border w-full max-w-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">{t("import_from_url")}</h2>
          <button onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        <form onSubmit={fetchUrl} className="p-6 space-y-4">
          <div>
            <label className="label-eyebrow block mb-2">URL</label>
            <input
              data-testid="import-url-input"
              type="url"
              required
              autoFocus
              placeholder={t("paste_url")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-4 h-11 text-sm"
            />
            <p className="text-xs text-text-secondary mt-2">Ex: https://www.intercarautosales.com/details/used-2019-honda-civic/125084579</p>
          </div>

          <button
            type="submit"
            data-testid="import-url-fetch"
            disabled={loading || !url}
            className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors py-3 font-display font-bold uppercase text-sm tracking-widest text-white"
          >
            {loading ? t("importing") : t("import")}
          </button>
        </form>

        {preview && (
          <div className="px-6 pb-6">
            <div className="border border-border bg-surface p-4">
              <p className="label-eyebrow text-primary mb-3">Preview</p>
              <div className="flex gap-4">
                {preview.image ? (
                  <img src={preview.image} alt="" className="w-32 h-24 object-cover bg-background flex-shrink-0" />
                ) : (
                  <div className="w-32 h-24 bg-background flex items-center justify-center"><Car size={28} className="text-text-secondary" /></div>
                )}
                <div className="flex-1 min-w-0 text-sm space-y-1">
                  <p className="font-display font-bold mb-1 truncate">{preview.title || "—"}</p>
                  {preview.year ? <p className="text-text-secondary">{preview.year} {preview.make} {preview.model}</p> : null}
                  {preview.price ? <p className="font-display font-bold text-primary">{formatCurrency(preview.price)}</p> : null}
                  {preview.vin ? <p className="text-xs text-text-secondary font-mono">VIN {preview.vin}</p> : null}
                  {preview.images?.length > 1 ? (
                    <p className="text-xs text-success">{preview.images.length} {t("photos_imported")}</p>
                  ) : null}
                </div>
              </div>
              {preview.images?.length > 1 && (
                <div className="grid grid-cols-6 gap-1.5 mt-3">
                  {preview.images.slice(0, 12).map((src, i) => (
                    <img key={i} src={src} alt="" className="w-full h-12 object-cover bg-background border border-border" />
                  ))}
                </div>
              )}
              <button
                type="button"
                data-testid="import-url-use"
                onClick={useThis}
                className="w-full mt-4 bg-success hover:opacity-80 transition-opacity py-2.5 font-display font-bold uppercase text-xs tracking-widest text-background"
              >
                <Check size={14} className="inline mr-2" /> {t("save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Input({ label, value, set, type = "text", required, testid }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <input data-testid={testid} type={type} required={required} value={value} onChange={(e) => set(e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm" />
    </div>
  );
}

function Select({ label, value, set, options, testid }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <select data-testid={testid} value={value} onChange={(e) => set(e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm cursor-pointer">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
