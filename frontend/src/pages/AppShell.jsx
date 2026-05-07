import { useEffect, useState } from "react";
import { Car, LayoutDashboard, Package, TrendingUp, Truck, Users, Settings, LogOut, Plus, Search, Edit2, Trash2, X, Check, Copy, RefreshCw, ChevronRight, FileText, Paperclip, Upload, Download, Image as ImageIcon, File as FileIcon, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, PUBLIC_API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useI18n, LANG_OPTIONS } from "@/lib/i18n.jsx";
import PhotoUploader from "@/components/PhotoUploader";
import ExpenseManager from "@/components/ExpenseManager";

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
  const [salespeople, setSalespeople] = useState([]);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tabs = [
    { id: "overview", label: t("dashboard"), icon: LayoutDashboard },
    { id: "inventory", label: t("inventory"), icon: Package },
    { id: "pipeline", label: t("pipeline"), icon: TrendingUp },
    { id: "delivery", label: t("delivery"), icon: Truck },
    { id: "salespeople", label: t("salespeople"), icon: Users },
    { id: "settings", label: t("settings"), icon: Settings },
  ];

  const reload = async () => {
    try {
      const [s, v, d, sp] = await Promise.all([
        api.get("/stats"),
        api.get("/vehicles", { params: { search: search || undefined } }),
        api.get("/delivery"),
        api.get("/salespeople"),
      ]);
      setStats(s.data); setVehicles(v.data); setDeliveries(d.data); setSalespeople(sp.data);
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
            onAdd={() => setEditing("new")} onImport={() => setImportOpen(true)} onEdit={(v) => setEditing(v)} onDelete={onDelete}
          />
        )}
        {tab === "pipeline" && <Pipeline vehicles={vehicles} t={t} onMove={updateStatus} onEdit={(v) => setEditing(v)} />}
        {tab === "delivery" && <Delivery deliveries={deliveries} t={t} onReload={reload} />}
        {tab === "salespeople" && <SalespeopleTab salespeople={salespeople} t={t} onReload={reload} />}
        {tab === "settings" && <SettingsTab dealership={dealership} t={t} onRefresh={refreshDealership} />}

        {editing && (
          <VehicleForm t={t} vehicle={editing === "new" || (editing && editing.__prefill) ? null : editing} prefill={editing && editing.__prefill ? editing : null} salespeople={salespeople} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
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

function Inventory({ vehicles, t, search, setSearch, onAdd, onImport, onEdit, onDelete }) {
  return (
    <div data-testid="inventory-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("inventory")}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("inventory")}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button data-testid="import-url" onClick={onImport} className="border border-border hover:border-primary hover:text-primary transition-colors px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2">
            <Download size={14} className="rotate-180" /> {t("import_from_url")}
          </button>
          <button data-testid="add-vehicle" onClick={onAdd} className="bg-primary hover:bg-primary-hover px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2">
            <Plus size={14} /> {t("add_vehicle")}
          </button>
        </div>
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
              <th className="text-left p-3 label-eyebrow">{t("vin")}</th>
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
                <td className="p-3 font-mono text-xs">{v.vin || "—"}</td>
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

function VehicleForm({ vehicle, prefill, onClose, onSaved, t }) {
  const isEdit = !!vehicle;
  const initial = vehicle || {
    make: prefill?.make || "", model: prefill?.model || "", year: prefill?.year || 2024, color: "", vin: "",
    transmission: "Automatic", fuel_type: "Gasoline", body_type: "Sedan",
    purchase_price: 0, sale_price: prefill?.price || 0, expenses: 0, description: prefill?.description || "",
    images: [], status: "in_stock", buyer_name: "", buyer_phone: "", payment_method: "", sold_price: 0, bank_name: "",
    salesperson_id: "", salesperson_name: "",
    commission_amount: 0, commission_paid: false,
  };
  const [form, setForm] = useState(initial);
  const [photos, setPhotos] = useState(
    vehicle?.images?.length ? vehicle.images : (prefill?.image ? [prefill.image] : [])
  );
  const [expenseItems, setExpenseItems] = useState(vehicle?.expense_items || []);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const numFields = ["year", "purchase_price", "sale_price", "expenses", "sold_price", "commission_amount"];

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, images: photos, expense_items: expenseItems };
    numFields.forEach((k) => { payload[k] = Number(payload[k]) || 0; });
    // Compute total expenses from items
    payload.expenses = expenseItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
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
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          <Input label={t("purchase_price")} type="number" value={form.purchase_price} set={(v) => set("purchase_price", v)} testid="f-purchase" />
          <Input label={t("sale_price")} type="number" value={form.sale_price} set={(v) => set("sale_price", v)} testid="f-sale" />
        </div>

        <div className="pt-4 border-t border-border">
          <ExpenseManager items={expenseItems} onChange={setExpenseItems} t={t} />
        </div>

        {/* Real profit summary */}
        {(() => {
          const totalExp = expenseItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
          const profit = (Number(form.sale_price) || 0) - (Number(form.purchase_price) || 0) - totalExp;
          return (
            <div className="bg-surface p-4 border border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">{t("sale_price")}</span>
                <span className="font-display font-bold">{formatCurrency(Number(form.sale_price) || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">− {t("purchase_price")}</span>
                <span className="font-display font-bold">{formatCurrency(Number(form.purchase_price) || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">− {t("expenses_total")}</span>
                <span className="font-display font-bold">{formatCurrency(totalExp)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="label-eyebrow text-primary">{t("real_profit")}</span>
                <span className={`font-display font-black text-2xl ${profit >= 0 ? "text-success" : "text-primary"}`}>{formatCurrency(profit)}</span>
              </div>
            </div>
          );
        })()}

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
          <PhotoUploader value={photos} onChange={setPhotos} folder="vehicles" t={t} />
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
  const [filesOpen, setFilesOpen] = useState(null); // { vehicle, step }

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
              <div className="flex flex-wrap gap-2 mb-4">
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

      {filesOpen && (
        <StepFilesModal
          vehicle={filesOpen.vehicle}
          step={filesOpen.step}
          t={t}
          onClose={() => setFilesOpen(null)}
          onChanged={onReload}
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

function SalespeopleTab({ salespeople, t, onReload }) {
  const [editingSp, setEditingSp] = useState(null);
  const [periodFilter, setPeriodFilter] = useState("all");
  const [selectedSp, setSelectedSp] = useState("all"); // "all" | "unassigned" | salesperson_id
  const [report, setReport] = useState({ rows: [], by_salesperson: [], total_sales: 0, total_revenue: 0, total_profit: 0 });

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

  useEffect(() => { loadReport(); /* eslint-disable-next-line */ }, [periodFilter, salespeople.length]);

  const removeSp = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/salespeople/${id}`);
      toast.success(t("saved"));
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  const togglePaid = async (vehicle_id, currentlyPaid) => {
    try {
      await api.put(`/vehicles/${vehicle_id}`, { commission_paid: !currentlyPaid });
      toast.success(t("saved"));
      loadReport();
      onReload();
    } catch { toast.error(t("error_generic")); }
  };

  return (
    <div data-testid="salespeople-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("salespeople")}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("sales_report")}</h1>
        </div>
        <button
          data-testid="add-salesperson"
          onClick={() => setEditingSp({})}
          className="bg-primary hover:bg-primary-hover px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
        >
          <Plus size={14} /> {t("add_salesperson")}
        </button>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-8">
        <div className="bg-background p-5">
          <p className="label-eyebrow mb-2">{t("sales_count")}</p>
          <p className="font-display font-black text-2xl">{report.total_sales}</p>
        </div>
        <div className="bg-background p-5">
          <p className="label-eyebrow mb-2">{t("total_revenue")}</p>
          <p className="font-display font-black text-2xl text-primary">{formatCurrency(report.total_revenue)}</p>
        </div>
        <div className="bg-background p-5">
          <p className="label-eyebrow mb-2">{t("commission_paid")}</p>
          <p className="font-display font-black text-2xl text-success">{formatCurrency(report.total_commission_paid || 0)}</p>
        </div>
        <div className="bg-background p-5">
          <p className="label-eyebrow mb-2">{t("commission_pending")}</p>
          <p className="font-display font-black text-2xl text-warning">{formatCurrency(report.total_commission_pending || 0)}</p>
        </div>
      </div>

      {/* Salespeople list with their performance */}
      <div className="border border-border mb-10">
        <div className="bg-surface px-4 py-3 border-b border-border">
          <p className="label-eyebrow text-primary">{t("by_salesperson")}</p>
        </div>
        {salespeople.length === 0 && report.by_salesperson.length === 0 ? (
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
                <th className="text-right p-3 label-eyebrow"></th>
              </tr>
            </thead>
            <tbody>
              {salespeople.map((sp) => {
                const stats = report.by_salesperson.find(b => b.salesperson_id === sp.id) || { count: 0, commission_paid_total: 0, commission_pending_total: 0, commission_paid_count: 0, commission_pending_count: 0 };
                return (
                  <tr
                    key={sp.id}
                    data-testid={`sp-row-${sp.id}`}
                    onClick={() => setSelectedSp(sp.id)}
                    className={`border-b border-border cursor-pointer transition-colors ${selectedSp === sp.id ? "bg-primary/10" : "hover:bg-surface"}`}
                  >
                    <td className="p-3">
                      <p className="font-display font-bold">{sp.name}</p>
                      <p className="text-xs text-text-secondary">{sp.phone || sp.email || ""}</p>
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
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button data-testid={`edit-sp-${sp.id}`} onClick={() => setEditingSp(sp)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Edit2 size={14} /></button>
                        <button data-testid={`del-sp-${sp.id}`} onClick={() => removeSp(sp.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Unassigned row */}
              {report.by_salesperson.find(b => !b.salesperson_id) && (() => {
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
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>

      {/* Detailed sales spreadsheet */}
      <div className="border border-border">
        <div className="bg-surface px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
          <p className="label-eyebrow text-primary">{t("detailed_sales")}</p>
        </div>

        {/* Salesperson filter pills */}
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

        {(() => {
          const filteredRows = report.rows.filter((r) => {
            if (selectedSp === "all") return true;
            if (selectedSp === "unassigned") return !r.salesperson_id;
            return r.salesperson_id === selectedSp;
          });
          // Subtotals for the filtered selection
          const subtotalRevenue = filteredRows.reduce((s, r) => s + r.sold_price, 0);
          const subtotalCommission = filteredRows.reduce((s, r) => s + (r.commission_amount || 0), 0);
          const paidCount = filteredRows.filter(r => r.commission_paid).length;
          const pendingCount = filteredRows.filter(r => !r.commission_paid).length;
          const selectedSpName = selectedSp === "all" ? t("all_time") : selectedSp === "unassigned" ? t("unassigned") : (salespeople.find(p => p.id === selectedSp)?.name || "");

          return (
            <>
              {/* Subtotals card when a specific salesperson is selected */}
              {selectedSp !== "all" && filteredRows.length > 0 && (
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
                        <th className="text-left p-3 label-eyebrow">{t("salesperson")}</th>
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
                          <td className="p-3">
                            {r.salesperson_name && r.salesperson_name !== "—" ? (
                              <span className="font-display font-bold">{r.salesperson_name}</span>
                            ) : (
                              <span className="text-warning text-xs uppercase tracking-wider">{t("unassigned")}</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-display font-bold">{formatCurrency(r.sold_price)}</td>
                          <td className="p-3 text-right font-display font-bold">{formatCurrency(r.commission_amount || 0)}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              data-testid={`toggle-paid-${r.vehicle_id}`}
                              onClick={() => togglePaid(r.vehicle_id, r.commission_paid)}
                              title={r.commission_paid ? t("mark_unpaid") : t("mark_paid")}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border transition-colors text-xs font-display font-bold uppercase tracking-wider ${
                                r.commission_paid
                                  ? "border-success text-success hover:bg-success/10"
                                  : "border-warning text-warning hover:bg-warning/10"
                              }`}
                            >
                              {r.commission_paid ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                              {r.commission_paid ? t("paid") : t("pending")}
                            </button>
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
            <p className="text-xs text-text-secondary mt-2">Ex: https://intercarautosales.com/vehicle/2022-honda-civic</p>
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
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm mb-1 truncate">{preview.title || "—"}</p>
                  {preview.year ? <p className="text-xs text-text-secondary">{preview.year} {preview.make} {preview.model}</p> : null}
                  {preview.price ? <p className="text-sm font-display font-bold text-primary mt-1">{formatCurrency(preview.price)}</p> : null}
                </div>
              </div>
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
