import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronRight, ChevronLeft, Check, Upload, X, Loader2, Eraser } from "lucide-react";
import axios from "axios";

/**
 * Public credit application form.
 *
 * Mounted at /apply/:dealershipId — anyone with the link can submit. The form
 * is split into 5 steps with a progress bar; we intentionally avoid React
 * Router nested routes so the customer cannot accidentally jump steps via the
 * browser back button.
 */
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const TOTAL_STEPS = 5;

// ──────────────────────────────────────────────────────────────────────
// Translations (PT default, EN, ES). One source of truth for the form.
// ──────────────────────────────────────────────────────────────────────
const T = {
  pt: {
    lang: "pt", langName: "Português", flag: "🇧🇷",
    page_title: "Aplicação de Financiamento",
    powered: "Aplicação digital · Intercar Manager",
    step: "Etapa", of: "de", complete: "Completa",
    next: "Próxima", back: "Voltar", submit: "Enviar aplicação", submitting: "Enviando...",
    required: "Campo obrigatório",
    // Step 1
    s1_title: "Vamos começar",
    s1_subtitle: "Conta pra gente o carro que te interessa.",
    vehicle_interest: "Veículo de interesse",
    vehicle_interest_ph: "Ex: 2020 Acura RDX, ou cole o VIN",
    down_payment: "Quanto pode dar de entrada?",
    down_payment_ph: "Ex: $5,000 ou 5000",
    // Step 2
    s2_title: "Quem é você?",
    s2_subtitle: "Suas informações pessoais ficam protegidas.",
    full_name: "Nome completo",
    email: "Email",
    phone: "Telefone",
    date_of_birth: "Data de nascimento",
    marital_status: "Estado civil",
    marital_single: "Solteiro(a)", marital_married: "Casado(a)", marital_divorced: "Divorciado(a)", marital_widowed: "Viúvo(a)", marital_other: "Outro",
    license_status: "Driver License",
    license_ma: "Massachusetts (USA)", license_other_state: "Outro estado USA", license_other_country: "Outro país", license_none: "Não tenho",
    license_number: "Número da Driver License",
    document_type: "Documento principal",
    document_type_ssn: "Social Security (SSN)", document_type_itin: "ITIN", document_type_passport: "Passaporte",
    document_number: "Número do documento",
    document_photo: "Foto do documento (opcional)",
    photo_front: "Frente", photo_back: "Verso",
    upload_btn: "Enviar foto", uploading: "Enviando...", remove: "Remover",
    // Step 3
    s3_title: "Onde você mora?",
    s3_subtitle: "Endereço atual completo.",
    address_line: "Endereço (rua e número)", city: "Cidade", state: "Estado", zipcode: "ZIP",
    time_at_address: "Há quanto tempo mora aí?",
    time_at_address_ph: "Ex: 3 anos e 2 meses",
    home_status: "Situação da moradia",
    home_owned: "Casa própria", home_rented: "Alugada", home_family: "Casa de família",
    rent_amount: "Valor do aluguel", rent_amount_ph: "Ex: 1500",
    previous_address: "Endereço anterior",
    previous_address_hint: "(somente se mora no atual há menos de 2 anos)",
    // Step 4
    s4_title: "Trabalho e renda",
    s4_subtitle: "Importante pra análise de crédito.",
    employment_type: "Você é",
    employment_employed: "Empregado", employment_self: "Autônomo", employment_owner: "Dono da empresa", employment_other: "Outro",
    company_name: "Nome da empresa",
    profession: "Profissão",
    time_in_profession: "Há quanto tempo na profissão?",
    income_amount: "Renda",
    income_period: "Período",
    income_weekly: "Semanal", income_biweekly: "Quinzenal", income_monthly: "Mensal", income_yearly: "Anual",
    company_reference_name: "Referência (gerente/colega)",
    company_reference_phone: "Telefone da referência",
    // Step 5
    s5_title: "Confirmação",
    s5_subtitle: "Última etapa — quase lá!",
    bank_statements: "Extratos bancários (opcional, últimos 3 meses)",
    consent_label: "Autorizo a Intercar Auto Sales a usar essas informações para análise de crédito.",
    truthful_label: "Confirmo que todas as informações fornecidas são verdadeiras.",
    signature: "Assinatura digital",
    signature_hint: "Assine no campo abaixo usando o dedo (no celular) ou o mouse.",
    clear_signature: "Limpar",
    sign_required: "Por favor assine antes de enviar.",
    consent_required: "Você precisa marcar as duas confirmações pra enviar.",
    // Done
    done_title: "Aplicação enviada com sucesso!",
    done_subtitle: "Recebemos sua aplicação. Em breve um vendedor entrará em contato.",
    done_id: "Número da aplicação",
    done_close: "Fechar",
  },
  en: {
    lang: "en", langName: "English", flag: "🇺🇸",
    page_title: "Financing Application",
    powered: "Digital application · Intercar Manager",
    step: "Step", of: "of", complete: "Complete",
    next: "Next", back: "Back", submit: "Submit application", submitting: "Submitting...",
    required: "Required field",
    s1_title: "Let's start", s1_subtitle: "Tell us about the car you're interested in.",
    vehicle_interest: "Vehicle of interest", vehicle_interest_ph: "Ex: 2020 Acura RDX, or paste the VIN",
    down_payment: "How much can you put down?", down_payment_ph: "Ex: $5,000 or 5000",
    s2_title: "Who are you?", s2_subtitle: "Your personal information is protected.",
    full_name: "Full name", email: "Email", phone: "Phone",
    date_of_birth: "Date of birth", marital_status: "Marital status",
    marital_single: "Single", marital_married: "Married", marital_divorced: "Divorced", marital_widowed: "Widowed", marital_other: "Other",
    license_status: "Driver License",
    license_ma: "Massachusetts (USA)", license_other_state: "Other USA state", license_other_country: "Other country", license_none: "None",
    license_number: "Driver License number",
    document_type: "Main document",
    document_type_ssn: "Social Security (SSN)", document_type_itin: "ITIN", document_type_passport: "Passport",
    document_number: "Document number", document_photo: "Document photo (optional)",
    photo_front: "Front", photo_back: "Back",
    upload_btn: "Upload photo", uploading: "Uploading...", remove: "Remove",
    s3_title: "Where do you live?", s3_subtitle: "Complete current address.",
    address_line: "Address (street and number)", city: "City", state: "State", zipcode: "ZIP",
    time_at_address: "How long at this address?", time_at_address_ph: "Ex: 3 years 2 months",
    home_status: "Home status",
    home_owned: "Owned", home_rented: "Rented", home_family: "Family",
    rent_amount: "Rent amount", rent_amount_ph: "Ex: 1500",
    previous_address: "Previous address",
    previous_address_hint: "(only if at current address less than 2 years)",
    s4_title: "Work & income", s4_subtitle: "Important for credit analysis.",
    employment_type: "You are",
    employment_employed: "Employed", employment_self: "Self-employed", employment_owner: "Business owner", employment_other: "Other",
    company_name: "Company name", profession: "Profession",
    time_in_profession: "Time in profession",
    income_amount: "Income", income_period: "Period",
    income_weekly: "Weekly", income_biweekly: "Biweekly", income_monthly: "Monthly", income_yearly: "Yearly",
    company_reference_name: "Reference (manager/coworker)",
    company_reference_phone: "Reference phone",
    s5_title: "Confirmation", s5_subtitle: "Last step — almost there!",
    bank_statements: "Bank statements (optional, last 3 months)",
    consent_label: "I authorize Intercar Auto Sales to use this information for credit analysis.",
    truthful_label: "I confirm all information provided is truthful.",
    signature: "Digital signature",
    signature_hint: "Sign below using your finger (mobile) or mouse.",
    clear_signature: "Clear",
    sign_required: "Please sign before submitting.",
    consent_required: "You must check both confirmations to submit.",
    done_title: "Application submitted!",
    done_subtitle: "We received your application. A salesperson will contact you shortly.",
    done_id: "Application number", done_close: "Close",
  },
  es: {
    lang: "es", langName: "Español", flag: "🇪🇸",
    page_title: "Solicitud de Financiamiento",
    powered: "Solicitud digital · Intercar Manager",
    step: "Paso", of: "de", complete: "Completo",
    next: "Siguiente", back: "Volver", submit: "Enviar solicitud", submitting: "Enviando...",
    required: "Campo obligatorio",
    s1_title: "Empecemos", s1_subtitle: "Cuéntanos del auto que te interesa.",
    vehicle_interest: "Vehículo de interés", vehicle_interest_ph: "Ej: 2020 Acura RDX, o pega el VIN",
    down_payment: "¿Cuánto puedes dar de entrada?", down_payment_ph: "Ej: $5,000 o 5000",
    s2_title: "¿Quién eres?", s2_subtitle: "Tu información personal está protegida.",
    full_name: "Nombre completo", email: "Email", phone: "Teléfono",
    date_of_birth: "Fecha de nacimiento", marital_status: "Estado civil",
    marital_single: "Soltero(a)", marital_married: "Casado(a)", marital_divorced: "Divorciado(a)", marital_widowed: "Viudo(a)", marital_other: "Otro",
    license_status: "Licencia de conducir",
    license_ma: "Massachusetts (USA)", license_other_state: "Otro estado USA", license_other_country: "Otro país", license_none: "No tengo",
    license_number: "Número de licencia",
    document_type: "Documento principal",
    document_type_ssn: "Social Security (SSN)", document_type_itin: "ITIN", document_type_passport: "Pasaporte",
    document_number: "Número del documento", document_photo: "Foto del documento (opcional)",
    photo_front: "Frente", photo_back: "Reverso",
    upload_btn: "Subir foto", uploading: "Subiendo...", remove: "Quitar",
    s3_title: "¿Dónde vives?", s3_subtitle: "Dirección actual completa.",
    address_line: "Dirección (calle y número)", city: "Ciudad", state: "Estado", zipcode: "ZIP",
    time_at_address: "¿Hace cuánto vives aí?", time_at_address_ph: "Ej: 3 años y 2 meses",
    home_status: "Situación de vivienda",
    home_owned: "Propia", home_rented: "Rentada", home_family: "Familia",
    rent_amount: "Valor de la renta", rent_amount_ph: "Ej: 1500",
    previous_address: "Dirección anterior",
    previous_address_hint: "(solo si vives en la actual hace menos de 2 años)",
    s4_title: "Trabajo e ingresos", s4_subtitle: "Importante para análisis de crédito.",
    employment_type: "Eres",
    employment_employed: "Empleado", employment_self: "Autónomo", employment_owner: "Dueño del negocio", employment_other: "Otro",
    company_name: "Nombre de la empresa", profession: "Profesión",
    time_in_profession: "Tiempo en la profesión",
    income_amount: "Ingreso", income_period: "Período",
    income_weekly: "Semanal", income_biweekly: "Quincenal", income_monthly: "Mensual", income_yearly: "Anual",
    company_reference_name: "Referencia (gerente/colega)",
    company_reference_phone: "Teléfono de la referencia",
    s5_title: "Confirmación", s5_subtitle: "Último paso — ¡casi listo!",
    bank_statements: "Estados bancarios (opcional, últimos 3 meses)",
    consent_label: "Autorizo a Intercar Auto Sales a usar esta información para análisis de crédito.",
    truthful_label: "Confirmo que toda la información provista es veraz.",
    signature: "Firma digital",
    signature_hint: "Firma abajo con el dedo (móvil) o el mouse.",
    clear_signature: "Limpiar",
    sign_required: "Por favor firma antes de enviar.",
    consent_required: "Debes marcar las dos confirmaciones para enviar.",
    done_title: "¡Solicitud enviada!",
    done_subtitle: "Recibimos tu solicitud. Un vendedor te contactará en breve.",
    done_id: "Número de solicitud", done_close: "Cerrar",
  },
};

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
function maskPhone(v) {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6,10)}`;
}

// ──────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────
export default function CreditApplicationPublic() {
  const { dealershipId } = useParams();
  const [lang, setLang] = useState("pt");
  const t = T[lang];
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // { id }
  const [error, setError] = useState("");
  const [dealershipName, setDealershipName] = useState("");

  const [form, setForm] = useState({
    vehicle_interest: "", down_payment: "",
    full_name: "", email: "", phone: "", date_of_birth: "",
    marital_status: "", license_status: "", license_number: "",
    document_type: "", document_number: "",
    document_photo_front_url: "", document_photo_back_url: "",
    address_line: "", city: "", state: "", zipcode: "",
    time_at_address: "", home_status: "", rent_amount: "",
    previous_address: "",
    employment_type: "", company_name: "", profession: "",
    time_in_profession: "",
    income_amount: "", income_period: "monthly",
    company_reference_name: "", company_reference_phone: "",
    bank_statements_urls: [],
    consent: false, truthful: false,
    signature_data_url: "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load dealership name (best effort)
  useEffect(() => {
    if (!dealershipId) return;
    axios.get(`${BACKEND}/api/public/dealership-info/${dealershipId}`)
      .then(r => setDealershipName(r.data?.name || ""))
      .catch(() => {});
  }, [dealershipId]);

  // Auto-pick browser language on first mount
  useEffect(() => {
    const nav = (navigator.language || "pt").slice(0, 2).toLowerCase();
    if (T[nav]) setLang(nav);
  }, []);

  const submit = async () => {
    setError("");
    if (!form.consent || !form.truthful) {
      setError(t.consent_required);
      return;
    }
    if (!form.signature_data_url) {
      setError(t.sign_required);
      return;
    }
    setSubmitting(true);
    try {
      const r = await axios.post(
        `${BACKEND}/api/public/applications/submit/${dealershipId}`,
        { ...form, language: lang },
      );
      setDone({ id: r.data.id });
    } catch (e) {
      setError(e.response?.data?.detail || "Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return <DonePanel t={t} appId={done.id} />;
  }

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Header */}
      <div className="border-b border-border bg-surface/40 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-display font-black text-lg uppercase tracking-tight">{dealershipName || "INTERCAR"}</p>
            <p className="text-[10px] uppercase tracking-widest text-text-secondary mt-0.5">{t.page_title}</p>
          </div>
          <div className="flex gap-1.5">
            {Object.values(T).map(L => (
              <button
                key={L.lang}
                data-testid={`lang-${L.lang}`}
                onClick={() => setLang(L.lang)}
                className={`text-xs px-2.5 py-1.5 border transition-colors ${
                  lang === L.lang ? "bg-primary border-primary text-white" : "border-border hover:border-primary"
                }`}
                title={L.langName}
              >
                {L.flag} {L.lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div className="max-w-2xl mx-auto px-5 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-widest text-text-secondary">
              {t.step} {step} {t.of} {TOTAL_STEPS}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-primary font-display font-bold">
              {Math.round(progressPct)}% {t.complete}
            </p>
          </div>
          <div className="h-1 bg-border relative overflow-hidden">
            <div
              data-testid="progress-bar"
              className="absolute inset-y-0 left-0 bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="max-w-2xl mx-auto px-5 py-8">
        {step === 1 && <Step1 form={form} set={set} t={t} />}
        {step === 2 && <Step2 form={form} set={set} t={t} dealershipId={dealershipId} />}
        {step === 3 && <Step3 form={form} set={set} t={t} />}
        {step === 4 && <Step4 form={form} set={set} t={t} />}
        {step === 5 && <Step5 form={form} set={set} t={t} dealershipId={dealershipId} />}

        {/* Error */}
        {error && (
          <div className="mt-5 border border-warning bg-warning/10 text-warning px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Nav */}
        <div className="flex justify-between gap-3 mt-8">
          {step > 1 ? (
            <button
              data-testid="btn-back"
              onClick={() => setStep(s => s - 1)}
              className="border border-border hover:border-primary hover:text-primary px-5 h-12 inline-flex items-center gap-2 font-display font-bold uppercase text-xs tracking-widest transition-colors"
            >
              <ChevronLeft size={16} /> {t.back}
            </button>
          ) : <div />}

          {step < TOTAL_STEPS ? (
            <button
              data-testid="btn-next"
              onClick={() => setStep(s => s + 1)}
              className="bg-primary hover:bg-primary-hover text-white px-6 h-12 inline-flex items-center gap-2 font-display font-bold uppercase text-xs tracking-widest"
            >
              {t.next} <ChevronRight size={16} />
            </button>
          ) : (
            <button
              data-testid="btn-submit"
              onClick={submit}
              disabled={submitting}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-6 h-12 inline-flex items-center gap-2 font-display font-bold uppercase text-xs tracking-widest"
            >
              {submitting ? <><Loader2 size={16} className="animate-spin" /> {t.submitting}</> : <>{t.submit} <Check size={16} /></>}
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-text-secondary mt-12 uppercase tracking-widest">{t.powered}</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Reusable atoms
// ──────────────────────────────────────────────────────────────────────
function Field({ label, children, required }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-widest text-text-secondary block mb-1.5">
        {label} {required && <span className="text-primary">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", testid, autoFocus = false }) {
  return (
    <input
      data-testid={testid}
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-4 h-12 text-base"
    />
  );
}

function Select({ value, onChange, options, testid }) {
  return (
    <select
      data-testid={testid}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-3 h-12 text-base"
    >
      <option value="">—</option>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

function Header({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="font-display font-black text-3xl uppercase tracking-tight">{title}</h1>
      <p className="text-text-secondary text-sm mt-1">{subtitle}</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Steps
// ──────────────────────────────────────────────────────────────────────
function Step1({ form, set, t }) {
  return (
    <div className="space-y-5">
      <Header title={t.s1_title} subtitle={t.s1_subtitle} />
      <Field label={t.vehicle_interest} required>
        <Input value={form.vehicle_interest} onChange={(v) => set("vehicle_interest", v)} placeholder={t.vehicle_interest_ph} testid="f-vehicle" autoFocus />
      </Field>
      <Field label={t.down_payment} required>
        <Input value={form.down_payment} onChange={(v) => set("down_payment", v)} placeholder={t.down_payment_ph} testid="f-down" />
      </Field>
    </div>
  );
}

function Step2({ form, set, t, dealershipId }) {
  return (
    <div className="space-y-5">
      <Header title={t.s2_title} subtitle={t.s2_subtitle} />
      <Field label={t.full_name} required>
        <Input value={form.full_name} onChange={(v) => set("full_name", v)} testid="f-name" autoFocus />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.email} required>
          <Input value={form.email} type="email" onChange={(v) => set("email", v)} testid="f-email" />
        </Field>
        <Field label={t.phone} required>
          <Input value={form.phone} onChange={(v) => set("phone", maskPhone(v))} placeholder="(555) 123-4567" testid="f-phone" />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.date_of_birth}>
          <Input value={form.date_of_birth} type="date" onChange={(v) => set("date_of_birth", v)} testid="f-dob" />
        </Field>
        <Field label={t.marital_status}>
          <Select value={form.marital_status} onChange={(v) => set("marital_status", v)} testid="f-marital" options={[
            ["single", t.marital_single], ["married", t.marital_married], ["divorced", t.marital_divorced], ["widowed", t.marital_widowed], ["other", t.marital_other],
          ]} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.license_status}>
          <Select value={form.license_status} onChange={(v) => set("license_status", v)} testid="f-lic-status" options={[
            ["ma_usa", t.license_ma], ["other_state_usa", t.license_other_state], ["other_country", t.license_other_country], ["none", t.license_none],
          ]} />
        </Field>
        {form.license_status && form.license_status !== "none" && (
          <Field label={t.license_number}>
            <Input value={form.license_number} onChange={(v) => set("license_number", v)} testid="f-lic-num" />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.document_type} required>
          <Select value={form.document_type} onChange={(v) => set("document_type", v)} testid="f-doctype" options={[
            ["ssn", t.document_type_ssn], ["itin", t.document_type_itin], ["passport", t.document_type_passport],
          ]} />
        </Field>
        <Field label={t.document_number} required>
          <Input value={form.document_number} onChange={(v) => set("document_number", v)} testid="f-docnum" />
        </Field>
      </div>

      {/* Optional document photos */}
      <div>
        <label className="text-[11px] uppercase tracking-widest text-text-secondary block mb-1.5">
          {t.document_photo}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <PhotoUpload
            label={t.photo_front}
            value={form.document_photo_front_url}
            onChange={(url) => set("document_photo_front_url", url)}
            t={t}
            dealershipId={dealershipId}
            testid="f-doc-front"
          />
          <PhotoUpload
            label={t.photo_back}
            value={form.document_photo_back_url}
            onChange={(url) => set("document_photo_back_url", url)}
            t={t}
            dealershipId={dealershipId}
            testid="f-doc-back"
          />
        </div>
      </div>
    </div>
  );
}

function Step3({ form, set, t }) {
  return (
    <div className="space-y-5">
      <Header title={t.s3_title} subtitle={t.s3_subtitle} />
      <Field label={t.address_line} required>
        <Input value={form.address_line} onChange={(v) => set("address_line", v)} testid="f-addr" autoFocus />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t.city}><Input value={form.city} onChange={(v) => set("city", v)} testid="f-city" /></Field>
        <Field label={t.state}><Input value={form.state} onChange={(v) => set("state", v)} testid="f-state" /></Field>
        <Field label={t.zipcode}><Input value={form.zipcode} onChange={(v) => set("zipcode", v)} testid="f-zip" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.time_at_address} required>
          <Input value={form.time_at_address} onChange={(v) => set("time_at_address", v)} placeholder={t.time_at_address_ph} testid="f-time-addr" />
        </Field>
        <Field label={t.home_status} required>
          <Select value={form.home_status} onChange={(v) => set("home_status", v)} testid="f-home" options={[
            ["owned", t.home_owned], ["rented", t.home_rented], ["family", t.home_family],
          ]} />
        </Field>
      </div>
      {form.home_status === "rented" && (
        <Field label={t.rent_amount}>
          <Input value={form.rent_amount} onChange={(v) => set("rent_amount", v)} placeholder={t.rent_amount_ph} testid="f-rent" />
        </Field>
      )}
      <Field label={t.previous_address}>
        <Input value={form.previous_address} onChange={(v) => set("previous_address", v)} testid="f-prev-addr" />
        <p className="text-[10px] text-text-secondary mt-1">{t.previous_address_hint}</p>
      </Field>
    </div>
  );
}

function Step4({ form, set, t }) {
  return (
    <div className="space-y-5">
      <Header title={t.s4_title} subtitle={t.s4_subtitle} />
      <Field label={t.employment_type} required>
        <Select value={form.employment_type} onChange={(v) => set("employment_type", v)} testid="f-emp" options={[
          ["employed", t.employment_employed], ["self_employed", t.employment_self], ["owner", t.employment_owner], ["other", t.employment_other],
        ]} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.company_name}><Input value={form.company_name} onChange={(v) => set("company_name", v)} testid="f-company" /></Field>
        <Field label={t.profession} required><Input value={form.profession} onChange={(v) => set("profession", v)} testid="f-profession" /></Field>
      </div>
      <Field label={t.time_in_profession} required>
        <Input value={form.time_in_profession} onChange={(v) => set("time_in_profession", v)} testid="f-time-prof" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.income_amount} required>
          <Input value={form.income_amount} onChange={(v) => set("income_amount", v)} testid="f-income" />
        </Field>
        <Field label={t.income_period} required>
          <Select value={form.income_period} onChange={(v) => set("income_period", v)} testid="f-income-period" options={[
            ["weekly", t.income_weekly], ["biweekly", t.income_biweekly], ["monthly", t.income_monthly], ["yearly", t.income_yearly],
          ]} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.company_reference_name}>
          <Input value={form.company_reference_name} onChange={(v) => set("company_reference_name", v)} testid="f-ref-name" />
        </Field>
        <Field label={t.company_reference_phone}>
          <Input value={form.company_reference_phone} onChange={(v) => set("company_reference_phone", maskPhone(v))} placeholder="(555) 123-4567" testid="f-ref-phone" />
        </Field>
      </div>
    </div>
  );
}

function Step5({ form, set, t, dealershipId }) {
  const sigRef = useRef(null);

  return (
    <div className="space-y-5">
      <Header title={t.s5_title} subtitle={t.s5_subtitle} />

      {/* Bank statements (multi upload) */}
      <Field label={t.bank_statements}>
        <MultiPhotoUpload
          urls={form.bank_statements_urls}
          onChange={(urls) => set("bank_statements_urls", urls)}
          t={t}
          dealershipId={dealershipId}
          testid="f-bank"
        />
      </Field>

      {/* Consent */}
      <div className="space-y-3 border border-border bg-surface p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            data-testid="f-consent"
            type="checkbox"
            checked={form.consent}
            onChange={(e) => set("consent", e.target.checked)}
            className="mt-1 w-5 h-5 accent-primary"
          />
          <span className="text-sm">{t.consent_label}</span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            data-testid="f-truthful"
            type="checkbox"
            checked={form.truthful}
            onChange={(e) => set("truthful", e.target.checked)}
            className="mt-1 w-5 h-5 accent-primary"
          />
          <span className="text-sm">{t.truthful_label}</span>
        </label>
      </div>

      {/* Signature */}
      <div>
        <label className="text-[11px] uppercase tracking-widest text-text-secondary block mb-1.5">
          {t.signature} <span className="text-primary">*</span>
        </label>
        <p className="text-[11px] text-text-secondary mb-2">{t.signature_hint}</p>
        <SignaturePad ref={sigRef} value={form.signature_data_url} onChange={(url) => set("signature_data_url", url)} t={t} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Done page
// ──────────────────────────────────────────────────────────────────────
function DonePanel({ t, appId }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-success/15 border border-success/40 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check size={40} className="text-success" />
        </div>
        <h1 className="font-display font-black text-3xl uppercase tracking-tight mb-3">{t.done_title}</h1>
        <p className="text-text-secondary mb-6">{t.done_subtitle}</p>
        <div className="border border-border bg-surface px-4 py-3 text-xs">
          <p className="text-[10px] uppercase tracking-widest text-text-secondary">{t.done_id}</p>
          <p className="font-mono text-sm mt-1">{appId}</p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Photo upload helpers
// ──────────────────────────────────────────────────────────────────────
async function uploadToCloudinary(file, dealershipId) {
  const sig = (await axios.get(`${BACKEND}/api/public/applications/upload-signature/${dealershipId}`)).data;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.api_key);
  fd.append("timestamp", sig.timestamp);
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`, {
    method: "POST", body: fd,
  });
  const json = await res.json();
  if (!json.secure_url) throw new Error(json.error?.message || "upload failed");
  return json.secure_url;
}

