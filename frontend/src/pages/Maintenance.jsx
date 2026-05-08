import { useEffect, useMemo, useState } from "react";
import { Wrench, Search, Plus, Edit2, Trash2, X, Upload, FileText, Image as ImageIcon, Car, Calendar, DollarSign, History } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import NameWithAvatar from "../components/NameWithAvatar";
import { uploadProfilePhoto } from "../lib/uploadPhoto";

const STATUS_LABEL = {
  in_stock: { label: "Em estoque", cls: "border-success text-success bg-success/10" },
  reserved: { label: "Reservado", cls: "border-warning text-warning bg-warning/10" },
  sold: { label: "Vendido", cls: "border-text-secondary text-text-secondary bg-surface" },
};

function formatBRL(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Maintenance({ t, onHistory }) {
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // selected vehicle id

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.get("/maintenance");
      setVehicles(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || t("error_generic"));
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(v => `${v.make} ${v.model} ${v.year} ${v.vin || ""}`.toLowerCase().includes(q));
  }, [vehicles, search]);

  const totalAll = filtered.reduce((s, v) => s + (v.maintenance_total || 0), 0);
  const totalServices = filtered.reduce((s, v) => s + (v.maintenance_count || 0), 0);

  return (
    <div data-testid="maintenance-tab">
      <p className="label-eyebrow text-primary mb-2">{t("maintenance_eyebrow")}</p>
      <h1 className="font-display font-black text-4xl uppercase tracking-tighter mb-6">{t("maintenance_title")}</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="border border-border bg-surface p-4">
          <p className="label-eyebrow text-text-secondary mb-1">{t("maintenance_total_cars")}</p>
          <p className="font-display font-black text-3xl">{filtered.length}</p>
        </div>
        <div className="border border-border bg-surface p-4">
          <p className="label-eyebrow text-text-secondary mb-1">{t("maintenance_total_services")}</p>
          <p className="font-display font-black text-3xl">{totalServices}</p>
        </div>
        <div className="border border-primary bg-primary/5 p-4">
          <p className="label-eyebrow text-primary mb-1">{t("maintenance_total_cost")}</p>
          <p className="font-display font-black text-3xl text-primary">{formatBRL(totalAll)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          data-testid="maintenance-search"
          type="text"
          placeholder={t("maintenance_search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-3 h-11 bg-surface border border-border focus:border-primary focus:outline-none text-sm"
        />
      </div>

      {loading ? (
        <p className="text-text-secondary text-center py-16 border border-dashed border-border">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-text-secondary text-center py-16 border border-dashed border-border">
          {search ? t("maintenance_no_match") : t("maintenance_no_vehicles")}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => (
            <VehicleRow
              key={v.id}
              v={v}
              isOpen={open === v.id}
              onToggle={() => setOpen(open === v.id ? null : v.id)}
              onChanged={reload}
              onHistory={onHistory}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleRow({ v, isOpen, onToggle, onChanged, onHistory, t }) {
  const status = STATUS_LABEL[v.status] || STATUS_LABEL.in_stock;
  const [editing, setEditing] = useState(null); // null | "new" | item

  return (
    <div data-testid={`maint-vehicle-${v.id}`} className="border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-4 p-4 text-left hover:bg-background/40 transition-colors"
      >
        <div className="w-20 h-16 bg-background border border-border overflow-hidden shrink-0">
          {v.image ? (
            <img src={v.image} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-secondary">
              <Car size={20} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="font-display font-bold uppercase">{v.year} {v.make} {v.model}</p>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 border ${status.cls}`}>{status.label}</span>
            {v.color && <span className="text-xs text-text-secondary">{v.color}</span>}
            {v.vin && <span className="text-xs text-text-secondary font-mono">VIN {v.vin}</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="label-eyebrow text-text-secondary">{t("maintenance_services_count")}</p>
          <p className="font-display font-bold text-lg">{v.maintenance_count}</p>
        </div>
        <div className="text-right">
          <p className="label-eyebrow text-primary">{t("maintenance_total_cost_short")}</p>
          <p className="font-display font-black text-xl text-primary">{formatBRL(v.maintenance_total)}</p>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border p-4 space-y-3" data-testid={`maint-panel-${v.id}`}>
          <div className="flex items-center justify-between">
            <p className="label-eyebrow">{t("maintenance_services")}</p>
            <div className="flex gap-2">
              {onHistory && (
                <button
                  type="button"
                  data-testid={`maint-history-${v.id}`}
                  onClick={() => onHistory(v.id)}
                  className="border border-border hover:border-primary hover:text-primary px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
                >
                  <History size={12} /> {t("vehicle_history")}
                </button>
              )}
              <button
                type="button"
                data-testid={`add-service-${v.id}`}
                onClick={() => setEditing("new")}
                className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 text-[11px] font-display font-bold uppercase tracking-widest inline-flex items-center gap-1.5"
              >
                <Plus size={12} /> {t("maintenance_add_service")}
              </button>
            </div>
          </div>

          {(v.maintenance_items || []).length === 0 ? (
            <p className="text-text-secondary text-xs italic py-4 text-center">{t("maintenance_no_services_yet")}</p>
          ) : (
            <ul className="space-y-2">
              {v.maintenance_items.map(it => (
                <ServiceItem key={it.id} item={it} vehicle={v} onEdit={() => setEditing(it)} onChanged={onChanged} t={t} />
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && (
        <ServiceForm
          vehicle={v}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
          t={t}
        />
      )}
    </div>
  );
}

function ServiceItem({ item, vehicle, onEdit, onChanged, t }) {
  const remove = async () => {
    if (!window.confirm(t("maintenance_confirm_delete"))) return;
    try {
      await api.delete(`/maintenance/vehicles/${vehicle.id}/items/${item.id}`);
      toast.success(t("saved"));
      onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || t("error_generic")); }
  };
  return (
    <li data-testid={`service-${item.id}`} className="border border-border p-3 flex flex-wrap items-start gap-3">
      <div className="flex-1 min-w-[200px]">
        <p className="font-display font-bold">{item.description}</p>
        <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1"><Calendar size={11} /> {item.date || "—"}</span>
          {item.created_by_name && (
            <span className="inline-flex items-center gap-1">
              {t("by")} <NameWithAvatar name={item.created_by_name} size="xs" className="text-text-primary" />
            </span>
          )}
          {(item.parts || []).length > 0 && (
            <span>{t("parts")}: {item.parts.join(", ")}</span>
          )}
        </div>
        {(item.attachments || []).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {item.attachments.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 border border-border hover:border-primary text-[11px]"
              >
                {(a.type || "").startsWith("image/") ? <ImageIcon size={11} /> : <FileText size={11} />}
                {a.name || t("file")}
              </a>
            ))}
          </div>
        )}
      </div>
      <p className="font-display font-black text-lg text-primary whitespace-nowrap">{formatBRL(item.amount)}</p>
      <div className="inline-flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          data-testid={`edit-service-${item.id}`}
          className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
          title={t("edit")}
        >
          <Edit2 size={12} />
        </button>
        <button
          type="button"
          onClick={remove}
          data-testid={`delete-service-${item.id}`}
          className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
          title={t("delete")}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </li>
  );
}

function ServiceForm({ vehicle, item, onClose, onSaved, t }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    description: item?.description || "",
    amount: item?.amount || 0,
    date: item?.date || new Date().toISOString().slice(0, 10),
    parts: (item?.parts || []).join("\n"),
    attachments: item?.attachments || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onAttach = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { photo_url, photo_public_id } = await uploadProfilePhoto(file);
      const att = { url: photo_url, public_id: photo_public_id, name: file.name, type: file.type || "" };
      set("attachments", [...form.attachments, att]);
    } catch (e) { toast.error(e.message || t("error_generic")); }
    finally { setUploading(false); }
  };

  const removeAttachment = (i) => set("attachments", form.attachments.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        description: form.description.trim(),
        amount: Number(form.amount) || 0,
        date: form.date,
        parts: form.parts.split("\n").map(s => s.trim()).filter(Boolean),
        attachments: form.attachments,
      };
      if (isEdit) {
        await api.put(`/maintenance/vehicles/${vehicle.id}/items/${item.id}`, payload);
      } else {
        await api.post(`/maintenance/vehicles/${vehicle.id}/items`, payload);
      }
      toast.success(t("saved"));
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || t("error_generic")); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={submit} className="bg-background border border-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-eyebrow text-primary">{vehicle.year} {vehicle.make} {vehicle.model}</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {isEdit ? t("maintenance_edit_service") : t("maintenance_add_service")}
            </h2>
          </div>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("description")}</label>
          <input
            data-testid="service-description"
            required
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={t("maintenance_description_placeholder")}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-eyebrow block mb-2 inline-flex items-center gap-1"><DollarSign size={11} /> {t("amount")}</label>
            <input
              data-testid="service-amount"
              required
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2 inline-flex items-center gap-1"><Calendar size={11} /> {t("date")}</label>
            <input
              data-testid="service-date"
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("maintenance_parts_optional")}</label>
          <textarea
            data-testid="service-parts"
            rows={3}
            value={form.parts}
            onChange={(e) => set("parts", e.target.value)}
            placeholder={t("maintenance_parts_placeholder")}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm font-mono resize-none"
          />
        </div>

        <div>
          <label className="label-eyebrow block mb-2">{t("maintenance_attachments")}</label>
          {form.attachments.length > 0 && (
            <ul className="space-y-1 mb-2">
              {form.attachments.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-xs border border-border px-2 py-1.5">
                  {(a.type || "").startsWith("image/") ? <ImageIcon size={12} /> : <FileText size={12} />}
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:text-primary">{a.name}</a>
                  <button type="button" onClick={() => removeAttachment(i)} className="text-text-secondary hover:text-primary">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="block w-full border border-dashed border-border hover:border-primary text-center py-3 text-xs text-text-secondary cursor-pointer transition-colors">
            <input
              data-testid="service-attach"
              type="file"
              className="hidden"
              accept="image/*,.pdf"
              onChange={(e) => onAttach(e.target.files?.[0])}
              disabled={uploading || saving}
            />
            <span className="inline-flex items-center gap-2">
              <Upload size={13} /> {uploading ? t("loading") : t("maintenance_attach_hint")}
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="service-submit" disabled={saving || uploading} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors">
            {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}
