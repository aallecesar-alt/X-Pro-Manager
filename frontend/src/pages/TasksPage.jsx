import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  CheckSquare, Plus, X, Trash2, Edit2, Clock, AlertTriangle, Check,
  Calendar, User as UserIcon, Car, Mail, Filter, Search,
} from "lucide-react";
import api from "@/lib/api";
import { useI18n } from "@/lib/i18n.jsx";
import { useAuth } from "@/context/AuthContext";

const PRIORITIES = [
  { value: "low",    label: "Baixa",   color: "border-text-secondary text-text-secondary" },
  { value: "medium", label: "Média",   color: "border-info text-info" },
  { value: "high",   label: "Alta",    color: "border-warning text-warning" },
  { value: "urgent", label: "Urgente", color: "border-primary text-primary bg-primary/[0.06]" },
];

function priorityMeta(value) {
  return PRIORITIES.find((p) => p.value === value) || PRIORITIES[1];
}

function isOverdue(task) {
  if (!task.due_at || task.status !== "open") return false;
  return new Date(task.due_at) < new Date();
}

function timeToDue(task) {
  if (!task.due_at) return null;
  const ms = new Date(task.due_at) - new Date();
  if (ms < 0) {
    const hOver = Math.abs(Math.round(ms / 3600000));
    if (hOver < 24) return `atrasada · ${hOver}h`;
    return `atrasada · ${Math.round(hOver / 24)}d`;
  }
  const hLeft = Math.round(ms / 3600000);
  if (hLeft < 24) return `em ${hLeft}h`;
  return `em ${Math.round(hLeft / 24)}d`;
}

