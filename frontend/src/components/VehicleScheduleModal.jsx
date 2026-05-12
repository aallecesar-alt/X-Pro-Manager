import { useState, useEffect, useMemo } from "react";
import { X, Plus, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { ScheduleCard, ScheduleForm } from "@/components/DeliverySchedulesPanel";

/**
 * VehicleScheduleModal — shows the delivery schedules for ONE specific vehicle.
 * Opens from the "Programação" button inside each car panel in Esteira de Entrega.
 */
export default function VehicleScheduleModal({ vehicle, team, currentUser, t, onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} new | { schedule object } edit
  const isStaff = ["owner", "gerente"].includes(currentUser?.role);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get("/delivery-schedules");
      const onlyMine = (r.data || []).filter(s => s.vehicle_id === vehicle.id);
      setSchedules(onlyMine);
      // Auto-open the create form when there's nothing yet — saves the user a click.
      if (onlyMine.length === 0) {
        setEditing({});
      }
    } catch (e) {
      toast.error("Erro ao carregar programação");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [vehicle?.id]);

  // Snapshot used when starting a new schedule — auto-fills the car details.
  const newPrefill = useMemo(() => ({
    vehicle_id: vehicle.id,
    vehicle_label: `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}${vehicle.color ? ` (${vehicle.color})` : ""}`.trim(),
    vin: vehicle.vin || "",
    customer_name: vehicle.buyer_name || "",
    customer_phone: vehicle.buyer_phone || "",
    salesperson_id: vehicle.salesperson_id || "",
    salesperson_name: vehicle.salesperson_name || "",
    delivery_date: "",
    specifications: [],
    assigned_user_ids: [],
    assigned_names: [],
    notes: "",
  }), [vehicle]);

  const toggleSpec = async (sched, specId) => {
    try {
      const r = await api.post(`/delivery-schedules/${sched.id}/spec/${specId}/toggle`);
      setSchedules(prev => prev.map(x => x.id === sched.id ? r.data : x));
      if (r.data.status === "completed") {
        toast.success("Tudo pronto! Vendedor notificado.");
      }
    } catch (e) {
      toast.error("Não foi possível atualizar");
    }
  };

  const removeSchedule = async (s) => {
    if (!window.confirm(`Excluir esta programação?`)) return;
    try {
      await api.delete(`/delivery-schedules/${s.id}`);
      toast.success("Programação excluída");
      reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao excluir");
    }
  };

  const carLabel = `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4">
      <div className="bg-background border border-border w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-primary/10 border border-primary/40 flex items-center justify-center shrink-0">
              <ClipboardList size={20} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="label-eyebrow text-primary">Programação de Entrega</p>
              <p className="font-display font-black text-lg uppercase tracking-tight truncate">{carLabel || "Veículo"}</p>
              {vehicle.buyer_name && (
                <p className="text-xs text-text-secondary truncate">Cliente: <span className="text-white font-bold">{vehicle.buyer_name}</span></p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              data-testid="veh-sched-add"
              onClick={() => setEditing({})}
              className="bg-primary hover:bg-primary-hover px-4 py-2 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2 text-white"
            >
              <Plus size={14} /> Nova
            </button>
            <button
              data-testid="veh-sched-close"
              onClick={onClose}
              className="w-9 h-9 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
              title="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <p className="text-text-secondary text-center py-8">Carregando...</p>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border">
              <ClipboardList size={36} className="mx-auto text-text-secondary/30 mb-3" />
              <p className="text-text-secondary text-sm">Sem programação para este carro.</p>
              <button
                onClick={() => setEditing({})}
                data-testid="veh-sched-create-first"
                className="mt-4 text-primary text-xs font-display font-bold uppercase tracking-widest hover:underline"
              >
                + Criar a primeira
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {schedules.map((s) => (
                <ScheduleCard
                  key={s.id}
                  s={s}
                  isStaff={isStaff}
                  onToggleSpec={(specId) => toggleSpec(s, specId)}
                  onEdit={() => setEditing(s)}
                  onDelete={() => removeSchedule(s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editing !== null && (
        <ScheduleForm
          schedule={editing.id ? editing : null}
          prefill={editing.id ? null : newPrefill}
          vehicles={[vehicle]}  // limit picker to this car
          team={team}
          t={t}
          onClose={() => {
            setEditing(null);
            // If there are no schedules yet, closing the auto-opened form should
            // also close the whole modal (better UX — the user cancelled creation).
            if (schedules.length === 0) onClose();
          }}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
