import { useState } from "react";
import { Car } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useI18n, LANG_OPTIONS } from "@/lib/i18n.jsx";

export default function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login"); // login | signup
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
    <div data-testid="auth-page" className="min-h-screen bg-background text-white flex flex-col items-center justify-center px-4 relative">
      {/* Lang switcher */}
      <div className="absolute top-6 right-6 flex gap-2" data-testid="lang-switcher">
        {LANG_OPTIONS.map((l) => (
          <button
            key={l.code}
            data-testid={`lang-${l.code}`}
            onClick={() => setLang(l.code)}
            className={`px-3 h-9 text-xs font-display font-bold uppercase tracking-wider border transition-colors ${
              lang === l.code ? "border-primary text-primary" : "border-border text-text-secondary hover:border-white hover:text-white"
            }`}
          >
            {l.flag} {l.label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-primary flex items-center justify-center mb-5">
            <Car size={28} className="text-white" />
          </div>
          <h1 className="font-display font-black text-3xl uppercase tracking-tighter">{t("app_name")}</h1>
          <p className="text-sm text-text-secondary mt-1">{t("tagline")}</p>
        </div>

        <div className="border border-border p-8">
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
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors py-3 mt-2 font-display font-bold uppercase text-sm tracking-widest"
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
        className="w-full bg-surface border border-border focus:border-primary focus:outline-none px-4 h-11 text-sm"
      />
    </div>
  );
}
