import { describe, expect, it } from "vitest";
import { applyOfferView, parseReais, type OfferLike } from "../lib/offer-filters";

const o = (productId: number, over: Partial<OfferLike> = {}): OfferLike => ({
  productId, store: "mercadolivre", priceCents: 10000, totalCents: 10000, originalPriceCents: null, groupId: productId, ...over,
});
const ids = (v: { groups: OfferLike[][] }) => v.groups.map((g) => g.map((i) => i.productId));

const data: OfferLike[] = [
  o(1, { priceCents: 9000, totalCents: 9000, groupId: 0 }),
  o(2, { store: "amazon", priceCents: 8000, totalCents: 10500, originalPriceCents: 16000, groupId: 0 }),
  o(3, { store: "magalu", priceCents: 5000, totalCents: 5000, originalPriceCents: 6000, groupId: 1 }),
  o(4, { store: "amazon", priceCents: 30000, totalCents: 30000, groupId: 2 }),
];

describe("parseReais", () => {
  it("aceita vírgula e ponto; rejeita lixo e negativos", () => {
    expect(parseReais("10")).toBe(1000);
    expect(parseReais("10,5")).toBe(1050);
    expect(parseReais("1299.90")).toBe(129990);
    expect(parseReais("1.299,90")).toBe(129990);
    expect(parseReais("")).toBeUndefined();
    expect(parseReais(undefined)).toBeUndefined();
    expect(parseReais("abc")).toBeUndefined();
    expect(parseReais("-5")).toBeUndefined();
    expect(parseReais("1e400")).toBeUndefined();
  });
  it("limita ao máximo do inteiro do banco", () => {
    expect(parseReais("99999999999")).toBe(2147483647);
  });
});

describe("applyOfferView", () => {
  const base = { store: null, minCents: undefined, maxCents: undefined, order: "relevancia" } as const;

  it("sem filtros mantém a ordem e conta ofertas e lojas", () => {
    const v = applyOfferView(data, base);
    expect(ids(v)).toEqual([[1, 2], [3], [4]]);
    expect(v.offers).toBe(4);
    expect(v.stores).toBe(3);
  });

  it("filtra por loja", () => {
    const v = applyOfferView(data, { ...base, store: "amazon" });
    expect(ids(v)).toEqual([[2], [4]]);
    expect(v.offers).toBe(2);
    expect(v.stores).toBe(1);
  });

  it("filtra por faixa de preço pelo total exibido (inclusive)", () => {
    const v = applyOfferView(data, { ...base, minCents: 9000, maxCents: 10500 });
    expect(ids(v)).toEqual([[1, 2]]);
  });

  it("ordena por menor preço total, grupo pelo melhor item", () => {
    const v = applyOfferView(data, { ...base, order: "menor-preco" });
    expect(ids(v)).toEqual([[3], [1, 2], [4]]);
  });

  it("ordena por maior desconto, sem desconto por último", () => {
    const v = applyOfferView(data, { ...base, order: "maior-desconto" });
    expect(ids(v)).toEqual([[2, 1], [3], [4]]);
  });

  it("resultado vazio quando nada passa", () => {
    const v = applyOfferView(data, { ...base, minCents: 1_000_000 });
    expect(v).toEqual({ groups: [], offers: 0, stores: 0 });
  });
});
