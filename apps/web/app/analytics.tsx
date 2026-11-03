"use client";
import Script from "next/script";
import { consentBootstrapScript } from "../lib/analytics-script";
import { normalizeAdsenseClient, normalizeGaId } from "../lib/site";

/**
 * Integrações Google, todas opcionais. Sem NEXT_PUBLIC_GA_ID nem NEXT_PUBLIC_ADSENSE_CLIENT
 * nada é carregado. Consent Mode v2 começa tudo `denied` até o usuário aceitar no banner.
 */
export function Analytics() {
  const gaId = normalizeGaId(process.env.NEXT_PUBLIC_GA_ID);
  const adsClient = normalizeAdsenseClient(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);
  if (!gaId && !adsClient) return null;
  return (
    <>
      <Script id="consent-bootstrap" strategy="afterInteractive">{consentBootstrapScript(gaId)}</Script>
      {gaId && (
        <Script id="gtag-js" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
      )}
      {adsClient && (
        <Script
          id="adsense-js"
          async
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsClient)}`}
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
