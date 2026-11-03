import { describe, expect, it } from "vitest";
import { OFERTAS_PAGE_SIZE, ofertasHref, parseOfertasParams } from "../lib/ofertas-params";

describe("parseOfertasParams", () => {
  it("padrões", () => {
    expect(parseOfertasParams({})).toEqual({ pagina: 1, loja: null, categoria: null, desconto: false, minCents: undefined, maxCents: undefined, ordem: "menor-preco" });
  });
  it("valida e limita entrada ruim sem lançar", () => {
    const p = parseOfertasParams({ pagina: "-3", loja: "xpto", min: "abc", max: "-1", ordem: "foo" });
    expect(p).toEqual({ pagina: 1, loja: null, categoria: null, desconto: false, minCents: undefined, maxCents: undefined, ordem: "menor-preco" });
    expect(parseOfertasParams({ pagina: "NaN" }).pagina).toBe(1);
    expect(parseOfertasParams({ pagina: "2.7" }).pagina).toBe(2);
    expect(parseOfertasParams({ pagina: "99999999999" }).pagina).toBe(10000);
  });
  it("aceita valores válidos e usa o primeiro de parâmetros repetidos", () => {
    const p = parseOfertasParams({ pagina: ["3", "4"], loja: "amazon", min: "10", max: "99,90", ordem: "maior-desconto" });
    expect(p).toEqual({ pagina: 3, loja: "amazon", categoria: null, desconto: false, minCents: 1000, maxCents: 9990, ordem: "maior-desconto" });
  });
  it("troca min e max quando invertidos", () => {
    const p = parseOfertasParams({ min: "50", max: "10" });
    expect([p.minCents, p.maxCents]).toEqual([1000, 5000]);
  });
});

describe("ofertasHref", () => {
  it("omite padrões", () => {
    expect(ofertasHref({ pagina: 1, loja: null, categoria: null, desconto: false, minCents: undefined, maxCents: undefined, ordem: "menor-preco" })).toBe("/ofertas");
    expect(OFERTAS_PAGE_SIZE).toBe(24);
  });
  it("limita valores fora do inteiro do banco e normaliza negativos", () => {
    const href = ofertasHref({ pagina: 1, loja: null, categoria: null, desconto: false, minCents: 99999999999, maxCents: -10, ordem: "menor-preco" });
    expect(href).toBe("/ofertas?min=21474836.47&max=0");
  });
  it("round-trip: href de parâmetros invertidos volta ordenado", () => {
    const p = parseOfertasParams({ min: "50", max: "10" });
    expect(ofertasHref(p)).toBe("/ofertas?min=10&max=50");
  });
  it("monta a query com reais", () => {
    expect(ofertasHref({ pagina: 2, loja: "amazon", categoria: null, desconto: false, minCents: 1000, maxCents: 9990, ordem: "recentes" })).toBe(
      "/ofertas?pagina=2&loja=amazon&min=10&max=99.9&ordem=recentes",
    );
  });
});

describe("categoria e desconto", () => {
  it("aceita categoria válida e desconto=1; ignora o resto", () => {
    expect(parseOfertasParams({ categoria: "tvs", desconto: "1" })).toMatchObject({ categoria: "tvs", desconto: true });
    expect(parseOfertasParams({ categoria: "naves", desconto: "sim" })).toMatchObject({ categoria: null, desconto: false });
  });
  it("entra no href e volta igual", () => {
    const p = parseOfertasParams({ categoria: "smartphones", desconto: "1", loja: "amazon" });
    expect(ofertasHref(p)).toBe("/ofertas?categoria=smartphones&loja=amazon&desconto=1");
    expect(parseOfertasParams(Object.fromEntries(new URLSearchParams(ofertasHref(p).split("?")[1])))).toEqual(p);
  });
});
