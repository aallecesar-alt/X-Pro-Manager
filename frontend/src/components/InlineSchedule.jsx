import { useState, useEffect } from "react";
import { ClipboardList, Check, Plus, AlertTriangle, Clock, Edit2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * InlineSchedule — compact, inline view of the programação directly inside a
 * delivery-pipeline car card. Shows the checklist with quick toggle so the
 * yard worker can mark tasks done without opening any modal.
 *
 * Props:
 *  - vehicle: the vehicle object (id, year, make, model, vin, buyer_*, sales_*)
 *  - onOpenModal: () => void  — opens the full modal (used for create / edit)
 */
export default function InlineSchedule({ vehicle, onOpenModal }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/delivery-schedules");
      const mine = (r.data || []).filter(s => s.vehicle_id === vehicle.id);
      setItems(mine);
    } catch (e) { /* silent */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vehicle?.id]);

  // Reload whenever the user closes the modal — handled via window event below.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.vehicleId === vehicle.id) load();
    };
    window.addEventListener("schedule:reload", handler);
    return () => window.removeEventListener("schedule:reload", handler);
    // eslint-disable-next-line
  }, [vehicle?.id]);

  const toggleSpec = async (sched, specId) => {
    try {
      const r = await api.post(`/delivery-schedules/${sched.id}/spec/${specId}/toggle`);
      setItems(prev => prev.map(x => x.id === sched.id ? r.data : x));
      if (r.data.status === "completed") {
        toast.success("Tudo pronto! Vendedor notificado.");
      }
    } catch (e) {
      toast.error("Não foi possível atualizar");
    }
  };

  if (loading) return null;

  if (items.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenModal}
        data-testid={`inline-add-prog-${vehicle.id}`}
        className="w-full border border-dashed border-border hover:border-primary hover:bg-primary/5 py-3 px-4 flex items-center justify-center gap-2 text-xs font-display font-bold uppercase tracking-widest text-text-secondary hover:text-primary transition-colors"
      >
        <Plus size={12} /> <ClipboardList size={12} /> Adicionar programação de entrega
      </button>
    );
  }

  return (
    <div className="space-y-3" data-testid={`inline-prog-${vehicle.id}`}>
      {items.map((s) => (
        <InlineScheduleCard
          key={s.id}
          s={s}
          onToggleSpec={(specId) => toggleSpec(s, specId)}
          onEdit={onOpenModal}
        />
      ))}
    </div>
  );
}

function InlineScheduleCard({ s, onToggleSpec, onEdit }) {
  const completed = s.status === "completed";
  const dd = s.delivery_date ? new Date(s.delivery_date) : null;
  const dateStr = dd ? dd.toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).replace(".", "") : null;

  let countdown = "";
  let countdownColor = "text-text-secondary";
  if (typeof s.hours_until === "number") {
    const h = s.hours_until;
    if (h < 0) { countdown = "Atrasada"; countdownColor = "text-primary"; }
    else if (h < 1) { countdown = "Menos 1h"; countdownColor = "text-primary"; }
    else if (h < 24) { countdown = `Em ${Math.round(h)}h`; countdownColor = "text-warning"; }
    else if (h < 48) { countdown = "Amanhã"; countdownColor = "text-warning"; }
    else { countdown = `Em ${Math.round(h / 24)}d`; countdownColor = "text-text-secondary"; }
  }

  return (
    <div className={`border bg-background/60 ${
      completed ? "border-success/40" : s.alert_due_soon ? "border-primary border-2" : "border-border"
    }`}>
      {/* Header strip */}
      <div className={`flex items-center justify-between gap-2 px-3 py-1.5 ${
        completed ? "bg-success/10" : s.alert_due_soon ? "bg-primary/10" : "bg-surface/60"
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList size={11} className={completed ? "text-success" : "text-primary"} />
          <p className="label-eyebrow text-[10px] m-0">Programação</p>
          {completed && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0 border border-success text-success">Concluído</span>
          )}
          {!completed && s.alert_due_soon && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0 border border-primary text-primary animate-pulse inline-flex items-center gap-1">
              <AlertTriangle size={9} /> Urgente
            </span>
          )}
          {!completed && !s.alert_due_soon && s.status === "in_progress" && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0 border border-warning text-warning">Andamento</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dateStr && (
            <p className={`text-[10px] font-display font-bold uppercase tracking-wider inline-flex items-center gap-1 ${countdownColor}`}>
              <Clock size={9} /> {dateStr}{countdown ? ` · ${countdown}` : ""}
            </p>
          )}
          <button
            type="button"
            onClick={onEdit}
            title="Editar programação"
            className="text-text-secondary hover:text-primary"
            data-testid={`inline-edit-${s.id}`}
          >
            <Edit2 size={11} />
          </button>
        </div>
      </div>

      {/* Specs checklist (compact, but still tappable) */}
      <div className="px-3 py-2">
        {(s.specifications || []).length === 0 ? (
          <p className="text-[10px] text-text-secondary text-center py-2">Sem tarefas cadastradas.</p>
        ) : (
          <div className="space-y-1">
            {(s.specifications || []).map((sp) => (
              <button
                type="button"
                key={sp.id}
                data-testid={`inline-spec-${sp.id}`}
                onClick={() => onToggleSpec(sp.id)}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 border transition-colors ${
                  sp.done
                    ? "border-success/30 bg-success/5"
                    : "border-transparent hover:border-primary/50 hover:bg-primary/5"
                }`}
              >
                <div className={`w-4 h-4 border flex items-center justify-center shrink-0 transition-colors ${
                  sp.done ? "border-success bg-success" : "border-border bg-background"
                }`}>
                  {sp.done && <Check size={10} className="text-white" strokeWidth={3} />}
                </div>
                <p className={`text-xs flex-1 font-display font-bold ${sp.done ? "line-through text-text-secondary" : "text-white"}`}>
                  {sp.text}
                </p>
                {sp.done && sp.done_by && (
                  <span className="text-[9px] text-text-secondary uppercase tracking-widest shrink-0 truncate max-w-[100px]" title={sp.done_by}>
                    {sp.done_by.split(" ")[0]}
                  </span>
                )}
              </button>
            ))}
            {/* Progress + assignees */}
            <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-border/50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-1 w-20 bg-surface relative overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 ${completed ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${s.total_specs > 0 ? (s.done_specs / s.total_specs) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[10px] text-text-secondary font-display font-black tracking-widest shrink-0">
                  {s.done_specs}/{s.total_specs}
                </p>
              </div>
              {(s.assigned_names || []).length > 0 && (
                <p className="text-[10px] text-text-secondary truncate" title={(s.assigned_names || []).join(", ")}>
                  👤 {(s.assigned_names || []).slice(0, 2).join(", ")}
                  {(s.assigned_names || []).length > 2 && ` +${s.assigned_names.length - 2}`}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