export default function TasksPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isManager = user?.role === "owner" || user?.role === "gerente";

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState("open"); // open | all | done | overdue
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | task
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [taskRes, userRes, vehRes] = await Promise.all([
        api.get("/tasks"),
        isManager ? api.get("/chat/users") : Promise.resolve({ data: [] }),
        api.get("/vehicles"),
      ]);
      setTasks(taskRes.data || []);
      // Normalize: chat/users returns full_name; tasks page expects name field too.
      setUsers((userRes.data || []).map((u) => ({ ...u, name: u.full_name || u.name || u.email })));
      setVehicles(vehRes.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    let out = tasks;
    if (filter === "open") out = out.filter((t) => t.status === "open");
    else if (filter === "done") out = out.filter((t) => t.status === "done");
    else if (filter === "overdue") out = out.filter(isOverdue);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((task) =>
        (task.title || "").toLowerCase().includes(q) ||
        (task.description || "").toLowerCase().includes(q) ||
        (task.vehicle_label || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [tasks, filter, search]);

  const counts = useMemo(() => ({
    open: tasks.filter((task) => task.status === "open").length,
    overdue: tasks.filter(isOverdue).length,
    done: tasks.filter((task) => task.status === "done").length,
    all: tasks.length,
  }), [tasks]);

  const toggleStatus = async (task) => {
    try {
      await api.put(`/tasks/${task.id}`, { status: task.status === "done" ? "open" : "done" });
      toast.success(t("saved"));
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    }
  };

  const deleteTask = async (task) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      toast.success(t("saved"));
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    }
  };

  const sendTestEmail = async () => {
    try {
      const r = await api.post("/tasks/_test_email");
      toast.success(`Email de teste enviado para ${r.data.sent_to}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao enviar email");
    }
  };

  return (
    <div data-testid="tasks-page" className="space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="label-eyebrow text-primary mb-2">{t("operations") || "Operações"}</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter inline-flex items-center gap-3">
            <CheckSquare size={32} className="text-primary" />
            {t("tasks") || "Tarefas"}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {t("tasks_subtitle") || "Atribua, lembre e acompanhe pendências do dia a dia"}
          </p>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <>
              <button
                data-testid="task-test-email"
                onClick={sendTestEmail}
                className="border border-border hover:border-info hover:text-info px-4 h-10 inline-flex items-center gap-2 text-[11px] font-display font-bold uppercase tracking-widest transition-colors"
                title={t("task_test_email_tip") || "Testar configuração de email (Resend)"}
              >
                <Mail size={13} /> {t("task_test_email") || "Testar email"}
              </button>
              <button
                data-testid="task-new"
                onClick={() => setEditing("new")}
                className="bg-primary hover:bg-primary-hover text-white px-5 h-10 inline-flex items-center gap-2 text-[11px] font-display font-bold uppercase tracking-widest"
              >
                <Plus size={14} /> {t("new_task") || "Nova tarefa"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* STATS / FILTERS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
        <FilterCard label={t("open") || "Abertas"} count={counts.open} active={filter === "open"} onClick={() => setFilter("open")} accent="warning" testid="filter-open" />
        <FilterCard label={t("overdue") || "Atrasadas"} count={counts.overdue} active={filter === "overdue"} onClick={() => setFilter("overdue")} accent="primary" testid="filter-overdue" />
        <FilterCard label={t("done") || "Concluídas"} count={counts.done} active={filter === "done"} onClick={() => setFilter("done")} accent="success" testid="filter-done" />
        <FilterCard label={t("all") || "Todas"} count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} testid="filter-all" />
      </div>

      {/* SEARCH */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          data-testid="task-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_tasks") || "Buscar tarefas..."}
          className="w-full bg-surface border border-border focus:border-primary focus:outline-none pl-10 pr-3 h-10 text-sm transition-colors"
        />
      </div>

      {/* LIST */}
      {loading ? (
        <p className="text-text-secondary text-center py-8 text-sm">…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-border bg-surface/40 p-10 text-center">
          <Filter size={32} className="mx-auto mb-3 text-text-secondary" />
          <p className="text-text-secondary text-sm">{t("no_tasks") || "Nenhuma tarefa por aqui."}</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="tasks-list">
          {filtered.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              t={t}
              isManager={isManager}
              onToggle={() => toggleStatus(task)}
              onEdit={() => setEditing(task)}
              onDelete={() => deleteTask(task)}
            />
          ))}
        </ul>
      )}

      {editing && (
        <TaskFormModal
          t={t}
          task={editing === "new" ? null : editing}
          users={users}
          vehicles={vehicles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}


function FilterCard({ label, count, active, onClick, accent, testid }) {
  const accentColor = accent === "primary" ? "text-primary" : accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "text-white";
  return (
    <button
      data-testid={testid}
      type="button"
      onClick={onClick}
      className={`bg-background p-5 text-left transition-all ${active ? "ring-2 ring-primary -ring-offset-1" : "hover:bg-surface"}`}
    >
      <p className="label-eyebrow mb-2">{label}</p>
      <p className={`font-display font-black text-3xl ${accentColor}`}>{count}</p>
    </button>
  );
}


function TaskRow({ task, t, isManager, onToggle, onEdit, onDelete }) {
  const pri = priorityMeta(task.priority);
  const overdue = isOverdue(task);
  const due = timeToDue(task);
  const done = task.status === "done";
  const assigneeNames = (task.assignees || [])
    .map((a) => a.name || a.full_name || a.email)
    .filter(Boolean)
    .join(", ");

  return (
    <li
      data-testid={`task-${task.id}`}
      className={`border bg-surface p-4 flex items-start gap-4 transition-all ${
        done
          ? "border-border opacity-60"
          : overdue
            ? "border-l-4 border-l-primary border-y border-r border-y-primary/40 border-r-primary/40 bg-primary/[0.04]"
            : "border-border hover:border-primary/40"
      }`}
    >
      {/* Checkbox to mark done */}
      <button
        data-testid={`task-check-${task.id}`}
        onClick={onToggle}
        title={done ? (t("mark_undone") || "Reabrir") : (t("mark_done") || "Concluir")}
        className={`mt-1 w-6 h-6 border-2 grid place-items-center transition-colors shrink-0 ${
          done
            ? "border-success bg-success text-white"
            : "border-border hover:border-success hover:bg-success/10"
        }`}
      >
        {done && <Check size={14} />}
      </button>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className={`font-display font-bold text-base ${done ? "line-through text-text-secondary" : ""}`}>
            {task.title}
          </h3>
          <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border font-display font-bold ${pri.color}`}>
            {pri.label}
          </span>
          {overdue && (
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 border border-primary text-primary bg-primary/10 font-display font-bold inline-flex items-center gap-1">
              <AlertTriangle size={10} /> {t("overdue") || "Atrasada"}
            </span>
          )}
        </div>
        {task.description && (
          <p className="text-sm text-text-secondary mt-1.5 line-clamp-2">{task.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-secondary">
          {task.due_at && (
            <span className={`inline-flex items-center gap-1 ${overdue ? "text-primary font-display font-bold" : ""}`}>
              <Calendar size={12} />
              {new Date(task.due_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              {due && <span className="ml-1 opacity-70">· {due}</span>}
            </span>
          )}
          {task.vehicle_label && (
            <span className="inline-flex items-center gap-1">
              <Car size={12} /> {task.vehicle_label}
            </span>
          )}
          {assigneeNames && (
            <span className="inline-flex items-center gap-1">
              <UserIcon size={12} /> {assigneeNames}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {isManager && (
        <div className="flex flex-col gap-1 shrink-0">
          <button
            data-testid={`task-edit-${task.id}`}
            onClick={onEdit}
            className="w-8 h-8 border border-border hover:border-primary hover:text-primary grid place-items-center transition-colors"
            title={t("edit") || "Editar"}
          >
            <Edit2 size={12} />
          </button>
          <button
            data-testid={`task-delete-${task.id}`}
            onClick={onDelete}
            className="w-8 h-8 border border-border hover:border-primary hover:text-primary grid place-items-center transition-colors"
            title={t("delete") || "Apagar"}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </li>
  );
}


function TaskFormModal({ task, t, users, vehicles, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    title: task?.title || "",
    description: task?.description || "",
    priority: task?.priority || "medium",
    due_at: task?.due_at ? task.due_at.slice(0, 16) : "",
    vehicle_id: task?.vehicle_id || "",
    vehicle_label: task?.vehicle_label || "",
    assignee_ids: task?.assignee_ids || [],
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error(t("task_title_required") || "Título é obrigatório");
      return;
    }
    if (!form.assignee_ids.length) {
      toast.error(t("task_assignee_required") || "Atribua a pelo menos uma pessoa");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        vehicle_id: form.vehicle_id || null,
        vehicle_label: form.vehicle_label || null,
      };
      if (task) {
        await api.put(`/tasks/${task.id}`, payload);
        toast.success(t("saved"));
      } else {
        await api.post("/tasks", payload);
        toast.success(t("task_created_with_notify") || "Tarefa criada e notificação enviada");
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally {
      setBusy(false);
    }
  };

  const toggleAssignee = (uid) => {
    set("assignee_ids", form.assignee_ids.includes(uid)
      ? form.assignee_ids.filter((x) => x !== uid)
      : [...form.assignee_ids, uid]);
  };

  const onPickVehicle = (id) => {
    if (!id) {
      set("vehicle_id", "");
      set("vehicle_label", "");
      return;
    }
    const v = vehicles.find((x) => x.id === id);
    set("vehicle_id", id);
    set("vehicle_label", v ? `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim() : "");
  };

  return (
    <div
      data-testid="task-modal"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-border w-full max-w-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-black text-xl uppercase tracking-tight">
            {task ? (t("edit_task") || "Editar tarefa") : (t("new_task") || "Nova tarefa")}
          </h2>
          <button data-testid="task-modal-close" onClick={onClose} className="text-text-secondary hover:text-primary">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="label-eyebrow block mb-2">{t("task_title") || "Título"} *</label>
            <input
              data-testid="task-form-title"
              autoFocus
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={t("task_title_placeholder") || "Ex: Levar Honda Civic pra trocar pneu"}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm"
            />
          </div>

          <div>
            <label className="label-eyebrow block mb-2">{t("task_description") || "Detalhes"}</label>
            <textarea
              data-testid="task-form-description"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("task_description_placeholder") || "Descrição, endereço, peça, valor estimado..."}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm resize-y"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-eyebrow block mb-2">
                <Calendar size={12} className="inline -mt-0.5" /> {t("due_at") || "Prazo"}
              </label>
              <input
                data-testid="task-form-due"
                type="datetime-local"
                value={form.due_at}
                onChange={(e) => set("due_at", e.target.value)}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-2">{t("priority") || "Prioridade"}</label>
              <select
                data-testid="task-form-priority"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm cursor-pointer"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label-eyebrow block mb-2">
              <Car size={12} className="inline -mt-0.5" /> {t("linked_vehicle") || "Veículo (opcional)"}
            </label>
            <select
              data-testid="task-form-vehicle"
              value={form.vehicle_id}
              onChange={(e) => onPickVehicle(e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-10 text-sm cursor-pointer"
            >
              <option value="">— {t("none") || "Nenhum"} —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model}{v.plate ? ` · ${v.plate}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-eyebrow block mb-2">
              <UserIcon size={12} className="inline -mt-0.5" /> {t("assignees") || "Atribuir a"} *
            </label>
            <div className="flex flex-wrap gap-2" data-testid="task-form-assignees">
              {users.map((u) => {
                const selected = form.assignee_ids.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    data-testid={`assignee-${u.id}`}
                    onClick={() => toggleAssignee(u.id)}
                    className={`px-3 py-2 border text-xs transition-colors inline-flex items-center gap-2 ${
                      selected
                        ? "border-success bg-success/10 text-success"
                        : "border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {selected && <Check size={12} />}
                    <span>
                      <span className="font-display font-bold">{u.name || u.email}</span>
                      {u.role && <span className="ml-1 text-text-secondary uppercase tracking-wider text-[10px]">· {u.role}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-text-secondary mt-2 inline-flex items-center gap-1.5">
              <Mail size={11} /> {t("assignees_notify_hint") || "Cada pessoa receberá um email + notificação no app"}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              data-testid="task-form-cancel"
              onClick={onClose}
              className="h-10 px-5 border border-border text-text-secondary hover:border-white hover:text-white font-display font-bold uppercase text-xs tracking-widest"
            >
              {t("cancel") || "Cancelar"}
            </button>
            <button
              type="submit"
              data-testid="task-form-submit"
              disabled={busy}
              className="h-10 px-5 bg-primary hover:bg-primary-hover text-white font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2 disabled:opacity-50"
            >
              {busy ? "..." : (
                <>
                  <Check size={14} />
                  {task ? (t("save") || "Salvar") : (t("create") || "Criar e notificar")}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
