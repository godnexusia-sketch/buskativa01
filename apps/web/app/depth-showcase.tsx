"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatBRL } from "../lib/format";

export interface ShowcaseItem {
  productId: number;
  title: string;
  imageUrl: string | null;
  store: string;
  priceCents: number;
  originalPriceCents: number | null;
  pct: number | null;
}

// depth stops for d = -1 (leaving on the right) … 5 (arriving out of the haze), as fractions of the stage
const KX = [1.12, 0.7, 0.5, 0.36, 0.25, 0.16, 0.09]; // centre x
const KF = [0.98, 0.94, 0.86, 0.8, 0.75, 0.71, 0.68]; // bottom y
const KH = [0.9, 0.78, 0.58, 0.45, 0.35, 0.27, 0.2]; // size
const KB = [0, 0, 0.8, 1.8, 3, 4.5, 6]; // blur px on screen
const KO = [0, 1, 1, 1, 0.92, 0.7, 0]; // opacity

const wrap = (x: number, n: number) => ((x % n) + n) % n;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * The day's biggest discounts standing in a line that recedes into the distance. One float `p` drives every
 * product: drag, horizontal wheel, arrows or the buttons move `target`, `p` eases after it, release snaps.
 * Vertical page scroll is never captured.
 */
export function DepthShowcase({ items }: { items: ShowcaseItem[] }) {
  const n = items.length;
  const stageRef = useRef<HTMLDivElement>(null);
  const elsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const rollRef = useRef<HTMLSpanElement>(null);
  const state = useRef({ p: 0, target: 0, W: 0, H: 0, dirty: true, last: 0, down: false, sx: 0, st: 0, moved: 0, wheelT: 0 as unknown as ReturnType<typeof setTimeout> });
  const [front, setFront] = useState(0);

  const go = useCallback((delta: number) => {
    const s = state.current;
    s.target = Math.round(s.target) + delta;
  }, []);

  useEffect(() => {
    if (n < 3) return;
    const stage = stageRef.current!;
    const s = state.current;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = () => {
      s.W = stage.clientWidth;
      s.H = stage.clientHeight;
      s.dirty = true;
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(stage);

    let shown = -1;
    let raf = 0;
    const paint = () => {
      const base = s.H; // layout size; only transform changes afterwards
      elsRef.current.forEach((el, i) => {
        if (!el) return;
        let d = wrap(i - s.p, n);
        if (d > n - 1) d -= n;
        const k = clamp(d + 1, 0, 6);
        const a = Math.floor(k);
        const b = Math.min(6, a + 1);
        const t = k - a;
        const mix = (A: number[]) => A[a] + (A[b] - A[a]) * t;
        const h = mix(KH) * s.H;
        const sc = h / base;
        const x = mix(KX) * s.W - h / 2;
        const y = mix(KF) * s.H - h;
        el.style.width = `${base}px`;
        el.style.height = `${base}px`;
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc.toFixed(4)})`;
        const blur = mix(KB) / sc;
        el.style.filter = blur < 0.2 ? "none" : `blur(${blur.toFixed(1)}px)`;
        el.style.opacity = mix(KO).toFixed(3);
        el.style.zIndex = String(100 - Math.round(d * 10));
        el.tabIndex = Math.abs(d) < 0.5 ? 0 : -1;
      });
      if (rollRef.current) {
        const line = rollRef.current.firstElementChild as HTMLElement | null;
        rollRef.current.style.transform = `translate3d(0,${(-wrap(s.p, n) * (line?.offsetHeight ?? 0)).toFixed(1)}px,0)`;
      }
      const idx = wrap(Math.round(s.p), n);
      if (idx !== shown) {
        shown = idx;
        setFront(idx);
      }
    };
    const frame = (now: number) => {
      const dt = Math.min(50, now - s.last) || 16;
      s.last = now;
      const was = s.p;
      s.p = calm ? s.target : s.p + (s.target - s.p) * (1 - Math.exp(-dt * 0.0072));
      if (Math.abs(s.target - s.p) < 0.0004) s.p = s.target;
      if (s.p !== was || s.dirty) {
        s.dirty = false;
        paint();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const pull = () => Math.max(120, s.W * 0.22);
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      s.down = true;
      s.sx = e.clientX;
      s.st = s.target;
      s.moved = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!s.down) return;
      const dx = e.clientX - s.sx;
      s.moved = Math.max(s.moved, Math.abs(dx));
      if (s.moved > 6) {
        stage.setPointerCapture(e.pointerId);
        stage.classList.add("dragging");
      }
      // the line follows the finger: dragging right walks it forward
      s.target = s.st + dx / pull();
    };
    const onUp = () => {
      if (!s.down) return;
      s.down = false;
      stage.classList.remove("dragging");
      if (s.moved >= 6) s.target = Math.round(s.target);
    };
    // a click after a drag must not open the product
    const onClick = (e: MouseEvent) => {
      if (s.moved >= 6) {
        e.preventDefault();
        s.moved = 0;
      }
    };
    // only sideways wheel/trackpad moves the line; vertical scroll keeps scrolling the page
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      s.target += clamp(e.deltaX, -120, 120) / 420;
      clearTimeout(s.wheelT);
      s.wheelT = setTimeout(() => (s.target = Math.round(s.target)), 150);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        s.target = Math.round(s.target) + 1;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.target = Math.round(s.target) - 1;
      }
    };
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("click", onClick, true);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clearTimeout(s.wheelT);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("click", onClick, true);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("keydown", onKey);
    };
  }, [n]);

  if (n < 3) return null;
  const cur = items[front];
  const pad = (x: number) => String(x).padStart(2, "0");

  return (
    <section className="depth" aria-roledescription="vitrine" aria-label="Maiores descontos do dia">
      <div className="depth-stage" ref={stageRef} tabIndex={0} aria-label="Arraste ou use as setas para ver o próximo produto">
        {items.map((it, i) => (
          <a
            key={it.productId}
            ref={(el) => {
              elsRef.current[i] = el;
            }}
            className="depth-item"
            href={`/produto/${it.productId}`}
            aria-label={it.title}
            draggable={false}
          >
            {it.imageUrl ? <img src={it.imageUrl} alt="" draggable={false} decoding="async" /> : <span className="pcard-noimg" />}
          </a>
        ))}
        <div className="depth-count" aria-hidden="true">
          <span className="depth-win">
            <span className="depth-roll" ref={rollRef}>
              {[...items, items[0]].map((_, i) => <b key={i}>{pad((i % n) + 1)}</b>)}
            </span>
          </span>
          <span>/ {pad(n)}</span>
        </div>
      </div>

      <div className="depth-panel" aria-live="polite">
        <span className="pcard-store">{cur.store}</span>
        <h2 className="depth-title">{cur.title}</h2>
        <div className="depth-price">
          {cur.originalPriceCents !== null && cur.pct !== null && <s>{formatBRL(cur.originalPriceCents)}</s>}
          <span className="price">{formatBRL(cur.priceCents)}</span>
          {cur.pct !== null && <span className="badge off">-{cur.pct}%</span>}
        </div>
        <div className="depth-actions">
          <a className="btn" href={`/produto/${cur.productId}`}>Ver detalhes</a>
          <a className="btn ghost" href={`/ir/${cur.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
        </div>
        <div className="depth-nav">
          <button type="button" className="car-btn" onClick={() => go(-1)} aria-label="Produto anterior">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <button type="button" className="car-btn" onClick={() => go(1)} aria-label="Próximo produto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </button>
          <span className="muted small">Arraste para o lado</span>
        </div>
      </div>
    </section>
  );
}
