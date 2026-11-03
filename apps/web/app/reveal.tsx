"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Plays the grid's entrance once, when it first scrolls into view (motion onset draws the eye; repeating it would
 * train people to ignore it). Without IntersectionObserver the content is simply shown.
 */
export function Reveal({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`${className} reveal ${shown ? "in" : ""}`}>
      {children}
    </div>
  );
}
