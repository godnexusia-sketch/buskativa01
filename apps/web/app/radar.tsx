"use client";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { RadarItem } from "../lib/radar";
import { ProductCard } from "./product-card";

const EVERY_MS = 30_000;

/**
 * "Radar de ofertas": the best-scored deals, re-read from the server every 30 s while the tab is visible.
 * Cards that change place slide to it (layout animation); cards that just entered get a "novo" seal.
 */
export function Radar({ initial, initialAt }: { initial: RadarItem[]; initialAt: string }) {
  const [items, setItems] = useState(initial);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [at, setAt] = useState(() => new Date(initialAt).getTime());
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  useEffect(() => {
    const refresh = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const r = await fetch("/api/radar", { cache: "no-store" });
        if (!r.ok) return;
        const body = (await r.json()) as { at: string; items: RadarItem[] };
        setItems((prev) => {
          const before = new Set(prev.map((i) => i.productId));
          setFresh(new Set(body.items.filter((i) => !before.has(i.productId)).map((i) => i.productId)));
          return body.items;
        });
        setAt(new Date(body.at).getTime());
      } catch {
        // offline or server busy: keep showing the last list
      } finally {
        busy.current = false;
      }
    };
    const poll = setInterval(refresh, EVERY_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => document.visibilityState === "visible" && Date.now() - at > EVERY_MS && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [at]);

  if (items.length === 0) return null;
  const ago = Math.max(0, Math.round((now - at) / 1000));
  const left = Math.max(0, Math.ceil((EVERY_MS - (now - at)) / 1000));

  return (
    <section className="shelf radar" aria-labelledby="radar-title">
      <header className="shelf-head">
        <h2 id="radar-title">Radar de ofertas</h2>
        <span className="radar-status" aria-live="off">
          <i className="radar-dot" aria-hidden="true" />
          atualizado há {ago} s
          <span className="radar-next" style={{ "--p": `${(left / (EVERY_MS / 1000)) * 100}%` } as React.CSSProperties} aria-label={`próxima análise em ${left} segundos`} />
        </span>
      </header>
      <p className="muted radar-note">Analisamos descontos e quedas de preço a cada 30 segundos. Os melhores ficam no topo.</p>
      <div className="grid">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((it, i) => (
            <m.div
              key={it.productId}
              layout
              className={`stagger-item radar-item ${fresh.has(it.productId) ? "is-new" : ""}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              {i < 3 && <span className="radar-rank" aria-label={`${i + 1}º melhor agora`}>{i + 1}º</span>}
              {fresh.has(it.productId) && <span className="radar-new">novo</span>}
              <ProductCard p={it} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
