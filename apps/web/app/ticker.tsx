"use client";
import { useState } from "react";
import { formatBRL } from "../lib/format";

export interface TickerItem {
  productId: number;
  title: string;
  imageUrl: string | null;
  priceCents: number;
  pct: number;
}

/**
 * Strip of real price drops that scrolls on its own. It pauses on hover/focus and with the button (WCAG 2.2.2),
 * and stands still for people who turned off motion.
 */
export function Ticker({ items }: { items: TickerItem[] }) {
  const [paused, setPaused] = useState(false);
  if (items.length < 3) return null;
  const row = (hidden: boolean) =>
    items.map((t) => (
      <a key={`${hidden ? "b" : "a"}-${t.productId}`} className="tick" href={`/produto/${t.productId}`} tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined}>
        {t.imageUrl ? <img src={t.imageUrl} alt="" loading="lazy" /> : <span className="tick-noimg" />}
        <span className="tick-title">{t.title}</span>
        <strong>{formatBRL(t.priceCents)}</strong>
        <span className="tick-pct">−{t.pct}%</span>
      </a>
    ));
  return (
    <section className={`ticker ${paused ? "paused" : ""}`} aria-label="Preços que caíram agora">
      <span className="ticker-live" aria-hidden="true"><i /> ao vivo</span>
      <div className="ticker-viewport">
        <div className="ticker-track" style={{ animationDuration: `${Math.max(items.length * 4, 30)}s` }}>
          {row(false)}
          {row(true)}
        </div>
      </div>
      <button type="button" className="ticker-toggle" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
        {paused ? "Continuar" : "Pausar"}
      </button>
    </section>
  );
}
