import { type Offer, parseBRL, pickCardPrice, type StoreId } from "@buskativa/core";
import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";

const abs = (href: string, base: string) => new URL(href, base).toString();

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

type Json = Record<string, unknown>;

function productNodes(data: unknown): Json[] {
  const out: Json[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const n = node as Json;
    const type = asArray(n["@type"] as string | string[]);
    if (type.includes("Product")) out.push(n);
    if (n["@graph"]) visit(n["@graph"]);
    if (n.itemListElement) visit(n.itemListElement);
    if (n.item) visit(n.item);
  };
  visit(data);
  return out;
}

export function parseJsonLd(html: string, store: StoreId, baseUrl: string): Offer[] {
  const $ = cheerio.load(html);
  const offers: Offer[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }
    for (const p of productNodes(data)) {
      const offer = asArray(p.offers as Json | Json[])[0];
      const rawPrice = offer?.price ?? offer?.lowPrice;
      const price = rawPrice === undefined ? NaN : Number(rawPrice);
      const name = typeof p.name === "string" ? p.name : "";
      const url = typeof p.url === "string" ? abs(p.url, baseUrl) : "";
      if (!name || !url || !(price > 0)) continue;
      const image = asArray(p.image as string | string[])[0];
      offers.push({
        store,
        externalId: String(p.sku ?? p.productID ?? url),
        title: name,
        url,
        price,
        shipping: null,
        currency: "BRL",
        imageUrl: typeof image === "string" ? abs(image, baseUrl) : undefined,
        attributes: {},
      });
    }
  });
  return offers;
}

type DomNode = Parameters<CheerioAPI["contains"]>[0]; // domhandler's AnyNode without a direct dependency

/** Text of an element with a space between text nodes; cheerio's .text() glues "R$ 279,90" to "10x". */
function spacedText($: CheerioAPI, root: Cheerio<DomNode>): string {
  const parts: string[] = [];
  const walk = (sel: Cheerio<DomNode>) =>
    sel.contents().each((_, node) => {
      if (node.type === "text") parts.push(node.data);
      else if (node.type === "tag" && node.name !== "script" && node.name !== "style") walk($(node));
    });
  walk(root);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function parseAnchors(html: string, store: StoreId, baseUrl: string, linkPattern: RegExp): Offer[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const offers: Offer[] = [];
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = a.attr("href")!;
    const m = href.match(linkPattern);
    if (!m) return;
    const url = abs(href, baseUrl);
    const externalId = m[1] ?? new URL(url).pathname;
    if (seen.has(externalId)) return;

    let card = a.parent();
    for (let i = 0; i < 5 && card.length && parseBRL(spacedText($, card)) === null; i++) card = card.parent();
    // skips the old "de" price, installments, shipping and cashback amounts
    const price = pickCardPrice(spacedText($, card));
    const title = (
      a.attr("title") ||
      a.find("img").attr("alt") ||
      card.find("h2, h3").first().text() ||
      a.text()
    ).trim();
    if (price === null || !title) return;

    seen.add(externalId);
    const img = card.find("img").first().attr("src");
    offers.push({
      store,
      externalId,
      title,
      url,
      price,
      shipping: null,
      currency: "BRL",
      imageUrl: img ? abs(img, baseUrl) : undefined,
      attributes: {},
    });
  });
  return offers;
}

export function parseGeneric(html: string, cfg: { store: StoreId; baseUrl: string; linkPattern: RegExp }): Offer[] {
  const fromJsonLd = parseJsonLd(html, cfg.store, cfg.baseUrl);
  return fromJsonLd.length > 0 ? fromJsonLd : parseAnchors(html, cfg.store, cfg.baseUrl, cfg.linkPattern);
}

export function parseAmazon(html: string, baseUrl: string): Offer[] {
  const $ = cheerio.load(html);
  const offers: Offer[] = [];
  $('div[data-component-type="s-search-result"]').each((_, el) => {
    const card = $(el);
    const asin = card.attr("data-asin");
    const title = card.find("h2 span").first().text().trim();
    const price = parseBRL(card.find(".a-price .a-offscreen").first().text());
    if (!asin || !title || price === null) return;
    const img = card.find("img.s-image").attr("src");
    offers.push({
      store: "amazon",
      externalId: asin,
      title,
      url: abs(`/dp/${asin}`, baseUrl),
      price,
      shipping: null,
      currency: "BRL",
      imageUrl: img,
      attributes: {},
    });
  });
  return offers;
}
