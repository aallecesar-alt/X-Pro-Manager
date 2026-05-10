import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit2, X, Check, AlertTriangle, Calendar as CalIcon, Phone, Car, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency } from "@/lib/api";

const FREQUENCIES = ["weekly", "biweekly", "monthly"];

function StatusPill({ status, t }) {
  const map = {
    active: { cls: "bg-warning/10 border-warning/40 text-warning", label: t("rec_status_active") },
    completed: { cls: "bg-success/10 border-success/40 text-success", label: t("rec_status_completed") },
    cancelled: { cls: "bg-text-secondary/10 border-text-secondary/40 text-text-secondary", label: t("rec_status_cancelled") },
  };
  const m = map[status] || map.active;
  return <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${m.cls}`}>{m.label}</span>;
}

function formatDate(s) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function isOverdue(due, today) { return due && due < today; }

export default function Receivables({ t }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState("active"); // active | completed | all
  const [editing, setEditing] = useState(null); // {} for new, object for edit
  const [expanded, setExpanded] = useState(null); // receivable id with installments visible
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const reload = async () => {
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const [r, s, v] = await Promise.all([
        api.get("/receivables", { params }),
        api.get("/receivables/summary"),
        api.get("/vehicles"),
      ]);
      setItems(r.data || []);
      setSummary(s.data);
      setVehicles(v.data || []);
    } catch {
      toast.error(t("error_generic"));
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [filter]);

  const removeItem = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/receivables/${id}`); toast.success(t("saved")); reload(); }
    catch { toast.error(t("error_generic")); }
  };

  const payInstallment = async (rid, number) => {
    try {
      await api.post(`/receivables/${rid}/installments/${number}/pay`, {});
      toast.success(t("rec_marked_paid"));
      reload();
    } catch { toast.error(t("error_generic")); }
  };

  const unpayInstallment = async (rid, number) => {
    if (!window.confirm(t("rec_confirm_unpay"))) return;
    try {
      await api.post(`/receivables/${rid}/installments/${number}/unpay`, {});
      toast.success(t("saved"));
      reload();
    } catch { toast.error(t("error_generic")); }
  };

  return (
    <div data-testid="receivables-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("receivables_eyebrow")}</p>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tighter">{t("receivables_title")}</h1>
        </div>
        <button
          data-testid="add-receivable"
          onClick={() => setEditing({})}
          className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest transition-colors"
        >
          <Plus size={14} /> {t("rec_add")}
        </button>
      </div>

      {/* KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-8">
          <div className="bg-background p-5" data-testid="rec-kpi-remaining">
            <p className="label-eyebrow mb-2">{t("rec_total_remaining")}</p>
            <p className="font-display font-black text-2xl text-white">{formatCurrency(summary.total_remaining)}</p>
          </div>
          <div className={`bg-background p-5 ${summary.overdue_count > 0 ? "ring-2 ring-primary/60" : ""}`} data-testid="rec-kpi-overdue">
            <p className="label-eyebrow mb-2 text-primary">{t("rec_overdue")}</p>
            <p className="font-display font-black text-2xl text-primary">{formatCurrency(summary.total_overdue)}</p>
            <p className="text-[10px] text-text-secondary mt-1 uppercase">{summary.overdue_count} {t("rec_installments")}</p>
          </div>
          <div className="bg-background p-5" data-testid="rec-kpi-due-today">
            <p className="label-eyebrow mb-2 text-warning">{t("rec_due_today")}</p>
            <p className="font-display font-black text-2xl text-warning">{formatCurrency(summary.due_today)}</p>
            <p className="text-[10px] text-text-secondary mt-1 uppercase">{summary.due_today_count} {t("rec_installments")}</p>
          </div>
          <div className="bg-background p-5" data-testid="rec-kpi-paid-month">
            <p className="label-eyebrow mb-2 text-success">{t("rec_paid_this_month")}</p>
            <p className="font-display font-black text-2xl text-success">{formatCurrency(summary.paid_this_month)}</p>
            <p className="text-[10px] text-text-secondary mt-1 uppercase">{summary.paid_this_month_count} {t("rec_installments")}</p>
          </div>
        </div>
      )}

      {/* Alerts panel */}
      {summary && (summary.overdue_list.length > 0 || summary.today_list.length > 0 || summary.week_list.length > 0) && (
        <div className="border border-border mb-8">
          <div className="bg-surface px-4 py-3 border-b border-border flex items-center gap-2">
            <AlertTriangle size={16} className="text-primary" />
            <p className="label-eyebrow text-primary">{t("rec_reminders")}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-border">
            <ReminderColumn title={t("rec_overdue")} items={summary.overdue_list} accent="primary" t={t} onPay={payInstallment} testid="rem-overdue" />
            <ReminderColumn title={t("rec_due_today")} items={summary.today_list} accent="warning" t={t} onPay={payInstallment} testid="rem-today" />
            <ReminderColumn title={t("rec_due_week")} items={summary.week_list} accent="info" t={t} onPay={payInstallment} testid="rem-week" />
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: "active", label: t("rec_status_active") },
          { key: "completed", label: t("rec_status_completed") },
          { key: "all", label: t("rec_filter_all") },
        ].map(o => (
          <button
            key={o.key}
            data-testid={`rec-filter-${o.key}`}
            onClick={() => setFilter(o.key)}
            className={`px-4 py-2 text-[11px] font-display font-bold uppercase tracking-widest border transition-colors ${
              filter === o.key ? "bg-primary border-primary text-white" : "border-border text-text-secondary hover:border-primary hover:text-primary"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Receivables list */}
      {items.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center">
          <p className="text-text-secondary text-sm">{t("rec_empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(r => (
            <ReceivableCard
              key={r.id}
              r={r}
              t={t}
              today={today}
              expanded={expanded === r.id}
              onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              onEdit={() => setEditing(r)}
              onDelete={() => removeItem(r.id)}
              onPay={(n) => payInstallment(r.id, n)}
              onUnpay={(n) => unpayInstallment(r.id, n)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ReceivableForm
          receivable={editing.id ? editing : null}
          vehicles={vehicles}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function ReminderColumn({ title, items, accent, t, onPay, testid }) {
  const accentMap = {
    primary: "text-primary border-l-primary",
    warning: "text-warning border-l-warning",
    info: "text-info border-l-info",
  };
  return (
    <div className={`bg-background p-4 border-l-4 ${accentMap[accent] || ""}`} data-testid={testid}>
      <p className={`label-eyebrow mb-3 ${accentMap[accent] || ""}`}>{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-text-secondary text-xs">—</p>
      ) : (
        <div className="space-y-2 max-h-56 overflow-auto">
          {items.map((it, idx) => (
            <div key={idx} className="bg-surface p-2 text-xs flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold truncate">{it.customer_name}</p>
                <p className="text-text-secondary text-[10px]">#{it.number} · {formatDate(it.due_date)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-display font-bold">{formatCurrency(it.amount)}</span>
                <button
                  data-testid={`${testid}-pay-${it.receivable_id}-${it.number}`}
                  onClick={() => onPay(it.receivable_id, it.number)}
                  title={t("rec_mark_paid")}
                  className="w-7 h-7 border border-success/40 text-success hover:bg-success/10 flex items-center justify-center"
                >
                  <Check size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReceivableCard({ r, t, today, expanded, onToggle, onEdit, onDelete, onPay, onUnpay }) {
  const v = r.vehicle;
  const totalPaid = r.paid_total || 0;
  const total = r.total_amount || 0;
  const pct = total > 0 ? Math.min(100, Math.round((totalPaid / total) * 100)) : 0;
  const overdue = (r.overdue_count || 0) > 0;
  return (
    <div data-testid={`rec-card-${r.id}`} className={`border ${overdue ? "border-primary" : "border-border"} bg-background`}>
      <div className="p-4 flex flex-wrap items-start gap-4">
        {v?.images?.[0] && <img src={v.images[0]} alt="" className="w-20 h-16 object-cover hidden sm:block" />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h3 className="font-display font-black text-base uppercase tracking-tight">{r.customer_name}</h3>
            <StatusPill status={r.status} t={t} />
            {overdue && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 border border-primary/40 text-primary bg-primary/10">
                <AlertTriangle size={10} /> {r.overdue_count} {t("rec_overdue").toLowerCase()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-secondary mb-3">
            {v ? (
              <span className="inline-flex items-center gap-1"><Car size={12} /> {v.year} {v.make} {v.model}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-text-secondary/60"><Car size={12} /> {t("rec_no_vehicle_short")}</span>
            )}
            {r.customer_phone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {r.customer_phone}</span>}
            <span className="inline-flex items-center gap-1"><CalIcon size={12} /> {t(`rec_freq_${r.frequency}`)}</span>
          </div>

          {/* Progress bar */}
          <div className="bg-surface h-2 mb-1 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between text-[11px] gap-2">
            <span className="text-text-secondary">
              {t("rec_paid")}: <span className="font-display font-bold text-success">{formatCurrency(totalPaid)}</span>
              {" · "}
              {t("rec_remaining")}: <span className="font-display font-bold text-warning">{formatCurrency(r.remaining || 0)}</span>
              {" · "}
              {t("rec_total")}: <span className="font-display font-bold text-white">{formatCurrency(total)}</span>
            </span>
            <span className="text-text-secondary">
              {r.paid_count || 0}/{r.installments?.length || 0} {t("rec_installments")} · {pct}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button data-testid={`rec-toggle-${r.id}`} onClick={onToggle} className="w-9 h-9 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors" title={expanded ? t("collapse") : t("expand")}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button data-testid={`rec-edit-${r.id}`} onClick={onEdit} className="w-9 h-9 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Edit2 size={14} /></button>
          <button data-testid={`rec-del-${r.id}`} onClick={onDelete} className="w-9 h-9 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-surface/40">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left p-3 label-eyebrow">#</th>
                  <th className="text-left p-3 label-eyebrow">{t("rec_due_date")}</th>
                  <th className="text-right p-3 label-eyebrow">{t("rec_amount")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("rec_status")}</th>
                  <th className="text-left p-3 label-eyebrow">{t("rec_paid_at")}</th>
                  <th className="text-right p-3 label-eyebrow"></th>
                </tr>
              </thead>
              <tbody>
                {(r.installments || []).map(ins => {
                  const overdueRow = ins.status !== "paid" && isOverdue(ins.due_date, today);
                  return (
                    <tr key={ins.number} data-testid={`rec-inst-${r.id}-${ins.number}`} className={`border-b border-border last:border-b-0 ${overdueRow ? "bg-primary/5" : ""}`}>
                      <td className="p-3 font-mono">{ins.number}</td>
                      <td className="p-3 font-mono">
                        {formatDate(ins.due_date)}
                        {overdueRow && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">{t("rec_overdue")}</span>}
                      </td>
                      <td className="p-3 text-right font-display font-bold">{formatCurrency(ins.amount)}</td>
                      <td className="p-3">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 border ${
                          ins.status === "paid" ? "bg-success/10 border-success/40 text-success" : "border-border text-text-secondary"
                        }`}>
                          {ins.status === "paid" ? t("rec_paid_label") : t("rec_pending")}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[10px]">{ins.paid_at ? formatDate(ins.paid_at) : "—"}</td>
                      <td className="p-3 text-right">
                        {ins.status === "paid" ? (
                          <button data-testid={`rec-unpay-${r.id}-${ins.number}`} onClick={() => onUnpay(ins.number)} title={t("rec_undo_paid")} className="text-[10px] uppercase tracking-wider px-2 py-1 border border-border hover:border-primary hover:text-primary inline-flex items-center gap-1">
                            <RotateCcw size={10} /> {t("rec_undo_paid")}
                          </button>
                        ) : (
                          <button data-testid={`rec-pay-${r.id}-${ins.number}`} onClick={() => onPay(ins.number)} className="text-[10px] uppercase tracking-wider px-3 py-1 bg-success hover:opacity-90 text-white inline-flex items-center gap-1">
                            <Check size={10} /> {t("rec_mark_paid")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReceivableForm({ receivable, vehicles, t, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(receivable || {
    vehicle_id: "",
    customer_name: "",
    customer_phone: "",
    total_amount: 0,
    installment_count: 12,
    installment_amount: 0,
    frequency: "monthly",
    start_date: today,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-fill from vehicle when picking one (pull buyer name + phone)
  const onVehicleChange = (vid) => {
    set("vehicle_id", vid);
    if (receivable) return; // editing — don't auto-fill
    const v = vehicles.find(x => x.id === vid);
    if (v) {
      if (v.buyer_name && !form.customer_name) set("customer_name", v.buyer_name);
      if (v.buyer_phone && !form.customer_phone) set("customer_phone", v.buyer_phone);
    }
  };

  // Auto-compute installment_amount from total + count whenever they change
  useEffect(() => {
    if (receivable) return; // don't auto-compute when editing
    const tot = Number(form.total_amount) || 0;
    const cnt = Number(form.installment_count) || 0;
    if (tot > 0 && cnt > 0) {
      const v = Math.round((tot / cnt) * 100) / 100;
      setForm(f => ({ ...f, installment_amount: v }));
    }
    // eslint-disable-next-line
  }, [form.total_amount, form.installment_count]);

  // Sold vehicles first, then in-stock
  const sortedVehicles = useMemo(() => {
    const arr = [...vehicles];
    arr.sort((a, b) => (a.status === "sold" ? 0 : 1) - (b.status === "sold" ? 0 : 1));
    return arr;
  }, [vehicles]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.customer_name) { toast.error(t("rec_customer_required")); return; }
    setSaving(true);
    try {
      if (receivable) {
        // Editing — only header fields can change (status / customer / notes)
        await api.put(`/receivables/${receivable.id}`, {
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          notes: form.notes,
          status: form.status,
        });
      } else {
        await api.post("/receivables", {
          vehicle_id: form.vehicle_id || null,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          total_amount: Number(form.total_amount) || 0,
          installment_count: Number(form.installment_count) || 0,
          installment_amount: Number(form.installment_amount) || 0,
          frequency: form.frequency,
          start_date: form.start_date,
          notes: form.notes,
        });
      }
      toast.success(t("saved"));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setSaving(false); }
  };

  // Preview the schedule (first 4 only)
  const preview = useMemo(() => {
    if (receivable) return [];
    const start = form.start_date;
    if (!start) return [];
    const cnt = Math.min(4, Number(form.installment_count) || 0);
    const out = [];
    for (let i = 0; i < cnt; i++) {
      const d = new Date(start + "T00:00:00");
      if (form.frequency === "weekly") d.setDate(d.getDate() + 7 * i);
      else if (form.frequency === "biweekly") d.setDate(d.getDate() + 14 * i);
      else d.setMonth(d.getMonth() + i);
      out.push({ n: i + 1, due: d.toISOString().slice(0, 10) });
    }
    return out;
  }, [form.start_date, form.installment_count, form.frequency, receivable]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight">
            {receivable ? t("rec_edit") : t("rec_add")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        {!receivable && (
          <div>
            <label className="label-eyebrow block mb-2">{t("rec_vehicle")} <span className="text-text-secondary normal-case">({t("optional")})</span></label>
            <select
              data-testid="rec-vehicle"
              value={form.vehicle_id}
              onChange={(e) => onVehicleChange(e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            >
              <option value="">— {t("rec_no_vehicle")} —</option>
              {sortedVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.status === "sold" ? "✓ " : "• "}
                  {v.year} {v.make} {v.model}
                  {v.buyer_name ? ` — ${v.buyer_name}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-eyebrow block mb-2">{t("rec_customer_name")}</label>
            <input data-testid="rec-customer" required value={form.customer_name} onChange={e => set("customer_name", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">{t("rec_phone")}</label>
            <input data-testid="rec-phone" value={form.customer_phone} onChange={e => set("customer_phone", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
          </div>
        </div>

        {!receivable && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-eyebrow block mb-2">{t("rec_total_amount")}</label>
                <input data-testid="rec-total" type="number" min="0" step="0.01" required value={form.total_amount} onChange={e => set("total_amount", e.target.value)}
                  className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
              </div>
              <div>
                <label className="label-eyebrow block mb-2">{t("rec_frequency")}</label>
                <select data-testid="rec-frequency" value={form.frequency} onChange={e => set("frequency", e.target.value)}
                  className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm">
                  {FREQUENCIES.map(f => <option key={f} value={f}>{t(`rec_freq_${f}`)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label-eyebrow block mb-2">{t("rec_installment_count")}</label>
                <input data-testid="rec-count" type="number" min="1" max="240" required value={form.installment_count} onChange={e => set("installment_count", e.target.value)}
                  className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
              </div>
              <div>
                <label className="label-eyebrow block mb-2">{t("rec_installment_amount")}</label>
                <input data-testid="rec-installment-amount" type="number" min="0" step="0.01" required value={form.installment_amount} onChange={e => set("installment_amount", e.target.value)}
                  className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
              </div>
              <div>
                <label className="label-eyebrow block mb-2">{t("rec_start_date")}</label>
                <input data-testid="rec-start-date" type="date" required value={form.start_date} onChange={e => set("start_date", e.target.value)}
                  className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
              </div>
            </div>

            {/* Preview of upcoming installments */}
            {preview.length > 0 && (
              <div className="bg-surface border border-border p-3">
                <p className="label-eyebrow text-text-secondary mb-2">{t("rec_preview_schedule")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {preview.map(p => (
                    <div key={p.n} className="bg-background p-2 border border-border">
                      <p className="text-text-secondary text-[10px] uppercase">#{p.n}</p>
                      <p className="font-mono">{formatDate(p.due)}</p>
                    </div>
                  ))}
                  {Number(form.installment_count) > 4 && (
                    <div className="bg-background p-2 border border-dashed border-border flex items-center justify-center text-[10px] text-text-secondary uppercase">
                      +{Number(form.installment_count) - 4} {t("rec_more")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {receivable && (
          <div>
            <label className="label-eyebrow block mb-2">{t("rec_status")}</label>
            <select data-testid="rec-status-select" value={form.status || "active"} onChange={e => set("status", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm">
              <option value="active">{t("rec_status_active")}</option>
              <option value="completed">{t("rec_status_completed")}</option>
              <option value="cancelled">{t("rec_status_cancelled")}</option>
            </select>
          </div>
        )}

        <div>
          <label className="label-eyebrow block mb-2">{t("rec_notes")}</label>
          <textarea data-testid="rec-notes" rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm" />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="rec-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <Check size={14} /> {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}
