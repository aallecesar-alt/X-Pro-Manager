import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Plus, Printer, Trash2, DollarSign, CheckCircle2, AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/api";

/**
 * DownPaymentDialog
 * Manages partial payments toward a vehicle's agreed down_payment (entrada).
 * Shows running balance (agreed / paid / remaining), lists all past payments
 * with PDF download + delete, and lets the user log a new payment.
 *
 * Props:
 *   vehicle   : vehicle object (must have `id`, `down_payment`, buyer_*)
 *   t         : i18n function
 *   onClose() : called when the dialog is dismissed
 *   onChange(summary) : called after any add/delete so the parent can refresh
 *                       the status pill on the pipeline card. Receives the
 *                       new summary `{ agreed, paid, balance, fully_paid }`.
 */
export default function DownPaymentDialog({ vehicle, t, onClose, onChange }) {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({ agreed: 0, paid: 0, balance: 0, fully_paid: false });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    amount: "",
    payment_method: "Cash",
    paid_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/vehicles/${vehicle.id}/down-payments`);
      setPayments(r.data?.payments || []);
      setSummary(r.data?.summary || { agreed: 0, paid: 0, balance: 0, fully_paid: false });
      onChange?.(r.data?.summary);
    } catch {
      toast.error(t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!amt || amt <= 0) {
      toast.error(t("dp_amount_required") || "Informe um valor maior que zero");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/vehicles/${vehicle.id}/down-payments`, {
        amount: amt,
        payment_method: form.payment_method,
        paid_at: form.paid_at,
        notes: form.notes,
      });
      toast.success(t("dp_payment_saved") || "Pagamento registrado!");
      // Open PDF in a new tab automatically
      openPdf(res.data.id);
      setForm({
        amount: "",
        payment_method: "Cash",
        paid_at: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally {
      setSaving(false);
    }
  };

  const openPdf = async (pid) => {
    try {
      const res = await api.get(`/down-payments/${pid}/receipt.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error(t("error_generic"));
    }
  };

  const removePayment = async (pid) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/down-payments/${pid}`);
      toast.success(t("saved"));
      reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    }
  };

  const agreed = Number(summary.agreed) || 0;
  const paid = Number(summary.paid) || 0;
  const balance = Number(summary.balance) || Math.max(agreed - paid, 0);
  const fullyPaid = summary.fully_paid || (agreed > 0 && balance <= 0);
  const pct = agreed > 0 ? Math.min(100, Math.round((paid / agreed) * 100)) : 0;

  return (
    <div
      data-testid={`dp-dialog-${vehicle.id}`}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-border w-full max-w-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <p className="label-eyebrow text-primary mb-1 inline-flex items-center gap-1.5">
              <DollarSign size={12} />
              {t("dp_section") || "Pagamento de Entrada"}
            </p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h2>
            {vehicle.buyer_name && (
              <p className="text-xs text-text-secondary mt-1">
                {t("buyer") || "Comprador"}: <span className="text-white">{vehicle.buyer_name}</span>
              </p>
            )}
          </div>
          <button data-testid="dp-close" onClick={onClose} className="text-text-secondary hover:text-primary">
            <X size={20} />
          </button>
        </div>

        {/* STATUS HERO */}
        <div className={`px-6 py-5 border-b border-border ${fullyPaid ? "bg-success/[0.06]" : "bg-surface/40"}`}>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              {fullyPaid ? (
                <CheckCircle2 size={18} className="text-success" />
              ) : (
                <AlertCircle size={18} className="text-warning" />
              )}
              <span
                className={`font-display font-black uppercase tracking-wider text-sm ${
                  fullyPaid ? "text-success" : "text-warning"
                }`}
                data-testid="dp-status"
              >
                {fullyPaid
                  ? (t("dp_fully_paid") || "Entrada Quitada")
                  : `${t("dp_remaining") || "Falta"}: ${formatCurrency(balance)}`}
              </span>
            </div>
            <span className="text-xs text-text-secondary font-mono">{pct}%</span>
          </div>
          {/* progress bar */}
          <div className="h-2 bg-background border border-border overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${fullyPaid ? "bg-success" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
            <Stat label={t("dp_agreed") || "Entrada Acordada"} value={formatCurrency(agreed)} />
            <Stat label={t("dp_paid_so_far") || "Já Pago"} value={formatCurrency(paid)} accent="success" />
            <Stat label={t("dp_balance") || "Restante"} value={formatCurrency(balance)} accent={fullyPaid ? "success" : "primary"} />
          </div>
        </div>

        {/* PAYMENTS LIST */}
        <div className="px-6 py-4 border-b border-border">
          <p className="label-eyebrow mb-3">{t("dp_history") || "Histórico de Pagamentos"}</p>
          {loading ? (
            <p className="text-xs text-text-secondary text-center py-6">…</p>
          ) : payments.length === 0 ? (
            <p className="text-xs text-text-secondary text-center py-6">
              {t("dp_no_payments") || "Nenhum pagamento registrado ainda."}
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border" data-testid="dp-list">
              {payments.map((p) => (
                <li
                  key={p.id}
                  data-testid={`dp-row-${p.id}`}
                  className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-surface/40 transition-colors"
                >
                  <span className="font-mono text-text-secondary w-8">#{p.payment_no}</span>
                  <span className="font-display font-bold text-success min-w-[88px]">
                    {formatCurrency(p.amount)}
                  </span>
                  <span className="text-text-secondary truncate flex-1">
                    {p.payment_method || "—"}
                    {p.paid_at && <span className="ml-2">· {new Date(p.paid_at).toLocaleDateString()}</span>}
                    {p.issued_by_name && <span className="ml-2">· {p.issued_by_name}</span>}
                    {p.notes && <span className="ml-2 italic text-white/60">· {p.notes}</span>}
                  </span>
                  <button
                    data-testid={`dp-pdf-${p.id}`}
                    onClick={() => openPdf(p.id)}
                    title={t("open_pdf") || "Abrir PDF"}
                    className="w-7 h-7 border border-success/40 text-success hover:bg-success hover:text-white flex items-center justify-center transition-colors"
                  >
                    <Printer size={12} />
                  </button>
                  <button
                    data-testid={`dp-del-${p.id}`}
                    onClick={() => removePayment(p.id)}
                    title={t("delete") || "Apagar"}
                    className="w-7 h-7 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* NEW PAYMENT FORM */}
        {!fullyPaid && (
          <form onSubmit={submit} className="px-6 py-4 space-y-3">
            <p className="label-eyebrow text-success">{t("dp_add_payment") || "Adicionar Pagamento"}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <FieldNum
                label={t("dp_amount") || "Valor"}
                testid="dp-amount"
                value={form.amount}
                onChange={(v) => set("amount", v)}
                placeholder={balance > 0 ? formatCurrency(balance) : ""}
                autoFocus
              />
              <FieldText
                label={t("date") || "Data"}
                testid="dp-paid-at"
                type="date"
                value={form.paid_at}
                onChange={(v) => set("paid_at", v)}
              />
              <FieldSelect
                label={t("payment_method") || "Forma"}
                testid="dp-method"
                value={form.payment_method}
                onChange={(v) => set("payment_method", v)}
                options={[
                  { value: "Cash", label: "Cash" },
                  { value: "Check", label: "Check" },
                  { value: "Card", label: "Card" },
                  { value: "Transfer", label: "Transfer" },
                  { value: "Zelle", label: "Zelle" },
                  { value: "Other", label: t("other") || "Outro" },
                ]}
              />
            </div>
            <FieldText
              label={t("notes") || "Observações"}
              testid="dp-notes"
              value={form.notes}
              onChange={(v) => set("notes", v)}
              placeholder={t("dp_notes_placeholder") || "Ex: dinheiro vivo, cliente prometeu o resto sexta…"}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="dp-cancel"
                onClick={onClose}
                className="h-10 px-5 border border-border text-text-secondary hover:border-white hover:text-white font-display font-bold uppercase text-xs tracking-widest transition-colors"
              >
                {t("cancel") || "Cancelar"}
              </button>
              <button
                type="submit"
                data-testid="dp-submit"
                disabled={saving}
                className="h-10 px-5 bg-success hover:bg-success/90 text-white font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Plus size={14} />
                {saving ? "…" : (t("dp_save_and_print") || "Salvar e Imprimir")}
              </button>
            </div>
          </form>
        )}

        {fullyPaid && (
          <div className="px-6 py-4 text-xs text-success text-center bg-success/[0.04]">
            {t("dp_all_paid_msg") || "Cliente já quitou a entrada completa. Bom trabalho!"}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  const color =
    accent === "success" ? "text-success" : accent === "primary" ? "text-primary" : "text-white";
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-text-secondary mb-1">{label}</p>
      <p className={`font-display font-bold text-base ${color}`}>{value}</p>
    </div>
  );
}

function FieldNum({ label, value, onChange, testid, placeholder, autoFocus }) {
  return (
    <div>
      <label className="label-eyebrow block mb-1.5">{label}</label>
      <input
        data-testid={testid}
        type="number"
        min="0"
        step="0.01"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 bg-background border border-border focus:border-primary focus:outline-none px-3 text-sm transition-colors"
      />
    </div>
  );
}

function FieldText({ label, value, onChange, testid, type = "text", placeholder }) {
  return (
    <div>
      <label className="label-eyebrow block mb-1.5">{label}</label>
      <input
        data-testid={testid}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 bg-background border border-border focus:border-primary focus:outline-none px-3 text-sm transition-colors"
      />
    </div>
  );
}

function FieldSelect({ label, value, onChange, testid, options }) {
  return (
    <div>
      <label className="label-eyebrow block mb-1.5">{label}</label>
      <select
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 bg-background border border-border focus:border-primary focus:outline-none px-3 text-sm transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
