import { describe, expect, it } from "vitest";
import { parseBRL, toCents } from "../src/money";

describe("parseBRL", () => {
  it.each([
    ["R$ 1.234,56", 1234.56],
    ["R$49,90", 49.9],
    ["R$ 1.299", 1299],
    ["por apenas 89,90 à vista", 89.9],
    ["de R$ 200,00 por R$ 150,00", 200],
  ])("%s -> %d", (text, expected) => {
    expect(parseBRL(text)).toBeCloseTo(expected);
  });

  it("retorna null sem preço", () => {
    expect(parseBRL("sem preço")).toBeNull();
  });
});

describe("toCents", () => {
  it("arredonda para centavos inteiros", () => {
    expect(toCents(49.9)).toBe(4990);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});
