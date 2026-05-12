import { useState, useEffect, useMemo } from "react";
import { X, Plus, Trash2, Calendar, Clock, AlertTriangle, Check, User, Car as CarIcon, ClipboardList, Edit2, Hash } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import Avatar from "@/components/Avatar";
import DateTimePicker from "@/components/DateTimePicker";

// ============================================================
// DeliverySchedulesPanel
// "Programação de Entrega" — checklist por carro pro menino do pátio.
// Espelha o formato do WhatsApp (Nome / Carro / VIN / Especificações / Atribuídos / Data).
// Renderiza como um painel inline (drawer-style) que abre dentro da aba Esteira de Entrega.
// ============================================================
export default function DeliverySchedulesPanel({ vehicles = [], team = [], currentUser, t, onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {} new, {...} edit
  const [statusFilter, setStatusFilter] = useState("active"); // active | all | completed
  const isStaff = ["owner", "gerente"].includes(currentUser?.role);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get("/delivery-schedules");
      setSchedules(r.data || []);
    } catch (e) {
      toast.error("Erro ao carregar programação");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "active") return schedules.filter(s => s.status !== "completed");
    if (statusFilter === "completed") return schedules.filter(s => s.status === "completed");
    return schedules;
  }, [schedules, statusFilter]);

  const counts = useMemo(() => ({
    active: schedules.filter(s => s.status !== "completed").length,
    completed: schedules.filter(s => s.status === "completed").length,
    alerts: schedules.filter(s => s.alert_due_soon).length,
  }), [schedules]);

  const toggleSpec = async (sched, specId) => {
    try {
      const r = await api.post(`/delivery-schedules/${sched.id}/spec/${specId}/toggle`);
      // Replace in list
      setSchedules(prev => prev.map(x => x.id === sched.id ? r.data : x));
      if (r.data.status === "completed") {
        toast.success("Tudo pronto! Vendedor notificado.");
      }
    } catch (e) {
      toast.error("Não foi possível atualizar");
    }
  };

  const removeSchedule = async (s) => {
    if (!window.confirm(`Excluir a programação de ${s.customer_name}?`)) return;
    try {
      await api.delete(`/delivery-schedules/${s.id}`);
      toast.success("Programação excluída");
      reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao excluir");
    }
  };

  return (
    <div data-testid="schedules-panel" className="border-2 border-primary/40 bg-surface p-4 lg:p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-primary/10 border border-primary/40 flex items-center justify-center">
            <ClipboardList size={20} className="text-primary" />
          </div>
          <div>
            <p className="label-eyebrow text-primary">Programação de Entrega</p>
            <p className="text-xs text-text-secondary">O que precisa ser feito antes do carro sair</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="schedule-add"
            onClick={() => setEditing({})}
            className="bg-primary hover:bg-primary-hover px-4 py-2.5 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2 text-white"
          >
            <Plus size={14} /> Nova programação
          </button>
          <button
            data-testid="schedule-close"
            onClick={onClose}
            className="w-9 h-9 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
            title="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { key: "active", label: "Ativas", count: counts.active },
          { key: "completed", label: "Concluídas", count: counts.completed },
          { key: "all", label: "Todas", count: schedules.length },
        ].map((p) => (
          <button
            key={p.key}
            data-testid={`schedule-filter-${p.key}`}
            onClick={() => setStatusFilter(p.key)}
            className={`px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-widest border transition-colors inline-flex items-center gap-1.5 ${
              statusFilter === p.key
                ? "bg-primary text-white border-primary"
                : "border-border text-text-secondary hover:border-primary"
            }`}
          >
            {p.label}
            <span className={`text-[10px] px-1.5 py-0.5 ${statusFilter === p.key ? "bg-white/20" : "bg-surface"}`}>{p.count}</span>
          </button>
        ))}
        {counts.alerts > 0 && (
          <span data-testid="schedule-alert-chip" className="px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-widest border border-primary bg-primary/10 text-primary inline-flex items-center gap-1.5">
            <AlertTriangle size={12} /> {counts.alerts} urgente{counts.alerts === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-text-secondary text-center py-8">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border">
          <ClipboardList size={36} className="mx-auto text-text-secondary/30 mb-3" />
          <p className="text-text-secondary text-sm">Nenhuma programação {statusFilter === "completed" ? "concluída" : "ativa"}.</p>
          <button
            onClick={() => setEditing({})}
            className="mt-4 text-primary text-xs font-display font-bold uppercase tracking-widest hover:underline"
          >
            + Criar a primeira
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((s) => (
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

      {editing !== null && (
        <ScheduleForm
          schedule={editing.id ? editing : null}
          vehicles={vehicles}
          team={team}
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// ScheduleCard — one schedule with big checkboxes for the yard guy
// ============================================================
function ScheduleCard({ s, isStaff, onToggleSpec, onEdit, onDelete }) {
  const completed = s.status === "completed";
  const dd = s.delivery_date ? new Date(s.delivery_date) : null;
  const dateStr = dd ? dd.toLocaleString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "Sem data";

  let countdownLabel = "";
  let countdownColor = "text-text-secondary";
  if (typeof s.hours_until === "number") {
    const h = s.hours_until;
    if (h < 0) { countdownLabel = "Atrasada"; countdownColor = "text-primary"; }
    else if (h < 1) { countdownLabel = "Menos de 1h"; countdownColor = "text-primary"; }
    else if (h < 24) { countdownLabel = `Em ${Math.round(h)}h`; countdownColor = "text-warning"; }
    else if (h < 48) { countdownLabel = "Amanhã"; countdownColor = "text-warning"; }
    else if (h < 24 * 7) { countdownLabel = `Em ${Math.round(h / 24)} dias`; countdownColor = "text-text-secondary"; }
    else { countdownLabel = `Em ${Math.round(h / 24)} dias`; countdownColor = "text-text-secondary"; }
  }

  return (
    <div
      data-testid={`schedule-${s.id}`}
      className={`border bg-background p-3 flex flex-col ${
        completed ? "border-success/40" : s.alert_due_soon ? "border-primary border-2" : "border-border"
      }`}
    >
      {/* Status chip + actions row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {completed && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-success text-success bg-success/10 inline-flex items-center gap-1">
              <Check size={9} /> Concluído
            </span>
          )}
          {!completed && s.alert_due_soon && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-primary text-primary bg-primary/10 inline-flex items-center gap-1 animate-pulse">
              <AlertTriangle size={9} /> Urgente
            </span>
          )}
          {!completed && !s.alert_due_soon && s.status === "in_progress" && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-warning text-warning bg-warning/10">
              Andamento
            </span>
          )}
          {!completed && s.status === "pending" && (
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-border text-text-secondary">
              Pendente
            </span>
          )}
        </div>
        <div className="inline-flex gap-1 shrink-0">
          <button
            data-testid={`schedule-edit-${s.id}`}
            onClick={onEdit}
            className="w-6 h-6 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
            title="Editar"
          >
            <Edit2 size={10} />
          </button>
          {isStaff && (
            <button
              data-testid={`schedule-delete-${s.id}`}
              onClick={onDelete}
              className="w-6 h-6 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
              title="Excluir"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Customer + car block */}
      <div className="mb-2">
        <p className="font-display font-black text-sm uppercase tracking-tight truncate text-white" title={s.customer_name || ""}>
          {s.customer_name || "Cliente"}
        </p>
        <p className="text-[11px] text-text-secondary truncate flex items-center gap-1 mt-0.5" title={s.vehicle_label || ""}>
          <CarIcon size={10} className="opacity-60 shrink-0" /> <span className="truncate">{s.vehicle_label || "—"}</span>
        </p>
        {s.vin_last_6 && (
          <p className="text-[10px] text-text-secondary flex items-center gap-1 mt-0.5">
            <Hash size={9} className="opacity-60" /> <span className="font-mono text-white tracking-wider">{s.vin_last_6}</span>
          </p>
        )}
      </div>

      {/* Delivery date */}
      <div className="border-t border-border pt-2 mb-2">
        <p className="text-[9px] text-text-secondary uppercase tracking-widest mb-0.5">Entrega</p>
        <p className="font-display font-bold text-[11px] text-white inline-flex items-center gap-1">
          <Calendar size={10} className="text-primary shrink-0" /> <span className="truncate">{dateStr}</span>
        </p>
        {countdownLabel && (
          <p className={`text-[10px] font-display font-bold uppercase tracking-wider ${countdownColor} inline-flex items-center gap-1 mt-0.5`}>
            <Clock size={9} /> {countdownLabel}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {s.total_specs > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[9px] text-text-secondary uppercase tracking-widest mb-1">
            <span>Progresso</span>
            <span className="font-display font-black text-white">{s.done_specs}/{s.total_specs}</span>
          </div>
          <div className="h-1 bg-surface relative overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 transition-all ${completed ? "bg-success" : "bg-primary"}`}
              style={{ width: `${s.total_specs > 0 ? (s.done_specs / s.total_specs) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Compact checklist — still tappable */}
      <div className="space-y-1.5 mb-2 flex-1">
        {(s.specifications || []).map((sp) => (
          <button
            type="button"
            key={sp.id}
            data-testid={`schedule-spec-${sp.id}`}
            onClick={() => onToggleSpec(sp.id)}
            className={`w-full text-left flex items-center gap-2 p-2 border transition-all ${
              sp.done
                ? "border-success/30 bg-success/5"
                : "border-border bg-surface/40 hover:border-primary hover:bg-primary/5"
            }`}
          >
            <div className={`w-5 h-5 border-2 flex items-center justify-center shrink-0 transition-colors ${
              sp.done ? "border-success bg-success" : "border-border bg-background"
            }`}>
              {sp.done && <Check size={12} className="text-white" strokeWidth={3} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-display font-bold text-xs leading-tight ${sp.done ? "line-through text-text-secondary" : "text-white"}`} title={sp.text}>
                {sp.text}
              </p>
              {sp.done && sp.done_by && (
                <p className="text-[9px] text-text-secondary mt-0.5 truncate">
                  {sp.done_by}
                </p>
              )}
            </div>
          </button>
        ))}
        {(s.specifications || []).length === 0 && (
          <p className="text-[10px] text-text-secondary text-center py-3 border border-dashed border-border">
            Sem tarefas.
          </p>
        )}
      </div>

      {/* Footer: assignees stacked */}
      {(s.assigned_names || []).length > 0 && (
        <div className="border-t border-border pt-2 flex flex-wrap items-center gap-1">
          <p className="text-[9px] text-text-secondary uppercase tracking-widest w-full mb-0.5">Responsáveis</p>
          {(s.assigned_names || []).slice(0, 3).map((name, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-surface px-1.5 py-0.5 border border-border max-w-full">
              <User size={9} className="text-primary shrink-0" />
              <span className="font-display font-bold uppercase tracking-wide truncate" title={name}>{name}</span>
            </span>
          ))}
          {(s.assigned_names || []).length > 3 && (
            <span className="text-[10px] text-text-secondary font-bold">
              +{s.assigned_names.length - 3}
            </span>
          )}
        </div>
      )}
      {s.notes && (
        <p className="text-[10px] text-text-secondary mt-2 pt-2 border-t border-border italic truncate" title={s.notes}>
          📝 {s.notes}
        </p>
      )}
      {s.salesperson_name && (
        <p className="text-[9px] text-text-secondary uppercase tracking-widest mt-2 truncate" title={s.salesperson_name}>
          Vendedor: <span className="text-white font-display font-bold">{s.salesperson_name}</span>
        </p>
      )}
    </div>
  );
}

// ============================================================
// ScheduleForm — create / edit modal
// ============================================================
function ScheduleForm({ schedule, vehicles, team, t, onClose, onSaved }) {
  const isEdit = !!schedule;
  const initial = schedule || {
    vehicle_id: "",
    vehicle_label: "",
    vin: "",
    customer_name: "",
    customer_phone: "",
    delivery_date: "",
    specifications: [],
    assigned_user_ids: [],
    assigned_names: [],
    salesperson_id: "",
    salesperson_name: "",
    notes: "",
  };
  const [form, setForm] = useState({
    ...initial,
    // Normalize delivery_date to "YYYY-MM-DDTHH:MM" for <input type=datetime-local>
    delivery_date: initial.delivery_date ? String(initial.delivery_date).slice(0, 16) : "",
    specifications: (initial.specifications || []).map(sp => ({ ...sp })),
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Team filtered: yard guys (geral role) + managers + owner — never BDC.
  const yardCandidates = useMemo(() => {
    return (team || []).filter(m => ["geral", "gerente", "salesperson", "owner"].includes(m.role));
  }, [team]);

  const onPickVehicle = (vid) => {
    const v = (vehicles || []).find(x => x.id === vid);
    if (!v) {
      set("vehicle_id", "");
      return;
    }
    setForm(f => ({
      ...f,
      vehicle_id: v.id,
      vehicle_label: `${v.year || ""} ${v.make || ""} ${v.model || ""}${v.color ? ` (${v.color})` : ""}`.trim(),
      vin: v.vin || f.vin,
      customer_name: v.buyer_name || f.customer_name,
      customer_phone: v.buyer_phone || f.customer_phone,
      salesperson_id: v.salesperson_id || f.salesperson_id,
      salesperson_name: v.salesperson_name || f.salesperson_name,
    }));
  };

  const addSpec = () => {
    setForm(f => ({ ...f, specifications: [...(f.specifications || []), { id: `tmp-${Date.now()}`, text: "", done: false }] }));
  };
  const updateSpec = (i, text) => {
    setForm(f => {
      const next = [...(f.specifications || [])];
      next[i] = { ...next[i], text };
      return { ...f, specifications: next };
    });
  };
  const removeSpec = (i) => {
    setForm(f => ({ ...f, specifications: (f.specifications || []).filter((_, idx) => idx !== i) }));
  };

  const toggleAssignee = (member) => {
    setForm(f => {
      const ids = new Set(f.assigned_user_ids || []);
      const names = new Set(f.assigned_names || []);
      if (ids.has(member.id)) {
        ids.delete(member.id);
        names.delete(member.full_name);
      } else {
        ids.add(member.id);
        names.add(member.full_name);
      }
      return { ...f, assigned_user_ids: [...ids], assigned_names: [...names] };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_name?.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      specifications: (form.specifications || []).filter(s => (s.text || "").trim()),
      delivery_date: form.delivery_date || null,
    };
    try {
      if (isEdit) {
        await api.put(`/delivery-schedules/${schedule.id}`, payload);
      } else {
        await api.post("/delivery-schedules", payload);
      }
      toast.success("Programação salva");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={submit} className="bg-background border border-border w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-eyebrow text-primary mb-1">Programação de Entrega</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {isEdit ? "Editar" : "Nova programação"}
            </h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={20} className="text-text-secondary hover:text-primary" />
          </button>
        </div>

        {/* Vehicle picker */}
        <div>
          <label className="label-eyebrow block mb-2">Carro</label>
          <select
            data-testid="sched-vehicle"
            value={form.vehicle_id || ""}
            onChange={e => onPickVehicle(e.target.value)}
            className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
          >
            <option value="">— Escolha um veículo (ou preencha manualmente abaixo) —</option>
            {(vehicles || []).map(v => (
              <option key={v.id} value={v.id}>
                {v.year} {v.make} {v.model} {v.color ? `· ${v.color}` : ""} {v.vin ? `· ${v.vin.slice(-6).toUpperCase()}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label-eyebrow block mb-2">Descrição do carro</label>
            <input
              data-testid="sched-veh-label"
              value={form.vehicle_label}
              onChange={e => set("vehicle_label", e.target.value)}
              placeholder="2023 Chevrolet Silverado 1500 (azul)"
              className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">VIN completo</label>
            <input
              data-testid="sched-vin"
              value={form.vin}
              onChange={e => set("vin", e.target.value.toUpperCase())}
              placeholder="1GCUDDED3PZ181772"
              maxLength={17}
              className="w-full bg-surface border border-border px-3 py-2.5 text-sm font-mono tracking-wider"
            />
            {form.vin && (
              <p className="text-[10px] text-text-secondary mt-1 uppercase tracking-widest">
                Últimos 6: <span className="text-primary font-bold">{form.vin.slice(-6).toUpperCase()}</span>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label-eyebrow block mb-2">Nome do cliente *</label>
            <input
              data-testid="sched-customer"
              value={form.customer_name}
              onChange={e => set("customer_name", e.target.value)}
              placeholder="DIESSICA P BARBOSA"
              required
              className="w-full bg-surface border border-border px-3 py-2.5 text-sm uppercase"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">Telefone</label>
            <input
              data-testid="sched-phone"
              value={form.customer_phone || ""}
              onChange={e => set("customer_phone", e.target.value)}
              className="w-full bg-surface border border-border px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        {/* Delivery date */}
        <div>
          <label className="label-eyebrow block mb-2">Data e hora da entrega *</label>
          <DateTimePicker
            testid="sched-date"
            value={form.delivery_date || ""}
            onChange={(v) => set("delivery_date", v)}
            placeholder="Escolha o dia e a hora"
          />
        </div>

        {/* Specifications */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-eyebrow">Especificações (tarefas)</label>
            <button
              type="button"
              data-testid="sched-spec-add"
              onClick={addSpec}
              className="text-[10px] uppercase tracking-widest text-primary font-display font-bold inline-flex items-center gap-1 hover:underline"
            >
              <Plus size={11} /> Adicionar tarefa
            </button>
          </div>
          <div className="space-y-2">
            {(form.specifications || []).map((sp, i) => (
              <div key={sp.id || i} className="flex items-center gap-2">
                <span className="text-text-secondary font-mono text-xs w-5 text-right">•</span>
                <input
                  data-testid={`sched-spec-input-${i}`}
                  value={sp.text || ""}
                  onChange={e => updateSpec(i, e.target.value)}
                  placeholder="ex: Colocar estribo"
                  className="flex-1 bg-surface border border-border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeSpec(i)}
                  className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center"
                  title="Remover"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {(form.specifications || []).length === 0 && (
              <p className="text-xs text-text-secondary border border-dashed border-border p-3 text-center">
                Nenhuma tarefa. Clique em "Adicionar tarefa".
              </p>
            )}
          </div>
        </div>

        {/* Assignees */}
        <div>
          <label className="label-eyebrow block mb-2">Responsáveis (quem vai executar)</label>
          <div className="flex flex-wrap gap-2">
            {yardCandidates.length === 0 ? (
              <p className="text-xs text-text-secondary border border-dashed border-border p-3 w-full text-center">
                Nenhum membro de equipe. Cadastre em Configurações → Equipe (função "Geral").
              </p>
            ) : (
              yardCandidates.map(m => {
                const picked = (form.assigned_user_ids || []).includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`sched-assign-${m.id}`}
                    onClick={() => toggleAssignee(m)}
                    className={`inline-flex items-center gap-2 px-3 py-2 border text-xs transition-colors ${
                      picked
                        ? "border-success bg-success/10 text-success"
                        : "border-border text-text-secondary hover:border-primary"
                    }`}
                  >
                    <Avatar src={m.photo_url} name={m.full_name} size="sm" />
                    <span className="font-display font-bold uppercase tracking-wide">{m.full_name}</span>
                    {picked && <Check size={12} />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="label-eyebrow block mb-2">Observações</label>
          <textarea
            data-testid="sched-notes"
            value={form.notes || ""}
            onChange={e => set("notes", e.target.value)}
            rows={2}
            placeholder="Detalhes extras…"
            className="w-full bg-surface border border-border px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2.5 border border-border text-text-secondary text-xs font-display font-bold uppercase tracking-widest hover:border-primary hover:text-primary transition-colors">
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="sched-save"
            disabled={saving}
            className="bg-primary hover:bg-primary-hover px-6 py-2.5 font-display font-bold uppercase text-xs tracking-widest text-white disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar programação"}
          </button>
        </div>
      </form>
    </div>
  );
}
