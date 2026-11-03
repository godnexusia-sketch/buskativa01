import { describe, expect, it } from "vitest";
import { computeStats, nextWindow } from "../src/stats";
import type { PricePoint } from "../src/types";

const H = 3600e3;

// 70 dias, um ponto a cada 3 h, começando em 2026-01-01 00:00 de Brasília (03:00Z, quinta-feira).
// Terça é mais barata (90), o bloco 0h–3h é mais barato todo dia (95), terça 0h–3h é o mínimo (80).
function serie(): PricePoint[] {
  const start = Date.parse("2026-01-01T03:00:00Z");
  const pts: PricePoint[] = [];
  for (let i = 0; i < 70 * 8; i++) {
    const t = new Date(start + i * 3 * H);
    const local = new Date(t.getTime() - 3 * H);
    const terca = local.getUTCDay() === 2;
    const madrugada = local.getUTCHours() < 3;
    const price = terca && madrugada ? 80 : terca ? 90 : madrugada ? 95 : 100;
    pts.push({ price, observedAt: t });
  }
  return pts;
}

describe("computeStats", () => {
  it("encontra menor preço, melhor dia, melhor horário e próxima janela", () => {
    const now = new Date("2026-03-12T01:00:00Z"); // quarta 22h em Brasília
    const s = computeStats(serie(), now)!;
    expect(s.lowest).toEqual({ price: 80, observedAt: new Date("2026-01-06T03:00:00Z") });
    expect(s.current).toBe(100);
    expect(s.bestWeekday).toBe(2);
    expect(s.bestHourBlock).toBe(0);
    expect(s.confidence).toBe("alta");
    expect(s.nextLowWindow).toEqual(new Date("2026-03-17T03:00:00Z"));
    expect(s.avg30d).toBeGreaterThan(90);
    expect(s.changeVsAvg30d).toBeGreaterThan(0);
  });

  it("confiança baixa com poucos dados", () => {
    const pts = serie().slice(0, 10);
    expect(computeStats(pts, new Date("2026-01-03T00:00:00Z"))!.confidence).toBe("baixa");
  });

  it("confiança média entre 14 e 60 dias", () => {
    const pts = serie().slice(0, 30 * 8);
    expect(computeStats(pts, new Date("2026-02-01T00:00:00Z"))!.confidence).toBe("media");
  });

  it("retorna null sem pontos", () => {
    expect(computeStats([], new Date())).toBeNull();
  });
});

describe("nextWindow", () => {
  it("pula para a semana seguinte se a janela de hoje já começou", () => {
    const now = new Date("2026-03-10T04:00:00Z"); // terça 01h em Brasília
    expect(nextWindow(now, 2, 0)).toEqual(new Date("2026-03-17T03:00:00Z"));
  });

  it("usa hoje se a janela ainda não começou", () => {
    const now = new Date("2026-03-10T04:00:00Z"); // terça 01h
    expect(nextWindow(now, 2, 6)).toEqual(new Date("2026-03-10T21:00:00Z")); // terça 18h
  });
});
