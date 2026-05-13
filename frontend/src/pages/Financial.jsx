import { useEffect, useMemo, useState } from "react";
import NameWithAvatar from "@/components/NameWithAvatar";
import FloorPlans from "@/pages/FloorPlans";
import FloorPlanAlertBanner from "@/components/FloorPlanAlertBanner";
import { Plus, Trash2, Edit2, X, Check, Paperclip, FileText, Image as ImageIcon, RotateCcw, Lock, Download, FolderArchive, ChevronDown, ChevronUp, History } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency } from "@/lib/api";

const CATEGORIES = ["rent", "water", "electricity", "internet", "phone", "salary", "marketing", "maintenance", "taxes", "floor_plan", "post_sale", "other"];

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

export default function Financial({ t, fpAlerts }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [closing, setClosing] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [allSold, setAllSold] = useState([]);
  const [lost, setLost] = useState({ rows: [], by_reason: [], total_count: 0, total_lost_revenue: 0 });
  const [editing, setEditing] = useState(null); // {} for new expense, expense object for edit
  const [editingCredit, setEditingCredit] = useState(null); // {} for new credit, credit object for edit
  const [opTab, setOpTab] = useState("expenses"); // "expenses" | "credits"
  const [detailVid, setDetailVid] = useState(null); // vehicle id to show details for
  const [closings, setClosings] = useState([]);
  const [closingMonth, setClosingMonth] = useState(false); // confirmation modal open
  const [showAllSold, setShowAllSold] = useState(false); // collapsible "all sold cars" history

  const reload = async () => {
    try {
      const [c, m, s, l, ar] = await Promise.all([
        api.get("/financial/closing", { params: { year, month } }),
        api.get("/financial/monthly", { params: { months: 6 } }),
        api.get("/financial/sold-vehicles"),
        api.get("/lost-sales", { params: { year, month } }),
        api.get("/financial/closings"),
      ]);
      setClosing(c.data);
      setMonthly(m.data);
      setAllSold(s.data);
      setLost(l.data);
      setClosings(ar.data || []);
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

  const removeCredit = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/credits/${id}`);
      toast.success(t("saved"));
      reload();
    } catch { toast.error(t("error_generic")); }
  };

  // Undo a payment that auto-generated this credit: unmark the receivable installment as paid.
  // The backend cascades — once the installment is unpaid, the linked credit is auto-removed.
  const undoAutoCredit = async (credit) => {
    if (!credit?.receivable_id || !credit?.installment_number) {
      toast.error("Crédito sem vínculo com Recebíveis. Não posso desfazer automaticamente.");
      return;
    }
    if (!window.confirm(
      `Desmarcar a parcela ${credit.installment_number} como NÃO paga? ` +
      `Isso vai remover este crédito e voltar a parcela para pendente em Recebíveis.`
    )) return;
    try {
      await api.post(`/receivables/${credit.receivable_id}/installments/${credit.installment_number}/unpay`);
      toast.success("Pagamento desfeito");
      reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    }
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
        <div className="flex flex-wrap gap-2 items-center">
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
          <button
            type="button"
            data-testid="open-close-month"
            onClick={() => setClosingMonth(true)}
            className="bg-primary hover:bg-primary-hover text-white px-4 h-11 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest transition-colors"
            title={t("close_month_btn")}
          >
            <Lock size={13} /> {t("close_month_btn")}
          </button>
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
                    <td className="p-3"><NameWithAvatar name={v.salesperson_name} size="sm" /></td>
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

      {/* All sold cars (all-time) — collapsed by default to keep the page tidy */}
      <div className="border border-border mb-10">
        <button
          type="button"
          data-testid="toggle-all-sold"
          onClick={() => setShowAllSold(s => !s)}
          className="w-full bg-surface px-4 py-3 border-b border-border flex items-center justify-between gap-3 hover:bg-surface/70 transition-colors group"
        >
          <span className="flex items-center gap-3">
            <History size={16} className="text-primary" />
            <span className="label-eyebrow text-primary">{t("all_sold_cars")}</span>
            <span className="text-[10px] uppercase tracking-widest px-2 py-1 border border-border text-text-secondary group-hover:border-primary group-hover:text-primary transition-colors">
              {allSold.length} {t("sales_count").toLowerCase()}
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-text-secondary group-hover:text-primary transition-colors">
            {showAllSold ? t("collapse") : t("expand")}
            {showAllSold ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
        {showAllSold && (
          allSold.length === 0 ? (
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
          )
        )}
      </div>

      {/* Lost sales (when client backed out) */}
      {(lost.total_count > 0 || lost.rows.length > 0) && (
        <div className="border border-border mb-10">
          <div className="bg-surface px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <p className="label-eyebrow text-warning">{t("lost_sales_title")}</p>
            <p className="text-xs text-text-secondary">
              {lost.total_count} {t("sales_count").toLowerCase()} ·
              <span className="ml-1">{t("lost_revenue")}: <span className="font-display font-bold text-warning">{formatCurrency(lost.total_lost_revenue)}</span></span>
            </p>
          </div>
          {lost.by_reason.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-border border-b border-border">
              {lost.by_reason.map((b) => (
                <div key={b.reason} className="bg-background p-3" data-testid={`lost-reason-${b.reason}`}>
                  <p className="label-eyebrow text-[9px] mb-1 truncate">{t(`reason_${b.reason}`) || b.reason}</p>
                  <p className="font-display font-black text-lg text-warning">{b.count}</p>
                  <p className="text-[10px] text-text-secondary">{formatCurrency(b.lost_revenue)}</p>
                </div>
              ))}
            </div>
          )}
          {lost.rows.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-8">—</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left p-3 label-eyebrow">{t("sale_date")}</th>
                    <th className="text-left p-3 label-eyebrow">{t("make")}/{t("model")}</th>
                    <th className="text-left p-3 label-eyebrow">{t("buyer_name")}</th>
                    <th className="text-left p-3 label-eyebrow">{t("salesperson")}</th>
                    <th className="text-left p-3 label-eyebrow">{t("lost_reason")}</th>
                    <th className="text-right p-3 label-eyebrow">{t("sold_price")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lost.rows.map((r) => (
                    <tr key={r.id} data-testid={`lost-row-${r.id}`} className="border-b border-border hover:bg-surface transition-colors">
                      <td className="p-3 text-xs text-text-secondary font-mono">
                        {r.lost_at ? new Date(r.lost_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {r.image && <img src={r.image} alt="" className="w-10 h-8 object-cover" />}
                          <p className="font-display font-bold">{r.year} {r.make} {r.model}</p>
                        </div>
                      </td>
                      <td className="p-3">{r.buyer_name || "—"}</td>
                      <td className="p-3"><NameWithAvatar name={r.salesperson_name} size="sm" /></td>
                      <td className="p-3">
                        <div>
                          <span className="text-xs uppercase tracking-wider px-2 py-1 border border-warning/40 text-warning">
                            {t(`reason_${r.reason}`) || r.reason}
                          </span>
                          {r.notes && <p className="text-[11px] text-text-secondary mt-1 italic">"{r.notes}"</p>}
                        </div>
                      </td>
                      <td className="p-3 text-right font-display font-bold text-warning">{formatCurrency(r.sold_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Operational expenses + credits (tabbed) */}
      <div className="border border-border mb-10">
        <div className="bg-surface px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
          {/* Tab pills */}
          <div className="flex gap-2">
            <button
              data-testid="op-tab-expenses"
              onClick={() => setOpTab("expenses")}
              className={`px-4 py-2 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
                opTab === "expenses" ? "bg-warning border-warning text-black" : "border-border text-text-secondary hover:border-warning hover:text-warning"
              }`}
            >
              − {t("operational_expenses")} ({(closing.operational_expenses || []).length})
            </button>
            <button
              data-testid="op-tab-credits"
              onClick={() => setOpTab("credits")}
              className={`px-4 py-2 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
                opTab === "credits" ? "bg-success border-success text-white" : "border-border text-text-secondary hover:border-success hover:text-success"
              }`}
            >
              + {t("operational_credits")} ({(closing.operational_credits || []).length})
            </button>
          </div>

          {/* Add buttons */}
          {opTab === "expenses" ? (
            <button
              data-testid="add-expense"
              onClick={() => setEditing({})}
              className="bg-primary hover:bg-primary-hover px-4 py-2 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
            >
              <Plus size={14} /> {t("add_expense")}
            </button>
          ) : (
            <button
              data-testid="add-credit"
              onClick={() => setEditingCredit({})}
              className="bg-success hover:opacity-90 text-white px-4 py-2 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
            >
              <Plus size={14} /> {t("add_credit")}
            </button>
          )}
        </div>

        {/* Net summary bar — shows credit reduces expense */}
        <div className="bg-background/40 px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-text-secondary uppercase tracking-widest">
            {t("operational_total")}: <span className="font-display font-bold text-warning">−{formatCurrency(closing.operational_total)}</span>
            {" · "}
            {t("operational_credits")}: <span className="font-display font-bold text-success">+{formatCurrency(closing.credits_total || 0)}</span>
          </span>
          <span className="font-display font-bold uppercase tracking-widest">
            {t("net_operational")}: <span className="text-primary">−{formatCurrency(closing.operational_net || closing.operational_total)}</span>
          </span>
        </div>

        {/* Expenses table */}
        {opTab === "expenses" && (
          (closing.operational_expenses || []).length === 0 ? (
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
          )
        )}

        {/* Credits table */}
        {opTab === "credits" && (
          (closing.operational_credits || []).length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-12">{t("no_credits")}</p>
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
                  {closing.operational_credits.map((c) => (
                    <tr key={c.id} data-testid={`credit-row-${c.id}`} className="border-b border-border hover:bg-surface transition-colors">
                      <td className="p-3 font-mono text-xs">{c.date}</td>
                      <td className="p-3">
                        <span className="text-xs uppercase tracking-wider px-2 py-1 border border-success/40 text-success bg-success/5">
                          {t(`credit_cat_${c.category}`) || c.category}
                        </span>
                        {c.auto && (
                          <span className="ml-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-info/40 text-info bg-info/5" title={t("credit_auto_tooltip")}>
                            ⚡ {t("credit_auto")}
                          </span>
                        )}
                      </td>
                      <td className="p-3">{c.description || "—"}</td>
                      <td className="p-3">
                        {c.attachment_url ? (
                          <a href={c.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                            <Paperclip size={12} /> {t("view")}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-right font-display font-bold text-success">+{formatCurrency(c.amount)}</td>
                      <td className="p-3 text-right">
                        <div className="inline-flex gap-1 items-center">
                          {c.auto ? (
                            <>
                              <span
                                className="text-[10px] text-text-secondary uppercase tracking-widest px-2 py-1 border border-info/40 bg-info/5"
                                title={t("credit_auto_tooltip")}
                              >
                                {t("credit_managed_in_receivables")}
                              </span>
                              <button
                                type="button"
                                data-testid={`undo-credit-${c.id}`}
                                onClick={() => undoAutoCredit(c)}
                                title="Desfazer pagamento — marca a parcela como NÃO paga em Recebíveis"
                                className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                              >
                                <RotateCcw size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button data-testid={`edit-credit-${c.id}`} onClick={() => setEditingCredit(c)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Edit2 size={14} /></button>
                              <button data-testid={`del-credit-${c.id}`} onClick={() => removeCredit(c.id)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
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

      {/* Floor Plans calendar */}
      <div className="mt-12 mb-6" data-testid="floor-plans-wrap">
        {fpAlerts && fpAlerts.total > 0 && (
          <FloorPlanAlertBanner alerts={fpAlerts} t={t} compact />
        )}
        <FloorPlans t={t} />
      </div>

      {/* Closings archive (folder of all monthly closings) */}
      <div className="border border-border mt-12 mb-10" data-testid="closings-archive">
        <div className="bg-surface px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FolderArchive size={16} className="text-primary" />
            <p className="label-eyebrow">{t("closings_archive_title")}</p>
          </div>
          <p className="text-xs text-text-secondary">{closings.length} {closings.length === 1 ? t("closing_one") : t("closing_many")}</p>
        </div>
        {closings.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-8 italic">{t("closings_archive_empty")}</p>
        ) : (
          <>
            <ClosingsBarChart closings={closings} t={t} />
            <div className="divide-y divide-border">
            {closings.map(c => {
              const label = `${monthOptions[c.month - 1]?.label} ${c.year}`;
              const downloadUrl = `${api.defaults.baseURL}/financial/closings/${c.id}/pdf`;
              const removeOne = async () => {
                if (!window.confirm(t("closings_confirm_delete"))) return;
                try {
                  await api.delete(`/financial/closings/${c.id}`);
                  toast.success(t("saved"));
                  reload();
                } catch { toast.error(t("error_generic")); }
              };
              return (
                <div key={c.id} data-testid={`closing-${c.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-display font-bold uppercase">{label}</p>
                    <p className="text-[11px] text-text-secondary">
                      {t("closed_at")} {new Date(c.closed_at).toLocaleString("pt-BR")} · {c.closed_by}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-text-secondary uppercase">{t("net_profit")}</p>
                    <p className={`font-display font-black text-base ${c.net_profit >= 0 ? "text-success" : "text-primary"}`}>
                      {formatCurrency(c.net_profit)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-text-secondary uppercase">{t("vehicles")}</p>
                    <p className="font-display font-bold">{c.vehicles_count}</p>
                  </div>
                  <div className="inline-flex gap-1">
                    <a
                      href={`${downloadUrl}?token=${encodeURIComponent(localStorage.getItem("auth_token") || "")}`}
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const r = await api.get(`/financial/closings/${c.id}/pdf`, { responseType: "blob" });
                          const url = URL.createObjectURL(r.data);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `fechamento-${c.year}-${String(c.month).padStart(2, "0")}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch { toast.error(t("error_generic")); }
                      }}
                      data-testid={`download-${c.id}`}
                      className="w-9 h-9 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                      title={t("download")}
                    >
                      <Download size={13} />
                    </a>
                    <button
                      type="button"
                      data-testid={`delete-closing-${c.id}`}
                      onClick={removeOne}
                      className="w-9 h-9 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                      title={t("delete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {closingMonth && (
        <CloseMonthModal
          year={year}
          month={month}
          monthLabel={monthOptions[month - 1]?.label || ""}
          closing={closing}
          t={t}
          onClose={() => setClosingMonth(false)}
          onDone={() => { setClosingMonth(false); reload(); }}
        />
      )}

      {editing && (
        <ExpenseForm
          expense={editing.id ? editing : null}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      {editingCredit && (
        <CreditForm
          credit={editingCredit.id ? editingCredit : null}
          t={t}
          onClose={() => setEditingCredit(null)}
          onSaved={() => { setEditingCredit(null); reload(); }}
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

function CreditForm({ credit, t, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const CREDIT_CATEGORIES = ["sublease", "refund", "commission", "other"];
  const [form, setForm] = useState(credit || { date: today, category: "sublease", description: "", amount: 0, attachment_url: "", attachment_public_id: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFileSelected = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error(t("file_too_large")); return; }
    try {
      const sig = (await api.get("/cloudinary/signature", { params: { folder: `vehicles/expenses/` } })).data;
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
    } catch (err) {
      toast.error(err.message || t("error_generic"));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, amount: Number(form.amount) || 0 };
    try {
      if (credit) await api.put(`/credits/${credit.id}`, payload);
      else await api.post("/credits", payload);
      toast.success(t("saved"));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-success w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight inline-flex items-center gap-2">
            <Plus size={18} className="text-success" /> {credit ? t("edit_credit") : t("add_credit")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label={t("expense_date")} type="date" value={form.date} set={(v) => set("date", v)} required testid="cr-date" />
          <div>
            <label className="label-eyebrow block mb-2">{t("expense_category")}</label>
            <select
              data-testid="cr-category"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            >
              {CREDIT_CATEGORIES.map(c => <option key={c} value={c}>{t(`credit_cat_${c}`)}</option>)}
            </select>
          </div>
        </div>
        <Input label={t("expense_description")} value={form.description} set={(v) => set("description", v)} testid="cr-description" />
        <Input label={t("expense_amount")} type="number" value={form.amount} set={(v) => set("amount", v)} required testid="cr-amount" />
        <div>
          <label className="label-eyebrow block mb-2">{t("expense_attachment")}</label>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer border border-border hover:border-primary px-3 h-11 inline-flex items-center gap-2 text-xs uppercase tracking-wider">
              <Paperclip size={14} /> {t("expense_attachment")}
              <input data-testid="cr-attachment" type="file" accept="image/*,application/pdf" onChange={(e) => onFileSelected(e.target.files?.[0])} className="hidden" />
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
          <button type="submit" data-testid="cr-submit" disabled={saving} className="bg-success hover:opacity-90 text-white disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
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
  const [revertOpen, setRevertOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    api.get(`/vehicles/${vehicleId}`)
      .then((r) => { if (!cancel) { setVehicle(r.data); setLoading(false); } })
      .catch(() => { if (!cancel) { toast.error(t("error_generic")); setLoading(false); } });
    return () => { cancel = true; };
  }, [vehicleId, t]);

  const items = vehicle?.expense_items || [];
  const expensesTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const sold = Number(vehicle?.sold_price) || 0;
  const purchase = Number(vehicle?.purchase_price) || 0;
  const commissionPaid = vehicle?.commission_paid ? Number(vehicle?.commission_amount) || 0 : 0;
  const profit = sold - purchase - expensesTotal - commissionPaid;

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
              {commissionPaid > 0 && (
                <div className="flex justify-between text-sm" data-testid="modal-commission-line">
                  <span className="text-text-secondary">− {t("paid_commissions")} ({vehicle?.salesperson_name || "—"})</span>
                  <span className="font-display font-bold">{formatCurrency(commissionPaid)}</span>
                </div>
              )}
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
                {t("expenses_total")} · {items.length + (commissionPaid > 0 ? 1 : 0)}
              </p>
              {items.length === 0 && commissionPaid === 0 ? (
                <p className="text-text-secondary text-sm text-center py-8 border border-dashed border-border">
                  {t("no_expenses")}
                </p>
              ) : (
                <div className="border border-border">
                  {commissionPaid > 0 && (
                    <div data-testid="vex-commission" className="flex items-center justify-between gap-3 p-3 border-b border-border bg-success/5">
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-bold text-sm truncate">{t("paid_commissions")}</p>
                        <p className="text-xs text-text-secondary">
                          {vehicle?.salesperson_name || "—"}{vehicle?.delivered_at ? ` · ${new Date(vehicle.delivered_at).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      <span className="font-display font-bold text-warning shrink-0 w-28 text-right">
                        −{formatCurrency(commissionPaid)}
                      </span>
                    </div>
                  )}
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
                onClick={() => setRevertOpen(true)}
                className="border border-warning text-warning hover:bg-warning/10 px-4 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2"
              >
                <RotateCcw size={14} /> {t("revert_to_stock")}
              </button>
            </div>
          </>
        )}
      </div>
      {revertOpen && (
        <RevertSaleDialog
          vehicleId={vehicleId}
          t={t}
          onClose={() => setRevertOpen(false)}
          onDone={() => { setRevertOpen(false); onChanged?.(); onClose(); }}
        />
      )}
    </div>
  );
}

