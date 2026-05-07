import { useEffect, useState } from "react";
import { Car, LayoutDashboard, Package, TrendingUp, Truck, Settings, LogOut, Plus, Search, Edit2, Trash2, X, Check, Copy, RefreshCw, ChevronRight, FileText } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, PUBLIC_API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useI18n, LANG_OPTIONS } from "@/lib/i18n.jsx";

const STATUS_COLUMNS = [
  { id: "in_stock", color: "border-blue-500" },
  { id: "reserved", color: "border-warning" },
  { id: "sold", color: "border-success" },
];

export default function AppShell() {
  const { t, lang, setLang } = useI18n();
  const { user, dealership, logout, refreshDealership } = useAuth();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const tabs = [
    { id: "overview", label: t("dashboard"), icon: LayoutDashboard },
    { id: "inventory", label: t("inventory"), icon: Package },
    { id: "pipeline", label: t("pipeline"), icon: TrendingUp },
    { id: "delivery", label: t("delivery"), icon: Truck },
    { id: "settings", label: t("settings"), icon: Settings },
  ];

  const reload = async () => {
    try {
      const [s, v, d] = await Promise.all([
        api.get("/stats"),
        api.get("/vehicles", { params: { search: search || undefined } }),
        api.get("/delivery"),
      ]);
      setStats(s.data); setVehicles(v.data); setDeliveries(d.data);
    } catch { toast.error(t("error_generic")); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [search]);

  const onDelete = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/vehicles/${id}`); toast.success(t("saved")); reload(); }
    catch { toast.error(t("error_generic")); }
  };

  const updateStatus = async (id, status) => {
    try { await api.put(`/vehicles/${id}`, { status }); toast.success(t("saved")); reload(); }
    catch { toast.error(t("error_generic")); }
  };

  return (
    <div data-testid="app-shell" className="min-h-screen bg-background text-white flex">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-border min-h-screen flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary flex items-center justify-center"><Car size={18} /></div>
            <div className="min-w-0">
              <p className="font-display font-bold uppercase text-sm truncate">{dealership?.name || "..."}</p>
              <p className="label-eyebrow text-[10px] truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              data-testid={`nav-${tb.id}`}
              onClick={() => setTab(tb.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-display uppercase tracking-wider font-semibold transition-colors ${
                tab === tb.id ? "bg-primary text-white" : "text-text-secondary hover:bg-surface hover:text-white"
              }`}
            >
              <tb.icon size={16} /> {tb.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-3">
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
          <button
            data-testid="logout-btn"
            onClick={logout}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-text-secondary hover:text-primary transition-colors"
          >
            <LogOut size={14} /> {t("sign_out")}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-8 overflow-auto">
        {tab === "overview" && <Overview stats={stats} t={t} />}
        {tab === "inventory" && (
          <Inventory
            vehicles={vehicles} t={t} search={search} setSearch={setSearch}
            onAdd={() => setEditing("new")} onEdit={(v) => setEditing(v)} onDelete={onDelete}
          />
        )}
        {tab === "pipeline" && <Pipeline vehicles={vehicles} t={t} onMove={updateStatus} onEdit={(v) => setEditing(v)} />}
        {tab === "delivery" && <Delivery deliveries={deliveries} t={t} onReload={reload} />}
        {tab === "settings" && <SettingsTab dealership={dealership} t={t} onRefresh={refreshDealership} />}

        {editing && (
          <VehicleForm t={t} vehicle={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
        )}
      </main>
    </div>
  );
}

function Overview({ stats, t }) {
  if (!stats) return <p className="text-text-secondary">...</p>;
  const cards = [
    { label: t("total_vehicles"), value: stats.total_vehicles },
    { label: t("in_stock"), value: stats.in_stock },
    { label: t("reserved"), value: stats.reserved },
    { label: t("sold"), value: stats.sold },
    { label: t("invested"), value: formatCurrency(stats.stock_total_cost), accent: false },
    { label: t("revenue"), value: formatCurrency(stats.total_revenue), accent: true },
    { label: t("profit"), value: formatCurrency(stats.total_profit), accent: true },
    { label: t("avg_ticket"), value: formatCurrency(stats.avg_ticket) },
  ];
  const maxRev = Math.max(...stats.monthly_sales.map(m => m.revenue), 1);

  return (
    <div data-testid="overview-tab">
      <p className="label-eyebrow text-primary mb-2">{t("dashboard")}</p>
      <h1 className="font-display font-black text-4xl uppercase tracking-tighter mb-10">{t("overview")}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-10">
        {cards.map((c, i) => (
          <div key={i} data-testid={`stat-${i}`} className="bg-background p-6">
            <p className="label-eyebrow mb-3">{c.label}</p>
            <p className={`font-display font-black text-2xl ${c.accent ? "text-primary" : "text-white"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="border border-border p-6">
        <p className="label-eyebrow text-primary mb-6">{t("monthly_performance")}</p>
        {stats.monthly_sales.length === 0 ? (
          <p className="text-text-secondary text-sm py-8 text-center">—</p>
        ) : (
          <div className="space-y-3">
            {stats.monthly_sales.map((m) => (
              <div key={m.month} className="flex items-center gap-4">
                <span className="font-display font-bold text-sm w-24">{m.month}</span>
                <div className="flex-1 bg-surface h-8 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${(m.revenue / maxRev) * 100}%` }} />
                </div>
                <span className="font-display font-bold text-sm w-32 text-right">{formatCurrency(m.revenue)}</span>
                <span className={`font-display font-bold text-sm w-32 text-right ${m.profit >= 0 ? "text-success" : "text-primary"}`}>
                  {formatCurrency(m.profit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Inventory({ vehicles, t, search, setSearch, onAdd, onEdit, onDelete }) {
  return (
    <div data-testid="inventory-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("inventory")}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("inventory")}</h1>
        </div>
        <button data-testid="add-vehicle" onClick={onAdd} className="bg-primary hover:bg-primary-hover px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2">
          <Plus size={14} /> {t("add_vehicle")}
        </button>
      </div>

      <div className="border border-border flex items-center px-4 h-12 mb-6">
        <Search size={16} className="text-text-secondary mr-3" />
        <input data-testid="inventory-search" type="text" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent w-full focus:outline-none text-sm" />
      </div>

      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr>
              <th className="text-left p-3 label-eyebrow">{t("make")}/{t("model")}</th>
              <th className="text-left p-3 label-eyebrow">{t("year")}</th>
              <th className="text-left p-3 label-eyebrow">{t("plate")}</th>
              <th className="text-left p-3 label-eyebrow">{t("purchase_price")}</th>
              <th className="text-left p-3 label-eyebrow">{t("sale_price")}</th>
              <th className="text-left p-3 label-eyebrow">{t("status")}</th>
              <th className="text-right p-3 label-eyebrow"></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} data-testid={`row-${v.id}`} className="border-b border-border hover:bg-surface transition-colors">
                <td className="p-3"><p className="font-display font-bold">{v.make} {v.model}</p><p className="text-xs text-text-secondary">{v.color}</p></td>
                <td className="p-3">{v.year}</td>
                <td className="p-3 font-mono text-xs">{v.plate || "—"}</td>
                <td className="p-3">{formatCurrency(v.purchase_price)}</td>
                <td className="p-3 font-display font-bold">{formatCurrency(v.sale_price)}</td>
                <td className="p-3"><StatusPill status={v.status} t={t} /></td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1">
                    <button data-testid={`edit-${v.id}`} onClick={() => onEdit(v)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Edit2 size={14} /></button>
                    <button data-testid={`delete-${v.id}`} onClick={() => onDelete(v.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-text-secondary">{t("no_vehicles")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status, t }) {
  const cls = status === "sold" ? "border-success text-success" : status === "reserved" ? "border-warning text-warning" : "border-blue-500 text-blue-400";
  return <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${cls}`}>{t(status)}</span>;
}

function Pipeline({ vehicles, t, onMove, onEdit }) {
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
                          onClick={() => onMove(v.id, c.id)}
                          className="text-[10px] px-2 py-1 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors"
                        >
                          → {t(c.id)}
                        </button>
                      ))}
                      <button onClick={() => onEdit(v)} className="text-[10px] px-2 py-1 border border-border hover:border-primary hover:text-primary uppercase tracking-wider transition-colors">{t("edit")}</button>
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
    </div>
  );
}

function VehicleForm({ vehicle, onClose, onSaved, t }) {
  const isEdit = !!vehicle;
  const [form, setForm] = useState(vehicle || {
    make: "", model: "", year: 2024, color: "", plate: "", vin: "",
    mileage: 0, transmission: "Automatic", fuel_type: "Gasoline", body_type: "Sedan",
    purchase_price: 0, sale_price: 0, expenses: 0, description: "",
    images: [], status: "in_stock", buyer_name: "", buyer_phone: "", payment_method: "", sold_price: 0, bank_name: "",
  });
  const [imgsText, setImgsText] = useState((vehicle?.images || []).join("\n"));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const numFields = ["year", "mileage", "purchase_price", "sale_price", "expenses", "sold_price"];

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, images: imgsText.split("\n").map((s) => s.trim()).filter(Boolean) };
    numFields.forEach((k) => { payload[k] = Number(payload[k]) || 0; });
    try {
      if (isEdit) await api.put(`/vehicles/${vehicle.id}`, payload);
      else await api.post("/vehicles", payload);
      toast.success(t("saved"));
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || t("error_generic")); }
    finally { setSaving(false); }
  };

  const profit = (Number(form.sale_price) || 0) - (Number(form.purchase_price) || 0) - (Number(form.expenses) || 0);

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
          <Input label={t("plate")} value={form.plate} set={(v) => set("plate", v)} testid="f-plate" />
          <Input label={t("vin")} value={form.vin} set={(v) => set("vin", v)} testid="f-vin" />
          <Input label={t("mileage")} type="number" value={form.mileage} set={(v) => set("mileage", v)} testid="f-mileage" />
          <Select label={t("transmission")} value={form.transmission} set={(v) => set("transmission", v)} options={["Automatic", "Manual"]} testid="f-trans" />
          <Select label={t("fuel_type")} value={form.fuel_type} set={(v) => set("fuel_type", v)} options={["Gasoline", "Diesel", "Hybrid", "Electric", "Flex"]} testid="f-fuel" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-border">
          <Input label={t("purchase_price")} type="number" value={form.purchase_price} set={(v) => set("purchase_price", v)} testid="f-purchase" />
          <Input label={t("expenses")} type="number" value={form.expenses} set={(v) => set("expenses", v)} testid="f-expenses" />
          <Input label={t("sale_price")} type="number" value={form.sale_price} set={(v) => set("sale_price", v)} testid="f-sale" />
        </div>

        <div className="bg-surface p-4 border border-border flex items-center justify-between">
          <span className="label-eyebrow">{t("profit_per_vehicle")}</span>
          <span className={`font-display font-black text-2xl ${profit >= 0 ? "text-success" : "text-primary"}`}>{formatCurrency(profit)}</span>
        </div>

        <Select label={t("status")} value={form.status} set={(v) => set("status", v)} options={["in_stock", "reserved", "sold"]} testid="f-status" />

        {form.status === "sold" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
            <Input label={t("buyer_name")} value={form.buyer_name} set={(v) => set("buyer_name", v)} testid="f-buyer-name" />
            <Input label={t("buyer_phone")} value={form.buyer_phone} set={(v) => set("buyer_phone", v)} testid="f-buyer-phone" />
            <Input label={t("payment_method")} value={form.payment_method} set={(v) => set("payment_method", v)} testid="f-payment" />
            <Input label={t("bank_name_label")} value={form.bank_name || ""} set={(v) => set("bank_name", v)} testid="f-bank" />
            <Input label={t("sold_price")} type="number" value={form.sold_price} set={(v) => set("sold_price", v)} testid="f-sold-price" />
          </div>
        )}

        <div>
          <label className="label-eyebrow block mb-2">{t("description")}</label>
          <textarea data-testid="f-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-4 py-2 text-sm resize-none" />
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("images")}</label>
          <textarea data-testid="f-images" rows={2} value={imgsText} onChange={(e) => setImgsText(e.target.value)} placeholder="https://..." className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-4 py-2 text-xs font-mono resize-none" />
        </div>

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

function Delivery({ deliveries, t, onReload }) {
  const [editing, setEditing] = useState(null); // vehicle being edited (step or notes)
  const [editMode, setEditMode] = useState("step"); // "step" | "notes"

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

  const advance = async (v) => {
    const nextStep = Math.min((v.delivery_step || 1) + 1, 8);
    try {
      await api.put(`/vehicles/${v.id}`, { delivery_step: nextStep });
      toast.success(t("saved"));
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  return (
    <div data-testid="delivery-tab">
      <p className="label-eyebrow text-primary mb-2">{t("delivery_pipeline_title")}</p>
      <h1 className="font-display font-black text-4xl uppercase tracking-tighter mb-6">{t("delivery")}</h1>

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
        {deliveries.length === 0 && (
          <p className="text-text-secondary text-center py-16 border border-dashed border-border">{t("no_deliveries")}</p>
        )}

        {deliveries.map((v) => {
          const step = v.delivery_step || 1;
          const isDelivered = step === 8;
          return (
            <div key={v.id} data-testid={`delivery-${v.id}`} className="border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start gap-5">
                {/* Photo */}
                <div className="w-32 h-24 bg-background border border-border overflow-hidden flex-shrink-0 relative">
                  {v.images?.[0] ? (
                    <img src={v.images[0]} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-surface">
                      <Car size={24} className="text-text-secondary" />
                      <span className="text-[9px] text-text-secondary uppercase tracking-wider">{t("no_photo")}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-[200px]">
                  <p className="font-display font-bold text-lg">{v.year} {v.make} {v.model}</p>
                  <p className="text-sm text-text-secondary">{v.buyer_name || "—"}</p>
                  <p className={`text-sm font-display font-bold mt-1 ${isDelivered ? "text-success" : "text-primary"}`}>
                    {t(`step_${step}`)}
                  </p>
                </div>

                {/* Advance button */}
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

              {/* Step indicator */}
              <div className="flex items-center mt-5 mb-4">
                {STEPS.map((n, i) => {
                  const completed = n < step;
                  const current = n === step;
                  return (
                    <div key={n} className="flex items-center flex-1 last:flex-none">
                      <div
                        className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                          completed ? `${STEP_COLORS[n]} text-white` :
                          current ? `${STEP_COLORS[n]} text-white ring-4 ring-primary/30` :
                          "bg-background border-border text-text-secondary"
                        }`}
                      >
                        {completed ? <Check size={14} /> : n}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 ${n < step ? STEP_COLORS[n].split(" ")[0] : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Meta info pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {v.buyer_name && <Pill label={t("buyer_name")} value={v.buyer_name} />}
                {v.bank_name && <Pill label={t("bank")} value={v.bank_name} />}
                {v.payment_method && <Pill label={t("payment_method")} value={v.payment_method} />}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <DeliveryEditModal
          vehicle={editing}
          mode={editMode}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onReload(); }}
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
