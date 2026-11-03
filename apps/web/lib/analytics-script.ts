import { CONSENT_DEFAULTS, CONSENT_STORAGE_KEY, consentState } from "./consent";

/**
 * Script inline do Google Consent Mode v2. Define gtag com tudo `denied` ANTES de qualquer tag
 * do Google carregar e restaura uma escolha "granted" salva antes do config do GA4.
 * `gaId` deve vir de normalizeGaId (formato seguro); sem ele só os defaults são definidos.
 */
export function consentBootstrapScript(gaId: string | null): string {
  const lines = [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}",
    "window.gtag=gtag;",
    `gtag('consent','default',${JSON.stringify(CONSENT_DEFAULTS)});`,
    `try{if(window.localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)})==='granted'){gtag('consent','update',${JSON.stringify(consentState("granted"))});}}catch(e){}`,
  ];
  if (gaId) lines.push("gtag('js',new Date());", `gtag('config',${JSON.stringify(gaId)});`);
  return lines.join("");
}
