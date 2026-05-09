import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * InstallPrompt — discrete banner that asks users to install the PWA.
 *
 * Behavior:
 * - Android/Desktop Chrome fires `beforeinstallprompt`. We capture it and show our
 *   own button so we can style it to match the app + control timing.
 * - iOS Safari does NOT fire that event. We sniff iOS + standalone state and show
 *   a custom hint with the "Add to Home Screen" instructions.
 * - Once the user dismisses or installs, we remember it in localStorage so they
 *   don't get pestered again.
 */
const DISMISS_KEY = "intercar_install_dismissed";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    // Hide if already running as installed PWA
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    setIsIOS(ios);

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (ios) {
      // Show iOS-specific banner after a short delay (so it doesn't interrupt login flow)
      const t = setTimeout(() => setShow(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" }));
    if (choice?.outcome === "accepted") {
      localStorage.setItem(DISMISS_KEY, "1");
    }
    setDeferred(null);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      data-testid="install-prompt"
      className="fixed bottom-5 left-5 right-5 sm:left-auto sm:right-5 sm:w-[360px] z-[60] bg-background border border-primary shadow-2xl shadow-primary/30 p-4 flex items-start gap-3"
    >
      <div className="w-10 h-10 bg-primary text-white flex items-center justify-center shrink-0">
        <Download size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-sm uppercase tracking-tight mb-1">
          Instalar Intercar Manager
        </p>
        {isIOS ? (
          <p className="text-xs text-text-secondary leading-relaxed">
            Toque em <span className="font-bold">Compartilhar</span> no Safari e depois em <span className="font-bold">Adicionar à Tela de Início</span> para instalar como aplicativo.
          </p>
        ) : (
          <p className="text-xs text-text-secondary leading-relaxed">
            Acesso instantâneo direto da tela inicial, em tela cheia, sem barra do navegador.
          </p>
        )}
        <div className="flex gap-2 mt-3">
          {!isIOS && deferred && (
            <button
              data-testid="install-now-btn"
              onClick={install}
              className="bg-primary hover:bg-primary-hover text-white px-4 h-9 font-display font-bold uppercase text-[11px] tracking-widest"
            >
              Instalar agora
            </button>
          )}
          <button
            data-testid="install-dismiss-btn"
            onClick={dismiss}
            className="border border-border hover:border-primary hover:text-primary px-4 h-9 font-display font-bold uppercase text-[11px] tracking-widest"
          >
            Mais tarde
          </button>
        </div>
      </div>
      <button
        data-testid="install-close-btn"
        onClick={dismiss}
        className="text-text-secondary hover:text-primary shrink-0"
        aria-label="Fechar"
      >
        <X size={16} />
      </button>
    </div>
  );
}
