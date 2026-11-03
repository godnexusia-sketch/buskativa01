"use client";
import { useEffect, useRef } from "react";
import { normalizeAdsenseClient } from "../lib/site";

/** Bloco de anúncio AdSense. Não renderiza nada sem client e slot válidos. */
export function AdSlot({ slot }: { slot: string | undefined }) {
  const client = normalizeAdsenseClient(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);
  const slotId = /^\d+$/.test((slot ?? "").trim()) ? (slot ?? "").trim() : null;

  const ref = useRef<HTMLModElement>(null);

  useEffect(() => {
    const ins = ref.current;
    if (!client || !slotId || !ins || ins.dataset.pushed === "1") return;
    ins.dataset.pushed = "1"; // um push por <ins> (StrictMode/remontagem)
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      // bloqueador de anúncios ou script ainda não carregado: ignora
    }
  }, [client, slotId]);

  if (!client || !slotId) return null;
  return (
    <aside className="ad-slot" aria-label="Publicidade">
      <ins ref={ref} className="adsbygoogle" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slotId} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