const LOST_REASONS = ["financing_denied", "client_changed_mind", "mechanical_issue", "price_disagreement", "found_better_deal", "other"];

function RevertSaleDialog({ vehicleId, t, onClose, onDone }) {
  const [reason, setReason] = useState("client_changed_mind");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/vehicles/${vehicleId}/revert-sale`, { reason, notes });
      toast.success(t("returned_to_stock"));
      onDone();
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={submit} className="bg-background border border-warning w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-eyebrow text-warning mb-1">{t("revert_to_stock")}</p>
            <h2 className="font-display font-black text-lg uppercase tracking-tight">{t("lost_sale_title")}</h2>
          </div>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed border-l-2 border-warning pl-3">
          {t("lost_sale_hint")}
        </p>
        <div>
          <label className="label-eyebrow block mb-2">{t("lost_reason")}</label>
          <div className="space-y-2">
            {LOST_REASONS.map((r) => (
              <label key={r} className={`flex items-center gap-2 px-3 py-2.5 border cursor-pointer transition-colors ${reason === r ? "border-warning bg-warning/10" : "border-border hover:border-warning/60"}`}>
                <input
                  type="radio"
                  name="reason"
                  data-testid={`reason-${r}`}
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-warning"
                />
                <span className="text-sm">{t(`reason_${r}`)}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("notes")}</label>
          <textarea
            data-testid="lost-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-surface border border-border focus:border-warning focus:outline-none px-3 py-2 text-sm"
            placeholder={t("lost_notes_placeholder")}
          />
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="revert-confirm" disabled={saving} className="bg-warning text-black hover:opacity-90 disabled:opacity-50 px-4 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <RotateCcw size={14} /> {saving ? "..." : t("confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}


function CloseMonthModal({ year, month, monthLabel, closing, t, onClose, onDone }) {
  const [markPaid, setMarkPaid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await api.post("/financial/closings", { year, month, mark_commissions_paid: markPaid });
      toast.success(t("close_month_success"));
      // Auto-download the freshly generated PDF
      try {
        const pdf = await api.get(`/financial/closings/${r.data.id}/pdf`, { responseType: "blob" });
        const url = URL.createObjectURL(pdf.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fechamento-${year}-${String(month).padStart(2, "0")}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch { /* user can re-download from archive */ }
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4" data-testid="close-month-modal">
      <div className="bg-background border border-border w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight">
            {t("close_month_title")} <span className="text-primary">{monthLabel} {year}</span>
          </h2>
          <button onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        <p className="text-sm text-text-secondary">{t("close_month_intro")}</p>

        {/* Snapshot preview */}
        <div className="border border-border bg-surface divide-y divide-border">
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-text-secondary">{t("vehicles_sold_label")}</span>
            <span className="font-display font-bold">{closing?.vehicles_count || 0}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-text-secondary">{t("gross_profit")}</span>
            <span className="font-display font-bold text-success">{formatCurrency(closing?.gross_profit || 0)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-text-secondary">{t("operational_total")}</span>
            <span className="font-display font-bold text-warning">−{formatCurrency(closing?.operational_total || 0)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-text-secondary">{t("paid_commissions")}</span>
            <span className="font-display font-bold text-warning">−{formatCurrency(closing?.paid_commissions || 0)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 text-base bg-primary/10">
            <span className="font-display font-bold uppercase">{t("net_profit")}</span>
            <span className={`font-display font-black text-lg ${(closing?.net_profit || 0) >= 0 ? "text-success" : "text-primary"}`}>
              {formatCurrency(closing?.net_profit || 0)}
            </span>
          </div>
        </div>

        {/* Mark commissions paid checkbox */}
        <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            data-testid="mark-commissions-paid"
            checked={markPaid}
            onChange={(e) => setMarkPaid(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-display font-bold">{t("mark_commissions_paid_label")}</span>
            <span className="block text-xs text-text-secondary">{t("mark_commissions_paid_hint")}</span>
          </span>
        </label>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            data-testid="confirm-close-month"
            onClick={submit}
            disabled={submitting}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest text-white transition-colors inline-flex items-center gap-2"
          >
            <Lock size={13} /> {submitting ? "..." : t("close_and_export")}
          </button>
        </div>
      </div>
    </div>
  );
}


function ClosingsBarChart({ closings, t }) {
  // Sort chronologically (oldest -> newest), keep last 12
  const sorted = [...closings]
    .sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month))
    .slice(-12);
  if (sorted.length === 0) return null;
  const monthShort = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const max = Math.max(...sorted.map(c => Math.abs(c.net_profit || 0)), 1);
  return (
    <div className="px-4 py-5 border-b border-border" data-testid="closings-chart">
      <p className="label-eyebrow text-text-secondary mb-4">{t("monthly_evolution")}</p>
      <div className="grid grid-flow-col auto-cols-fr gap-2 items-end h-40">
        {sorted.map(c => {
          const v = c.net_profit || 0;
          const positive = v >= 0;
          const heightPct = Math.max(4, Math.round((Math.abs(v) / max) * 100));
          return (
            <div key={c.id} className="flex flex-col items-center justify-end h-full group" title={`${monthShort[c.month]}/${c.year} · ${formatCurrency(v)}`}>
              <span className={`text-[9px] font-display font-bold mb-1 ${positive ? "text-success" : "text-primary"}`}>
                {formatCurrency(v).replace(/\u00a0/g, " ")}
              </span>
              <div
                className={`w-full transition-all ${positive ? "bg-success/70 group-hover:bg-success" : "bg-primary/70 group-hover:bg-primary"}`}
                style={{ height: `${heightPct}%` }}
              />
              <span className="text-[10px] text-text-secondary uppercase tracking-wider mt-1">
                {monthShort[c.month]}/{String(c.year).slice(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
