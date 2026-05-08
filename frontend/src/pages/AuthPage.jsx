import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useI18n, LANG_OPTIONS } from "@/lib/i18n.jsx";

export default function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ full_name: "", dealership_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup(form);
      toast.success(t("saved"));
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail === "Invalid credentials" ? t("invalid_credentials") :
                  detail === "Email already in use" ? t("email_in_use") :
                  detail || t("error_generic"));
    } finally { setLoading(false); }
  };

  return (
    <div data-testid="auth-page" className="min-h-screen text-white flex flex-col items-center justify-center px-4 relative overflow-hidden bg-auth-hero">
      {/* Decorative grid + grain overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-30" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />
      <div className="absolute inset-0 pointer-events-none grain" />

      {/* Lang switcher */}
      <div className="absolute top-6 right-6 flex gap-2 z-10" data-testid="lang-switcher">
        {LANG_OPTIONS.map((l) => (
          <button
            key={l.code}
            data-testid={`lang-${l.code}`}
            onClick={() => setLang(l.code)}
            className={`px-3 h-9 text-xs font-display font-bold uppercase tracking-wider border transition-colors backdrop-blur ${
              lang === l.code ? "border-primary text-primary bg-primary/10" : "border-border text-text-secondary hover:border-white hover:text-white"
            }`}
          >
            {l.flag} {l.label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Hero logo with red glow */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-primary/40 blur-3xl rounded-full" />
            <img
              src="/intercar-logo.png"
              alt="Intercar Auto Sales"
              className="relative w-44 h-44 object-contain drop-shadow-2xl"
            />
          </div>
          <p className="text-xs text-text-secondary uppercase tracking-[0.3em]">{t("tagline")}</p>
        </div>

        {/* Glass form card */}
        <div className="border border-border bg-surface/60 backdrop-blur-xl p-8 shadow-2xl">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight text-center mb-6">
            {mode === "login" ? t("welcome_back") : t("create_account_title")}
          </h2>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <Field label={t("full_name")} testid="auth-name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
                <Field label={t("dealership_name")} testid="auth-dealership" value={form.dealership_name} onChange={(v) => setForm({ ...form, dealership_name: v })} required />
              </>
            )}
            <Field label={t("email")} type="email" testid="auth-email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <Field label={t("password")} type="password" testid="auth-password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />

            <button
              type="submit"
              data-testid="auth-submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors py-3 mt-2 font-display font-bold uppercase text-sm tracking-widest shadow-lg shadow-primary/30"
            >
              {loading ? "..." : mode === "login" ? t("sign_in") : t("create_account")}
            </button>
          </form>

          <button
            data-testid="auth-toggle"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-6 w-full text-center text-sm text-text-secondary hover:text-primary transition-colors"
          >
            {mode === "login" ? t("no_account") : t("have_account")}
          </button>
        </div>
      </div>

      {/* Bottom credit */}
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-text-secondary uppercase tracking-[0.4em] z-10">
        Intercar Auto Sales · Management Suite
      </p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, testid }) {
  return (
    <div>
      <label className="label-eyebrow block mb-2">{label}</label>
      <input
        data-testid={testid}
        type={type} required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background/60 border border-border focus:border-primary focus:outline-none px-4 h-11 text-sm transition-colors"
      />
    </div>
  );
}
