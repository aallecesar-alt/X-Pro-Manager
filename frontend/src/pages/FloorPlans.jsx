import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Edit2, Trash2, X, Check, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Banknote } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

function formatBRL(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const MONTH_NAMES_PT = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const PALETTE = ["#D92D20", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

export default function FloorPlans({ t, onHistory }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null); // null | "new" | plan
  const [editingPay, setEditingPay] = useState(null); // null | "new" | payment | { defaultDate, defaultPlanId }
  const [dayOpen, setDayOpen] = useState(null); // YYYY-MM-DD

  const reload = async () => {
    try {
      const [p, pay, v] = await Promise.all([
        api.get("/floor-plans"),
        api.get("/floor-plans/payments", { params: { year, month } }),
        api.get("/vehicles"),
      ]);
      setPlans(p.data || []);
      setPayments(pay.data || []);
      setVehicles(v.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    }
  };
  useEffect(() => { reload(); }, [year, month]);

  const paymentsByDay = useMemo(() => {
    const map = {};
    payments.forEach(p => {
      if (!map[p.due_date]) map[p.due_date] = [];
      map[p.due_date].push(p);
    });
    return map;
  }, [payments]);

  // Per-plan totals for the visible month
  const planTotals = useMemo(() => {
    const totals = {};
    plans.forEach(pl => { totals[pl.id] = { paid: 0, pending: 0, count: 0 }; });
    payments.forEach(p => {
      const t = totals[p.floor_plan_id];
      if (!t) return;
      t.count += 1;
      if (p.paid) t.paid += p.amount; else t.pending += p.amount;
    });
    return totals;
  }, [plans, payments]);

  const totalPending = payments.filter(p => !p.paid).reduce((s, p) => s + (p.amount || 0), 0);
  const totalPaid = payments.filter(p => p.paid).reduce((s, p) => s + (p.amount || 0), 0);

  // Build calendar grid for the month
  const grid = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay(); // 0..6
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const goPrev = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const goNext = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); };

  return (
    <div className="border border-border bg-surface" data-testid="floor-plans-section">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarIcon size={16} className="text-primary" />
          <p className="label-eyebrow">{t("floor_plans_title")}</p>
        </div>
        <button
          type="button"
          data-testid="add-floor-plan"
          onClick={() => setEditingPlan("new")}
          className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
        >
          <Plus size={12} /> {t("floor_plans_add_plan")}
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Plan list + monthly totals */}
        <div className="space-y-2">
          {plans.length === 0 ? (
            <p className="text-text-secondary text-sm italic">{t("floor_plans_empty_plans")}</p>
          ) : (
            plans.map(pl => {
              const t2 = planTotals[pl.id] || { paid: 0, pending: 0, count: 0 };
              return (
                <div key={pl.id} data-testid={`fp-${pl.id}`} className="border border-border p-3 group hover:border-primary/60 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: pl.color }} />
                      <p className="font-display font-bold uppercase truncate">{pl.name}</p>
                    </div>
                    <div className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingPlan(pl)} className="w-6 h-6 border border-border hover:border-primary hover:text-primary flex items-center justify-center" title={t("edit")}>
                        <Edit2 size={10} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(t("floor_plans_confirm_delete_plan"))) return;
                          try { await api.delete(`/floor-plans/${pl.id}`); reload(); }
                          catch { toast.error(t("error_generic")); }
                        }}
                        className="w-6 h-6 border border-border hover:border-primary hover:text-primary flex items-center justify-center"
                        title={t("delete")}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">{t("pending")}</span>
                      <span className="font-display font-bold text-warning">{formatBRL(t2.pending)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">{t("paid")}</span>
                      <span className="font-display font-bold text-success">{formatBRL(t2.paid)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {/* Monthly totals */}
          <div className="border-2 border-primary p-3 bg-primary/5 mt-3">
            <p className="label-eyebrow text-primary mb-1">{t("month_total")}</p>
            <div className="text-xs space-y-0.5">
              <div className="flex justify-between"><span className="text-text-secondary">{t("pending")}</span><span className="font-display font-bold text-warning">{formatBRL(totalPending)}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">{t("paid")}</span><span className="font-display font-bold text-success">{formatBRL(totalPaid)}</span></div>
              <div className="flex justify-between border-t border-border mt-1 pt-1"><span className="font-display font-bold uppercase">Total</span><span className="font-display font-black text-primary">{formatBRL(totalPending + totalPaid)}</span></div>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button data-testid="cal-prev" onClick={goPrev} className="w-11 h-11 border border-border hover:border-primary hover:text-primary flex items-center justify-center"><ChevronLeft size={18} /></button>
            <div className="text-center">
              <p className="font-display font-black text-2xl uppercase tracking-tight">{MONTH_NAMES_PT[month]} {year}</p>
              <button onClick={goToday} className="text-[11px] uppercase tracking-widest text-text-secondary hover:text-primary mt-0.5">{t("today")}</button>
            </div>
            <button data-testid="cal-next" onClick={goNext} className="w-11 h-11 border border-border hover:border-primary hover:text-primary flex items-center justify-center"><ChevronRight size={18} /></button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i} className="text-xs uppercase text-text-secondary text-center font-display font-bold tracking-widest py-2">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {grid.map((d, i) => {
              if (d === null) return <div key={i} className="min-h-[110px]" />;
              const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const dayPays = paymentsByDay[iso] || [];
              const isToday = iso === today.toISOString().slice(0, 10);
              const dayPaidTotal = dayPays.reduce((s, p) => s + (p.paid ? p.amount : 0), 0);
              const dayPendTotal = dayPays.reduce((s, p) => s + (!p.paid ? p.amount : 0), 0);
              return (
                <button
                  key={i}
                  type="button"
                  data-testid={`cal-day-${iso}`}
                  onClick={() => {
                    if (dayPays.length > 0) setDayOpen(iso);
                    else setEditingPay({ defaultDate: iso });
                  }}
                  className={`min-h-[110px] border p-2.5 text-left flex flex-col transition-colors hover:border-primary ${
                    isToday ? "border-primary bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <span className={`text-base font-display font-black ${isToday ? "text-primary" : ""}`}>{d}</span>
                  {dayPays.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {dayPays.slice(0, 8).map(p => (
                        <span
                          key={p.id}
                          className={`w-2.5 h-2.5 rounded-full ${p.paid ? "" : "ring-2 ring-warning"}`}
                          style={{ background: p.floor_plan_color || "#888" }}
                        />
                      ))}
                    </div>
                  )}
                  {dayPays.length > 0 && (
                    <div className="mt-auto space-y-0.5">
                      {dayPendTotal > 0 && (
                        <p className="text-xs font-display font-bold text-warning leading-tight">
                          −{formatBRL(dayPendTotal).replace(/,\d\d$/, "")}
                        </p>
                      )}
                      {dayPaidTotal > 0 && (
                        <p className="text-xs font-display font-bold text-success leading-tight">
                          ✓ {formatBRL(dayPaidTotal).replace(/,\d\d$/, "")}
                        </p>
                      )}
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                        {dayPays.length} {dayPays.length === 1 ? "pgto" : "pgtos"}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-text-secondary mt-3">
            <span className="inline-block w-2 h-2 bg-text-secondary rounded-full ring-2 ring-warning mr-2 align-middle" /> {t("pending")}
            <span className="inline-block w-2 h-2 bg-text-secondary rounded-full ml-4 mr-2 align-middle" /> {t("paid")}
            <span className="ml-3">·</span>
            <span className="ml-3">{t("floor_plans_calendar_hint")}</span>
          </p>
        </div>
      </div>

      {editingPlan && (
        <FloorPlanForm
          plan={editingPlan === "new" ? null : editingPlan}
          t={t}
          onClose={() => setEditingPlan(null)}
          onSaved={() => { setEditingPlan(null); reload(); }}
        />
      )}
      {editingPay && (
        <PaymentForm
          payment={editingPay && editingPay.id ? editingPay : null}
          defaults={editingPay && !editingPay.id ? editingPay : null}
          plans={plans}
          vehicles={vehicles}
          t={t}
          onClose={() => setEditingPay(null)}
          onSaved={() => { setEditingPay(null); reload(); }}
        />
      )}
      {dayOpen && (
        <DayDetailModal
          date={dayOpen}
          payments={paymentsByDay[dayOpen] || []}
          plans={plans}
          t={t}
          onClose={() => setDayOpen(null)}
          onEdit={(p) => { setDayOpen(null); setEditingPay(p); }}
          onAdd={() => { setEditingPay({ defaultDate: dayOpen }); setDayOpen(null); }}
          onChanged={reload}
          onHistory={onHistory}
        />
      )}
    </div>
  );
}

function FloorPlanForm({ plan, t, onClose, onSaved }) {
  const [name, setName] = useState(plan?.name || "");
  const [color, setColor] = useState(plan?.color || PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (plan) await api.put(`/floor-plans/${plan.id}`, { name, color });
      else await api.post("/floor-plans", { name, color });
      toast.success(t("saved"));
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || t("error_generic")); }
    finally { setSaving(false); }
  };
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={submit} className="bg-background border border-border w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight">
            {plan ? t("floor_plans_edit_plan") : t("floor_plans_add_plan")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("name")}</label>
          <input data-testid="fp-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="NextGear, Westlake, Floor Xpress..." className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("color")}</label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-9 h-9 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-white" : ""}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" disabled={saving} data-testid="fp-submit" className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest text-white transition-colors">{saving ? "..." : t("save")}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function VehiclePicker({ vehicles, value, onChange, t }) {
  // Hybrid: type a VIN to instantly resolve, OR pick from list.
  const [vinInput, setVinInput] = useState("");
  const [error, setError] = useState("");

  const selected = vehicles.find(v => v.id === value);

  const lookupByVin = () => {
    const q = vinInput.trim();
    if (!q) {
      setError(t("vin_required") || "Digite o VIN");
      return;
    }
    const found = vehicles.find(v => (v.vin || "").toLowerCase() === q.toLowerCase());
    if (!found) {
      setError(t("vin_not_found") || "VIN não encontrado no estoque");
      return;
    }
    setError("");
    setVinInput("");
    onChange(found.id);
  };

  return (
    <div className="space-y-2">
      <label className="label-eyebrow block">{t("vehicle_optional")}</label>

      {/* VIN search box */}
      <div className="flex gap-2">
        <input
          data-testid="pay-vin-input"
          type="text"
          value={vinInput}
          onChange={(e) => { setVinInput(e.target.value.toUpperCase()); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupByVin(); } }}
          placeholder={t("vehicle_vin_search_placeholder") || "Digite o VIN..."}
          className="flex-1 bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm uppercase tracking-wider"
        />
        <button
          type="button"
          data-testid="pay-vin-search"
          onClick={lookupByVin}
          className="border border-primary text-primary hover:bg-primary hover:text-white px-4 h-11 text-[11px] font-display font-bold uppercase tracking-widest transition-colors"
        >
          {t("search") || "Buscar"}
        </button>
      </div>

      {/* OR dropdown */}
      <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase tracking-widest py-1">
        <span className="flex-1 border-t border-border" />
        <span>{t("or") || "OU"}</span>
        <span className="flex-1 border-t border-border" />
      </div>
      <select
        data-testid="pay-vehicle"
        value={value}
        onChange={(e) => { onChange(e.target.value); setError(""); }}
        className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
      >
        <option value="">{t("none")}</option>
        {vehicles.map(v => (
          <option key={v.id} value={v.id}>
            {v.year} {v.make} {v.model}{v.vin ? ` · VIN ${v.vin}` : ""}
          </option>
        ))}
      </select>

      {/* Selected confirmation chip */}
      {selected && (
        <div className="flex items-center gap-2 border border-primary/40 bg-primary/5 text-primary px-3 py-2 text-xs">
          <span className="font-display font-bold uppercase tracking-wider">
            {selected.year} {selected.make} {selected.model}
          </span>
          {selected.vin && <span className="text-text-secondary">· VIN {selected.vin}</span>}
          <button
            type="button"
            data-testid="pay-vehicle-clear"
            onClick={() => onChange("")}
            className="ml-auto text-text-secondary hover:text-primary"
            aria-label="Remover"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error && <p className="text-warning text-xs">{error}</p>}
    </div>
  );
}


function PaymentForm({ payment, defaults, plans, vehicles, t, onClose, onSaved }) {
  const isEdit = !!payment;
  const [form, setForm] = useState({
    floor_plan_id: payment?.floor_plan_id || defaults?.defaultPlanId || (plans[0]?.id || ""),
    vehicle_id: payment?.vehicle_id || "",
    amount: payment?.amount || 0,
    due_date: payment?.due_date || defaults?.defaultDate || new Date().toISOString().slice(0, 10),
    notes: payment?.notes || "",
    paid: !!payment?.paid,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.floor_plan_id) {
      toast.error(t("floor_plans_pick_plan_first"));
      return;
    }
    setSaving(true);
    try {
      if (isEdit) await api.put(`/floor-plans/payments/${payment.id}`, { ...form, amount: Number(form.amount) });
      else await api.post("/floor-plans/payments", { ...form, amount: Number(form.amount) });
      toast.success(t("saved"));
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || t("error_generic")); }
    finally { setSaving(false); }
  };
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={submit} className="bg-background border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-xl uppercase tracking-tight inline-flex items-center gap-2">
            <Banknote size={18} /> {isEdit ? t("floor_plans_edit_pay") : t("floor_plans_add_pay")}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        {plans.length === 0 ? (
          <p className="text-warning text-sm">{t("floor_plans_empty_plans")}</p>
        ) : (
          <>
            <div>
              <label className="label-eyebrow block mb-2">{t("floor_plan")}</label>
              <select data-testid="pay-plan" required value={form.floor_plan_id} onChange={(e) => set("floor_plan_id", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm">
                {plans.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-eyebrow block mb-2">{t("amount")}</label>
                <input data-testid="pay-amount" required type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
              </div>
              <div>
                <label className="label-eyebrow block mb-2">{t("due_date")}</label>
                <input data-testid="pay-date" required type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
              </div>
            </div>
            <VehiclePicker vehicles={vehicles} value={form.vehicle_id} onChange={(id) => set("vehicle_id", id)} t={t} />
            <div>
              <label className="label-eyebrow block mb-2">{t("notes")}</label>
              <input data-testid="pay-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" data-testid="pay-paid" checked={form.paid} onChange={(e) => set("paid", e.target.checked)} />
              <span className="font-display font-bold uppercase">{t("already_paid")}</span>
            </label>
          </>
        )}
        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" disabled={saving || plans.length === 0} data-testid="pay-submit" className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest text-white transition-colors">{saving ? "..." : t("save")}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function DayDetailModal({ date, payments, plans, t, onClose, onEdit, onAdd, onChanged, onHistory }) {
  const [busy, setBusy] = useState(null);
  const togglePay = async (p) => {
    setBusy(p.id);
    try {
      await api.post(`/floor-plans/payments/${p.id}/toggle`);
      onChanged();
    } catch { toast.error(t("error_generic")); }
    finally { setBusy(null); }
  };
  const removePay = async (p) => {
    if (!window.confirm(t("floor_plans_confirm_delete_pay"))) return;
    try { await api.delete(`/floor-plans/payments/${p.id}`); onChanged(); }
    catch { toast.error(t("error_generic")); }
  };
  const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-start justify-center overflow-auto py-12 px-4" data-testid="day-modal">
      <div className="bg-background border border-border w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="label-eyebrow text-primary mb-1">{t("payments_for")}</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {new Date(date + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </h2>
            <p className="text-xs text-text-secondary mt-1">{payments.length} pagamento(s) · total {formatBRL(total)}</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <div className="p-5 space-y-2 max-h-[60vh] overflow-auto">
          {payments.map(p => (
            <div key={p.id} data-testid={`pay-${p.id}`} className={`border p-3 ${p.paid ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: p.floor_plan_color || "#888" }} />
                <div className="flex-1 min-w-[150px]">
                  <p className="font-display font-bold uppercase">{p.floor_plan_name}</p>
                  {p.vehicle_label && <p className="text-xs text-text-secondary">{p.vehicle_label}</p>}
                  {p.notes && <p className="text-xs text-text-secondary italic mt-0.5">"{p.notes}"</p>}
                </div>
                <p className="font-display font-black text-lg whitespace-nowrap">{formatBRL(p.amount)}</p>
                <div className="inline-flex gap-1">
                  <button
                    type="button"
                    data-testid={`toggle-${p.id}`}
                    disabled={busy === p.id}
                    onClick={() => togglePay(p)}
                    className={`px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-widest border transition-colors ${
                      p.paid ? "border-success text-success bg-success/10" : "border-warning text-warning bg-warning/10"
                    }`}
                  >
                    {p.paid ? <><Check size={10} className="inline" /> {t("paid")}</> : t("mark_paid")}
                  </button>
                  <button onClick={() => onEdit(p)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center"><Edit2 size={11} /></button>
                  <button onClick={() => removePay(p)} className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center"><Trash2 size={11} /></button>
                </div>
              </div>
              {onHistory && p.vehicle_id && (
                <button onClick={() => onHistory(p.vehicle_id)} className="text-[10px] uppercase tracking-widest text-text-secondary hover:text-primary mt-2">
                  → {t("vehicle_history")}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("close")}</button>
          <button data-testid="day-add-pay" onClick={onAdd} className="bg-primary hover:bg-primary-hover px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest text-white transition-colors inline-flex items-center gap-2">
            <Plus size={13} /> {t("floor_plans_add_pay")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
