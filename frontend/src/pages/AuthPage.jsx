import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useI18n, LANG_OPTIONS } from "@/lib/i18n.jsx";

// Detect tenant from hostname so the login screen feels personal to each dealership.
function detectBrand() {
  if (typeof window === "undefined") return BRANDS.intercar;
  const host = window.location.hostname.toLowerCase();
  if (host.includes("xpro")) return BRANDS.xpro;
  return BRANDS.intercar;
}

const BRANDS = {
  intercar: {
    key: "intercar",
    logoSrc: "/intercar-logo.png",
    wordmark: "INTERCAR",
    sub: "AUTO SALES",
    accent: "#D92D20",
    accentGlow: "rgba(217, 45, 32, 0.55)",
  },
  xpro: {
    key: "xpro",
    logoSrc: null, // text wordmark
    wordmark: "X-PRO",
    sub: "MOTORS",
    accent: "#E11D2B",
    accentGlow: "rgba(225, 29, 43, 0.55)",
  },
};

export default function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ full_name: "", dealership_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [brand] = useState(detectBrand);

  // Smooth fade-in on mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
    <div
      data-testid="auth-page"
      className="min-h-screen w-full flex text-white overflow-hidden relative bg-[#070707]"
      style={{ "--brand": brand.accent, "--brand-glow": brand.accentGlow }}
    >
      {/* ============ AMBIENT BACKGROUND ============ */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        {/* Radial brand glow */}
        <div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full opacity-60 blur-[140px]"
          style={{ background: `radial-gradient(circle, ${brand.accentGlow} 0%, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-60 -right-40 w-[800px] h-[800px] rounded-full opacity-40 blur-[160px]"
          style={{ background: `radial-gradient(circle, ${brand.accentGlow} 0%, transparent 70%)` }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        {/* Diagonal speed lines */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.5) 0, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 28px)",
          }}
        />
        {/* Top racing stripe */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, var(--brand) 0%, var(--brand) 38%, #000 38%, #000 62%, var(--brand) 62%, var(--brand) 100%)",
          }}
        />
        {/* Grain */}
        <div className="absolute inset-0 grain" />
      </div>

      {/* ============ TOP BAR (lang switcher) ============ */}
      <div className="absolute top-6 right-6 flex gap-2 z-30" data-testid="lang-switcher">
        {LANG_OPTIONS.map((l) => (
          <button
            key={l.code}
            data-testid={`lang-${l.code}`}
            onClick={() => setLang(l.code)}
            className={`px-3 h-9 text-[11px] font-display font-bold uppercase tracking-[0.2em] border transition-all duration-200 ${
              lang === l.code
                ? "border-white/80 text-white bg-white/5"
                : "border-white/15 text-white/50 hover:border-white/40 hover:text-white"
            }`}
          >
            {l.flag} {l.label}
          </button>
        ))}
      </div>

      {/* ============ LEFT — HERO PANEL ============ */}
      <div
        className={`hidden lg:flex relative w-[58%] flex-col justify-between p-14 xl:p-20 z-10 transition-all duration-1000 ${
          mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
        }`}
      >
        {/* Brand row */}
        <div className="flex items-center gap-4">
          {brand.logoSrc ? (
            <div className="relative">
              <div
                className="absolute inset-0 blur-2xl"
                style={{ background: brand.accentGlow }}
              />
              <img
                src={brand.logoSrc}
                alt={brand.wordmark}
                className="relative w-14 h-14 object-contain"
              />
            </div>
          ) : (
            <div
              className="w-12 h-12 grid place-items-center font-display font-black text-xl"
              style={{ background: "var(--brand)", color: "#fff", letterSpacing: "-0.02em" }}
            >
              X
            </div>
          )}
          <div className="font-display font-bold tracking-[0.35em] text-[11px] text-white/70">
            {brand.wordmark} · {brand.sub}
          </div>
        </div>

        {/* Headline block */}
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="inline-block w-9 h-[2px]" style={{ background: "var(--brand)" }} />
            <span className="font-display font-bold uppercase tracking-[0.4em] text-[10px] text-white/55">
              {t("tagline")}
            </span>
          </div>

          <h1 className="font-display font-black uppercase leading-[0.92] tracking-tight">
            <span className="block text-white text-5xl xl:text-7xl">{t("auth_hero_line1") || "Drive"}</span>
            <span
              className="block text-5xl xl:text-7xl"
              style={{
                background: `linear-gradient(180deg, #fff 0%, ${brand.accent} 110%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {t("auth_hero_line2") || "your dealership"}
            </span>
            <span className="block text-white/30 text-5xl xl:text-7xl">{t("auth_hero_line3") || "forward."}</span>
          </h1>

          <p className="mt-8 text-white/55 text-base xl:text-lg max-w-md leading-relaxed">
            {t("auth_hero_blurb") ||
              "Estoque, vendas, leads, financeiro e equipe — tudo num só lugar, em tempo real."}
          </p>

          {/* Feature pills */}
          <div className="mt-10 grid grid-cols-3 gap-3 max-w-lg">
            <FeaturePill label={t("inventory") || "Estoque"} value="∞" />
            <FeaturePill label={t("leads_title") || "Leads"} value="CRM" />
            <FeaturePill label={t("financials") || "Financeiro"} value="ROI" />
          </div>
        </div>

        {/* Footer credit */}
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-white/35">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: "var(--brand)" }}
              />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--brand)" }} />
            </span>
            {t("auth_live_status") || "Live · System online"}
          </div>
          <span>© {new Date().getFullYear()} {brand.wordmark} {brand.sub}</span>
        </div>
      </div>

      {/* ============ RIGHT — FORM PANEL ============ */}
      <div
        className={`relative flex-1 flex items-center justify-center px-6 py-14 z-10 transition-all duration-1000 delay-150 ${
          mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6"
        }`}
      >
        {/* Panel background — vertical sheet */}
        <div className="absolute inset-y-0 right-0 w-full lg:w-[110%] -z-10 bg-gradient-to-b from-[#0C0C0C] via-[#0A0A0A] to-[#070707] border-l border-white/5 hidden lg:block" />

        <div className="w-full max-w-md">
          {/* MOBILE-ONLY brand */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            {brand.logoSrc ? (
              <img src={brand.logoSrc} alt={brand.wordmark} className="w-24 h-24 object-contain" />
            ) : (
              <div
                className="w-20 h-20 grid place-items-center font-display font-black text-3xl"
                style={{ background: "var(--brand)", color: "#fff" }}
              >
                X
              </div>
            )}
            <div className="mt-3 font-display font-bold tracking-[0.3em] text-[11px] text-white/60">
              {brand.wordmark} · {brand.sub}
            </div>
          </div>

          {/* Heading */}
          <div className="mb-10">
            <span className="font-display font-bold uppercase tracking-[0.3em] text-[10px] text-white/40">
              {mode === "login" ? (t("auth_eyebrow_login") || "Acesso restrito") : (t("auth_eyebrow_signup") || "Nova conta")}
            </span>
            <h2 className="mt-3 font-display font-black uppercase text-3xl lg:text-4xl tracking-tight">
              {mode === "login" ? t("welcome_back") : t("create_account_title")}
            </h2>
            <div className="mt-4 w-12 h-[2px]" style={{ background: "var(--brand)" }} />
          </div>

          {/* FORM */}
          <form onSubmit={submit} className="space-y-5">
            {mode === "signup" && (
              <>
                <Field
                  label={t("full_name")}
                  testid="auth-name"
                  value={form.full_name}
                  onChange={(v) => setForm({ ...form, full_name: v })}
                  required
                />
                <Field
                  label={t("dealership_name")}
                  testid="auth-dealership"
                  value={form.dealership_name}
                  onChange={(v) => setForm({ ...form, dealership_name: v })}
                  required
                />
              </>
            )}
            <Field
              label={t("email")}
              type="email"
              testid="auth-email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              required
              autoComplete="email"
            />
            <Field
              label={t("password")}
              type={showPwd ? "text" : "password"}
              testid="auth-password"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              suffix={
                <button
                  type="button"
                  data-testid="auth-toggle-password"
                  onClick={() => setShowPwd((s) => !s)}
                  className="text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? (t("hide") || "Ocultar") : (t("show") || "Ver")}
                </button>
              }
            />

            <button
              type="submit"
              data-testid="auth-submit"
              disabled={loading}
              className="group relative w-full mt-2 h-12 overflow-hidden font-display font-bold uppercase text-[12px] tracking-[0.32em] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300"
              style={{
                background: "var(--brand)",
                boxShadow: "0 12px 28px -10px var(--brand-glow)",
              }}
            >
              <span className="relative z-10 inline-flex items-center justify-center gap-3">
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? t("sign_in") : t("create_account")}
                    <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </>
                )}
              </span>
              {/* shine sweep */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:translate-x-full transition-transform duration-700" />
            </button>
          </form>

          {/* Mode toggle */}
          <div className="mt-8 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/30">
              {t("or") || "ou"}
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <button
            data-testid="auth-toggle"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-6 w-full h-11 border border-white/15 hover:border-white/40 hover:bg-white/5 text-[11px] uppercase tracking-[0.3em] font-display font-bold text-white/75 transition-all"
          >
            {mode === "login" ? t("no_account") : t("have_account")}
          </button>

          <p className="mt-10 text-[10px] uppercase tracking-[0.35em] text-white/25 text-center">
            {brand.wordmark} {brand.sub} · {t("management_suite") || "Management Suite"}
          </p>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({ label, value }) {
  return (
    <div className="border border-white/10 bg-white/[0.02] backdrop-blur-sm px-4 py-3 hover:border-white/25 hover:bg-white/[0.04] transition-all">
      <div className="font-display font-black text-2xl" style={{ color: "var(--brand)" }}>
        {value}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.25em] text-white/50">{label}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, testid, autoComplete, suffix }) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="block group">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-bold uppercase tracking-[0.25em] text-[10px] text-white/45 group-focus-within:text-white transition-colors">
          {label}
        </span>
        {suffix}
      </div>
      <div className="relative">
        <input
          data-testid={testid}
          type={type}
          required={required}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full bg-transparent border-0 border-b border-white/15 focus:border-white/0 focus:outline-none px-1 h-11 text-base text-white placeholder-white/30 transition-colors"
        />
        {/* Animated underline */}
        <span
          className="absolute left-0 bottom-0 h-[2px] transition-all duration-300"
          style={{
            width: focused ? "100%" : "0%",
            background: "var(--brand)",
            boxShadow: focused ? "0 0 10px var(--brand-glow)" : "none",
          }}
        />
      </div>
    </label>
  );
}
