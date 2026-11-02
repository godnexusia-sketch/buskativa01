import { createHash } from "node:crypto";
import { normalizeText, tokens } from "./text";
import type { NormalizedQuery, QueryAttributes } from "./types";

const MARCAS = [
  "apple", "samsung", "xiaomi", "motorola", "lg", "sony", "jbl", "dell", "lenovo", "acer", "asus",
  "hp", "philips", "nike", "adidas", "electrolux", "brastemp", "consul", "positivo", "multilaser",
  "logitech", "redragon", "nintendo", "microsoft", "britania", "mondial", "oster", "arno",
  "tramontina", "puma", "mizuno", "olympikus", "intelbras", "tcl", "realme", "huawei", "anker",
];
const MARCA_POR_LINHA: Record<string, string> = {
  iphone: "apple", ipad: "apple", macbook: "apple", airpods: "apple",
  galaxy: "samsung", redmi: "xiaomi", poco: "xiaomi", moto: "motorola",
  playstation: "sony", xbox: "microsoft",
};
const CORES = [
  "preto", "preta", "branco", "branca", "azul", "vermelho", "vermelha", "verde", "rosa", "cinza",
  "prata", "dourado", "dourada", "roxo", "roxa", "amarelo", "amarela", "bege", "grafite", "marrom",
  "laranja",
];
const SUFIXOS_MODELO = new Set(["pro", "max", "plus", "ultra", "mini", "lite", "se", "fe"]);
const PALAVRAS_GENERICAS = new Set([
  "de", "do", "da", "para", "com", "sem", "e", "o", "a", "kit", "tenis", "fone", "notebook",
  "celular", "smartphone", "tamanho", "tam", "numero", "n",
]);

const RE_CAP = /\b(\d+(?:[.,]\d+)?)\s?(gb|tb|ml|mah|kg|w|l)\b/;
const RE_VOLT = /\b(110|127|220)\s?v\b|\bbivolt\b/;
const RE_TAM = /\b(?:tamanho|tam|numero|n)\.?\s*(pp|p|m|g|gg|xg|xgg|\d{2})\b/;
const RE_UNIDADE = /^(gb|tb|ml|mah|kg|w|l|v)$/;
const RE_TOKEN_MEDIDA = /^\d+(gb|tb|ml|mah|kg|w|l|v)$/;

function extrairModelo(toks: string[], atributos: QueryAttributes): string | undefined {
  const i = toks.findIndex((t, idx) => {
    if (!/\d/.test(t)) return false;
    if (RE_TOKEN_MEDIDA.test(t) || /^\dg$/.test(t)) return false;
    if (RE_UNIDADE.test(toks[idx + 1] ?? "")) return false;
    if (atributos.tamanho === t) return false;
    if (["110", "127", "220"].includes(t)) return false;
    return true;
  });
  if (i < 0) return undefined;
  const partes = [toks[i]];
  for (let j = i - 1; j >= 0 && partes.length < 3; j--) {
    const t = toks[j];
    if (!/^[a-z]+$/.test(t) || PALAVRAS_GENERICAS.has(t) || MARCAS.includes(t) || CORES.includes(t)) break;
    partes.unshift(t);
  }
  for (let j = i + 1; j < toks.length && SUFIXOS_MODELO.has(toks[j]); j++) partes.push(toks[j]);
  return partes.join(" ");
}

export function normalizeQuery(text: string): NormalizedQuery {
  const termo = normalizeText(text);
  const atributos: QueryAttributes = {};

  const cap = termo.match(RE_CAP);
  if (cap) atributos.capacidade = `${cap[1].replace(",", ".")}${cap[2]}`;
  const volt = termo.match(RE_VOLT);
  if (volt) atributos.voltagem = volt[1] ? `${volt[1]}v` : "bivolt";
  const tam = termo.match(RE_TAM);
  if (tam) atributos.tamanho = tam[1];

  const toks = tokens(termo);
  const cor = toks.find((t) => CORES.includes(t));
  if (cor) atributos.cor = cor;
  const marcaDireta = toks.find((t) => MARCAS.includes(t));
  const linha = toks.find((t) => Object.hasOwn(MARCA_POR_LINHA, t));
  const marca = marcaDireta ?? (linha ? MARCA_POR_LINHA[linha] : undefined);
  if (marca) atributos.marca = marca;
  const modelo = extrairModelo(toks, atributos);
  if (modelo) atributos.modelo = modelo;

  const n = Object.keys(atributos).length;
  const tipo = (atributos.marca && atributos.modelo) || n >= 2 ? "especifica" : "generica";
  const hash = createHash("sha256").update([...new Set(toks)].sort().join(" ")).digest("hex");

  return { original: text.trim(), termo, tipo, atributos, hash };
}

const radical = (t: string) => t.slice(0, -1);

export function matchesAttributes(title: string, atributos: QueryAttributes): boolean {
  const t = normalizeText(title);
  const toks = tokens(t);

  if (atributos.capacidade) {
    const m = atributos.capacidade.match(/^([\d.]+)([a-z]+)$/);
    if (!m) return false;
    const numero = m[1].replace(/\./g, "[.,]");
    if (!new RegExp(`(?<![\\d.,])${numero}\\s?${m[2]}\\b`).test(t)) return false;
  }
  if (atributos.voltagem && !toks.includes("bivolt")) {
    const numero = atributos.voltagem.replace("v", "");
    if (atributos.voltagem === "bivolt" || !new RegExp(`\\b${numero}\\s?v\\b`).test(t)) return false;
  }
  if (atributos.cor && !toks.some((tok) => radical(tok) === radical(atributos.cor!))) return false;
  if (atributos.marca) {
    const temMarca = toks.includes(atributos.marca) || toks.some((tok) => Object.hasOwn(MARCA_POR_LINHA, tok) && MARCA_POR_LINHA[tok] === atributos.marca);
    if (!temMarca) return false;
  }
  if (atributos.modelo) {
    const partes = atributos.modelo.split(" ");
    if (!partes.every((p) => toks.includes(p))) return false;
    if (!partes.some((p) => SUFIXOS_MODELO.has(p))) {
      const ultima = partes[partes.length - 1];
      if (toks.some((tok, i) => tok === ultima && SUFIXOS_MODELO.has(toks[i + 1] ?? ""))) return false;
    }
  }
  return true;
}
