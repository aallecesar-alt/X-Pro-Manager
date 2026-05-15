import { useEffect, useMemo, useState } from "react";
import { FileText, Search, Eye, Trash2, X, Phone, Mail, Calendar, MapPin, Briefcase, DollarSign, FileSignature, Copy, Check, Printer } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STATUS_META = {
  new: { label: "Novo", cls: "border-warning text-warning bg-warning/10" },
  in_review: { label: "Em análise", cls: "border-blue-500 text-blue-400 bg-blue-500/10" },
  approved: { label: "Aprovada", cls: "border-success text-success bg-success/10" },
  declined: { label: "Negada", cls: "border-primary text-primary bg-primary/10" },
  archived: { label: "Arquivada", cls: "border-border text-text-secondary bg-surface" },
};

export default function CreditApplications() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, new: 0, in_review: 0, approved: 0, declined: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [opened, setOpened] = useState(null); // application detail
  const [copiedLang, setCopiedLang] = useState("");

  const baseLink = `${window.location.origin}/apply/${user?.dealership_id || ""}`;
  const links = {
    pt: `${baseLink}/pt`,
    en: `${baseLink}/en`,
    es: `${baseLink}/es`,
  };

  const reload = async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        api.get("/applications"),
        api.get("/applications/stats"),
      ]);
      setItems(list.data || []);
      setStats(s.data || {});
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao carregar");
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (!q) return true;
      return `${it.full_name} ${it.email} ${it.phone} ${it.vehicle_interest}`.toLowerCase().includes(q);
    });
  }, [items, search, statusFilter]);

  const copyLink = async (lang) => {
    try {
      await navigator.clipboard.writeText(links[lang]);
      setCopiedLang(lang);
      toast.success(`Link em ${lang.toUpperCase()} copiado!`);
      setTimeout(() => setCopiedLang(""), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div data-testid="applications-tab">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="label-eyebrow text-primary mb-2">Aplicações de crédito</p>
          <h1 className="font-display font-black text-4xl uppercase tracking-tighter">Aplicações</h1>
        </div>
      </div>

      {/* Public link card */}
      <div className="border border-primary/40 bg-primary/5 p-5 mb-6">
        <p className="label-eyebrow text-primary mb-3">📤 Links públicos por idioma</p>
        <p className="text-[11px] text-text-secondary mb-4">
          Manda o link no idioma do cliente. Ele preenche pelo celular e a aplicação cai aqui automaticamente.
        </p>
        <div className="space-y-2.5">
          {[
            { lang: "pt", flag: "🇧🇷", name: "Português" },
            { lang: "en", flag: "🇺🇸", name: "English" },
            { lang: "es", flag: "🇪🇸", name: "Español" },
          ].map(({ lang, flag, name }) => (
            <div key={lang} className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-sm uppercase tracking-wider w-24 shrink-0">
                {flag} {name}
              </span>
              <code className="flex-1 min-w-0 truncate bg-background border border-border px-3 py-2 text-xs">
                {links[lang]}
              </code>
              <button
                data-testid={`copy-link-${lang}`}
                onClick={() => copyLink(lang)}
                className="border border-primary text-primary hover:bg-primary hover:text-white px-3 h-9 inline-flex items-center gap-2 font-display font-bold uppercase text-[10px] tracking-widest transition-colors"
              >
                {copiedLang === lang ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Novos" value={stats.new} accent="text-warning border-warning/40" />
        <StatCard label="Em análise" value={stats.in_review} accent="text-blue-400 border-blue-500/40" />
        <StatCard label="Aprovadas" value={stats.approved} accent="text-success border-success/40" />
        <StatCard label="Negadas" value={stats.declined} accent="text-primary border-primary/40" />
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="border border-border flex items-center px-4 h-12 flex-1 min-w-[280px]">
          <Search size={16} className="text-text-secondary mr-3" />
          <input
            data-testid="apps-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, email, telefone, veículo..."
            className="bg-transparent w-full focus:outline-none text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          ["all", `Todos (${stats.total || 0})`],
          ["new", `Novos (${stats.new || 0})`],
          ["in_review", `Em análise (${stats.in_review || 0})`],
          ["approved", `Aprovadas (${stats.approved || 0})`],
          ["declined", `Negadas (${stats.declined || 0})`],
        ].map(([id, label]) => (
          <button
            key={id}
            data-testid={`apps-filter-${id}`}
            onClick={() => setStatusFilter(id)}
            className={`px-4 py-2 text-xs font-display font-bold uppercase tracking-widest border transition-colors ${
              statusFilter === id ? "bg-primary border-primary text-white" : "border-border text-text-secondary hover:border-primary hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-text-secondary text-center py-16 border border-dashed border-border">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border">
          <FileText size={32} className="mx-auto text-text-secondary mb-4" />
          <p className="text-text-secondary">Nenhuma aplicação ainda.</p>
          <p className="text-[11px] text-text-secondary mt-2">
            Manda o link acima pro cliente preencher!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(it => (
            <ApplicationRow key={it.id} item={it} onOpen={() => setOpened(it)} onChange={reload} />
          ))}
        </div>
      )}

      {opened && <ApplicationModal app={opened} onClose={() => setOpened(null)} onChange={() => { setOpened(null); reload(); }} />}
    </div>
  );
}

function StatCard({ label, value, accent = "" }) {
  return (
    <div className={`border ${accent.includes("border") ? accent : "border-border"} bg-surface p-4`}>
      <p className="label-eyebrow text-text-secondary mb-1">{label}</p>
      <p className={`font-display font-black text-3xl ${accent.includes("text") ? accent.split(" ").find(c => c.startsWith("text-")) : ""}`}>{value || 0}</p>
    </div>
  );
}

function ApplicationRow({ item, onOpen, onChange }) {
  const meta = STATUS_META[item.status] || STATUS_META.new;
  return (
    <div
      data-testid={`app-row-${item.id}`}
      className="border border-border bg-surface p-4 flex flex-wrap items-center gap-4 hover:border-primary/60 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wider ${meta.cls}`}>
            {meta.label}
          </span>
          <span className="text-[10px] text-text-secondary uppercase tracking-widest">
            {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
          </span>
          {item.language && (
            <span className="text-[10px] uppercase border border-border px-1.5 py-0.5 text-text-secondary">
              {item.language}
            </span>
          )}
        </div>
        <p className="font-display font-bold text-base uppercase truncate">{item.full_name || "—"}</p>
        <p className="text-xs text-text-secondary truncate">
          {item.vehicle_interest || "—"}
          {item.down_payment && <span className="ml-2 text-text-secondary/70">· entrada {item.down_payment}</span>}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary mt-1.5">
          {item.email && <span className="inline-flex items-center gap-1.5"><Mail size={11} /> {item.email}</span>}
          {item.phone && <span className="inline-flex items-center gap-1.5"><Phone size={11} /> {item.phone}</span>}
        </div>
      </div>
      <button
        data-testid={`app-view-${item.id}`}
        onClick={onOpen}
        className="border border-primary text-primary hover:bg-primary hover:text-white px-4 h-10 inline-flex items-center gap-2 font-display font-bold uppercase text-[11px] tracking-widest"
      >
        <Eye size={14} /> Ver
      </button>
    </div>
  );
}

function ApplicationModal({ app, onClose, onChange }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[app.status] || STATUS_META.new;

  const setStatus = async (s) => {
    setBusy(true);
    try {
      await api.put(`/applications/${app.id}/status`, { status: s });
      toast.success("Status atualizado");
      onChange();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    } finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!window.confirm("Excluir esta aplicação? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    try {
      await api.delete(`/applications/${app.id}`);
      toast.success("Removido");
      onChange();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro");
    } finally { setBusy(false); }
  };

  const onPrint = async () => {
    setBusy(true);
    try {
      const res = await api.get(`/applications/${app.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      // Give the new tab a moment to consume the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar PDF");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center overflow-auto py-8 px-4">
      <div className="bg-background border border-border w-full max-w-3xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <p className="label-eyebrow text-primary mb-1">Aplicação de crédito</p>
            <h2 className="font-display font-black text-2xl uppercase tracking-tight">{app.full_name || "—"}</h2>
            <span className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wider mt-2 ${meta.cls}`}>
              {meta.label}
            </span>
          </div>
          <button data-testid="app-modal-close" onClick={onClose} className="text-text-secondary hover:text-primary">
            <X size={22} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Vehicle */}
          <Section title="Veículo de interesse">
            <Row label="Veículo" value={app.vehicle_interest} />
            <Row label="Entrada" value={app.down_payment} icon={DollarSign} />
          </Section>

          {/* Identification */}
          <Section title="Identificação">
            <Row label="Nome completo" value={app.full_name} />
            <Row label="Email" value={app.email} icon={Mail} />
            <Row label="Telefone" value={app.phone} icon={Phone} />
            <Row label="Data de nasc." value={app.date_of_birth} icon={Calendar} />
            <Row label="Estado civil" value={app.marital_status} />
            <Row label="Driver License" value={app.license_status} />
            {app.license_number && <Row label="Nº Driver License" value={app.license_number} />}
            <Row label="Documento" value={`${app.document_type || ""} · ${app.document_number || ""}`} />
            {(app.document_photo_front_url || app.document_photo_back_url) && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                {app.document_photo_front_url && (
                  <a href={app.document_photo_front_url} target="_blank" rel="noreferrer" className="border border-border block">
                    <img src={app.document_photo_front_url} alt="Frente" className="w-full h-32 object-cover" />
                    <p className="text-[10px] uppercase text-center py-1 text-text-secondary">Frente</p>
                  </a>
                )}
                {app.document_photo_back_url && (
                  <a href={app.document_photo_back_url} target="_blank" rel="noreferrer" className="border border-border block">
                    <img src={app.document_photo_back_url} alt="Verso" className="w-full h-32 object-cover" />
                    <p className="text-[10px] uppercase text-center py-1 text-text-secondary">Verso</p>
                  </a>
                )}
              </div>
            )}
          </Section>

          {/* Address */}
          <Section title="Endereço">
            <Row label="Endereço" value={`${app.address_line || ""} ${app.city ? `· ${app.city}` : ""} ${app.state ? `· ${app.state}` : ""} ${app.zipcode ? `· ${app.zipcode}` : ""}`} icon={MapPin} />
            <Row label="Tempo no endereço" value={app.time_at_address} />
            <Row label="Moradia" value={app.home_status} />
            {app.rent_amount && <Row label="Aluguel" value={app.rent_amount} icon={DollarSign} />}
            {app.previous_address && <Row label="Endereço anterior" value={app.previous_address} />}
          </Section>

          {/* Work & income */}
          <Section title="Trabalho e renda">
            <Row label="Tipo" value={app.employment_type} icon={Briefcase} />
            <Row label="Empresa" value={app.company_name} />
            <Row label="Profissão" value={app.profession} />
            <Row label="Tempo na profissão" value={app.time_in_profession} />
            <Row label="Renda" value={`${app.income_amount || ""} · ${app.income_period || ""}`} icon={DollarSign} />
            {app.company_reference_name && <Row label="Referência" value={`${app.company_reference_name} · ${app.company_reference_phone || ""}`} />}
          </Section>

          {/* Bank statements */}
          {app.bank_statements_urls?.length > 0 && (
            <Section title="Extratos bancários">
              <div className="grid grid-cols-3 gap-3">
                {app.bank_statements_urls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="border border-border block">
                    <img src={u} alt="" className="w-full h-24 object-cover" />
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Signature */}
          {app.signature_data_url && (
            <Section title="Assinatura digital">
              <div className="border border-border bg-white p-2">
                <img src={app.signature_data_url} alt="Assinatura" className="max-h-32 mx-auto" />
              </div>
              <p className="text-[10px] text-text-secondary mt-1.5 inline-flex items-center gap-1.5">
                <FileSignature size={11} /> Assinada digitalmente em {new Date(app.created_at).toLocaleString()}
              </p>
            </Section>
          )}

          {/* Consent */}
          <Section title="Confirmações">
            <Row label="Consentimento" value={app.consent ? "✓ Autorizou análise de crédito" : "—"} />
            <Row label="Veracidade" value={app.truthful ? "✓ Confirmou veracidade das informações" : "—"} />
          </Section>
        </div>

        {/* Actions */}
        <div className="border-t border-border px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_META).map(([id, m]) => (
              <button
                key={id}
                data-testid={`app-status-${id}`}
                onClick={() => setStatus(id)}
                disabled={busy || app.status === id}
                className={`px-3 py-1.5 text-[10px] font-display font-bold uppercase tracking-widest border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  app.status === id ? `${m.cls}` : "border-border text-text-secondary hover:border-primary hover:text-primary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="app-print"
              onClick={onPrint}
              disabled={busy}
              className="border border-success/40 bg-success/10 text-success hover:bg-success hover:text-white px-4 h-9 inline-flex items-center gap-2 text-[11px] font-display font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              <Printer size={13} /> Imprimir aplicação
            </button>
            <button
              data-testid="app-delete"
              onClick={onDelete}
              disabled={busy}
              className="border border-border hover:border-primary hover:text-primary px-4 h-9 inline-flex items-center gap-2 text-[11px] font-display font-bold uppercase tracking-widest"
            >
              <Trash2 size={13} /> Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-border p-4">
      <p className="label-eyebrow text-primary mb-3">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2 text-sm">
      <span className="text-[10px] uppercase tracking-widest text-text-secondary w-32 shrink-0">{label}</span>
      <span className="flex-1 inline-flex items-center gap-1.5">
        {Icon && <Icon size={12} className="text-text-secondary shrink-0" />}
        {value}
      </span>
    </div>
  );
}
