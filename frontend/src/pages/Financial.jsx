import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit2, X, Check, Paperclip, FileText, Image as ImageIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency } from "@/lib/api";

const CATEGORIES = ["rent", "water", "electricity", "internet", "phone", "salary", "marketing", "maintenance", "taxes", "other"];

function Input({ label, value, set, type = "text", testid, required }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <input
        data-testid={testid}
        type={type}
        value={value}
        required={required}
        onChange={(e) => set(e.target.value)}
        className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
      />
    </div>
  );
}

function EditablePrice({ value, onSave, testid }) {
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
        className="w-32 bg-surface border border-primary focus:outline-none px-2 h-9 text-sm font-display font-bold text-right"
      />
    );
  }
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={() => { setDraft(String(value ?? 0)); setEditing(true); }}
      className="font-display font-bold hover:text-primary transition-colors border-b border-dashed border-text-secondary/40 hover:border-primary"
      title="Click to edit"
    >
      {formatCurrency(Number(value) || 0)}
    </button>
  );
}

export default function Financial({ t }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [closing, setClosing] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [allSold, setAllSold] = useState([]);
  const [editing, setEditing] = useState(null); // {} for new, expense object for edit
  const [detailVid, setDetailVid] = useState(null); // vehicle id to show details for

  const reload = async () => {
    try {
      const [c, m, s] = await Promise.all([
        api.get("/financial/closing", { params: { year, month } }),
        api.get("/financial/monthly", { params: { months: 6 } }),
        api.get("/financial/sold-vehicles"),
      ]);
      setClosing(c.data);
      setMonthly(m.data);
      setAllSold(s.data);
    } catch { toast.error(t("error_generic")); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [year, month]);

  const updatePurchasePrice = async (vehicleId, value) => {
    const v = Number(value);
    if (Number.isNaN(v) || v < 0) {
      toast.error(t("error_generic"));
      return;
    }
    try {
      await api.put(`/vehicles/${vehicleId}`, { purchase_price: v });
      toast.success(t("saved"));
      reload();
    } catch { toast.error(t("error_generic")); }
  };

  const removeExpense = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success(t("saved"));
      reload();
    } catch { toast.error(t("error_generic")); }
  };

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    value: i + 1, label: new Date(2000, i, 1).toLocaleString(undefined, { month: "long" }),
  })), []);
  const yearOptions = useMemo(() => {
    const arr = [];
    for (let y = now.getFullYear() - 4; y <= now.getFullYear() + 1; y++) arr.push(y);
    return arr;
  }, [now]);

  if (!closing) return <p className="text-text-secondary">...</p>;

  const maxNet = Math.max(...monthly.map(m => Math.abs(m.net_profit) || 0), 1);

  return (
    <div data-testid="financial-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("financial")}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("financial_dashboard")}</h1>
        </div>
        <div className="flex gap-2 items-center">
          <select
            data-testid="financial-month"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          >
            {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            data-testid="financial-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-10">
        <div className="bg-background p-6" data-testid="kpi-gross">
          <p className="label-eyebrow mb-3">{t("gross_profit")}</p>
          <p className="font-display font-black text-2xl text-success">{formatCurrency(closing.gross_profit)}</p>
          <p className="text-xs text-text-secondary mt-1">{closing.vehicles_count} {t("cars_sold_in_month").toLowerCase()}</p>
        </div>
        <div className="bg-background p-6" data-testid="kpi-opex">
          <p className="label-eyebrow mb-3">{t("operational_total")}</p>
          <p className="font-display font-black text-2xl text-warning">−{formatCurrency(closing.operational_total)}</p>
          <p className="text-xs text-text-secondary mt-1">{closing.operational_expenses.length} {t("expenses_total").toLowerCase()}</p>
        </div>
        <div className="bg-background p-6" data-testid="kpi-commissions">
          <p className="label-eyebrow mb-3">{t("paid_commissions")}</p>
          <p className="font-display font-black text-2xl text-warning">−{formatCurrency(closing.paid_commissions)}</p>
        </div>
        <div className="bg-background p-6" data-testid="kpi-net">
          <p className="label-eyebrow text-primary mb-3">{t("net_profit")}</p>
          <p className={`font-display font-black text-3xl ${closing.net_profit >= 0 ? "text-success" : "text-primary"}`}>
            {formatCurrency(closing.net_profit)}
          </p>
        </div>
      </div>

      {/* Cars sold in the month */}
      <div className="border border-border mb-10">
        <div className="bg-surface px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="label-eyebrow text-primary">{t("cars_sold_in_month")}</p>
          <p className="text-xs text-text-secondary">
            {t("revenue")}: <span className="font-display font-bold text-white">{formatCurrency(closing.total_revenue)}</span>
            {" · "}
            {t("expenses_total")}: <span className="font-display font-bold text-white">{formatCurrency(closing.total_cost)}</span>
          </p>
        </div>
        {closing.vehicles_sold.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-12">—</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left p-3 label-eyebrow">{t("make")}/{t("model")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("buyer_name")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("salesperson")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("purchase_price")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("expenses_total")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("sold_price")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("real_profit")}</th>
                </tr>
              </thead>
              <tbody>
                {closing.vehicles_sold.map((v) => (
                  <tr key={v.vehicle_id} data-testid={`fin-sale-${v.vehicle_id}`} className="border-b border-border hover:bg-surface transition-colors">
                    <td className="p-3">
                      <button
                        type="button"
                        data-testid={`open-detail-${v.vehicle_id}`}
                        onClick={() => setDetailVid(v.vehicle_id)}
                        className="flex items-center gap-2 text-left hover:text-primary transition-colors"
                      >
                        {v.image && <img src={v.image} alt="" className="w-10 h-8 object-cover" />}
                        <div>
                          <p className="font-display font-bold border-b border-dashed border-text-secondary/40">{v.year} {v.make} {v.model}</p>
                          <p className="text-[10px] text-text-secondary uppercase tracking-wider">{t("view_expenses")}</p>
                        </div>
                      </button>
                    </td>
                    <td className="p-3">{v.buyer_name || "—"}</td>
                    <td className="p-3">{v.salesperson_name || "—"}</td>
                    <td className="p-3 text-right">
                      <EditablePrice value={v.purchase_price} onSave={(val) => updatePurchasePrice(v.vehicle_id, val)} testid={`edit-purchase-${v.vehicle_id}`} />
                    </td>
                    <td className="p-3 text-right text-text-secondary">{formatCurrency(v.expenses)}</td>
                    <td className="p-3 text-right font-display font-bold">{formatCurrency(v.sold_price)}</td>
                    <td className={`p-3 text-right font-display font-bold ${v.profit >= 0 ? "text-success" : "text-primary"}`}>
                      {formatCurrency(v.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All sold cars (all-time) */}
      <div className="border border-border mb-10">
        <div className="bg-surface px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="label-eyebrow text-primary">{t("all_sold_cars")}</p>
          <p className="text-xs text-text-secondary">{allSold.length} {t("sales_count").toLowerCase()}</p>
        </div>
        {allSold.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-12">—</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left p-3 label-eyebrow">{t("sale_date")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("make")}/{t("model")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("buyer_name")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("purchase_price")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("sold_price")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("real_profit")}</th>
                </tr>
              </thead>
              <tbody>
                {allSold.map((v) => (
                  <tr key={v.vehicle_id} data-testid={`fin-all-${v.vehicle_id}`} className="border-b border-border hover:bg-surface transition-colors">
                    <td className="p-3 text-xs text-text-secondary font-mono">
                      {v.sold_at ? new Date(v.sold_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        data-testid={`open-detail-all-${v.vehicle_id}`}
                        onClick={() => setDetailVid(v.vehicle_id)}
                        className="flex items-center gap-2 text-left hover:text-primary transition-colors"
                      >
                        {v.image && <img src={v.image} alt="" className="w-10 h-8 object-cover" />}
                        <div>
                          <p className="font-display font-bold border-b border-dashed border-text-secondary/40">{v.year} {v.make} {v.model}</p>
                          <p className="text-[10px] text-text-secondary uppercase tracking-wider">{t("view_expenses")}</p>
                        </div>
                      </button>
                    </td>
                    <td className="p-3">{v.buyer_name || "—"}</td>
                    <td className="p-3 text-right">
                      <EditablePrice value={v.purchase_price} onSave={(val) => updatePurchasePrice(v.vehicle_id, val)} testid={`edit-purchase-all-${v.vehicle_id}`} />
                    </td>
                    <td className="p-3 text-right font-display font-bold">{formatCurrency(v.sold_price)}</td>
                    <td className={`p-3 text-right font-display font-bold ${v.profit >= 0 ? "text-success" : "text-primary"}`}>
                      {formatCurrency(v.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Operational expenses */}
      <div className="border border-border mb-10">
        <div className="bg-surface px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="label-eyebrow text-primary">{t("operational_expenses")}</p>
          <button
            data-testid="add-expense"
            onClick={() => setEditing({})}
            className="bg-primary hover:bg-primary-hover px-4 py-2 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
          >
            <Plus size={14} /> {t("add_expense")}
          </button>
        </div>
        {closing.operational_expenses.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-12">{t("no_expenses")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left p-3 label-eyebrow">{t("expense_date")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("expense_category")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("expense_description")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("expense_attachment")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("expense_amount")}</th>
                  <th className="text-right p-3 label-eyebrow"></th>
                </tr>
              </thead>
              <tbody>
                {closing.operational_expenses.map((e) => (
                  <tr key={e.id} data-testid={`expense-row-${e.id}`} className="border-b border-border hover:bg-surface transition-colors">
                    <td className="p-3 font-mono text-xs">{e.date}</td>
                    <td className="p-3">
                      <span className="text-xs uppercase tracking-wider px-2 py-1 border border-border">
                        {t(`cat_${e.category}`) || e.category}
                      </span>
                    </td>
                    <td className="p-3">{e.description || "—"}</td>
                    <td className="p-3">
                      {e.attachment_url ? (
                        <a href={e.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                          <Paperclip size={12} /> {t("view")}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-right font-display font-bold text-warning">−{formatCurrency(e.amount)}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-1">
                        <button data-testid={`edit-expense-${e.id}`} onClick={() => setEditing(e)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Edit2 size={14} /></button>
                        <button data-testid={`del-expense-${e.id}`} onClick={() => removeExpense(e.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Last 6 months net profit chart */}
      <div className="border border-border p-6">
        <p className="label-eyebrow text-primary mb-6">{t("monthly_closing")} · 6m</p>
        <div className="space-y-3">
          {monthly.map((m) => {
            const w = (Math.abs(m.net_profit) / maxNet) * 100;
            const positive = m.net_profit >= 0;
            return (
              <div key={m.label} className="flex items-center gap-4">
                <span className="font-display font-bold text-sm w-20">{m.label}</span>
                <div className="flex-1 bg-surface h-8 relative overflow-hidden">
                  <div className={`absolute inset-y-0 left-0 ${positive ? "bg-success" : "bg-primary"}`} style={{ width: `${w}%` }} />
                </div>
                <span className={`font-display font-bold text-sm w-32 text-right ${positive ? "text-success" : "text-primary"}`}>
                  {formatCurrency(m.net_profit)}
                </span>
                <span className="text-xs text-text-secondary w-24 text-right">{m.vehicles_count} {t("sales_count").toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <ExpenseForm
          expense={editing.id ? editing : null}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      {detailVid && (
        <VehicleExpensesModal
          vehicleId={detailVid}
          t={t}
          onClose={() => setDetailVid(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function ExpenseForm({ expense, t, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(expense || { date: today, category: "other", description: "", amount: 0, attachment_url: "", attachment_public_id: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFileSelected = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t("file_too_large"));
      return;
    }
    try {
      const sigRes = await api.get("/cloudinary/signature", { params: { folder: `vehicles/expenses/` } });
      const sig = sigRes.data;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", sig.timestamp);
      fd.append("signature", sig.signature);
      fd.append("folder", sig.folder);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`, { method: "POST", body: fd });
      const json = await res.json();
      if (!json.secure_url) throw new Error(json.error?.message || "upload failed");
      set("attachment_url", json.secure_url);
      set("attachment_public_id", json.public_id);
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err.message || t("error_generic"));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, amount: Number(form.amount) || 0 };
    try {
      if (expense) await api.put(`/expenses/${expense.id}`, payload);
      else await api.post("/expenses", payload);
      toast.success(t("saved"));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight">
            {expense ? t("edit") : t("add_expense")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label={t("expense_date")} type="date" value={form.date} set={(v) => set("date", v)} required testid="exp-date" />
          <div>
            <label className="label-eyebrow block mb-2">{t("expense_category")}</label>
            <select
              data-testid="exp-category"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{t(`cat_${c}`)}</option>)}
            </select>
          </div>
        </div>
        <Input label={t("expense_description")} value={form.description} set={(v) => set("description", v)} testid="exp-description" />
        <Input label={t("expense_amount")} type="number" value={form.amount} set={(v) => set("amount", v)} required testid="exp-amount" />
        <div>
          <label className="label-eyebrow block mb-2">{t("expense_attachment")}</label>
          <div className="flex items-center gap-3">
            <label data-testid="exp-attachment-label" className="cursor-pointer border border-border hover:border-primary px-3 h-11 inline-flex items-center gap-2 text-xs uppercase tracking-wider">
              <Paperclip size={14} /> {t("expense_attachment")}
              <input data-testid="exp-attachment" type="file" accept="image/*,application/pdf" onChange={(e) => onFileSelected(e.target.files?.[0])} className="hidden" />
            </label>
            {form.attachment_url && (
              <a href={form.attachment_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                {form.attachment_url.match(/\.(pdf)$/i) ? <FileText size={14} /> : <ImageIcon size={14} />} {t("view")}
              </a>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="exp-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <Check size={14} /> {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function VehicleExpensesModal({ vehicleId, t, onClose, onChanged }) {
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    let cancel = false;
    api.get(`/vehicles/${vehicleId}`)
      .then((r) => { if (!cancel) { setVehicle(r.data); setLoading(false); } })
      .catch(() => { if (!cancel) { toast.error(t("error_generic")); setLoading(false); } });
    return () => { cancel = true; };
  }, [vehicleId, t]);

  const revertSale = async () => {
    if (!window.confirm(t("confirm_revert_sale"))) return;
    setReverting(true);
    try {
      await api.put(`/vehicles/${vehicleId}`, {
        status: "in_stock",
        sold_price: 0,
        sold_at: null,
        delivered_at: null,
        delivery_step: 0,
        buyer_name: "",
        buyer_phone: "",
        payment_method: "",
        bank_name: "",
        salesperson_id: "",
        salesperson_name: "",
        commission_amount: 0,
        commission_paid: false,
      });
      toast.success(t("returned_to_stock"));
      onChanged?.();
      onClose();
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setReverting(false);
    }
  };

  const items = vehicle?.expense_items || [];
  const expensesTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const sold = Number(vehicle?.sold_price) || 0;
  const purchase = Number(vehicle?.purchase_price) || 0;
  const profit = sold - purchase - expensesTotal;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <div className="bg-background border border-border w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <p className="label-eyebrow text-primary mb-1">{t("real_profit")}</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "..."}
            </h2>
            {vehicle?.buyer_name && <p className="text-xs text-text-secondary mt-1">{t("buyer_name")}: {vehicle.buyer_name}</p>}
          </div>
          <button onClick={onClose} data-testid="close-detail"><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        {loading ? (
          <p className="text-text-secondary text-sm text-center py-12">...</p>
        ) : (
          <>
            {/* Summary breakdown */}
            <div className="p-6 space-y-2 border-b border-border">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">{t("sold_price")}</span>
                <span className="font-display font-bold">{formatCurrency(sold)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">− {t("purchase_price")}</span>
                <span className="font-display font-bold">{formatCurrency(purchase)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">− {t("expenses_total")}</span>
                <span className="font-display font-bold">{formatCurrency(expensesTotal)}</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-border">
                <span className="label-eyebrow text-primary">{t("real_profit")}</span>
                <span className={`font-display font-black text-2xl ${profit >= 0 ? "text-success" : "text-primary"}`}>
                  {formatCurrency(profit)}
                </span>
              </div>
            </div>

            {/* Itemized expenses */}
            <div className="p-6">
              <p className="label-eyebrow text-primary mb-4">
                {t("expenses_total")} · {items.length}
              </p>
              {items.length === 0 ? (
                <p className="text-text-secondary text-sm text-center py-8 border border-dashed border-border">
                  {t("no_expenses")}
                </p>
              ) : (
                <div className="border border-border">
                  {items.map((it, i) => {
                    const att = (it.attachments && it.attachments[0]) || null;
                    return (
                      <div key={it.id || i} data-testid={`vex-item-${i}`} className="flex items-center justify-between gap-3 p-3 border-b border-border last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-display font-bold text-sm truncate">{it.description || "—"}</p>
                          <p className="text-xs text-text-secondary">
                            {it.category || "—"}{it.date ? ` · ${it.date}` : ""}
                          </p>
                        </div>
                        {att?.url && (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                          >
                            {(att.url || "").match(/\.(pdf)$/i) ? <FileText size={12} /> : <ImageIcon size={12} />} {t("view")}
                          </a>
                        )}
                        <span className="font-display font-bold text-warning shrink-0 w-28 text-right">
                          −{formatCurrency(Number(it.amount) || 0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-t border-border bg-surface/30">
              <p className="text-xs text-text-secondary leading-relaxed flex-1 min-w-[200px]">
                {t("revert_sale_hint")}
              </p>
              <button
                type="button"
                data-testid="revert-sale"
                onClick={revertSale}
                disabled={reverting}
                className="border border-warning text-warning hover:bg-warning/10 disabled:opacity-50 px-4 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2"
              >
                <RotateCcw size={14} /> {reverting ? "..." : t("revert_to_stock")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
