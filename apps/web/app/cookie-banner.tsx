"use client";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, consentState, readConsent, saveConsent, type ConsentChoice } from "../lib/consent";

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(readConsent() === null);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_EVENT, reopen);
  }, []);

  function choose(choice: ConsentChoice) {
    saveConsent(choice);
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof gtag === "function") gtag("consent", "update", consentState(choice));
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="cookie-banner" role="dialog" aria-label="Preferências de cookies">
      <p>
        Usamos cookies do Google (estatísticas e anúncios) apenas se você aceitar. Sua escolha fica salva neste
        navegador. Saiba mais na <a href="/privacidade">Política de Privacidade</a>.
      </p>
      <div className="cookie-actions">
        <button type="button" className="ghost" onClick={() => choose("denied")}>Recusar</button>
        <button type="button" onClick={() => choose("granted")}>Aceitar</button>
      </div>
    </div>
  );
}

export function CookieSettingsButton() {
  return (
    <button type="button" className="linklike" onClick={() => window.dispatchEvent(new Event(CONSENT_EVENT))}>
      Preferências de cookies
    </button>
  );
}
