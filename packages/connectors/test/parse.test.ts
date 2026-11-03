import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAmazon, parseAnchors, parseGeneric, parseJsonLd } from "../src/parse";

const fx = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("parseAmazon", () => {
  it("extrai ASIN, título, link absoluto, preço e imagem", () => {
    const offers = parseAmazon(fx("amazon-search.html"), "https://www.amazon.com.br/s?k=fone");
    expect(offers.map((o) => o.externalId)).toEqual(["B0AAA111", "B0BBB222"]);
    expect(offers[0]).toMatchObject({
      store: "amazon",
      title: "Fone de Ouvido JBL Tune 520BT Bluetooth Preto",
      url: "https://www.amazon.com.br/dp/B0AAA111",
      price: 249.9,
      imageUrl: "https://m.media-amazon.com/images/I/aaa.jpg",
    });
    expect(offers[1].price).toBe(1099);
  });
});

describe("parseJsonLd", () => {
  it("lê ItemList com Offer e AggregateOffer e ignora JSON inválido", () => {
    const offers = parseJsonLd(fx("jsonld-itemlist.html"), "magalu", "https://www.magazineluiza.com.br/busca/air+fryer/");
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: "AF-1",
      title: "Air Fryer Mondial 4L",
      url: "https://www.magazineluiza.com.br/p/af1/",
      price: 299.9,
      imageUrl: "https://img.example/af1.jpg",
    });
    expect(offers[1]).toMatchObject({ externalId: "https://www.magazineluiza.com.br/p/af2/", price: 349 });
  });
});

describe("parseAnchors", () => {
  it("usa o card ao redor do link, deduplica e ignora links sem padrão", () => {
    const offers = parseAnchors(
      fx("anchors-magalu.html"),
      "magalu",
      "https://www.magazineluiza.com.br/busca/jbl/",
      /\/p\/([a-z0-9]+)\//i,
    );
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: "237896300",
      title: "Fone de Ouvido JBL Tune 520BT",
      url: "https://www.magazineluiza.com.br/fone-de-ouvido-jbl/p/237896300/ea/fone/",
      price: 279.9,
      imageUrl: "https://a-static.mlcdn.com.br/jbl.jpg",
    });
    expect(offers[1]).toMatchObject({ externalId: "abc123def", title: "Caixa de Som JBL Go 3", price: 199 });
  });

  it("separa o texto de elementos vizinhos antes de ler os preços", () => {
    const html =
      '<div><a href="/x/p/aaa111/" title="Fone X">Fone</a><span>R$ 279,90</span><span>10x de R$ 27,99</span></div>';
    const offers = parseAnchors(html, "magalu", "https://www.magazineluiza.com.br/", /\/p\/([a-z0-9]+)\//i);
    expect(offers).toHaveLength(1);
    expect(offers[0].price).toBe(279.9);
  });
});

describe("parseGeneric", () => {
  it("prefere JSON-LD e cai para links quando não há JSON-LD", () => {
    const cfg = { store: "magalu" as const, baseUrl: "https://www.magazineluiza.com.br/", linkPattern: /\/p\/([a-z0-9]+)\//i };
    expect(parseGeneric(fx("jsonld-itemlist.html"), cfg)).toHaveLength(2);
    expect(parseGeneric(fx("anchors-magalu.html"), cfg)).toHaveLength(2);
  });
});

describe("preço original e forma de pagamento", () => {
  const amazonCard = (prices: string) =>
    `<div data-component-type="s-search-result" data-asin="B0X"><h2><span>Fone X</span></h2>${prices}</div>`;

  it("parseAmazon lê o preço riscado como originalPrice quando é maior", () => {
    const html = amazonCard(
      '<span class="a-price a-text-price"><span class="a-offscreen">R$ 349,90</span></span>' +
        '<span class="a-price"><span class="a-offscreen">R$ 249,90</span></span>',
    );
    const [o] = parseAmazon(html, "https://www.amazon.com.br/");
    expect(o.price).toBe(249.9);
    expect(o.originalPrice).toBe(349.9);
  });

  it("parseAmazon ignora preço riscado menor ou igual e card sem riscado", () => {
    const menor = amazonCard(
      '<span class="a-price a-text-price"><span class="a-offscreen">R$ 200,00</span></span>' +
        '<span class="a-price"><span class="a-offscreen">R$ 249,90</span></span>',
    );
    expect(parseAmazon(menor, "https://www.amazon.com.br/")[0].originalPrice).toBeUndefined();
    const [sem] = parseAmazon(fx("amazon-search.html"), "https://www.amazon.com.br/");
    expect("originalPrice" in sem).toBe(false);
  });

  const jsonLd = (offers: unknown) =>
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: "Air Fryer",
      url: "/p/af/",
      sku: "AF",
      offers,
    })}</script>`;

  it("parseJsonLd usa highPrice como originalPrice quando é maior que o preço", () => {
    const [o] = parseJsonLd(jsonLd({ "@type": "AggregateOffer", price: 299.9, highPrice: 399.9 }), "magalu", "https://m.com.br/");
    expect(o.price).toBe(299.9);
    expect(o.originalPrice).toBe(399.9);
  });

  it("parseJsonLd ignora highPrice menor ou igual ao preço (e lowPrice como preço)", () => {
    const [a] = parseJsonLd(jsonLd({ price: 299.9, highPrice: 299.9 }), "magalu", "https://m.com.br/");
    expect(a.originalPrice).toBeUndefined();
    const [b] = parseJsonLd(jsonLd({ lowPrice: 299.9, highPrice: 349 }), "magalu", "https://m.com.br/");
    expect(b.originalPrice).toBe(349);
  });

  const card = (text: string) =>
    `<div><a href="/x/p/aaa111/" title="Fone X">Fone</a><span>${text.split("|").join("</span><span>")}</span></div>`;
  const anchors = (text: string) =>
    parseAnchors(card(text), "magalu", "https://www.magazineluiza.com.br/", /\/p\/([a-z0-9]+)\//i)[0];

  it("parseAnchors devolve o maior candidato como originalPrice", () => {
    const o = anchors("R$ 399,00|R$ 279,90|10x de R$ 27,99|Frete R$ 9,90");
    expect(o.price).toBe(279.9);
    expect(o.originalPrice).toBe(399);
  });

  it("parseAnchors não inventa originalPrice sem candidato maior", () => {
    const o = anchors("R$ 279,90|10x de R$ 27,99");
    expect("originalPrice" in o).toBe(false);
  });

  it("parseAnchors marca pagamento app ou pix", () => {
    expect(anchors("R$ 399,00|R$ 279,90 no app").attributes.pagamento).toBe("app");
    expect(anchors("R$ 399,00|R$ 279,90 à vista no Pix").attributes.pagamento).toBe("pix");
    expect(anchors("R$ 279,90").attributes.pagamento).toBeUndefined();
  });
});