function PhotoUpload({ label, value, onChange, t, dealershipId, testid }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef(null);

  const handle = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErr("Max 10MB"); return; }
    setBusy(true); setErr("");
    try {
      const url = await uploadToCloudinary(file, dealershipId);
      onChange(url);
    } catch (e) {
      setErr(e.message || "erro");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  if (value) {
    return (
      <div className="relative border border-success/40 bg-success/5 p-2">
        <p className="text-[10px] uppercase tracking-widest text-success mb-1">{label}</p>
        <img src={value} alt="" className="w-full h-24 object-cover" />
        <button
          type="button"
          data-testid={`${testid}-remove`}
          onClick={() => onChange("")}
          className="absolute top-1 right-1 bg-background/80 border border-border p-1"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <button
        type="button"
        data-testid={testid}
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="w-full border border-dashed border-border hover:border-primary hover:text-primary p-4 flex flex-col items-center gap-1.5 text-xs disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        <span className="font-display font-bold uppercase tracking-widest">{busy ? t.uploading : label}</span>
      </button>
      {err && <p className="text-warning text-[10px] mt-1">{err}</p>}
    </div>
  );
}

function MultiPhotoUpload({ urls, onChange, t, dealershipId, testid }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  const handle = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const newOnes = [];
      for (const f of files) {
        if (f.size > 10 * 1024 * 1024) continue;
        const url = await uploadToCloudinary(f, dealershipId);
        newOnes.push(url);
      }
      onChange([...(urls || []), ...newOnes]);
    } catch {/* silent */}
    finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div>
      <input ref={ref} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => handle(e.target.files)} />
      <button
        type="button"
        data-testid={testid}
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="w-full border border-dashed border-border hover:border-primary hover:text-primary p-4 flex items-center justify-center gap-2 text-xs disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        <span className="font-display font-bold uppercase tracking-widest">{busy ? t.uploading : t.upload_btn}</span>
      </button>
      {urls?.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {urls.map((u, i) => (
            <div key={i} className="relative border border-border p-1">
              <img src={u} alt="" className="w-full h-16 object-cover" />
              <button
                type="button"
                onClick={() => onChange(urls.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 bg-background/80 border border-border p-0.5"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Signature pad (canvas)
// ──────────────────────────────────────────────────────────────────────
function SignaturePad({ value, onChange, t }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  // Resize canvas to its CSS size
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const getPoint = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    if (e.touches?.[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = getPoint(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    onChange(c.toDataURL("image/png"));
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    onChange("");
  };

  return (
    <div className="border border-border bg-white">
      <canvas
        ref={canvasRef}
        data-testid="signature-canvas"
        className="w-full h-40 touch-none cursor-crosshair"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div className="border-t border-border flex justify-between items-center px-3 py-1.5">
        <span className={`text-[10px] uppercase tracking-widest ${value ? "text-success" : "text-text-secondary"}`}>
          {value ? "✓ Signed" : "—"}
        </span>
        <button
          type="button"
          data-testid="signature-clear"
          onClick={clear}
          className="text-[10px] text-text-secondary hover:text-primary inline-flex items-center gap-1.5 uppercase tracking-widest"
        >
          <Eraser size={11} /> {t.clear_signature}
        </button>
      </div>
    </div>
  );
}
