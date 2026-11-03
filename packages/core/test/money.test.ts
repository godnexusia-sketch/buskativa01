import { describe, expect, it } from "vitest";
import { detectPagamento, parseAllBRL, parseBRL, pickCardPrice, pickCardPrices, toCents } from "../src/money";

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
    ["R$ 279,90 em 10x sem juros de R$ 27,99", 279.9],
    ["R$ 279,90 Frete grátis acima de R$ 99,00", 279.9],
    ["R$ 279,90 Frete grátis a partir de R$ 99,00", 279.9],
    ["R$ 279,90 Frete grátis R$ 0,00", 279.9],
    ["R$ 279,90 + R$ 15,00 de frete", 279.9],
    ["R$ 279,90 ganhe R$ 5,00 de volta", 279.9],
    ["R$ 279,90 R$ 27,99 por mês", 279.9],
    ["R$ 279,90 R$ 27,99/mês", 279.9],
    ["R$ 279,90 (R$ 27,99/un)", 279.9],
    ["R$ 279,90 R$ 3,50 / 100g", 279.9],
    ["R$ 279,90 R$ 3,50 / 1 kg", 279.9],
    ["R$ 279,90 R$ 0,50 / 100ml", 279.9],
    ["R$ 279,90 R$ 5,00", 279.9],
    ["R$ 1.299,00 R$ 1.099,00 à vista no Pix ou R$ 1.199,00 em até 10x de R$ 119,90 sem juros", 1099],
  ])("%s -> %d", (text, expected) => {
    expect(pickCardPrice(text)).toBeCloseTo(expected);
  });

  it("se todos os valores forem excluídos, usa o primeiro", () => {
    expect(pickCardPrice("10x de R$ 27,99 Frete R$ 9,90")).toBeCloseTo(27.99);
  });

  it("retorna null sem preço", () => {
    expect(pickCardPrice("sem preço")).toBeNull();
  });

  it("nunca retorna valor menor ou igual a zero", () => {
    expect(pickCardPrice("Frete grátis R$ 0,00")).toBeNull();
    expect(pickCardPrice("R$ 0,00 R$ 10,00")).toBeCloseTo(10);
  });

  it("descarta valores abaixo de 10% do maior candidato", () => {
    expect(pickCardPrice("R$ 3,50 R$ 279,90")).toBeCloseTo(279.9);
  });
});

describe("pickCardPrices", () => {
  it("devolve o preço original (maior candidato) quando é maior que o preço", () => {
    expect(pickCardPrices("de R$ 399,00 R$ 279,90 no Pix")).toEqual({ price: 279.9, originalPrice: 399 });
    expect(pickCardPrices("R$ 1.299,00 R$ 1.099,00 à vista no Pix ou R$ 1.199,00 em até 10x de R$ 119,90 sem juros")).toEqual({
      price: 1099,
      originalPrice: 1299,
    });
  });

  it("não devolve original quando não há candidato maior", () => {
    expect(pickCardPrices("R$ 279,90 no Pix ou 10x de R$ 27,99 sem juros")).toEqual({ price: 279.9 });
    expect(pickCardPrices("R$ 279,90 Frete grátis acima de R$ 999,00")).toEqual({ price: 279.9 });
  });

  it("retorna null sem preço", () => {
    expect(pickCardPrices("sem preço")).toBeNull();
  });
});

describe("detectPagamento", () => {
  it.each([
    ["R$ 279,90 no app", "app"],
    ["Preço pelo app", "app"],
    ["Oferta exclusivo do app", "app"],
    ["exclusivo no app", "app"],
    ["R$ 279,90 no Pix", "pix"],
    ["R$ 279,90 à vista no Pix", "pix"],
  ])("%s -> %s", (text, expected) => {
    expect(detectPagamento(text)).toBe(expected);
  });

  it("retorna undefined sem menção", () => {
    expect(detectPagamento("R$ 279,90 em 10x")).toBeUndefined();
    expect(detectPagamento("capa do aplicativo")).toBeUndefined();
  });
});

describe("toCents", () => {
  it("arredonda para centavos inteiros", () => {
    expect(toCents(49.9)).toBe(4990);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});
