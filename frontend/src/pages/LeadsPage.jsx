import { useEffect, useMemo, useState } from "react";
import { Plus, Edit2, Trash2, X, Check, Search, Phone, Mail, MessageCircle, UserPlus, Download, AlertCircle, Globe } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import Avatar from "@/components/Avatar";

const STATUSES = [
  "new", "in_progress", "hot_lead", "follow_up", "cold",
  "no_answer", "wrong_number", "deal_closed", "lost", "future"
];
const SOURCES = [
  "facebook", "instagram", "google_ads", "cargurus", "carfax",
  "craigslist", "walk_in", "referral", "phone", "other"
];
const PAYMENT_TYPES = ["cash", "financing"];

const STATUS_COLORS = {
  new: "border-blue-500 text-blue-400 bg-blue-500/10",
  in_progress: "border-cyan-500 text-cyan-400 bg-cyan-500/10",
  hot_lead: "border-primary text-primary bg-primary/10",
  follow_up: "border-purple-500 text-purple-400 bg-purple-500/10",
  cold: "border-gray-500 text-gray-400 bg-gray-500/10",
  no_answer: "border-yellow-500 text-yellow-400 bg-yellow-500/10",
  wrong_number: "border-orange-500 text-orange-400 bg-orange-500/10",
  deal_closed: "border-success text-success bg-success/10",
  lost: "border-red-700 text-red-500 bg-red-700/10",
  future: "border-indigo-500 text-indigo-400 bg-indigo-500/10",
};

