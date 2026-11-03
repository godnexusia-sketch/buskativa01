import { computeStats, type PricePoint } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { buyVerdict, highestPoint } from "../lib/verdict";

const now = new Date("2026-11-03T12:00:00Z");
const pts = (...prices: number[]): PricePoint[] =>
  prices.map((price, i) => ({ price, observedAt: new Date(now.getTime() - (prices.length - i) * 86400e3) }));
const verdict = (p: PricePoint[]) => buyVerdict(p, computeStats(p, now));

describe("buyVerdict", () => {
  it("poucos dados ou preço que nunca mudou", () => {
    expect(verdict(pts(100, 90)).kind).toBe("poucos-dados");
    expect(verdict(pts(100, 100, 100)).kind).toBe("poucos-dados");
    expect(buyVerdict([], null).kind).toBe("poucos-dados");
  });

  it("no menor preço já visto é ótimo", () => {
    expect(verdict(pts(120, 110, 100)).kind).toBe("otimo");
  });

  it("abaixo da média é bom, acima é esperar, perto é média", () => {
    expect(verdict(pts(80, 120, 120, 120, 100)).kind).toBe("bom");
    const caro = verdict(pts(80, 90, 90, 130));
    expect(caro.kind).toBe("espere");
    expect(caro.detail).toMatch(/% acima da média/);
    expect(verdict(pts(90, 101, 99, 100)).kind).toBe("media");
  });
});

describe("highestPoint", () => {
  it("acha o maior preço e quando foi", () => {
    const p = pts(100, 150, 120);
    expect(highestPoint(p)).toEqual(p[1]);
    expect(highestPoint([])).toBeNull();
  });
});
