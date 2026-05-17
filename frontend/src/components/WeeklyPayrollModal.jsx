import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, ChevronLeft, ChevronRight, Printer, Check, AlertCircle, Calendar, DollarSign } from "lucide-react";
import api, { formatCurrency } from "@/lib/api";

/**
 * WeeklyPayrollModal — preview & close the week for a single salesperson.
 *
 * Step 1: Pick the week (defaults to current Mon→Sat). Preview shows all
 *         FUNDED cars assigned to the salesperson for that period, plus the
 *         suggested salary (from salesperson.salary_weekly). User can:
 *           - Uncheck cars to exclude them
 *           - Edit salary / bonus
 *           - See the live total
 * Step 2: Click "Visualizar PDF" to open a preview-only PDF (using a draft
 *         endpoint? Actually we just save then open the persisted PDF —
 *         simpler & one less code path). Or click "Salvar e Pagar" to persist
 *         and download the receipt.
 */
export default function WeeklyPayrollModal({ salesperson, onClose, onSaved }) {
  // Today (UTC). Used as default week_start.
  const today = new Date().toISOString().slice(0, 10);
  const [weekStart, setWeekStart] = useState(today);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [excluded, setExcluded] = useState(new Set());
  const [salary, setSalary] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${salesperson.id}/payroll-week`, {
        params: { week_start: weekStart },
      });
      setPreview(r.data);
      setSalary(r.data?.suggested?.salary || 0);
      setBonus(r.data?.suggested?.bonus || 0);
      setExcluded(new Set()); // reset selection when reloading
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao carregar preview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weekStart]);

  const shiftWeek = (days) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + days);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const toggleCar = (cid) => {
    setExcluded((prev) => {
      const n = new Set(prev);
      if (n.has(cid)) n.delete(cid); else n.add(cid);
      return n;
    });
  };

  const selectedCars = (preview?.cars || []).filter((c) => !excluded.has(c.id));
  const commissions = selectedCars.reduce((s, c) => s + (c.commission_amount || 0), 0);
  const total = Number(salary || 0) + commissions + Number(bonus || 0);

  const closeAndPay = async () => {
    if (selectedCars.length === 0 && Number(salary || 0) === 0 && Number(bonus || 0) === 0) {
      toast.error("Nada para pagar — selecione ao menos 1 carro ou informe um valor.");
      return;
    }
    if (!window.confirm(
      `Confirmar pagamento de ${formatCurrency(total)} para ${salesperson.name}?\n\nIsto marca ${selectedCars.length} carro(s) como comissão paga e não pode ser desfeito sem ação manual.`
    )) return;

    setSaving(true);
    try {
      const res = await api.post(`/salespeople/${salesperson.id}/payroll-week`, {
        week_start: weekStart,
        salary: Number(salary || 0),
        bonus: Number(bonus || 0),
        car_ids: selectedCars.map((c) => c.id),
      });
      toast.success("Pagamento registrado! Abrindo recibo...");
      await openReceipt(res.data.id);
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = async (pid) => {
    try {
      const r = await api.get(`/payrolls/${pid}/receipt.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error("Erro ao gerar PDF");
    }
  };

  const periodLabel = preview?.period
    ? `${formatDateBr(preview.period.start)} → ${formatDateBr(preview.period.end)}`
    : "...";

  return (
    <div
      data-testid="payroll-modal"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-border w-full max-w-3xl" onMouseDown={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="label-eyebrow text-primary mb-1">Fechar semana</p>
            <h2 className="font-display font-black text-2xl uppercase tracking-tight">
              {salesperson.name}
            </h2>
          </div>
          <button data-testid="payroll-close" onClick={onClose} className="text-text-secondary hover:text-primary">
            <X size={20} />
          </button>
        </div>

        {/* WEEK PICKER */}
        <div className="px-6 py-4 border-b border-border bg-surface/40 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button data-testid="prev-week" onClick={() => shiftWeek(-7)} className="w-8 h-8 border border-border hover:border-primary grid place-items-center">
              <ChevronLeft size={14} />
            </button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary inline-flex items-center gap-1">
                <Calendar size={11} /> Semana
              </p>
              <p data-testid="week-label" className="font-display font-bold text-sm mt-0.5">{periodLabel}</p>
              <p className="text-[10px] text-text-secondary">Segunda → Sábado</p>
            </div>
            <button data-testid="next-week" onClick={() => shiftWeek(7)} className="w-8 h-8 border border-border hover:border-primary grid place-items-center">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-text-secondary">Carros funded</p>
            <p data-testid="cars-count" className="font-display font-bold text-2xl text-success">
              {preview?.cars?.length ?? "—"}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-text-secondary text-sm py-10">Carregando preview…</p>
        ) : (
          <>
            {/* CARS TABLE */}
            <div className="px-6 py-4">
              <p className="label-eyebrow text-text-secondary mb-3">Carros funded da semana</p>
              {(!preview?.cars || preview.cars.length === 0) ? (
                <div className="border border-border bg-surface/40 p-8 text-center">
                  <AlertCircle size={20} className="mx-auto mb-2 text-text-secondary" />
                  <p className="text-sm text-text-secondary">Nenhum carro funded para esse vendedor nesta semana.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-left label-eyebrow">Incl.</th>
                      <th className="p-2 text-left label-eyebrow">Veículo</th>
                      <th className="p-2 text-left label-eyebrow">Funded</th>
                      <th className="p-2 text-right label-eyebrow">Venda</th>
                      <th className="p-2 text-right label-eyebrow">Comissão</th>
                    </tr>
                  </thead>
                  <tbody data-testid="cars-list">
                    {preview.cars.map((c) => {
                      const inc = !excluded.has(c.id);
                      return (
                        <tr key={c.id} data-testid={`car-row-${c.id}`} className={`border-b border-border/60 ${inc ? "" : "opacity-40"}`}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              data-testid={`car-include-${c.id}`}
                              checked={inc}
                              onChange={() => toggleCar(c.id)}
                              className="accent-success"
                            />
                          </td>
                          <td className="p-2">
                            <p className="font-display font-bold">{c.year} {c.make} {c.model}</p>
                            {c.buyer_name && <p className="text-[10px] text-text-secondary">→ {c.buyer_name}</p>}
                          </td>
                          <td className="p-2 text-text-secondary text-xs">
                            {c.funded_at ? new Date(c.funded_at).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="p-2 text-right">{formatCurrency(c.sold_price)}</td>
                          <td className="p-2 text-right font-display font-bold text-success">{formatCurrency(c.commission_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* TOTALS */}
            <div className="px-6 py-4 border-t border-border bg-surface/30 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <NumberField
                  label="Salário base"
                  value={salary}
                  onChange={setSalary}
                  testid="payroll-salary"
                  hint="Vem do perfil do vendedor"
                />
                <div>
                  <p className="label-eyebrow mb-2">Comissões ({selectedCars.length})</p>
                  <p data-testid="payroll-commissions" className="font-display font-bold text-2xl text-success leading-10 px-3">
                    {formatCurrency(commissions)}
                  </p>
                </div>
                <NumberField
                  label="Bônus / Extras"
                  value={bonus}
                  onChange={setBonus}
                  testid="payroll-bonus"
                  hint="Opcional"
                />
              </div>
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <p className="font-display font-bold uppercase tracking-widest text-sm text-text-secondary inline-flex items-center gap-2">
                  <DollarSign size={14} className="text-primary" />
                  Total a pagar
                </p>
                <p data-testid="payroll-total" className="font-display font-black text-3xl text-primary">
                  {formatCurrency(total)}
                </p>
              </div>
            </div>

            {/* FOOTER */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                data-testid="payroll-cancel"
                className="border border-border text-text-secondary hover:border-white hover:text-white px-5 h-10 font-display font-bold uppercase text-xs tracking-widest"
              >
                Cancelar
              </button>
              <button
                onClick={closeAndPay}
                disabled={saving}
                data-testid="payroll-pay"
                className="bg-primary hover:bg-primary-hover text-white px-5 h-10 inline-flex items-center gap-2 font-display font-bold uppercase text-xs tracking-widest disabled:opacity-50"
              >
                <Printer size={14} />
                {saving ? "..." : "Salvar e Imprimir Recibo"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, testid, hint }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <input
        data-testid={testid}
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm"
      />
      {hint && <p className="text-[10px] text-text-secondary mt-1">{hint}</p>}
    </div>
  );
}

function formatDateBr(s) {
  if (!s) return "—";
  try {
    const [y, m, d] = s.split("-").map(Number);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  } catch {
    return s;
  }
}
