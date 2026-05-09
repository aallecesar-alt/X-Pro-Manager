import { useEffect, useMemo, useState } from "react";
import { Wrench, Search, Plus, Edit2, Trash2, X, Phone, Calendar, DollarSign, User, Car, AlertCircle, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency } from "@/lib/api";

const STATUS_META = {
  open:        { label: "Aberto",       cls: "border-warning text-warning bg-warning/10",        icon: AlertCircle },
  in_progress: { label: "Em andamento", cls: "border-blue-500 text-blue-400 bg-blue-500/10",     icon: Clock },
  done:        { label: "Concluído",    cls: "border-success text-success bg-success/10",        icon: CheckCircle2 },
};

const STATUS_FLOW = ["open", "in_progress", "done"];

export default function PostSales({ t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null); // null | "new" | item

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get("/post-sales");
      setItems(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const counts = useMemo(() => ({
    all: items.length,
    open: items.filter(x => x.status === "open").length,
    in_progress: items.filter(x => x.status === "in_progress").length,
    done: items.filter(x => x.status === "done").length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(x => {
      if (statusFilter !== "all" && x.status !== statusFilter) return false;
      if (!q) return true;
      return `${x.vin} ${x.make} ${x.model} ${x.customer_name} ${x.problem} ${x.work_to_do}`.toLowerCase().includes(q);
    });
  }, [items, search, statusFilter]);

  const totalCost = useMemo(() => filtered.reduce((s, x) => s + Number(x.cost || 0), 0), [filtered]);
  const openCount = counts.open + counts.in_progress;

  const advance = async (item) => {
    const idx = STATUS_FLOW.indexOf(item.status);
    const next = STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 1)];
    if (next === item.status) return;
    try {
      await api.put(`/post-sales/${item.id}`, { ...item, status: next });
      toast.success("Status atualizado");
      reload();
    } catch (e) { toast.error(e.response?.data?.detail || t("error_generic")); }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este reparo?")) return;
    try {
      await api.delete(`/post-sales/${id}`);
      toast.success("Removido");
      reload();
    } catch (e) { toast.error(e.response?.data?.detail || t("error_generic")); }
  };

  return (
    <div data-testid="post-sales-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="label-eyebrow text-primary mb-2">Pós-Vendas</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">Pós-Vendas</h1>
        </div>
        <button
          data-testid="add-post-sale"
          onClick={() => setEditing("new")}
          className="bg-primary hover:bg-primary-hover px-5 py-3 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
        >
          <Plus size={14} /> Novo reparo
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Em aberto" value={openCount} accent="text-warning border-warning/40" />
        <SummaryCard label="Concluídos" value={counts.done} accent="text-success border-success/40" />
        <SummaryCard label="Total de reparos" value={counts.all} />
        <SummaryCard label="Custo total" value={formatCurrency(totalCost)} accent="text-primary border-primary" big />
      </div>

      {/* Search + status filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="border border-border flex items-center px-4 h-12 flex-1 min-w-[280px]">
          <Search size={16} className="text-text-secondary mr-3" />
          <input
            data-testid="post-sales-search"
            type="text"
            placeholder="Buscar VIN, cliente, marca, problema..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent w-full focus:outline-none text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: "all", label: `Todos (${counts.all})` },
          { id: "open", label: `Aberto (${counts.open})` },
          { id: "in_progress", label: `Em andamento (${counts.in_progress})` },
          { id: "done", label: `Concluído (${counts.done})` },
        ].map(s => (
          <button
            key={s.id}
            data-testid={`ps-filter-${s.id}`}
            onClick={() => setStatusFilter(s.id)}
            className={`px-4 py-2 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
              statusFilter === s.id ? "bg-primary border-primary text-white" : "border-border text-text-secondary hover:border-primary hover:text-primary"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-text-secondary text-center py-16 border border-dashed border-border">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border">
          <Wrench size={32} className="mx-auto text-text-secondary mb-4" />
          <p className="text-text-secondary">Nenhum reparo cadastrado ainda.</p>
          <button
            data-testid="empty-add-post-sale"
            onClick={() => setEditing("new")}
            className="mt-4 text-primary text-xs font-display font-bold uppercase tracking-widest hover:underline"
          >
            + Adicionar o primeiro
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(it => (
            <RepairCard key={it.id} item={it} onEdit={() => setEditing(it)} onDelete={() => onDelete(it.id)} onAdvance={() => advance(it)} />
          ))}
        </div>
      )}

      {editing && (
        <RepairForm
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent = "", big = false }) {
  return (
    <div className={`border ${accent.includes("border") ? accent : "border-border"} bg-surface p-4`}>
      <p className="label-eyebrow text-text-secondary mb-1">{label}</p>
      <p className={`font-display font-black ${big ? "text-2xl" : "text-3xl"} ${accent.includes("text") ? accent.split(" ").find(c => c.startsWith("text-")) : ""}`}>{value}</p>
    </div>
  );
}

function RepairCard({ item, onEdit, onDelete, onAdvance }) {
  const meta = STATUS_META[item.status] || STATUS_META.open;
  const Icon = meta.icon;
  const canAdvance = item.status !== "done";

  return (
    <div data-testid={`ps-card-${item.id}`} className="border border-border bg-surface p-5 hover:border-primary/60 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wider ${meta.cls}`}>
              <Icon size={10} /> {meta.label}
            </span>
            {item.vin && (
              <span className="text-[10px] uppercase tracking-widest text-text-secondary border border-border px-2 py-0.5">VIN: {item.vin}</span>
            )}
          </div>
          <p className="font-display font-bold text-lg uppercase truncate">
            {[item.year, item.make, item.model].filter(Boolean).join(" ") || "Carro sem identificação"}
          </p>
          {item.color && <p className="text-xs text-text-secondary">{item.color}</p>}
        </div>
        <div className="flex items-center gap-1">
          {canAdvance && (
            <button
              data-testid={`ps-advance-${item.id}`}
              onClick={onAdvance}
              title="Avançar status"
              className="border border-primary text-primary hover:bg-primary hover:text-white p-2 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          )}
          <button data-testid={`ps-edit-${item.id}`} onClick={onEdit} title="Editar" className="border border-border hover:border-primary hover:text-primary p-2"><Edit2 size={14} /></button>
          <button data-testid={`ps-del-${item.id}`} onClick={onDelete} title="Excluir" className="border border-border hover:border-primary hover:text-primary p-2"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Customer */}
      {(item.customer_name || item.customer_phone) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary mb-3">
          {item.customer_name && <span className="inline-flex items-center gap-1.5"><User size={11} /> {item.customer_name}</span>}
          {item.customer_phone && <span className="inline-flex items-center gap-1.5"><Phone size={11} /> {item.customer_phone}</span>}
        </div>
      )}

      {/* Problem & work */}
      {item.problem && (
        <div className="mb-2">
          <p className="label-eyebrow text-text-secondary mb-1">Problema</p>
          <p className="text-sm">{item.problem}</p>
        </div>
      )}
      {item.work_to_do && (
        <div className="mb-3">
          <p className="label-eyebrow text-text-secondary mb-1">A fazer</p>
          <p className="text-sm">{item.work_to_do}</p>
        </div>
      )}

      {/* Footer row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-text-secondary">
          {item.entry_date && <span className="inline-flex items-center gap-1"><Calendar size={11} /> Entrada {item.entry_date}</span>}
          {item.exit_date && <span className="inline-flex items-center gap-1"><Calendar size={11} /> Saída {item.exit_date}</span>}
          {item.technician && <span className="inline-flex items-center gap-1"><Wrench size={11} /> {item.technician}</span>}
        </div>
        {Number(item.cost) > 0 && (
          <span className="inline-flex items-center gap-1 text-primary font-display font-bold">
            <DollarSign size={11} /> {formatCurrency(item.cost)}
          </span>
        )}
      </div>
    </div>
  );
}

function RepairForm({ item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState(item || {
    vin: "", vehicle_id: "", make: "", model: "", year: "", color: "",
    customer_name: "", customer_phone: "",
    entry_date: new Date().toISOString().slice(0, 10),
    exit_date: "",
    problem: "", work_to_do: "",
    cost: 0, technician: "", notes: "",
    status: "open",
  });
  const [lookupBusy, setLookupBusy] = useState(false);
  const [foundCar, setFoundCar] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const lookupVin = async () => {
    const vin = (form.vin || "").trim();
    if (!vin) { toast.error("Digite o VIN primeiro"); return; }
    setLookupBusy(true);
    try {
      const r = await api.get("/post-sales/lookup-vin", { params: { vin } });
      if (r.data?.found) {
        setForm(f => ({
          ...f,
          vehicle_id: r.data.vehicle_id || "",
          vin: r.data.vin || vin,
          make: r.data.make || f.make,
          model: r.data.model || f.model,
          year: r.data.year || f.year,
          color: r.data.color || f.color,
          customer_name: r.data.customer_name || f.customer_name,
          customer_phone: r.data.customer_phone || f.customer_phone,
        }));
        setFoundCar(r.data);
        toast.success("Carro encontrado, dados preenchidos");
      } else {
        setFoundCar(null);
        toast.message("VIN não encontrado", { description: "Você pode preencher manualmente os dados do carro abaixo." });
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Erro na busca"); }
    finally { setLookupBusy(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      year: form.year ? Number(form.year) : null,
      cost: Number(form.cost || 0),
    };
    try {
      if (isEdit) await api.put(`/post-sales/${item.id}`, payload);
      else await api.post("/post-sales", payload);
      toast.success("Salvo!");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao salvar");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-3xl p-7 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-black text-2xl uppercase tracking-tight">
            {isEdit ? "Editar reparo" : "Novo reparo"}
          </h2>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        {/* VIN lookup */}
        <div className="border border-border p-4 bg-surface space-y-3">
          <div>
            <label className="label-eyebrow block mb-2">VIN do veículo</label>
            <div className="flex gap-2">
              <input
                data-testid="ps-form-vin"
                type="text"
                value={form.vin}
                onChange={(e) => set("vin", e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupVin(); } }}
                placeholder="Digite o VIN..."
                className="flex-1 bg-background border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm uppercase tracking-wider"
              />
              <button
                type="button"
                data-testid="ps-form-lookup-btn"
                onClick={lookupVin}
                disabled={lookupBusy}
                className="border border-primary text-primary hover:bg-primary hover:text-white px-5 h-11 font-display font-bold uppercase text-xs tracking-widest disabled:opacity-50"
              >
                {lookupBusy ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </div>
          {foundCar && (
            <div className="flex items-center gap-3 text-xs text-success border border-success/40 bg-success/5 p-2.5">
              <Car size={14} />
              <span className="font-display font-bold uppercase tracking-wider">Carro encontrado:</span>
              <span>{foundCar.year} {foundCar.make} {foundCar.model}</span>
              {foundCar.customer_name && <span className="text-text-secondary">· Cliente: {foundCar.customer_name}</span>}
            </div>
          )}
        </div>

        {/* Vehicle data */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FormInput label="Marca" value={form.make} onChange={(v) => set("make", v)} testid="ps-form-make" />
          <FormInput label="Modelo" value={form.model} onChange={(v) => set("model", v)} testid="ps-form-model" />
          <FormInput label="Ano" type="number" value={form.year || ""} onChange={(v) => set("year", v)} testid="ps-form-year" />
          <FormInput label="Cor" value={form.color} onChange={(v) => set("color", v)} testid="ps-form-color" />
        </div>

        {/* Customer */}
        <div className="grid grid-cols-2 gap-3">
          <FormInput label="Cliente" value={form.customer_name} onChange={(v) => set("customer_name", v)} testid="ps-form-customer" />
          <FormInput label="Telefone do cliente" value={form.customer_phone} onChange={(v) => set("customer_phone", v)} testid="ps-form-phone" />
        </div>

        {/* Problem & work */}
        <div className="space-y-3">
          <div>
            <label className="label-eyebrow block mb-2">Problema relatado</label>
            <textarea
              data-testid="ps-form-problem"
              value={form.problem}
              onChange={(e) => set("problem", e.target.value)}
              rows={2}
              placeholder="Ex: barulho no motor, ar não gela..."
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm resize-none"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">O que precisa ser feito</label>
            <textarea
              data-testid="ps-form-work"
              value={form.work_to_do}
              onChange={(e) => set("work_to_do", e.target.value)}
              rows={3}
              placeholder="Ex: trocar correia dentada, recarregar gás do ar..."
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        {/* Dates / cost / status / tech */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FormInput label="Data de entrada" type="date" value={form.entry_date || ""} onChange={(v) => set("entry_date", v)} testid="ps-form-entry" />
          <FormInput label="Data de saída" type="date" value={form.exit_date || ""} onChange={(v) => set("exit_date", v)} testid="ps-form-exit" />
          <FormInput label="Custo" type="number" value={form.cost} onChange={(v) => set("cost", v)} testid="ps-form-cost" />
          <div>
            <label className="label-eyebrow block mb-2">Status</label>
            <select
              data-testid="ps-form-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            >
              <option value="open">Aberto</option>
              <option value="in_progress">Em andamento</option>
              <option value="done">Concluído</option>
            </select>
          </div>
        </div>

        <FormInput label="Mecânico / responsável" value={form.technician} onChange={(v) => set("technician", v)} testid="ps-form-tech" />

        <div>
          <label className="label-eyebrow block mb-2">Observações</label>
          <textarea
            data-testid="ps-form-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="border border-border hover:border-primary hover:text-primary px-5 h-11 font-display font-bold uppercase text-xs tracking-widest">
            Cancelar
          </button>
          <button
            data-testid="ps-form-save"
            type="submit"
            disabled={saving}
            className="bg-primary hover:bg-primary-hover px-5 h-11 font-display font-bold uppercase text-xs tracking-widest disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FormInput({ label, value, onChange, testid, type = "text" }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <input
        data-testid={testid}
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
      />
    </div>
  );
}
