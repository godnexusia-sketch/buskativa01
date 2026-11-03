import { describe, expect, it } from "vitest";
import { parseAllBRL, parseBRL, pickCardPrice, toCents } from "../src/money";

describe("parseBRL", () => {
  it.each([
    ["R$ 1.234,56", 1234.56],
    ["R$49,90", 49.9],
    ["R$ 1.299", 1299],
    ["por apenas 89,90 à vista", 89.9],
    ["de R$ 200,00 por R$ 150,00", 200],
    ["R$ 1234,56", 1234.56],
    ["R$1234", 1234],
    ["R$ 99,90", 99.9],
    ["R$ 12.999", 12999],
    ["R$ 1.299,00", 1299],
  ])("%s -> %d", (text, expected) => {
    expect(parseBRL(text)).toBeCloseTo(expected);
  });

  it("retorna null sem preço", () => {
    expect(parseBRL("sem preço")).toBeNull();
  });
});

describe("parseAllBRL", () => {
  it("retorna todos os preços com símbolo, na ordem", () => {
    expect(parseAllBRL("de R$ 399,00 por R$ 279,90 no Pix")).toEqual([399, 279.9]);
    expect(parseAllBRL("R$ 1234,56 ou 10x de R$1.299")).toEqual([1234.56, 1299]);
  });

  it("cai para valores sem símbolo quando não há R$", () => {
    expect(parseAllBRL("de 399,00 por 279,90")).toEqual([399, 279.9]);
  });

  it("retorna lista vazia sem preço", () => {
    expect(parseAllBRL("sem preço")).toEqual([]);
  });
});

describe("pickCardPrice", () => {
  it.each([
    ["de R$ 399,00 R$ 279,90 no Pix", 279.9],
    ["R$ 279,90 no Pix ou 10x de R$ 27,99 sem juros", 279.9],
    ["R$ 279,90 em 10x R$ 27,99", 279.9],
    ["R$ 279,90 Frete R$ 9,90", 279.9],
    ["R$ 279,90 entrega: R$ 15,00", 279.9],
    ["R$ 279,90 ganhe R$ 5,00 de cashback", 279.9],
    ["economize R$ 20,00 por R$ 279,90", 279.9],
    ["R$ 279,90 R$ 30,00 de desconto", 279.9],
    ["R$ 279,90 R$ 50 OFF", 279.9],
    ["por apenas 89,90 em 3x de 29,97", 89.9],
  ])("%s -> %d", (text, expected) => {
    expect(pickCardPrice(text)).toBeCloseTo(expected);
  });

  it("se todos os valores forem excluídos, usa o primeiro", () => {
    expect(pickCardPrice("10x de R$ 27,99 Frete R$ 9,90")).toBeCloseTo(27.99);
  });

  it("retorna null sem preço", () => {
    expect(pickCardPrice("sem preço")).toBeNull();
  });
});

describe("toCents", () => {
  it("arredonda para centavos inteiros", () => {
    expect(toCents(49.9)).toBe(4990);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});
