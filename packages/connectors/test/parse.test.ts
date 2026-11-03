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
