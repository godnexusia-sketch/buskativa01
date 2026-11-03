import { describe, expect, it } from "vitest";
import { jsonLdString, productDescription, productJsonLd, SITEMAP_PRODUCT_LIMIT, sitemapEntries } from "../lib/seo";

const base = "https://exemplo.test";
const now = new Date("2026-11-03T12:00:00Z");

describe("sitemapEntries", () => {
  it("inclui páginas fixas, institucionais e produtos", () => {
    const urls = sitemapEntries(base, [{ id: 7 }], now).map((e) => e.url);
    expect(urls).toEqual([
      `${base}/`,
      `${base}/ofertas`,
      `${base}/cupons`,
      `${base}/sobre`,
      `${base}/privacidade`,
      `${base}/termos`,
      `${base}/contato`,
      `${base}/produto/7`,
    ]);
  });
  it("sem produtos devolve só as fixas", () => {
    expect(sitemapEntries(base, [], now)).toHaveLength(7);
  });
  it("limita a 5000 produtos e remove duplicados", () => {
    const many = Array.from({ length: SITEMAP_PRODUCT_LIMIT + 10 }, (_, i) => ({ id: i + 1 }));
    expect(sitemapEntries(base, many, now)).toHaveLength(7 + SITEMAP_PRODUCT_LIMIT);
    expect(sitemapEntries(base, [{ id: 1 }, { id: 1 }], now)).toHaveLength(8);
  });
});

describe("productJsonLd", () => {
  const p = { id: 3, title: "Fone X", imageUrl: "https://img.test/a.png", storeName: "Amazon", priceCents: 12345 };
  it("monta Product com Offer em BRL apontando para /produto/:id", () => {
    const ld = productJsonLd(base, p) as Record<string, any>;
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("Fone X");
    expect(ld.offers).toMatchObject({ "@type": "Offer", price: "123.45", priceCurrency: "BRL", url: `${base}/produto/3` });
  });
  it("sem preço omite offers", () => {
    expect(productJsonLd(base, { ...p, priceCents: null }).offers).toBeUndefined();
  });
  it("escapa < para não fechar a tag script", () => {
    const s = jsonLdString(productJsonLd(base, { ...p, title: "</script><b>" }));
    expect(s).not.toContain("</script>");
    expect(JSON.parse(s).name).toBe("</script><b>");
  });
  it("descrição com e sem preço", () => {
    expect(productDescription("Fone", "Amazon", "R$ 10,00")).toContain("por R$ 10,00");
    expect(productDescription("Fone", "Amazon", null)).not.toContain(" por ");
  });
});