export default function LeadsPage({ t, role, currentSpId, salespeople = [] }) {
  const isOwner = role === "owner";
  const isBdc = role === "bdc";
  const isSp = role === "salesperson";
  const canEdit = isOwner || isBdc;

  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, unassigned: 0, by_status: {}, by_source: {} });
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAssigned, setFilterAssigned] = useState(isSp ? "no" : "all"); // sp default: unassigned
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // {} for new, lead obj for edit
  const [importing, setImporting] = useState(false);

  const reload = async () => {
    try {
      const params = {};
      if (filterStatus !== "all") params.status = filterStatus;
      if (filterAssigned !== "all") params.assigned = filterAssigned;
      if (search) params.search = search;
      const [l, s] = await Promise.all([
        api.get("/leads", { params }),
        api.get("/leads-stats"),
      ]);
      setLeads(l.data);
      setStats(s.data);
    } catch { toast.error(t("error_generic")); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [filterStatus, filterAssigned, search]);

  const claim = async (id) => {
    try { await api.post(`/leads/${id}/claim`); toast.success(t("lead_claimed")); reload(); }
    catch (err) { toast.error(err.response?.data?.detail || t("error_generic")); }
  };

  const remove = async (id) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/leads/${id}`); toast.success(t("saved")); reload(); }
    catch { toast.error(t("error_generic")); }
  };

  const importMonday = async () => {
    if (!window.confirm(t("confirm_monday_import"))) return;
    setImporting(true);
    try {
      const r = await api.post("/leads/import-monday", {});
      toast.success(`${t("imported")}: ${r.data.imported} · ${t("updated")}: ${r.data.updated}`);
      reload();
    } catch { toast.error(t("error_generic")); }
    finally { setImporting(false); }
  };

  const visibleStatuses = useMemo(() => {
    return [{ id: "all", label: t("all_time"), count: stats.total }].concat(
      STATUSES.filter(s => stats.by_status[s] > 0).map(s => ({ id: s, label: t(`lead_status_${s}`), count: stats.by_status[s] || 0 }))
    );
  }, [stats, t]);

  return (
    <div data-testid="leads-tab">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="label-eyebrow text-primary mb-2">CRM</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">{t("leads_title")}</h1>
          <p className="text-text-secondary text-sm mt-1">{stats.total} {t("leads_count_label")} · {stats.unassigned} {t("unassigned_label")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isOwner && (
            <button
              data-testid="import-monday"
              onClick={importMonday}
              disabled={importing}
              className="border border-border hover:border-primary hover:text-primary disabled:opacity-50 transition-colors px-4 py-2.5 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
            >
              <Download size={14} /> {importing ? "..." : t("import_monday")}
            </button>
          )}
          {canEdit && (
            <button
              data-testid="add-lead"
              onClick={() => setEditing({})}
              className="bg-primary hover:bg-primary-hover px-4 py-2.5 font-display font-bold uppercase text-xs tracking-widest inline-flex items-center gap-2"
            >
              <Plus size={14} /> {t("add_lead")}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-6">
        {[
          { id: "all", label: t("total"), val: stats.total },
          { id: "new", label: t("lead_status_new"), val: stats.by_status.new || 0 },
          { id: "hot_lead", label: t("lead_status_hot_lead"), val: stats.by_status.hot_lead || 0, accent: true },
          { id: "follow_up", label: t("lead_status_follow_up"), val: stats.by_status.follow_up || 0 },
          { id: "deal_closed", label: t("lead_status_deal_closed"), val: stats.by_status.deal_closed || 0, success: true },
        ].map((c) => (
          <button
            key={c.id}
            data-testid={`kpi-${c.id}`}
            onClick={() => setFilterStatus(c.id)}
            className={`bg-background p-5 text-left transition-colors hover:bg-surface ${filterStatus === c.id ? "ring-1 ring-primary" : ""}`}
          >
            <p className="label-eyebrow mb-2 text-[10px]">{c.label}</p>
            <p className={`font-display font-black text-2xl ${c.accent ? "text-primary" : c.success ? "text-success" : "text-white"}`}>{c.val}</p>
          </button>
        ))}
      </div>

      {/* Search + assignment filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="border border-border flex items-center px-4 h-12 flex-1 min-w-[260px]">
          <Search size={16} className="text-text-secondary mr-3" />
          <input data-testid="leads-search" type="text" placeholder={t("search_lead")} value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent w-full focus:outline-none text-sm" />
        </div>
        <div className="flex border border-border h-12">
          {[
            { id: "all", label: t("all_time") },
            { id: "no", label: t("unassigned_label") },
            { id: "mine", label: t("my_leads") },
            { id: "yes", label: t("assigned") },
          ].filter(x => !(isSp && x.id === "yes")).map(opt => (
            <button
              key={opt.id}
              data-testid={`filter-assigned-${opt.id}`}
              onClick={() => setFilterAssigned(opt.id)}
              className={`px-4 text-xs font-display font-bold uppercase tracking-wider transition-colors ${filterAssigned === opt.id ? "bg-primary text-white" : "text-text-secondary hover:text-white"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-6 overflow-x-auto">
        {visibleStatuses.map(s => (
          <button
            key={s.id}
            data-testid={`filter-status-${s.id}`}
            onClick={() => setFilterStatus(s.id)}
            className={`shrink-0 px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wider border transition-colors ${
              filterStatus === s.id ? "border-primary text-primary bg-primary/10" : "border-border text-text-secondary hover:text-white"
            }`}
          >
            {s.label} <span className="ml-1 text-text-secondary">({s.count})</span>
          </button>
        ))}
      </div>

      {/* Leads table */}
      <div className="border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface border-b border-border">
            <tr>
              <th className="text-left p-3 label-eyebrow">{t("name")}</th>
              <th className="text-left p-3 label-eyebrow">{t("contact")}</th>
              <th className="text-left p-3 label-eyebrow">{t("source")}</th>
              <th className="text-left p-3 label-eyebrow">{t("status")}</th>
              <th className="text-left p-3 label-eyebrow">{t("salesperson")}</th>
              <th className="text-left p-3 label-eyebrow">{t("last_contact")}</th>
              <th className="text-right p-3 label-eyebrow"></th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-text-secondary">{t("no_leads")}</td></tr>
            )}
            {leads.map(l => (
              <tr key={l.id} data-testid={`lead-row-${l.id}`} className="border-b border-border hover:bg-surface transition-colors">
                <td className="p-3">
                  <p className="font-display font-bold">{l.name}</p>
                  {l.interest_make_model && <p className="text-xs text-text-secondary">→ {l.interest_make_model}</p>}
                </td>
                <td className="p-3 space-y-0.5">
                  {l.phone && (
                    <div className="text-xs flex items-center gap-1.5">
                      <Phone size={11} className="text-text-secondary" />
                      <a href={`tel:${l.phone}`} className="hover:text-primary font-mono">{l.phone}</a>
                      <a
                        href={`https://wa.me/${(l.phone || "").replace(/\D/g, "")}`}
                        target="_blank" rel="noreferrer"
                        title="WhatsApp"
                        className="text-success hover:text-success/80"
                      >
                        <MessageCircle size={11} />
                      </a>
                    </div>
                  )}
                  {l.email && (
                    <div className="text-xs flex items-center gap-1.5 text-text-secondary">
                      <Mail size={11} /> {l.email}
                    </div>
                  )}
                </td>
                <td className="p-3 text-xs">
                  <span className="border border-border px-2 py-1 inline-flex items-center gap-1 uppercase tracking-wider">
                    <Globe size={10} /> {t(`lead_source_${l.source}`) || l.source}
                  </span>
                </td>
                <td className="p-3">
                  <span className={`text-[10px] font-display font-bold uppercase tracking-wider px-2 py-1 border ${STATUS_COLORS[l.status] || "border-border text-text-secondary"}`}>
                    {t(`lead_status_${l.status}`) || l.status}
                  </span>
                </td>
                <td className="p-3 text-xs">
                  {l.salesperson_name ? (
                    (() => {
                      const sp = salespeople.find(s => s.id === l.salesperson_id);
                      return (
                        <div className="flex items-center gap-2">
                          <Avatar src={sp?.photo_url} name={l.salesperson_name} size="sm" />
                          <span className="font-display font-bold">{l.salesperson_name}</span>
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-warning uppercase tracking-wider inline-flex items-center gap-1">
                      <AlertCircle size={11} /> {t("unassigned_label")}
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs text-text-secondary font-mono">
                  {l.last_contact_at || "—"}
                </td>
                <td className="p-3 text-right">
                  <div className="inline-flex gap-1">
                    {isSp && !l.salesperson_id && (
                      <button
                        data-testid={`claim-${l.id}`}
                        onClick={() => claim(l.id)}
                        title={t("claim_lead")}
                        className="px-3 h-8 bg-primary hover:bg-primary-hover text-white inline-flex items-center gap-1 text-[10px] font-display font-bold uppercase tracking-wider"
                      >
                        <UserPlus size={11} /> {t("claim_lead")}
                      </button>
                    )}
                    <button
                      data-testid={`edit-lead-${l.id}`}
                      onClick={() => setEditing(l)}
                      className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                      title={t("edit")}
                    >
                      <Edit2 size={13} />
                    </button>
                    {canEdit && (
                      <button
                        data-testid={`del-lead-${l.id}`}
                        onClick={() => remove(l.id)}
                        className="w-8 h-8 border border-border hover:border-primary hover:text-primary flex items-center justify-center transition-colors"
                        title={t("delete")}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <LeadForm
          lead={editing.id ? editing : null}
          t={t}
          salespeople={salespeople}
          role={role}
          currentSpId={currentSpId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function LeadForm({ lead, t, salespeople, role, currentSpId, onClose, onSaved }) {
  const isSp = role === "salesperson";
  const [form, setForm] = useState(lead || {
    name: "", phone: "", email: "", source: "facebook", status: "new",
    interest_make_model: "", budget: 0, payment_type: "", notes: "",
    last_contact_at: "", salesperson_id: isSp ? currentSpId : "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, budget: Number(form.budget) || 0 };
      if (lead) await api.put(`/leads/${lead.id}`, payload);
      else await api.post("/leads", payload);
      toast.success(t("saved"));
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || t("error_generic"));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-12 px-4">
      <form onSubmit={save} className="bg-background border border-border w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-eyebrow text-primary mb-1">CRM</p>
            <h2 className="font-display font-black text-xl uppercase tracking-tight">
              {lead ? t("edit_lead") : t("add_lead")}
            </h2>
          </div>
          <button type="button" onClick={onClose}><X size={20} className="text-text-secondary hover:text-primary" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("name")} required value={form.name} set={(v) => set("name", v)} testid="lf-name" />
          <Field label={t("phone")} value={form.phone} set={(v) => set("phone", v)} testid="lf-phone" />
          <Field label={t("email")} type="email" value={form.email} set={(v) => set("email", v)} testid="lf-email" />
          <SelectField label={t("source")} value={form.source} set={(v) => set("source", v)} options={SOURCES} t={t} prefix="lead_source_" testid="lf-source" />
          <SelectField label={t("status")} value={form.status} set={(v) => set("status", v)} options={STATUSES} t={t} prefix="lead_status_" testid="lf-status" />
          <Field label={t("interest_make_model")} value={form.interest_make_model} set={(v) => set("interest_make_model", v)} testid="lf-interest" />
          <Field label={t("budget")} type="number" value={form.budget} set={(v) => set("budget", v)} testid="lf-budget" />
          <SelectField label={t("payment_type")} value={form.payment_type} set={(v) => set("payment_type", v)} options={["", ...PAYMENT_TYPES]} t={t} prefix="payment_" testid="lf-payment" />
          <Field label={t("last_contact")} type="date" value={form.last_contact_at} set={(v) => set("last_contact_at", v)} testid="lf-last-contact" />
          {!isSp && (
            <div>
              <label className="label-eyebrow block mb-2">{t("salesperson")}</label>
              <select
                data-testid="lf-salesperson"
                value={form.salesperson_id || ""}
                onChange={(e) => set("salesperson_id", e.target.value)}
                className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
              >
                <option value="">— {t("unassigned_label")} —</option>
                {salespeople.filter(s => s.active !== false).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="label-eyebrow block mb-2">{t("notes")}</label>
          <textarea
            data-testid="lf-notes"
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={4}
            className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-5 py-2.5 border border-border hover:border-primary text-xs font-display font-bold uppercase tracking-widest transition-colors">{t("cancel")}</button>
          <button type="submit" data-testid="lf-submit" disabled={saving} className="bg-primary hover:bg-primary-hover disabled:opacity-50 px-5 py-2.5 text-xs font-display font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2">
            <Check size={14} /> {saving ? "..." : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, set, type = "text", required, testid }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <input
        data-testid={testid}
        type={type}
        value={value || ""}
        required={required}
        onChange={(e) => set(e.target.value)}
        className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
      />
    </div>
  );
}

function SelectField({ label, value, set, options, t, prefix, testid }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <select
        data-testid={testid}
        value={value || ""}
        onChange={(e) => set(e.target.value)}
        className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-11 text-sm"
      >
        {options.map(o => (
          <option key={o} value={o}>{o ? (t(`${prefix}${o}`) || o) : "—"}</option>
        ))}
      </select>
    </div>
  );
}
