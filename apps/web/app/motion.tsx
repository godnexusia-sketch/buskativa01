"use client";
import { animate, domAnimation, LazyMotion, m, MotionConfig, useInView, useReducedMotion } from "motion/react";
import { Children, type ReactNode, useEffect, useRef, useState } from "react";
import { formatBRL } from "../lib/format";

const spring = { type: "spring", stiffness: 380, damping: 30, mass: 0.8 } as const;

/** Loads only the DOM animation features (keeps the bundle small) and honours the system "reduce motion". */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={spring}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** Grid whose children enter once, in a wave, when it first scrolls into view. */
export function StaggerGrid({ className, children }: { className: string; children: ReactNode }) {
  return (
    <m.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.05 } } }}
    >
      {Children.map(children, (child) => (
        <m.div
          className="stagger-item"
          variants={{
            hidden: { opacity: 0, y: 18, scale: 0.96 },
            shown: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 24 } },
          }}
        >
          {child}
        </m.div>
      ))}
    </m.div>
  );
}

/** Lifts on hover, sinks on press: the card answers the finger. */
export function Pressable({ children }: { children: ReactNode }) {
  return (
    <m.div className="pressable" whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}>
      {children}
    </m.div>
  );
}

/** Counts from `from` to `to` once visible; reduced motion shows the final value right away. */
export function CountTo({ to, from = 0, format = "int", duration = 1.1 }: { to: number; from?: number; format?: "int" | "brl"; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (!inView || reduced || from === to) return setValue(to);
    setValue(from);
    const controls = animate(from, to, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduced, from, to, duration]);
  const text = format === "brl" ? formatBRL(Math.round(value)) : Math.round(value).toLocaleString("pt-BR");
  return <span ref={ref}>{text}</span>;
}

export { m };
