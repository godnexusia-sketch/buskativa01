import type { PricePoint, PriceStats } from "@buskativa/core";

export type VerdictKind = "otimo" | "bom" | "media" | "espere" | "poucos-dados";

export interface Verdict {
  kind: VerdictKind;
  title: string;
  detail: string;
}

/** Highest observed price and when; null without points. */
export function highestPoint(points: PricePoint[]): PricePoint | null {
  let top: PricePoint | null = null;
  for (const p of points) if (!top || p.price > top.price) top = p;
  return top;
}

/**
 * "Is now a good time to buy?" from the observed history only. Fewer than 3 observations, or all on the same
 * price, is not enough to say anything.
 */
export function buyVerdict(points: PricePoint[], stats: PriceStats | null): Verdict {
  const top = highestPoint(points);
  if (!stats || !top || points.length < 3 || top.price === stats.lowest.price) {
    return {
      kind: "poucos-dados",
      title: "Ainda juntando histórico",
      detail: "Acompanhamos este preço há pouco tempo. Volte em alguns dias para ver a tendência.",
    };
  }
  const pct = Math.round(Math.abs(stats.changeVsAvg30d) * 100);
  if (stats.current <= stats.lowest.price * 1.02) {
    return { kind: "otimo", title: "Ótimo momento para comprar", detail: "O preço está no menor valor que já registramos." };
  }
  if (stats.changeVsAvg30d <= -0.05) {
    return { kind: "bom", title: "Bom preço", detail: `Está ${pct}% abaixo da média dos últimos 30 dias.` };
  }
  if (stats.changeVsAvg30d >= 0.05) {
    return { kind: "espere", title: "Vale esperar", detail: `Está ${pct}% acima da média dos últimos 30 dias.` };
  }
  return { kind: "media", title: "Preço na média", detail: "Perto da média dos últimos 30 dias." };
}
