# BUSKATIVA Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web que busca 24h o menor preço de um produto em várias lojas reais, guarda o histórico, mostra gráfico + melhor dia/horário + estimativa da próxima queda e redireciona para a loja com link de afiliado.

**Architecture:** Monorepo npm workspaces em TypeScript. `apps/web` (Next.js App Router) recebe buscas e enfileira jobs no Redis (BullMQ); `apps/worker` consome a fila, roda os conectores de loja (API ou Playwright), filtra e grava ofertas/observações no Postgres (Drizzle). A lógica pura (normalização da consulta, filtros, estatísticas, afiliado) fica em `packages/core` e é toda testada com Vitest.

**Tech Stack:** Node 22+, TypeScript, Next.js (App Router), React, Recharts, Drizzle ORM + node-postgres (prod) + PGlite (testes), BullMQ + Redis, Playwright + cheerio, pino, Vitest, Playwright Test, Docker.

Spec: `docs/superpowers/specs/2026-11-01-buskativa-fase1-design.md`

## Global Constraints

- Moeda sempre BRL; no banco os preços são inteiros em centavos (`priceCents`, `shippingCents`).
- Fuso de exibição e estatísticas: America/Sao_Paulo, tratado como UTC−3 fixo (o Brasil não tem horário de verão desde 2019).
- Lojas permitidas (allowlist): mercadolivre, amazon, shopee, magalu, aliexpress, tiktokshop, kwaishop. Domínios fora da lista nunca são gravados nem redirecionados.
- Vendedores com nota < 4,0 (escala 0–5) são descartados quando a loja informa a nota.
- Preço suspeito: `<= 0` ou `< 10%` da mediana do grupo → descartado.
- Playwright: timeout de navegação de 30 s; 1 página por vez por loja; intervalo mínimo de 5 s entre requisições à mesma loja; CAPTCHA nunca é resolvido, vira erro `BLOCKED`.
- Ao iniciar o worker: enfileirar 20 buscas na hora. Recorrência: 60 min (30 min se houve variação de preço nas últimas 24 h). Tick do agendador a cada 5 min.
- Rede: até 3 tentativas com backoff exponencial; `BLOCKED` e `PARSE` não repetem.
- Cache de busca: resultado com menos de 15 min (ou execução em andamento há menos de 2 min) para a mesma consulta normalizada é reaproveitado.
- Rate limit da API pública: 30 buscas/min por IP.
- Melhor horário: blocos de 3 h (0 = 0h–3h … 7 = 21h–24h). Confiança: `baixa` se < 14 dias de dados ou < 30 observações; `media` se < 60 dias; senão `alta`.
- Desvios da spec registrados aqui: a tabela `stores` virou configuração em código (`STORES`); `query_results` guarda o preço da execução; a fila fica num pacote próprio `packages/queue`; o conector Kwai Shop vem desligado por padrão (`KWAI_ENABLED=true` liga), porque a loja não tem busca web confirmada.
- Textos da interface em português do Brasil.

## File Structure

```
package.json                     # workspaces, scripts raiz
tsconfig.base.json
vitest.config.ts
docker-compose.yml               # postgres + redis locais
.env.example
packages/core/src/
  types.ts        # StoreId, Offer, NormalizedQuery, Connector, ConnectorError, PricePoint, StoreStatus
  text.ts         # normalizeText, tokens
  money.ts        # parseBRL, toCents
  stores.ts       # STORES, storeForUrl, isAllowedUrl
  affiliate.ts    # affiliateUrl
  query.ts        # normalizeQuery, matchesAttributes
  offers.ts       # totalPrice, median, isSuspiciousPrice, filterOffers, similarity, groupSimilar
  stats.ts        # computeStats, nextWindow
  index.ts
packages/db/src/
  schema.ts       # tabelas Drizzle
  client.ts       # Db, createDb, migrateDb
  repo.ts         # funções de acesso
  testing.ts      # createTestDb (PGlite)
packages/db/drizzle/             # migrações geradas
packages/queue/src/index.ts      # BullMQ: fila, conexão, enqueueSearch
packages/connectors/src/
  mercadolivre.ts
  amazon-paapi.ts
  browser.ts      # Playwright compartilhado + detecção de bloqueio
  limiter.ts      # concorrência + intervalo mínimo
  parse.ts        # parseJsonLd, parseAnchors, parseGeneric, parseAmazon
  browser-stores.ts  # URL de busca + parser por loja
  browser-connector.ts
  demo.ts         # conectores falsos para dev/E2E
  index.ts        # createConnectors(env)
packages/connectors/scripts/smoke.ts
apps/worker/src/
  run-search.ts   # runConnector, runSearch
  scheduler.ts    # pickStartupQueries, isDue, dueQueries
  main.ts
apps/worker/seed/trending.json
apps/web/
  next.config.ts
  lib/server.ts  lib/rate-limit.ts  lib/search-service.ts  lib/redirect.ts  lib/format.ts
  app/layout.tsx  app/globals.css  app/page.tsx
  app/busca/page.tsx  app/busca/search-results.tsx
  app/produto/[id]/page.tsx  app/produto/[id]/price-chart.tsx
  app/api/buscas/route.ts  app/api/buscas/[id]/route.ts
  app/api/produtos/[id]/historico/route.ts
  app/ir/[id]/route.ts
  e2e/busca.spec.ts  playwright.config.ts
Dockerfile.web  Dockerfile.worker  render.yaml  README.md
```

---

### Task 1: Monorepo e tipos/dinheiro do core

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`, `packages/core/src/text.ts`, `packages/core/src/money.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/money.test.ts`

**Interfaces:**
- Produces: tipos `StoreId`, `STORE_IDS`, `QueryAttributes`, `NormalizedQuery`, `Offer`, `ConnectorErrorCode`, `ConnectorError`, `Connector`, `PricePoint`, `StoreStatus`; `normalizeText(s: string): string`; `tokens(s: string): string[]`; `parseBRL(text: string): number | null`; `toCents(reais: number): number`.

- [ ] **Step 1: Criar a raiz do monorepo**

`package.json`:
```json
{
  "name": "buskativa",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    testTimeout: 20000,
  },
});
```

`.gitignore`:
```
node_modules
.next
.env
.env.local
dist
test-results
playwright-report
packages/connectors/fixtures/live
```

`packages/core/package.json`:
```json
{
  "name": "@buskativa/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./stores": "./src/stores.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit -p ." }
}
```

`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Run: `npm i -D vitest typescript @types/node tsx`
Expected: instala sem erros e cria `package-lock.json`.

- [ ] **Step 2: Escrever os tipos e utilitários de texto**

`packages/core/src/types.ts`:
```ts
export const STORE_IDS = [
  "mercadolivre",
  "amazon",
  "shopee",
  "magalu",
  "aliexpress",
  "tiktokshop",
  "kwaishop",
] as const;
export type StoreId = (typeof STORE_IDS)[number];

export interface QueryAttributes {
  marca?: string;
  modelo?: string;
  capacidade?: string;
  cor?: string;
  tamanho?: string;
  voltagem?: string;
}

export interface NormalizedQuery {
  original: string;
  termo: string;
  tipo: "generica" | "especifica";
  atributos: QueryAttributes;
  hash: string;
}

export interface Offer {
  store: StoreId;
  externalId: string;
  title: string;
  url: string;
  price: number;
  shipping: number | null;
  currency: "BRL";
  sellerName?: string;
  sellerRating?: number;
  imageUrl?: string;
  attributes: Record<string, string>;
}

export type ConnectorErrorCode = "BLOCKED" | "TIMEOUT" | "NETWORK" | "PARSE";

export class ConnectorError extends Error {
  constructor(
    public readonly code: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export interface Connector {
  id: StoreId;
  experimental?: boolean;
  search(q: NormalizedQuery, opts: { limit: number }): Promise<Offer[]>;
}

export interface PricePoint {
  price: number;
  observedAt: Date;
}

export interface StoreStatus {
  ok: boolean;
  count?: number;
  error?: ConnectorErrorCode;
  message?: string;
}
```

`packages/core/src/text.ts`:
```ts
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalizeText(s).split(/[^a-z0-9]+/).filter(Boolean);
}
```

- [ ] **Step 3: Escrever o teste de dinheiro (falhando)**

`packages/core/test/money.test.ts`:
```ts
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
```

Run: `npx vitest run packages/core/test/money.test.ts`
Expected: FAIL (`Cannot find module '../src/money'`).

- [ ] **Step 4: Implementar `money.ts` e o `index.ts`**

`packages/core/src/money.ts`:
```ts
const WITH_SYMBOL = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/;
const WITHOUT_SYMBOL = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;

export function parseBRL(text: string): number | null {
  const m = text.match(WITH_SYMBOL) ?? text.match(WITHOUT_SYMBOL);
  if (!m) return null;
  const value = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}
```

`packages/core/src/index.ts`:
```ts
export * from "./types";
export * from "./text";
export * from "./money";
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run packages/core/test/money.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts .gitignore packages/core
git commit -m "feat(core): monorepo, tipos base e parse de preço BRL"
```

---

### Task 2: Allowlist de lojas e link de afiliado

**Files:**
- Create: `packages/core/src/stores.ts`, `packages/core/src/affiliate.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/affiliate.test.ts`

**Interfaces:**
- Consumes: `StoreId` (Task 1).
- Produces: `STORES: Record<StoreId, { name: string; domains: string[]; experimental?: boolean }>`; `storeForUrl(url: string): StoreId | null`; `isAllowedUrl(url: string, store?: StoreId): boolean`; `affiliateUrl(url: string, store: StoreId, env: Record<string, string | undefined>): string` (lança erro se a URL não estiver na allowlist).

- [ ] **Step 1: Escrever o teste (falhando)**

`packages/core/test/affiliate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { affiliateUrl } from "../src/affiliate";
import { isAllowedUrl, storeForUrl } from "../src/stores";

describe("storeForUrl / isAllowedUrl", () => {
  it("reconhece domínios e subdomínios permitidos", () => {
    expect(storeForUrl("https://www.amazon.com.br/dp/B0C1")).toBe("amazon");
    expect(storeForUrl("https://produto.mercadolivre.com.br/MLB-1")).toBe("mercadolivre");
    expect(storeForUrl("https://pt.aliexpress.com/item/1.html")).toBe("aliexpress");
  });

  it("recusa domínios parecidos, http e URLs inválidas", () => {
    expect(storeForUrl("https://amazon.com.br.evil.com/x")).toBeNull();
    expect(storeForUrl("http://www.amazon.com.br/dp/B0C1")).toBeNull();
    expect(storeForUrl("não é url")).toBeNull();
  });

  it("confere a loja quando informada", () => {
    expect(isAllowedUrl("https://www.amazon.com.br/dp/B0C1", "amazon")).toBe(true);
    expect(isAllowedUrl("https://www.amazon.com.br/dp/B0C1", "shopee")).toBe(false);
  });
});

describe("affiliateUrl", () => {
  it("aplica os parâmetros de afiliado da loja", () => {
    const url = affiliateUrl("https://www.amazon.com.br/dp/B0C1?th=1", "amazon", {
      AFFILIATE_PARAMS_AMAZON: "tag=meutag-20",
    });
    const u = new URL(url);
    expect(u.searchParams.get("tag")).toBe("meutag-20");
    expect(u.searchParams.get("th")).toBe("1");
  });

  it("mantém a URL sem parâmetros configurados", () => {
    expect(affiliateUrl("https://www.amazon.com.br/dp/B0C1", "amazon", {})).toBe(
      "https://www.amazon.com.br/dp/B0C1",
    );
  });

  it("lança erro para URL fora da allowlist", () => {
    expect(() => affiliateUrl("https://evil.com/x", "amazon", {})).toThrow(/allowlist/);
  });
});
```

Run: `npx vitest run packages/core/test/affiliate.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 2: Implementar `stores.ts` e `affiliate.ts`**

`packages/core/src/stores.ts`:
```ts
import { STORE_IDS, type StoreId } from "./types";

export const STORES: Record<StoreId, { name: string; domains: string[]; experimental?: boolean }> = {
  mercadolivre: { name: "Mercado Livre", domains: ["mercadolivre.com.br", "mercadolibre.com"] },
  amazon: { name: "Amazon", domains: ["amazon.com.br"] },
  shopee: { name: "Shopee", domains: ["shopee.com.br"] },
  magalu: { name: "Magalu", domains: ["magazineluiza.com.br", "magalu.com"] },
  aliexpress: { name: "AliExpress", domains: ["aliexpress.com"] },
  tiktokshop: { name: "TikTok Shop", domains: ["tiktok.com"], experimental: true },
  kwaishop: { name: "Kwai Shop", domains: ["kwai.com"], experimental: true },
};

export function storeForUrl(url: string): StoreId | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  for (const id of STORE_IDS) {
    if (STORES[id].domains.some((d) => host === d || host.endsWith(`.${d}`))) return id;
  }
  return null;
}

export function isAllowedUrl(url: string, store?: StoreId): boolean {
  const found = storeForUrl(url);
  return found !== null && (store === undefined || found === store);
}
```

`packages/core/src/affiliate.ts`:
```ts
import { isAllowedUrl } from "./stores";
import type { StoreId } from "./types";

/** Aplica os parâmetros de AFFILIATE_PARAMS_<LOJA> (formato query string, ex.: "tag=meutag-20"). */
export function affiliateUrl(
  url: string,
  store: StoreId,
  env: Record<string, string | undefined>,
): string {
  if (!isAllowedUrl(url, store)) throw new Error(`URL fora da allowlist: ${url}`);
  const u = new URL(url);
  const raw = env[`AFFILIATE_PARAMS_${store.toUpperCase()}`];
  if (raw) for (const [k, v] of new URLSearchParams(raw)) u.searchParams.set(k, v);
  return u.toString();
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./stores";
export * from "./affiliate";
```

- [ ] **Step 3: Rodar os testes**

Run: `npx vitest run packages/core/test/affiliate.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): allowlist de lojas e link de afiliado"
```

---

### Task 3: Normalizador de consulta

**Files:**
- Create: `packages/core/src/query.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/query.test.ts`

**Interfaces:**
- Consumes: `normalizeText`, `tokens`, `NormalizedQuery`, `QueryAttributes` (Task 1).
- Produces: `normalizeQuery(text: string): NormalizedQuery`; `matchesAttributes(title: string, atributos: QueryAttributes): boolean`.

- [ ] **Step 1: Escrever o teste (falhando)**

`packages/core/test/query.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { matchesAttributes, normalizeQuery } from "../src/query";

describe("normalizeQuery", () => {
  it("consulta genérica sem atributos", () => {
    const q = normalizeQuery("Fone Bluetooth");
    expect(q.tipo).toBe("generica");
    expect(q.atributos).toEqual({});
    expect(q.termo).toBe("fone bluetooth");
  });

  it("produto específico com marca, modelo, capacidade e cor", () => {
    const q = normalizeQuery("iPhone 15 128GB preto");
    expect(q.tipo).toBe("especifica");
    expect(q.atributos).toEqual({ marca: "apple", modelo: "iphone 15", capacidade: "128gb", cor: "preto" });
  });

  it("modelo com sufixo e capacidade separada por espaço", () => {
    const q = normalizeQuery("Samsung Galaxy S24 Ultra 256 GB");
    expect(q.atributos.marca).toBe("samsung");
    expect(q.atributos.modelo).toBe("galaxy s24 ultra");
    expect(q.atributos.capacidade).toBe("256gb");
  });

  it("linha sem marca explícita e modelo de duas palavras", () => {
    const q = normalizeQuery("redmi note 13");
    expect(q.atributos.marca).toBe("xiaomi");
    expect(q.atributos.modelo).toBe("redmi note 13");
  });

  it("tamanho com prefixo conta como atributo e não vira modelo", () => {
    const q = normalizeQuery("Tênis Nike tamanho 42");
    expect(q.atributos).toEqual({ marca: "nike", tamanho: "42" });
    expect(q.tipo).toBe("especifica");
  });

  it("um único atributo continua genérico; 5g não vira capacidade", () => {
    expect(normalizeQuery("air fryer 220v").atributos).toEqual({ voltagem: "220v" });
    expect(normalizeQuery("air fryer 220v").tipo).toBe("generica");
    expect(normalizeQuery("celular 5g").atributos).toEqual({});
  });

  it("hash ignora caixa, acentos, espaços e ordem das palavras", () => {
    expect(normalizeQuery("Fone Bluetooth").hash).toBe(normalizeQuery("  bluetooth   fone ").hash);
    expect(normalizeQuery("tênis").hash).toBe(normalizeQuery("tenis").hash);
  });
});

describe("matchesAttributes", () => {
  const { atributos } = normalizeQuery("iPhone 15 128GB preto");

  it("aceita título equivalente", () => {
    expect(matchesAttributes("Apple iPhone 15 (128 GB) - Preto", atributos)).toBe(true);
    expect(matchesAttributes("iPhone 15 128GB Preta", atributos)).toBe(true);
  });

  it("recusa modelo ou capacidade diferentes", () => {
    expect(matchesAttributes("Apple iPhone 14 128GB Preto", atributos)).toBe(false);
    expect(matchesAttributes("Apple iPhone 15 256GB Preto", atributos)).toBe(false);
  });

  it("bivolt satisfaz qualquer voltagem", () => {
    expect(matchesAttributes("Air Fryer Mondial Bivolt", { voltagem: "220v" })).toBe(true);
    expect(matchesAttributes("Air Fryer Mondial 127V", { voltagem: "220v" })).toBe(false);
  });
});
```

Run: `npx vitest run packages/core/test/query.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementar `query.ts`**

`packages/core/src/query.ts`:
```ts
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
  const linha = toks.find((t) => t in MARCA_POR_LINHA);
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
  const compacto = t.replace(/\s+/g, "");

  if (atributos.capacidade && !compacto.includes(atributos.capacidade)) return false;
  if (atributos.voltagem && !toks.includes("bivolt")) {
    const numero = atributos.voltagem.replace("v", "");
    if (atributos.voltagem === "bivolt" || !new RegExp(`\\b${numero}\\s?v\\b`).test(t)) return false;
  }
  if (atributos.cor && !toks.some((tok) => radical(tok) === radical(atributos.cor!))) return false;
  if (atributos.marca) {
    const temMarca = toks.includes(atributos.marca) || toks.some((tok) => MARCA_POR_LINHA[tok] === atributos.marca);
    if (!temMarca) return false;
  }
  if (atributos.modelo && !atributos.modelo.split(" ").every((p) => toks.includes(p))) return false;
  return true;
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./query";
```

- [ ] **Step 3: Rodar os testes**

Run: `npx vitest run packages/core/test/query.test.ts`
Expected: PASS (10 testes). Se algum caso falhar, ajuste apenas as listas/regex de `query.ts`, nunca o teste.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): normalizador de consulta e checagem de atributos"
```

---

### Task 4: Filtro e agrupamento de ofertas

**Files:**
- Create: `packages/core/src/offers.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/offers.test.ts`

**Interfaces:**
- Consumes: `Offer`, `NormalizedQuery`, `tokens` (Task 1), `isAllowedUrl` (Task 2), `matchesAttributes`, `normalizeQuery` (Task 3).
- Produces: `totalPrice(o: Offer): number`; `median(xs: number[]): number`; `isSuspiciousPrice(price: number, med: number): boolean`; `filterOffers(offers: Offer[], q: NormalizedQuery, opts?: { minSellerRating?: number }): Offer[]`; `similarity(a: string, b: string): number`; `groupSimilar<T extends { title: string }>(items: T[], threshold?: number): T[][]`.

- [ ] **Step 1: Escrever o teste (falhando)**

`packages/core/test/offers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { filterOffers, groupSimilar, isSuspiciousPrice, median, totalPrice } from "../src/offers";
import { normalizeQuery } from "../src/query";
import type { Offer } from "../src/types";

const offer = (over: Partial<Offer>): Offer => ({
  store: "mercadolivre",
  externalId: "1",
  title: "Fone Bluetooth",
  url: "https://www.mercadolivre.com.br/p/1",
  price: 100,
  shipping: null,
  currency: "BRL",
  attributes: {},
  ...over,
});

describe("helpers", () => {
  it("totalPrice soma frete conhecido", () => {
    expect(totalPrice(offer({ price: 100, shipping: 15 }))).toBe(115);
    expect(totalPrice(offer({ price: 100, shipping: null }))).toBe(100);
  });

  it("median de listas par e ímpar", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("isSuspiciousPrice", () => {
    expect(isSuspiciousPrice(0, 100)).toBe(true);
    expect(isSuspiciousPrice(9, 100)).toBe(true);
    expect(isSuspiciousPrice(10, 100)).toBe(false);
  });
});

describe("filterOffers", () => {
  it("remove URL fora da allowlist, vendedor ruim e preço suspeito", () => {
    const q = normalizeQuery("fone bluetooth");
    const result = filterOffers(
      [
        offer({ externalId: "ok", price: 100 }),
        offer({ externalId: "ok2", price: 120, sellerRating: 4.5 }),
        offer({ externalId: "fora", url: "https://golpe.com/p/1" }),
        offer({ externalId: "ruim", sellerRating: 3.2 }),
        offer({ externalId: "erro", price: 1 }),
      ],
      q,
    );
    expect(result.map((o) => o.externalId)).toEqual(["ok", "ok2"]);
  });

  it("em consulta específica mantém só títulos com os atributos", () => {
    const q = normalizeQuery("iPhone 15 128GB preto");
    const result = filterOffers(
      [
        offer({ externalId: "a", title: "Apple iPhone 15 128GB Preto", price: 4500 }),
        offer({ externalId: "b", title: "Capinha para iPhone 15", price: 4400 }),
        offer({ externalId: "c", title: "Apple iPhone 14 128GB Preto", price: 3900 }),
      ],
      q,
    );
    expect(result.map((o) => o.externalId)).toEqual(["a"]);
  });
});

describe("groupSimilar", () => {
  it("agrupa títulos parecidos", () => {
    const groups = groupSimilar([
      { title: "Fone Bluetooth JBL Tune 510BT Preto" },
      { title: "Caixa de Som JBL Go 3" },
      { title: "JBL Tune 510BT Fone Bluetooth Preto Original" },
    ]);
    expect(groups.map((g) => g.length)).toEqual([2, 1]);
  });
});
```

Run: `npx vitest run packages/core/test/offers.test.ts`
Expected: FAIL (módulo não existe).

Observação: no caso "b" ("Capinha para iPhone 15") o filtro recusa porque falta "128gb" e "preto" no título.

- [ ] **Step 2: Implementar `offers.ts`**

`packages/core/src/offers.ts`:
```ts
import { matchesAttributes } from "./query";
import { isAllowedUrl } from "./stores";
import { tokens } from "./text";
import type { NormalizedQuery, Offer } from "./types";

export const totalPrice = (o: Offer): number => o.price + (o.shipping ?? 0);

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function isSuspiciousPrice(price: number, med: number): boolean {
  return !(price > 0) || (med > 0 && price < med * 0.1);
}

export function filterOffers(
  offers: Offer[],
  q: NormalizedQuery,
  opts: { minSellerRating?: number } = {},
): Offer[] {
  const minRating = opts.minSellerRating ?? 4;
  const base = offers.filter(
    (o) =>
      isAllowedUrl(o.url, o.store) &&
      (o.sellerRating === undefined || o.sellerRating >= minRating) &&
      (q.tipo === "generica" || matchesAttributes(o.title, q.atributos)),
  );
  const med = median(base.map((o) => o.price));
  return base.filter((o) => !isSuspiciousPrice(o.price, med));
}

export function similarity(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function groupSimilar<T extends { title: string }>(items: T[], threshold = 0.6): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const g = groups.find((grp) => similarity(grp[0].title, item.title) >= threshold);
    if (g) g.push(item);
    else groups.push([item]);
  }
  return groups;
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./offers";
```

- [ ] **Step 3: Rodar os testes**

Run: `npx vitest run packages/core/test/offers.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): filtro de ofertas e agrupamento por similaridade"
```

---

### Task 5: Estatísticas de preço

**Files:**
- Create: `packages/core/src/stats.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/stats.test.ts`

**Interfaces:**
- Consumes: `PricePoint` (Task 1), `median` (Task 4).
- Produces:
  ```ts
  type Confidence = "baixa" | "media" | "alta";
  interface PriceStats {
    lowest: { price: number; observedAt: Date };
    current: number; avg30d: number; changeVsAvg30d: number;
    bestWeekday: number;     // 0 = domingo … 6 = sábado (horário de Brasília)
    bestHourBlock: number;   // 0 = 0h–3h … 7 = 21h–24h
    confidence: Confidence;
    nextLowWindow: Date;     // início da próxima janela provável (UTC)
  }
  computeStats(points: PricePoint[], now: Date): PriceStats | null
  nextWindow(now: Date, weekday: number, block: number): Date
  ```

- [ ] **Step 1: Escrever o teste (falhando)**

`packages/core/test/stats.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { computeStats, nextWindow } from "../src/stats";
import type { PricePoint } from "../src/types";

const H = 3600e3;

// 70 dias, um ponto a cada 3 h, começando em 2026-01-01 00:00 de Brasília (03:00Z, quinta-feira).
// Terça é mais barata (90), o bloco 0h–3h é mais barato todo dia (95), terça 0h–3h é o mínimo (80).
function serie(): PricePoint[] {
  const start = Date.parse("2026-01-01T03:00:00Z");
  const pts: PricePoint[] = [];
  for (let i = 0; i < 70 * 8; i++) {
    const t = new Date(start + i * 3 * H);
    const local = new Date(t.getTime() - 3 * H);
    const terca = local.getUTCDay() === 2;
    const madrugada = local.getUTCHours() < 3;
    const price = terca && madrugada ? 80 : terca ? 90 : madrugada ? 95 : 100;
    pts.push({ price, observedAt: t });
  }
  return pts;
}

describe("computeStats", () => {
  it("encontra menor preço, melhor dia, melhor horário e próxima janela", () => {
    const now = new Date("2026-03-12T01:00:00Z"); // quarta 22h em Brasília
    const s = computeStats(serie(), now)!;
    expect(s.lowest).toEqual({ price: 80, observedAt: new Date("2026-01-06T03:00:00Z") });
    expect(s.current).toBe(100);
    expect(s.bestWeekday).toBe(2);
    expect(s.bestHourBlock).toBe(0);
    expect(s.confidence).toBe("alta");
    expect(s.nextLowWindow).toEqual(new Date("2026-03-17T03:00:00Z"));
    expect(s.avg30d).toBeGreaterThan(90);
    expect(s.changeVsAvg30d).toBeGreaterThan(0);
  });

  it("confiança baixa com poucos dados", () => {
    const pts = serie().slice(0, 10);
    expect(computeStats(pts, new Date("2026-01-03T00:00:00Z"))!.confidence).toBe("baixa");
  });

  it("confiança média entre 14 e 60 dias", () => {
    const pts = serie().slice(0, 30 * 8);
    expect(computeStats(pts, new Date("2026-02-01T00:00:00Z"))!.confidence).toBe("media");
  });

  it("retorna null sem pontos", () => {
    expect(computeStats([], new Date())).toBeNull();
  });
});

describe("nextWindow", () => {
  it("pula para a semana seguinte se a janela de hoje já começou", () => {
    const now = new Date("2026-03-10T04:00:00Z"); // terça 01h em Brasília
    expect(nextWindow(now, 2, 0)).toEqual(new Date("2026-03-17T03:00:00Z"));
  });

  it("usa hoje se a janela ainda não começou", () => {
    const now = new Date("2026-03-10T04:00:00Z"); // terça 01h
    expect(nextWindow(now, 2, 6)).toEqual(new Date("2026-03-10T21:00:00Z")); // terça 18h
  });
});
```

Run: `npx vitest run packages/core/test/stats.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementar `stats.ts`**

`packages/core/src/stats.ts`:
```ts
import { median } from "./offers";
import type { PricePoint } from "./types";

/** America/Sao_Paulo: UTC−3 fixo (sem horário de verão desde 2019). */
const TZ_OFFSET_MS = 3 * 3600e3;
const DAY = 86400e3;
const BLOCK_MS = 3 * 3600e3;

export type Confidence = "baixa" | "media" | "alta";

export interface PriceStats {
  lowest: { price: number; observedAt: Date };
  current: number;
  avg30d: number;
  changeVsAvg30d: number;
  bestWeekday: number;
  bestHourBlock: number;
  confidence: Confidence;
  nextLowWindow: Date;
}

const toLocal = (d: Date) => new Date(d.getTime() - TZ_OFFSET_MS);

function bestGroup(points: PricePoint[], key: (local: Date) => number, size: number): number {
  const groups: number[][] = Array.from({ length: size }, () => []);
  for (const p of points) groups[key(toLocal(p.observedAt))].push(p.price);
  let best = 0;
  let bestMed = Infinity;
  groups.forEach((g, i) => {
    if (g.length === 0) return;
    const m = median(g);
    if (m < bestMed) {
      bestMed = m;
      best = i;
    }
  });
  return best;
}

export function nextWindow(now: Date, weekday: number, block: number): Date {
  const ln = toLocal(now);
  const startOfDay = Date.UTC(ln.getUTCFullYear(), ln.getUTCMonth(), ln.getUTCDate());
  const diff = (weekday - ln.getUTCDay() + 7) % 7;
  let cand = startOfDay + diff * DAY + block * BLOCK_MS;
  if (cand <= ln.getTime()) cand += 7 * DAY;
  return new Date(cand + TZ_OFFSET_MS);
}

export function computeStats(input: PricePoint[], now: Date): PriceStats | null {
  if (input.length === 0) return null;
  const points = [...input].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  let lowest = points[0];
  for (const p of points) if (p.price < lowest.price) lowest = p;
  const current = points[points.length - 1].price;

  const recent = points.filter((p) => p.observedAt.getTime() >= now.getTime() - 30 * DAY);
  const ref = recent.length > 0 ? recent : points;
  const avg30d = ref.reduce((s, p) => s + p.price, 0) / ref.length;

  const bestWeekday = bestGroup(points, (d) => d.getUTCDay(), 7);
  const bestHourBlock = bestGroup(points, (d) => Math.floor(d.getUTCHours() / 3), 8);

  const spanDays =
    (points[points.length - 1].observedAt.getTime() - points[0].observedAt.getTime()) / DAY;
  const confidence: Confidence =
    spanDays < 14 || points.length < 30 ? "baixa" : spanDays < 60 ? "media" : "alta";

  return {
    lowest: { price: lowest.price, observedAt: lowest.observedAt },
    current,
    avg30d,
    changeVsAvg30d: (current - avg30d) / avg30d,
    bestWeekday,
    bestHourBlock,
    confidence,
    nextLowWindow: nextWindow(now, bestWeekday, bestHourBlock),
  };
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./stats";
```

- [ ] **Step 3: Rodar os testes do core inteiro**

Run: `npx vitest run packages/core`
Expected: PASS (todos os testes das Tasks 1–5).

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): estatísticas de preço e janela provável de queda"
```

---

### Task 6: Banco de dados (schema, repositório, PGlite para testes)

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/repo.ts`, `packages/db/src/testing.ts`, `packages/db/src/index.ts`
- Create (gerado): `packages/db/drizzle/*.sql`
- Test: `packages/db/test/repo.test.ts`

**Interfaces:**
- Consumes: `NormalizedQuery`, `Offer`, `StoreId`, `StoreStatus`, `PricePoint`, `toCents`, `normalizeQuery` (core).
- Produces:
  ```ts
  type Db  // PgDatabase compatível com node-postgres e PGlite
  createDb(url: string): { db: Db; pool: pg.Pool }
  migrateDb(db: Db): Promise<void>
  createTestDb(): Promise<Db>
  upsertQuery(db, nq: NormalizedQuery): Promise<{ id: number; original: string; hash: string }>
  createRun(db, queryId: number, startedAt?: Date): Promise<number>
  saveOffers(db, runId: number, offers: Offer[], observedAt?: Date): Promise<number[]>
  updateRunStoreStatus(db, runId: number, store: StoreId, status: StoreStatus): Promise<void>
  finishRun(db, runId: number, at?: Date): Promise<void>
  getRunWithResults(db, runId: number): Promise<RunWithResults | null>
  getRecentRunForHash(db, hash: string, now?: Date): Promise<number | null>
  getProduct(db, id: number): Promise<ProductRow | null>
  getPriceHistory(db, productId: number): Promise<PricePoint[]>
  latestRunIdForProduct(db, productId: number): Promise<number | null>
  recordClick(db, productId: number, referer: string | null): Promise<void>
  listWatchedQueries(db, limit: number): Promise<{ id: number; original: string; lastRunAt: Date | null }[]>
  queriesWithRecentChange(db, now: Date, hours?: number): Promise<Set<number>>
  topDrops(db, now: Date, limit: number): Promise<Drop[]>
  ```
  `RunWithResults = { id; status: "running" | "done"; storeStatus: Partial<Record<StoreId, StoreStatus>>; startedAt: Date; finishedAt: Date | null; query: NormalizedQuery; results: ResultRow[] }`
  `ResultRow = { productId: number; store: StoreId; title: string; imageUrl: string | null; priceCents: number; shippingCents: number | null }` (ordenado por preço + frete)
  `Drop = { productId: number; store: StoreId; title: string; imageUrl: string | null; nowCents: number; prevAvgCents: number; drop: number }`

- [ ] **Step 1: Criar o pacote e instalar dependências**

`packages/db/package.json`:
```json
{
  "name": "@buskativa/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./testing": "./src/testing.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit -p .",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": { "@buskativa/core": "*" }
}
```

`packages/db/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "drizzle.config.ts"] }
```

`packages/db/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({ dialect: "postgresql", schema: "./src/schema.ts", out: "./drizzle" });
```

Run: `npm i -w @buskativa/db drizzle-orm pg && npm i -w @buskativa/db -D drizzle-kit @types/pg @electric-sql/pglite`
Expected: instala sem erros.

- [ ] **Step 2: Escrever o schema e gerar a migração**

`packages/db/src/schema.ts`:
```ts
import type { NormalizedQuery, StoreId, StoreStatus } from "@buskativa/core";
import {
  boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const queries = pgTable("queries", {
  id: serial("id").primaryKey(),
  original: text("original").notNull(),
  normalized: jsonb("normalized").$type<NormalizedQuery>().notNull(),
  hash: text("hash").notNull().unique(),
  watched: boolean("watched").notNull().default(true),
  lastRunAt: tz("last_run_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    store: text("store").$type<StoreId>().notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    imageUrl: text("image_url"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    sellerName: text("seller_name"),
    sellerRating: real("seller_rating"),
  },
  (t) => [uniqueIndex("products_store_external").on(t.store, t.externalId)],
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id),
    priceCents: integer("price_cents").notNull(),
    shippingCents: integer("shipping_cents"),
    observedAt: tz("observed_at").notNull().defaultNow(),
  },
  (t) => [index("price_obs_product_time").on(t.productId, t.observedAt)],
);

export const searchRuns = pgTable("search_runs", {
  id: serial("id").primaryKey(),
  queryId: integer("query_id").notNull().references(() => queries.id),
  status: text("status").$type<"running" | "done">().notNull().default("running"),
  storeStatus: jsonb("store_status").$type<Partial<Record<StoreId, StoreStatus>>>().notNull().default({}),
  startedAt: tz("started_at").notNull().defaultNow(),
  finishedAt: tz("finished_at"),
});

export const queryResults = pgTable(
  "query_results",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").notNull().references(() => searchRuns.id),
    productId: integer("product_id").notNull().references(() => products.id),
    position: integer("position").notNull(),
    priceCents: integer("price_cents").notNull(),
    shippingCents: integer("shipping_cents"),
  },
  (t) => [index("query_results_run").on(t.runId), index("query_results_product").on(t.productId)],
);

export const clicks = pgTable("clicks", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  at: tz("at").notNull().defaultNow(),
  referer: text("referer"),
});
```

Run: `npm run db:generate -w @buskativa/db`
Expected: cria `packages/db/drizzle/0000_*.sql` e `packages/db/drizzle/meta/`.

- [ ] **Step 3: Escrever cliente e helper de teste**

`packages/db/src/client.ts`:
```ts
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }) as unknown as Db, pool };
}

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db as never, { migrationsFolder });
}
```

`packages/db/src/testing.ts`:
```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { type Db, migrationsFolder } from "./client";
import * as schema from "./schema";

export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}
```

- [ ] **Step 4: Escrever o teste do repositório (falhando)**

`packages/db/test/repo.test.ts`:
```ts
import { normalizeQuery, type Offer } from "@buskativa/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import {
  createRun, finishRun, getPriceHistory, getRecentRunForHash, getRunWithResults,
  latestRunIdForProduct, queriesWithRecentChange, saveOffers, topDrops, updateRunStoreStatus,
  upsertQuery,
} from "../src/repo";
import { createTestDb } from "../src/testing";

const MIN = 60e3;
const nq = normalizeQuery("fone bluetooth");
const offer = (over: Partial<Offer> = {}): Offer => ({
  store: "mercadolivre",
  externalId: "MLB1",
  title: "Fone Bluetooth X",
  url: "https://www.mercadolivre.com.br/p/MLB1",
  price: 100,
  shipping: 0,
  currency: "BRL",
  attributes: {},
  ...over,
});

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("repo", () => {
  it("upsertQuery é idempotente pelo hash", async () => {
    const a = await upsertQuery(db, nq);
    const b = await upsertQuery(db, normalizeQuery("Bluetooth Fone"));
    expect(b.id).toBe(a.id);
  });

  it("saveOffers reaproveita o produto e acumula observações", async () => {
    const q = await upsertQuery(db, nq);
    const r1 = await createRun(db, q.id);
    const [p1] = await saveOffers(db, r1, [offer({ price: 100 })]);
    const r2 = await createRun(db, q.id);
    const [p2] = await saveOffers(db, r2, [offer({ price: 90, shipping: null }), offer({ externalId: "MLB2", price: 50 })]);
    expect(p2).toBe(p1);
    expect((await getPriceHistory(db, p1)).map((p) => p.price)).toEqual([100, 90]);
    const run = await getRunWithResults(db, r2);
    expect(run!.results.map((r) => r.priceCents)).toEqual([5000, 9000]);
    expect(run!.query.termo).toBe("fone bluetooth");
    expect(await latestRunIdForProduct(db, p1)).toBe(r2);
  });

  it("updateRunStoreStatus mescla lojas e finishRun conclui", async () => {
    const q = await upsertQuery(db, nq);
    const r = await createRun(db, q.id);
    await updateRunStoreStatus(db, r, "mercadolivre", { ok: true, count: 2 });
    await updateRunStoreStatus(db, r, "shopee", { ok: false, error: "BLOCKED" });
    await finishRun(db, r);
    const run = await getRunWithResults(db, r);
    expect(run!.status).toBe("done");
    expect(run!.storeStatus).toEqual({
      mercadolivre: { ok: true, count: 2 },
      shopee: { ok: false, error: "BLOCKED" },
    });
  });

  it("getRecentRunForHash respeita 15 min (concluída) e 2 min (em andamento)", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const q = await upsertQuery(db, nq);
    const velha = await createRun(db, q.id, new Date(now.getTime() - 25 * MIN));
    await finishRun(db, velha, new Date(now.getTime() - 20 * MIN));
    expect(await getRecentRunForHash(db, nq.hash, now)).toBeNull();

    const travada = await createRun(db, q.id, new Date(now.getTime() - 5 * MIN));
    expect(travada).toBeGreaterThan(velha);
    expect(await getRecentRunForHash(db, nq.hash, now)).toBeNull();

    const recente = await createRun(db, q.id, new Date(now.getTime() - 1 * MIN));
    expect(await getRecentRunForHash(db, nq.hash, now)).toBe(recente);
  });

  it("queriesWithRecentChange e topDrops detectam queda de preço", async () => {
    const now = new Date();
    const q = await upsertQuery(db, nq);
    const r1 = await createRun(db, q.id, new Date(now.getTime() - 5 * 24 * 60 * MIN));
    await saveOffers(db, r1, [offer({ price: 100 })], new Date(now.getTime() - 5 * 24 * 60 * MIN));
    const r2 = await createRun(db, q.id, new Date(now.getTime() - 2 * 60 * MIN));
    await saveOffers(db, r2, [offer({ price: 80 })], new Date(now.getTime() - 2 * 60 * MIN));

    const r3 = await createRun(db, q.id, new Date(now.getTime() - 60 * MIN));
    await saveOffers(db, r3, [offer({ price: 80 })]);

    expect((await queriesWithRecentChange(db, now)).has(q.id)).toBe(false);
    const r4 = await createRun(db, q.id, new Date(now.getTime() - 30 * MIN));
    await saveOffers(db, r4, [offer({ price: 75 })]);
    expect((await queriesWithRecentChange(db, now)).has(q.id)).toBe(true);

    const drops = await topDrops(db, now, 10);
    expect(drops).toHaveLength(1);
    expect(drops[0].nowCents).toBe(7500);
    expect(drops[0].prevAvgCents).toBe(10000);
    expect(drops[0].drop).toBeCloseTo(0.25);
  });
});
```

Nota sobre o último teste: `r1` e sua observação são de 5 dias atrás (fora da janela de 24 h); `r2`, `r3`, `r4` estão nas últimas 24 h. Antes de `r4`, as execuções nas últimas 24 h viram só 80 → sem variação. Depois de `r4` (75) → há variação.

Run: `npx vitest run packages/db`
Expected: FAIL (`../src/repo` não existe).

- [ ] **Step 5: Implementar `repo.ts` e o `index.ts`**

`packages/db/src/repo.ts`:
```ts
import { toCents, type NormalizedQuery, type Offer, type PricePoint, type StoreId, type StoreStatus } from "@buskativa/core";
import { and, desc, eq, gte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./client";
import { clicks, priceObservations, products, queries, queryResults, searchRuns } from "./schema";

async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}

export async function upsertQuery(db: Db, nq: NormalizedQuery) {
  const [row] = await db
    .insert(queries)
    .values({ original: nq.original, normalized: nq, hash: nq.hash })
    .onConflictDoUpdate({ target: queries.hash, set: { watched: true } })
    .returning({ id: queries.id, original: queries.original, hash: queries.hash });
  return row;
}

export async function createRun(db: Db, queryId: number, startedAt = new Date()): Promise<number> {
  const [r] = await db.insert(searchRuns).values({ queryId, startedAt }).returning({ id: searchRuns.id });
  return r.id;
}

export async function saveOffers(db: Db, runId: number, offers: Offer[], observedAt = new Date()): Promise<number[]> {
  const ids: number[] = [];
  for (const [position, o] of offers.entries()) {
    const fields = {
      title: o.title,
      url: o.url,
      imageUrl: o.imageUrl ?? null,
      attributes: o.attributes,
      sellerName: o.sellerName ?? null,
      sellerRating: o.sellerRating ?? null,
    };
    const [p] = await db
      .insert(products)
      .values({ store: o.store, externalId: o.externalId, ...fields })
      .onConflictDoUpdate({ target: [products.store, products.externalId], set: fields })
      .returning({ id: products.id });
    const priceCents = toCents(o.price);
    const shippingCents = o.shipping === null ? null : toCents(o.shipping);
    await db.insert(priceObservations).values({ productId: p.id, priceCents, shippingCents, observedAt });
    await db.insert(queryResults).values({ runId, productId: p.id, position, priceCents, shippingCents });
    ids.push(p.id);
  }
  return ids;
}

export async function updateRunStoreStatus(db: Db, runId: number, store: StoreId, status: StoreStatus) {
  await db
    .update(searchRuns)
    .set({ storeStatus: sql`${searchRuns.storeStatus} || ${JSON.stringify({ [store]: status })}::jsonb` })
    .where(eq(searchRuns.id, runId));
}

export async function finishRun(db: Db, runId: number, at = new Date()) {
  const [run] = await db
    .update(searchRuns)
    .set({ status: "done", finishedAt: at })
    .where(eq(searchRuns.id, runId))
    .returning({ queryId: searchRuns.queryId });
  if (run) await db.update(queries).set({ lastRunAt: at }).where(eq(queries.id, run.queryId));
}

export async function getRunWithResults(db: Db, runId: number) {
  const [run] = await db
    .select({
      id: searchRuns.id,
      status: searchRuns.status,
      storeStatus: searchRuns.storeStatus,
      startedAt: searchRuns.startedAt,
      finishedAt: searchRuns.finishedAt,
      query: queries.normalized,
    })
    .from(searchRuns)
    .innerJoin(queries, eq(queries.id, searchRuns.queryId))
    .where(eq(searchRuns.id, runId));
  if (!run) return null;
  const results = await db
    .select({
      productId: products.id,
      store: products.store,
      title: products.title,
      imageUrl: products.imageUrl,
      priceCents: queryResults.priceCents,
      shippingCents: queryResults.shippingCents,
    })
    .from(queryResults)
    .innerJoin(products, eq(products.id, queryResults.productId))
    .where(eq(queryResults.runId, runId))
    .orderBy(sql`${queryResults.priceCents} + coalesce(${queryResults.shippingCents}, 0)`);
  return { ...run, results };
}

export type RunWithResults = NonNullable<Awaited<ReturnType<typeof getRunWithResults>>>;
export type ResultRow = RunWithResults["results"][number];

export async function getRecentRunForHash(db: Db, hash: string, now = new Date()): Promise<number | null> {
  const doneSince = new Date(now.getTime() - 15 * 60e3);
  const runningSince = new Date(now.getTime() - 2 * 60e3);
  const found = await db
    .select({ id: searchRuns.id })
    .from(searchRuns)
    .innerJoin(queries, eq(queries.id, searchRuns.queryId))
    .where(
      and(
        eq(queries.hash, hash),
        or(
          gte(searchRuns.finishedAt, doneSince),
          and(eq(searchRuns.status, "running"), gte(searchRuns.startedAt, runningSince)),
        ),
      ),
    )
    .orderBy(desc(searchRuns.startedAt))
    .limit(1);
  return found[0]?.id ?? null;
}

export async function getProduct(db: Db, id: number) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  return p ?? null;
}

export type ProductRow = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

export async function getPriceHistory(db: Db, productId: number): Promise<PricePoint[]> {
  const obs = await db
    .select({ priceCents: priceObservations.priceCents, observedAt: priceObservations.observedAt })
    .from(priceObservations)
    .where(eq(priceObservations.productId, productId))
    .orderBy(priceObservations.observedAt, priceObservations.id);
  return obs.map((o) => ({ price: o.priceCents / 100, observedAt: o.observedAt }));
}

export async function latestRunIdForProduct(db: Db, productId: number): Promise<number | null> {
  const [r] = await db
    .select({ runId: queryResults.runId })
    .from(queryResults)
    .where(eq(queryResults.productId, productId))
    .orderBy(desc(queryResults.id))
    .limit(1);
  return r?.runId ?? null;
}

export async function recordClick(db: Db, productId: number, referer: string | null) {
  await db.insert(clicks).values({ productId, referer });
}

export async function listWatchedQueries(db: Db, limit: number) {
  return db
    .select({ id: queries.id, original: queries.original, lastRunAt: queries.lastRunAt })
    .from(queries)
    .where(eq(queries.watched, true))
    .orderBy(sql`${queries.lastRunAt} asc nulls first`)
    .limit(limit);
}

export async function queriesWithRecentChange(db: Db, now: Date, hours = 24): Promise<Set<number>> {
  const since = new Date(now.getTime() - hours * 3600e3).toISOString();
  const found = await rows<{ query_id: number }>(
    db,
    sql`select distinct query_id from (
          select sr.query_id
          from search_runs sr join query_results qr on qr.run_id = sr.id
          where sr.started_at > ${since}::timestamptz
          group by sr.query_id, qr.product_id
          having count(distinct qr.price_cents) > 1
        ) t`,
  );
  return new Set(found.map((r) => Number(r.query_id)));
}

export interface Drop {
  productId: number;
  store: StoreId;
  title: string;
  imageUrl: string | null;
  nowCents: number;
  prevAvgCents: number;
  drop: number;
}

export async function topDrops(db: Db, now: Date, limit: number): Promise<Drop[]> {
  const day = new Date(now.getTime() - 24 * 3600e3).toISOString();
  const month = new Date(now.getTime() - 30 * 24 * 3600e3).toISOString();
  const found = await rows<{
    id: number; store: StoreId; title: string; image_url: string | null; now_min: number; prev_avg: number;
  }>(
    db,
    sql`with recent as (
          select product_id, min(price_cents)::float8 as now_min from price_observations
          where observed_at > ${day}::timestamptz group by product_id
        ), prev as (
          select product_id, avg(price_cents)::float8 as prev_avg from price_observations
          where observed_at <= ${day}::timestamptz and observed_at > ${month}::timestamptz group by product_id
        )
        select p.id, p.store, p.title, p.image_url, r.now_min, prev.prev_avg
        from recent r join prev on prev.product_id = r.product_id join products p on p.id = r.product_id
        where r.now_min < prev.prev_avg
        order by (prev.prev_avg - r.now_min) / prev.prev_avg desc
        limit ${limit}`,
  );
  return found.map((r) => ({
    productId: Number(r.id),
    store: r.store,
    title: r.title,
    imageUrl: r.image_url,
    nowCents: Math.round(Number(r.now_min)),
    prevAvgCents: Math.round(Number(r.prev_avg)),
    drop: (Number(r.prev_avg) - Number(r.now_min)) / Number(r.prev_avg),
  }));
}
```

`packages/db/src/index.ts`:
```ts
export * from "./client";
export * from "./repo";
export * as schema from "./schema";
```

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run packages/db`
Expected: PASS (5 testes).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json packages/db
git commit -m "feat(db): schema, migração e repositório com testes em PGlite"
```

---

### Task 7: Conectores por API (Mercado Livre, Amazon PA-API) e conectores demo

**Files:**
- Create: `packages/connectors/package.json`, `packages/connectors/tsconfig.json`
- Create: `packages/connectors/src/mercadolivre.ts`, `packages/connectors/src/amazon-paapi.ts`, `packages/connectors/src/demo.ts`
- Create: `packages/connectors/fixtures/mercadolivre-search.json`
- Test: `packages/connectors/test/mercadolivre.test.ts`, `packages/connectors/test/amazon-paapi.test.ts`, `packages/connectors/test/demo.test.ts`

**Interfaces:**
- Consumes: `Connector`, `ConnectorError`, `NormalizedQuery`, `Offer`, `normalizeQuery`, `STORES` (core).
- Produces:
  - `mercadoLivreConnector(opts?: { fetch?: typeof fetch; accessToken?: string }): Connector`
  - `amazonPaapiConnector(opts: { searchItems: SearchItemsFn }): Connector` e `paapiSearchItems(cfg: { accessKey: string; secretKey: string; partnerTag: string }): SearchItemsFn`, onde `type SearchItemsFn = (keywords: string, count: number) => Promise<PaapiItem[]>` e `PaapiItem = { ASIN: string; DetailPageURL: string; ItemInfo?: { Title?: { DisplayValue?: string } }; Offers?: { Listings?: { Price?: { Amount?: number } }[] }; Images?: { Primary?: { Medium?: { URL?: string } } } }`
  - `demoConnectors(): Connector[]` (mercadolivre, amazon, magalu; 3 ofertas determinísticas cada)

- [ ] **Step 1: Criar o pacote**

`packages/connectors/package.json`:
```json
{
  "name": "@buskativa/connectors",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit -p .",
    "smoke": "tsx scripts/smoke.ts"
  },
  "dependencies": { "@buskativa/core": "*" }
}
```

`packages/connectors/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2023", "DOM"] }, "include": ["src", "test", "scripts"] }
```

Run: `npm i -w @buskativa/connectors amazon-paapi`
Expected: instala sem erros.

- [ ] **Step 2: Escrever a fixture e os testes (falhando)**

`packages/connectors/fixtures/mercadolivre-search.json`:
```json
{
  "results": [
    {
      "id": "MLB111",
      "title": "Fone De Ouvido Bluetooth Jbl Tune 520bt Preto",
      "permalink": "https://produto.mercadolivre.com.br/MLB-111-fone-jbl",
      "price": 249.9,
      "thumbnail": "http://http2.mlstatic.com/D_111-I.jpg",
      "shipping": { "free_shipping": true },
      "seller": { "nickname": "LOJAOFICIALJBL" },
      "attributes": [
        { "id": "BRAND", "value_name": "JBL" },
        { "id": "COLOR", "value_name": "Preto" },
        { "id": "LINE", "value_name": null }
      ]
    },
    {
      "id": "MLB222",
      "title": "Fone Bluetooth Sem Fio I12",
      "permalink": "https://produto.mercadolivre.com.br/MLB-222-fone-i12",
      "price": 39.5,
      "thumbnail": "http://http2.mlstatic.com/D_222-I.jpg",
      "shipping": { "free_shipping": false },
      "seller": { "nickname": "IMPORTS" },
      "attributes": []
    }
  ]
}
```

`packages/connectors/test/mercadolivre.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { ConnectorError, normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { mercadoLivreConnector } from "../src/mercadolivre";

const fixture = readFileSync(new URL("../fixtures/mercadolivre-search.json", import.meta.url), "utf8");
const q = normalizeQuery("fone bluetooth");

describe("mercadoLivreConnector", () => {
  it("mapeia a resposta da API para Offer", async () => {
    let calledUrl = "";
    let auth: string | null = null;
    const c = mercadoLivreConnector({
      accessToken: "tok",
      fetch: async (url, init) => {
        calledUrl = String(url);
        auth = new Headers(init?.headers).get("authorization");
        return new Response(fixture, { status: 200 });
      },
    });
    const offers = await c.search(q, { limit: 10 });
    expect(calledUrl).toBe("https://api.mercadolibre.com/sites/MLB/search?q=fone%20bluetooth&limit=10");
    expect(auth).toBe("Bearer tok");
    expect(offers).toHaveLength(2);
    expect(offers[0]).toEqual({
      store: "mercadolivre",
      externalId: "MLB111",
      title: "Fone De Ouvido Bluetooth Jbl Tune 520bt Preto",
      url: "https://produto.mercadolivre.com.br/MLB-111-fone-jbl",
      price: 249.9,
      shipping: 0,
      currency: "BRL",
      imageUrl: "https://http2.mlstatic.com/D_111-I.jpg",
      sellerName: "LOJAOFICIALJBL",
      attributes: { brand: "JBL", color: "Preto" },
    });
    expect(offers[1].shipping).toBeNull();
  });

  it("403 vira BLOCKED e 500 vira NETWORK", async () => {
    const blocked = mercadoLivreConnector({ fetch: async () => new Response("", { status: 403 }) });
    await expect(blocked.search(q, { limit: 5 })).rejects.toMatchObject({ code: "BLOCKED" });
    const down = mercadoLivreConnector({ fetch: async () => new Response("", { status: 500 }) });
    await expect(down.search(q, { limit: 5 })).rejects.toBeInstanceOf(ConnectorError);
    await expect(down.search(q, { limit: 5 })).rejects.toMatchObject({ code: "NETWORK" });
  });
});
```

`packages/connectors/test/amazon-paapi.test.ts`:
```ts
import { normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { amazonPaapiConnector } from "../src/amazon-paapi";

describe("amazonPaapiConnector", () => {
  it("mapeia itens e ignora os sem preço", async () => {
    const c = amazonPaapiConnector({
      searchItems: async (keywords, count) => {
        expect(keywords).toBe("fone bluetooth");
        expect(count).toBe(5);
        return [
          {
            ASIN: "B0ABC",
            DetailPageURL: "https://www.amazon.com.br/dp/B0ABC?tag=x-20",
            ItemInfo: { Title: { DisplayValue: "Fone JBL" } },
            Offers: { Listings: [{ Price: { Amount: 199.9 } }] },
            Images: { Primary: { Medium: { URL: "https://m.media-amazon.com/i.jpg" } } },
          },
          { ASIN: "B0SEM", DetailPageURL: "https://www.amazon.com.br/dp/B0SEM", ItemInfo: { Title: { DisplayValue: "Sem preço" } } },
        ];
      },
    });
    const offers = await c.search(normalizeQuery("fone bluetooth"), { limit: 5 });
    expect(offers).toEqual([
      {
        store: "amazon",
        externalId: "B0ABC",
        title: "Fone JBL",
        url: "https://www.amazon.com.br/dp/B0ABC?tag=x-20",
        price: 199.9,
        shipping: null,
        currency: "BRL",
        imageUrl: "https://m.media-amazon.com/i.jpg",
        attributes: {},
      },
    ]);
  });
});
```

`packages/connectors/test/demo.test.ts`:
```ts
import { filterOffers, normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { demoConnectors } from "../src/demo";

describe("demoConnectors", () => {
  it("gera ofertas determinísticas que passam no filtro", async () => {
    const q = normalizeQuery("iPhone 15 128GB preto");
    const all = (await Promise.all(demoConnectors().map((c) => c.search(q, { limit: 10 })))).flat();
    expect(all).toHaveLength(9);
    expect(filterOffers(all, q)).toHaveLength(9);
    const again = await demoConnectors()[0].search(q, { limit: 10 });
    expect(again.map((o) => o.price)).toEqual(all.slice(0, 3).map((o) => o.price));
  });
});
```

Run: `npx vitest run packages/connectors`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar os conectores**

`packages/connectors/src/mercadolivre.ts`:
```ts
import { type Connector, ConnectorError, type Offer } from "@buskativa/core";

interface MlResult {
  id: string;
  title: string;
  permalink: string;
  price: number;
  thumbnail?: string;
  shipping?: { free_shipping?: boolean };
  seller?: { nickname?: string };
  attributes?: { id: string; value_name: string | null }[];
}

export function mercadoLivreConnector(opts: { fetch?: typeof fetch; accessToken?: string } = {}): Connector {
  const doFetch = opts.fetch ?? fetch;
  return {
    id: "mercadolivre",
    async search(q, { limit }) {
      const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q.termo)}&limit=${Math.min(limit, 50)}`;
      const headers: Record<string, string> = opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {};
      let res: Response;
      try {
        res = await doFetch(url, { headers });
      } catch (e) {
        throw new ConnectorError("NETWORK", String(e));
      }
      if ([401, 403, 429].includes(res.status)) throw new ConnectorError("BLOCKED", `HTTP ${res.status}`);
      if (!res.ok) throw new ConnectorError("NETWORK", `HTTP ${res.status}`);
      let body: { results?: MlResult[] };
      try {
        body = (await res.json()) as { results?: MlResult[] };
      } catch (e) {
        throw new ConnectorError("PARSE", String(e));
      }
      return (body.results ?? []).map(
        (r): Offer => ({
          store: "mercadolivre",
          externalId: r.id,
          title: r.title,
          url: r.permalink,
          price: r.price,
          shipping: r.shipping?.free_shipping ? 0 : null,
          currency: "BRL",
          imageUrl: r.thumbnail?.replace(/^http:/, "https:"),
          sellerName: r.seller?.nickname,
          attributes: Object.fromEntries(
            (r.attributes ?? [])
              .filter((a) => a.value_name)
              .map((a) => [a.id.toLowerCase(), a.value_name as string]),
          ),
        }),
      );
    },
  };
}
```

`packages/connectors/src/amazon-paapi.ts`:
```ts
import { type Connector, ConnectorError, type Offer } from "@buskativa/core";
// @ts-expect-error pacote sem tipos
import amazonPaapi from "amazon-paapi";

export interface PaapiItem {
  ASIN: string;
  DetailPageURL: string;
  ItemInfo?: { Title?: { DisplayValue?: string } };
  Offers?: { Listings?: { Price?: { Amount?: number } }[] };
  Images?: { Primary?: { Medium?: { URL?: string } } };
}
export type SearchItemsFn = (keywords: string, count: number) => Promise<PaapiItem[]>;

export function paapiSearchItems(cfg: { accessKey: string; secretKey: string; partnerTag: string }): SearchItemsFn {
  return async (keywords, count) => {
    const res = await amazonPaapi.SearchItems(
      {
        AccessKey: cfg.accessKey,
        SecretKey: cfg.secretKey,
        PartnerTag: cfg.partnerTag,
        PartnerType: "Associates",
        Marketplace: "www.amazon.com.br",
      },
      {
        Keywords: keywords,
        SearchIndex: "All",
        ItemCount: Math.min(count, 10),
        Resources: ["ItemInfo.Title", "Offers.Listings.Price", "Images.Primary.Medium"],
      },
    );
    return (res?.SearchResult?.Items ?? []) as PaapiItem[];
  };
}

export function amazonPaapiConnector(opts: { searchItems: SearchItemsFn }): Connector {
  return {
    id: "amazon",
    async search(q, { limit }) {
      let items: PaapiItem[];
      try {
        items = await opts.searchItems(q.termo, limit);
      } catch (e) {
        const msg = String(e);
        throw new ConnectorError(/429|TooManyRequests|Unauthorized|403/i.test(msg) ? "BLOCKED" : "NETWORK", msg);
      }
      return items.flatMap((it): Offer[] => {
        const price = it.Offers?.Listings?.[0]?.Price?.Amount;
        const title = it.ItemInfo?.Title?.DisplayValue;
        if (price === undefined || !title) return [];
        return [
          {
            store: "amazon",
            externalId: it.ASIN,
            title,
            url: it.DetailPageURL,
            price,
            shipping: null,
            currency: "BRL",
            imageUrl: it.Images?.Primary?.Medium?.URL,
            attributes: {},
          },
        ];
      });
    },
  };
}
```

`packages/connectors/src/demo.ts`:
```ts
import { type Connector, type Offer, STORES, type StoreId } from "@buskativa/core";

const DEMO_STORES: StoreId[] = ["mercadolivre", "amazon", "magalu"];

function seed(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return h;
}

/** Conectores falsos e determinísticos, para desenvolvimento local e E2E (CONNECTORS=demo). */
export function demoConnectors(): Connector[] {
  return DEMO_STORES.map((store, s) => ({
    id: store,
    async search(q) {
      const base = 100 + seed(q.termo);
      return [1, 2, 3].map(
        (n): Offer => ({
          store,
          externalId: `demo-${store}-${seed(q.termo)}-${n}`,
          title: `${q.original} - Oferta ${n}`,
          url: `https://www.${STORES[store].domains[0]}/demo-${seed(q.termo)}-${n}`,
          price: base + s * 10 + n * 5,
          shipping: n === 1 ? 0 : null,
          currency: "BRL",
          attributes: {},
        }),
      );
    },
  }));
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run packages/connectors`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json packages/connectors
git commit -m "feat(connectors): Mercado Livre, Amazon PA-API e conectores demo"
```

---

### Task 8: Conectores por navegador (Playwright + parsers)

**Files:**
- Create: `packages/connectors/src/limiter.ts`, `packages/connectors/src/browser.ts`, `packages/connectors/src/parse.ts`, `packages/connectors/src/browser-stores.ts`, `packages/connectors/src/browser-connector.ts`, `packages/connectors/src/index.ts`
- Create: `packages/connectors/fixtures/amazon-search.html`, `packages/connectors/fixtures/jsonld-itemlist.html`, `packages/connectors/fixtures/anchors-magalu.html`
- Create: `packages/connectors/scripts/smoke.ts`
- Test: `packages/connectors/test/limiter.test.ts`, `packages/connectors/test/parse.test.ts`, `packages/connectors/test/browser-connector.test.ts`

**Interfaces:**
- Consumes: core (`Connector`, `ConnectorError`, `Offer`, `StoreId`, `NormalizedQuery`, `parseBRL`), Task 7.
- Produces:
  - `createLimiter(concurrency: number, minIntervalMs: number): <T>(fn: () => Promise<T>) => Promise<T>`
  - `fetchRendered(url: string, timeoutMs?: number): Promise<string>`; `closeBrowser(): Promise<void>`
  - `parseJsonLd(html, store, baseUrl): Offer[]`; `parseAnchors(html, store, baseUrl, linkPattern: RegExp): Offer[]`; `parseGeneric(html, cfg: { store; baseUrl; linkPattern }): Offer[]`; `parseAmazon(html, baseUrl): Offer[]`
  - `BROWSER_STORES: Record<BrowserStoreId, BrowserStoreConfig>` com `BrowserStoreConfig = { buildUrl(q: NormalizedQuery): string; parse(html: string, url: string): Offer[]; experimental?: boolean }` e `BrowserStoreId = "amazon" | "magalu" | "shopee" | "aliexpress" | "tiktokshop" | "kwaishop"`
  - `browserConnector(id: BrowserStoreId, cfg: BrowserStoreConfig, deps?: { fetchHtml?: (url: string) => Promise<string>; limiter?: Limiter }): Connector`
  - `createConnectors(env: Record<string, string | undefined>): Connector[]`

- [ ] **Step 1: Instalar Playwright e cheerio**

Run: `npm i -w @buskativa/connectors playwright cheerio && npx playwright install chromium`
Expected: instala e baixa o Chromium.

- [ ] **Step 2: Teste do limitador (falhando)**

`packages/connectors/test/limiter.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createLimiter } from "../src/limiter";

describe("createLimiter", () => {
  it("respeita concorrência e intervalo mínimo", async () => {
    const limit = createLimiter(1, 100);
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    const task = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        starts.push(Date.now());
        await new Promise((r) => setTimeout(r, 20));
        active--;
      });
    await Promise.all([task(), task(), task()]);
    expect(maxActive).toBe(1);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(95);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(95);
  });

  it("libera a vaga mesmo quando a tarefa falha", async () => {
    const limit = createLimiter(1, 0);
    await expect(limit(async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(limit(async () => 42)).resolves.toBe(42);
  });
});
```

Run: `npx vitest run packages/connectors/test/limiter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `limiter.ts`**

`packages/connectors/src/limiter.ts`:
```ts
export type Limiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLimiter(concurrency: number, minIntervalMs: number): Limiter {
  let active = 0;
  let nextStart = 0;
  const waiting: (() => void)[] = [];

  async function acquire() {
    if (active < concurrency) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve)); // a vaga é repassada por release()
    const startAt = Math.max(Date.now(), nextStart);
    nextStart = startAt + minIntervalMs;
    const wait = startAt - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  function release() {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }

  return async (fn) => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
```

Run: `npx vitest run packages/connectors/test/limiter.test.ts`
Expected: PASS.

- [ ] **Step 4: Fixtures e teste dos parsers (falhando)**

`packages/connectors/fixtures/amazon-search.html`:
```html
<html><body>
<div data-component-type="s-search-result" data-asin="B0AAA111">
  <img class="s-image" src="https://m.media-amazon.com/images/I/aaa.jpg">
  <h2><a class="a-link-normal" href="/JBL-Tune-520BT/dp/B0AAA111/ref=sr_1_1"><span>Fone de Ouvido JBL Tune 520BT Bluetooth Preto</span></a></h2>
  <span class="a-price"><span class="a-offscreen">R$ 249,90</span></span>
</div>
<div data-component-type="s-search-result" data-asin="B0BBB222">
  <img class="s-image" src="https://m.media-amazon.com/images/I/bbb.jpg">
  <h2><span>Fone Bluetooth QCY T13</span></h2>
  <a class="a-link-normal s-link-style" href="/QCY-T13/dp/B0BBB222">ver</a>
  <span class="a-price"><span class="a-offscreen">R$ 1.099,00</span></span>
</div>
<div data-component-type="s-search-result" data-asin="B0SEMPRECO">
  <h2><a href="/x/dp/B0SEMPRECO"><span>Produto indisponível</span></a></h2>
</div>
<div data-component-type="s-search-result" data-asin="">
  <h2><span>Anúncio patrocinado sem ASIN</span></h2>
</div>
</body></html>
```

`packages/connectors/fixtures/jsonld-itemlist.html`:
```html
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
  {"@type":"ListItem","position":1,"item":{"@type":"Product","name":"Air Fryer Mondial 4L","sku":"AF-1","url":"/p/af1/","image":["https://img.example/af1.jpg"],"offers":{"@type":"Offer","price":"299.90","priceCurrency":"BRL"}}},
  {"@type":"ListItem","position":2,"item":{"@type":"Product","name":"Air Fryer Philco 5L","url":"https://www.magazineluiza.com.br/p/af2/","offers":{"@type":"AggregateOffer","lowPrice":349,"priceCurrency":"BRL"}}},
  {"@type":"ListItem","position":3,"item":{"@type":"Product","name":"Sem preço","url":"/p/af3/"}}
]}
</script>
<script type="application/ld+json">{ isto não é json }</script>
</head><body></body></html>
```

`packages/connectors/fixtures/anchors-magalu.html`:
```html
<html><body><ul>
<li><div class="card">
  <a href="/fone-de-ouvido-jbl/p/237896300/ea/fone/"><img src="https://a-static.mlcdn.com.br/jbl.jpg" alt="Fone de Ouvido JBL Tune 520BT"></a>
  <div><p>de R$ 399,00</p><p>R$ 279,90 no Pix</p></div>
</div></li>
<li><div class="card">
  <a href="/caixa-de-som-go3/p/abc123def/ea/caix/" title="Caixa de Som JBL Go 3">Caixa</a>
  <span>R$ 199,00</span>
</div></li>
<li><div class="card"><a href="/institucional/sobre/">Sobre nós</a></div></li>
<li><div class="card"><a href="/fone-de-ouvido-jbl/p/237896300/ea/fone/">duplicado</a><span>R$ 279,90</span></div></li>
</ul></body></html>
```

`packages/connectors/test/parse.test.ts`:
```ts
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
      price: 399,
      imageUrl: "https://a-static.mlcdn.com.br/jbl.jpg",
    });
    expect(offers[1]).toMatchObject({ externalId: "abc123def", title: "Caixa de Som JBL Go 3", price: 199 });
  });
});

describe("parseGeneric", () => {
  it("prefere JSON-LD e cai para links quando não há JSON-LD", () => {
    const cfg = { store: "magalu" as const, baseUrl: "https://www.magazineluiza.com.br/", linkPattern: /\/p\/([a-z0-9]+)\//i };
    expect(parseGeneric(fx("jsonld-itemlist.html"), cfg)).toHaveLength(2);
    expect(parseGeneric(fx("anchors-magalu.html"), cfg)).toHaveLength(2);
  });
});
```

Nota: no primeiro card da fixture de links, o primeiro preço do texto é "de R$ 399,00" (preço antigo). O parser genérico pega o primeiro preço do card; isso é um limite conhecido e fica coberto pelo teste para que mudanças sejam conscientes. Os parsers específicos por loja, ajustados no smoke test (Step 9), devem escolher o preço atual.

Run: `npx vitest run packages/connectors/test/parse.test.ts`
Expected: FAIL.

- [ ] **Step 5: Implementar `parse.ts`**

`packages/connectors/src/parse.ts`:
```ts
import { type Offer, parseBRL, type StoreId } from "@buskativa/core";
import * as cheerio from "cheerio";

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
    for (let i = 0; i < 5 && card.length && parseBRL(card.text()) === null; i++) card = card.parent();
    const price = parseBRL(card.text());
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
```

Run: `npx vitest run packages/connectors/test/parse.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Implementar navegador, configuração das lojas e conector**

`packages/connectors/src/browser.ts`:
```ts
import { ConnectorError } from "@buskativa/core";
import { type Browser, chromium } from "playwright";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ headless: true });
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise;
  browserPromise = null;
  await b.close();
}

const BLOCK_TEXT = /captcha|não sou um robô|nao sou um robo|verifique se você é humano|robot check|unusual traffic|acesso negado/i;
const LOGIN_URL = /\/(login|signin|buyer\/login)/i;

export async function fetchRendered(url: string, timeoutMs = 30000): Promise<string> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1366, height: 900 },
  });
  try {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (e) {
      throw new ConnectorError(/timeout/i.test(String(e)) ? "TIMEOUT" : "NETWORK", String(e));
    }
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    if (LOGIN_URL.test(page.url())) throw new ConnectorError("BLOCKED", `redirecionado para login: ${page.url()}`);
    const visible = await page.innerText("body").catch(() => "");
    if (BLOCK_TEXT.test(visible)) throw new ConnectorError("BLOCKED", "página de verificação/CAPTCHA");
    return await page.content();
  } finally {
    await ctx.close();
  }
}
```

`packages/connectors/src/browser-stores.ts`:
```ts
import type { NormalizedQuery, Offer } from "@buskativa/core";
import { parseAmazon, parseGeneric } from "./parse";

export type BrowserStoreId = "amazon" | "magalu" | "shopee" | "aliexpress" | "tiktokshop" | "kwaishop";

export interface BrowserStoreConfig {
  buildUrl(q: NormalizedQuery): string;
  parse(html: string, url: string): Offer[];
  experimental?: boolean;
}

const enc = encodeURIComponent;
const plus = (s: string) => s.split(" ").map(enc).join("+");

export const BROWSER_STORES: Record<BrowserStoreId, BrowserStoreConfig> = {
  amazon: {
    buildUrl: (q) => `https://www.amazon.com.br/s?k=${plus(q.termo)}`,
    parse: (html, url) => parseAmazon(html, url),
  },
  magalu: {
    buildUrl: (q) => `https://www.magazineluiza.com.br/busca/${plus(q.termo)}/`,
    parse: (html, url) => parseGeneric(html, { store: "magalu", baseUrl: url, linkPattern: /\/p\/([a-z0-9]+)\//i }),
  },
  shopee: {
    buildUrl: (q) => `https://shopee.com.br/search?keyword=${enc(q.termo)}`,
    parse: (html, url) => parseGeneric(html, { store: "shopee", baseUrl: url, linkPattern: /-i\.(\d+\.\d+)/ }),
  },
  aliexpress: {
    buildUrl: (q) => `https://pt.aliexpress.com/w/wholesale-${q.termo.split(" ").map(enc).join("-")}.html`,
    parse: (html, url) => parseGeneric(html, { store: "aliexpress", baseUrl: url, linkPattern: /\/item\/(\d+)\.html/ }),
  },
  tiktokshop: {
    experimental: true,
    buildUrl: (q) => `https://www.tiktok.com/shop/s/${enc(q.termo)}`,
    parse: (html, url) => parseGeneric(html, { store: "tiktokshop", baseUrl: url, linkPattern: /\/shop\/pdp\/[^/?]+\/(\d+)/ }),
  },
  kwaishop: {
    experimental: true,
    buildUrl: (q) => `https://www.kwai.com/search?keyword=${enc(q.termo)}`,
    parse: (html, url) => parseGeneric(html, { store: "kwaishop", baseUrl: url, linkPattern: /\/(?:product|item)\/(\d+)/ }),
  },
};
```

`packages/connectors/src/browser-connector.ts`:
```ts
import type { Connector } from "@buskativa/core";
import { fetchRendered } from "./browser";
import type { BrowserStoreConfig, BrowserStoreId } from "./browser-stores";
import { createLimiter, type Limiter } from "./limiter";

export function browserConnector(
  id: BrowserStoreId,
  cfg: BrowserStoreConfig,
  deps: { fetchHtml?: (url: string) => Promise<string>; limiter?: Limiter } = {},
): Connector {
  const fetchHtml = deps.fetchHtml ?? ((url: string) => fetchRendered(url));
  const limit = deps.limiter ?? createLimiter(1, 5000);
  return {
    id,
    experimental: cfg.experimental,
    async search(q, { limit: max }) {
      const url = cfg.buildUrl(q);
      const html = await limit(() => fetchHtml(url));
      return cfg.parse(html, url).slice(0, max);
    },
  };
}
```

`packages/connectors/src/index.ts`:
```ts
import type { Connector } from "@buskativa/core";
import { amazonPaapiConnector, paapiSearchItems } from "./amazon-paapi";
import { browserConnector } from "./browser-connector";
import { BROWSER_STORES } from "./browser-stores";
import { demoConnectors } from "./demo";
import { mercadoLivreConnector } from "./mercadolivre";

export { closeBrowser } from "./browser";
export { demoConnectors } from "./demo";

export function createConnectors(env: Record<string, string | undefined>): Connector[] {
  if (env.CONNECTORS === "demo") return demoConnectors();
  const list: Connector[] = [mercadoLivreConnector({ accessToken: env.ML_ACCESS_TOKEN })];
  list.push(
    env.AMAZON_PAAPI_ACCESS_KEY && env.AMAZON_PAAPI_SECRET_KEY && env.AMAZON_PAAPI_PARTNER_TAG
      ? amazonPaapiConnector({
          searchItems: paapiSearchItems({
            accessKey: env.AMAZON_PAAPI_ACCESS_KEY,
            secretKey: env.AMAZON_PAAPI_SECRET_KEY,
            partnerTag: env.AMAZON_PAAPI_PARTNER_TAG,
          }),
        })
      : browserConnector("amazon", BROWSER_STORES.amazon),
  );
  for (const id of ["magalu", "shopee", "aliexpress", "tiktokshop"] as const) {
    list.push(browserConnector(id, BROWSER_STORES[id]));
  }
  if (env.KWAI_ENABLED === "true") list.push(browserConnector("kwaishop", BROWSER_STORES.kwaishop));
  return list;
}
```

- [ ] **Step 7: Teste do conector de navegador e de `createConnectors`**

`packages/connectors/test/browser-connector.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { browserConnector } from "../src/browser-connector";
import { BROWSER_STORES } from "../src/browser-stores";
import { createConnectors } from "../src/index";
import { createLimiter } from "../src/limiter";

const html = readFileSync(new URL("../fixtures/amazon-search.html", import.meta.url), "utf8");

describe("browserConnector", () => {
  it("monta a URL da loja, busca o HTML e aplica o limite", async () => {
    let requested = "";
    const c = browserConnector("amazon", BROWSER_STORES.amazon, {
      fetchHtml: async (url) => {
        requested = url;
        return html;
      },
      limiter: createLimiter(1, 0),
    });
    const offers = await c.search(normalizeQuery("Fone Bluetooth"), { limit: 1 });
    expect(requested).toBe("https://www.amazon.com.br/s?k=fone+bluetooth");
    expect(offers).toHaveLength(1);
  });
});

describe("createConnectors", () => {
  it("modo demo e modo real", () => {
    expect(createConnectors({ CONNECTORS: "demo" }).map((c) => c.id)).toEqual(["mercadolivre", "amazon", "magalu"]);
    expect(createConnectors({}).map((c) => c.id)).toEqual([
      "mercadolivre", "amazon", "magalu", "shopee", "aliexpress", "tiktokshop",
    ]);
    expect(createConnectors({ KWAI_ENABLED: "true" }).map((c) => c.id)).toContain("kwaishop");
  });
});
```

Run: `npx vitest run packages/connectors`
Expected: PASS (todos os testes do pacote).

- [ ] **Step 8: Script de smoke test ao vivo**

`packages/connectors/scripts/smoke.ts`:
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { normalizeQuery } from "@buskativa/core";
import { closeBrowser, fetchRendered } from "../src/browser";
import { BROWSER_STORES, type BrowserStoreId } from "../src/browser-stores";
import { mercadoLivreConnector } from "../src/mercadolivre";

const [store, ...rest] = process.argv.slice(2);
const q = normalizeQuery(rest.join(" ") || "fone bluetooth");

try {
  if (store === "mercadolivre") {
    const offers = await mercadoLivreConnector({ accessToken: process.env.ML_ACCESS_TOKEN }).search(q, { limit: 10 });
    console.log(`${offers.length} ofertas`, offers.slice(0, 3));
  } else {
    const cfg = BROWSER_STORES[store as BrowserStoreId];
    if (!cfg) throw new Error(`loja desconhecida: ${store}`);
    const url = cfg.buildUrl(q);
    const html = await fetchRendered(url);
    mkdirSync(new URL("../fixtures/live/", import.meta.url), { recursive: true });
    writeFileSync(new URL(`../fixtures/live/${store}.html`, import.meta.url), html);
    const offers = cfg.parse(html, url);
    console.log(`${url}\n${offers.length} ofertas`, offers.slice(0, 3));
  }
} finally {
  await closeBrowser();
}
```

- [ ] **Step 9: Rodar o smoke test em cada loja (manual, fora do CI)**

Run, uma de cada vez:
```bash
npm run smoke -w @buskativa/connectors -- mercadolivre fone bluetooth
npm run smoke -w @buskativa/connectors -- amazon fone bluetooth
npm run smoke -w @buskativa/connectors -- magalu fone bluetooth
npm run smoke -w @buskativa/connectors -- shopee fone bluetooth
npm run smoke -w @buskativa/connectors -- aliexpress fone bluetooth
npm run smoke -w @buskativa/connectors -- tiktokshop fone bluetooth
```
Expected: para cada loja, ou `N ofertas` com N > 0 e títulos/preços corretos, ou um `ConnectorError` com `BLOCKED`.

Se uma loja devolver 0 ofertas sem `BLOCKED`, abra `packages/connectors/fixtures/live/<loja>.html`, encontre o card de produto e escreva um parser específico `parse<Loja>(html, baseUrl)` em `parse.ts`, no mesmo formato de `parseAmazon`. Copie um trecho mínimo do HTML real para `fixtures/<loja>-search.html`, adicione um teste em `parse.test.ts` e troque o `parse` da loja em `browser-stores.ts`. Registre no `README.md` (Task 14) quais lojas ficaram `BLOCKED`. Se o Mercado Livre devolver 403, é preciso configurar `ML_ACCESS_TOKEN`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json packages/connectors
git commit -m "feat(connectors): conectores Playwright com parsers JSON-LD, links e Amazon"
```

---

### Task 9: Fila (pacote queue) e execução da busca no worker

**Files:**
- Create: `packages/queue/package.json`, `packages/queue/tsconfig.json`, `packages/queue/src/index.ts`
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/run-search.ts`
- Test: `apps/worker/test/run-search.test.ts`

**Interfaces:**
- Consumes: core (`normalizeQuery`, `filterOffers`, `Connector`, `ConnectorError`, `Offer`, `NormalizedQuery`); db (`Db`, `upsertQuery`, `createRun`, `saveOffers`, `updateRunStoreStatus`, `finishRun`, `getRunWithResults`, `createTestDb`).
- Produces:
  - queue: `QUEUE_NAME = "search"`; `interface SearchJob { text: string; runId?: number }`; `redisConnection(url: string): ConnectionOptions`; `createSearchQueue(conn): Queue<SearchJob>`; `enqueueSearch(queue, job: SearchJob): Promise<void>`
  - worker: `runConnector(c: Connector, q: NormalizedQuery, limit: number, opts?: { retries?: number; baseDelayMs?: number; timeoutMs?: number }): Promise<Offer[]>`; `runSearch(deps: { db: Db; connectors: Connector[]; limit?: number; retryDelayMs?: number }, text: string, runId?: number): Promise<number>`

- [ ] **Step 1: Criar o pacote `queue`**

`packages/queue/package.json`:
```json
{
  "name": "@buskativa/queue",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p ." },
  "dependencies": { "@buskativa/core": "*" }
}
```

`packages/queue/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/queue/src/index.ts`:
```ts
import { normalizeQuery } from "@buskativa/core";
import { type ConnectionOptions, Queue } from "bullmq";

export const QUEUE_NAME = "search";

export interface SearchJob {
  text: string;
  runId?: number;
}

export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function createSearchQueue(connection: ConnectionOptions): Queue<SearchJob> {
  return new Queue<SearchJob>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
  });
}

/** O jobId evita enfileirar a mesma consulta mais de uma vez na mesma janela de 10 min. */
export async function enqueueSearch(queue: Queue<SearchJob>, job: SearchJob): Promise<void> {
  const jobId = job.runId
    ? `run-${job.runId}`
    : `q-${normalizeQuery(job.text).hash}-${Math.floor(Date.now() / 600_000)}`;
  await queue.add("search", job, { jobId });
}
```

Run: `npm i -w @buskativa/queue bullmq`
Expected: instala sem erros.

- [ ] **Step 2: Criar o app worker**

`apps/worker/package.json`:
```json
{
  "name": "@buskativa/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit -p .",
    "start": "node --env-file-if-exists=../../.env --import tsx src/main.ts"
  },
  "dependencies": {
    "@buskativa/core": "*",
    "@buskativa/db": "*",
    "@buskativa/connectors": "*",
    "@buskativa/queue": "*"
  }
}
```

`apps/worker/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Run: `npm i -w @buskativa/worker pino bullmq`
Expected: instala sem erros.

- [ ] **Step 3: Escrever o teste de `runSearch` (falhando)**

`apps/worker/test/run-search.test.ts`:
```ts
import { type Connector, ConnectorError, type Offer } from "@buskativa/core";
import { getRunWithResults } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { runConnector, runSearch } from "../src/run-search";

const offer = (over: Partial<Offer>): Offer => ({
  store: "mercadolivre",
  externalId: "1",
  title: "Fone Bluetooth X",
  url: "https://www.mercadolivre.com.br/p/1",
  price: 100,
  shipping: null,
  currency: "BRL",
  attributes: {},
  ...over,
});

describe("runConnector", () => {
  it("repete erro de rede e não repete BLOCKED", async () => {
    let calls = 0;
    const flaky: Connector = {
      id: "magalu",
      async search() {
        calls++;
        if (calls < 3) throw new ConnectorError("NETWORK", "falhou");
        return [offer({ store: "magalu" })];
      },
    };
    await expect(runConnector(flaky, {} as never, 10, { baseDelayMs: 1 })).resolves.toHaveLength(1);
    expect(calls).toBe(3);

    let blockedCalls = 0;
    const blocked: Connector = {
      id: "shopee",
      async search() {
        blockedCalls++;
        throw new ConnectorError("BLOCKED", "captcha");
      },
    };
    await expect(runConnector(blocked, {} as never, 10, { baseDelayMs: 1 })).rejects.toMatchObject({ code: "BLOCKED" });
    expect(blockedCalls).toBe(1);
  });

  it("estoura TIMEOUT quando a loja demora demais", async () => {
    const slow: Connector = { id: "amazon", search: () => new Promise(() => {}) };
    await expect(runConnector(slow, {} as never, 10, { retries: 1, timeoutMs: 20 })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });
});

describe("runSearch", () => {
  it("roda as lojas em paralelo, grava ofertas filtradas e o status por loja", async () => {
    const db = await createTestDb();
    const connectors: Connector[] = [
      {
        id: "mercadolivre",
        async search() {
          return [
            offer({ externalId: "a", price: 120 }),
            offer({ externalId: "b", price: 90 }),
            offer({ externalId: "golpe", url: "https://golpe.com/x" }),
          ];
        },
      },
      {
        id: "shopee",
        async search() {
          throw new ConnectorError("BLOCKED", "captcha");
        },
      },
      {
        id: "magalu",
        async search() {
          throw new Error("erro inesperado");
        },
      },
    ];
    const runId = await runSearch({ db, connectors, retryDelayMs: 1 }, "fone bluetooth");
    const run = await getRunWithResults(db, runId);
    expect(run!.status).toBe("done");
    expect(run!.results.map((r) => r.priceCents)).toEqual([9000, 12000]);
    expect(run!.storeStatus.mercadolivre).toEqual({ ok: true, count: 2 });
    expect(run!.storeStatus.shopee).toMatchObject({ ok: false, error: "BLOCKED" });
    expect(run!.storeStatus.magalu).toMatchObject({ ok: false, error: "NETWORK" });
  });
});
```

Run: `npx vitest run apps/worker`
Expected: FAIL (`../src/run-search` não existe).

- [ ] **Step 4: Implementar `run-search.ts`**

`apps/worker/src/run-search.ts`:
```ts
import { type Connector, ConnectorError, filterOffers, type NormalizedQuery, normalizeQuery, type Offer } from "@buskativa/core";
import { createRun, type Db, finishRun, saveOffers, updateRunStoreStatus, upsertQuery } from "@buskativa/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ConnectorError("TIMEOUT", `sem resposta em ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const asConnectorError = (e: unknown) => (e instanceof ConnectorError ? e : new ConnectorError("NETWORK", String(e)));

export async function runConnector(
  c: Connector,
  q: NormalizedQuery,
  limit: number,
  opts: { retries?: number; baseDelayMs?: number; timeoutMs?: number } = {},
): Promise<Offer[]> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 45000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTimeout(c.search(q, { limit }), timeoutMs);
    } catch (e) {
      const err = asConnectorError(e);
      if (err.code === "BLOCKED" || err.code === "PARSE" || attempt >= retries) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

export async function runSearch(
  deps: { db: Db; connectors: Connector[]; limit?: number; retryDelayMs?: number },
  text: string,
  runId?: number,
): Promise<number> {
  const nq = normalizeQuery(text);
  const query = await upsertQuery(deps.db, nq);
  const id = runId ?? (await createRun(deps.db, query.id));

  await Promise.allSettled(
    deps.connectors.map(async (c) => {
      try {
        const raw = await runConnector(c, nq, deps.limit ?? 20, { baseDelayMs: deps.retryDelayMs });
        const offers = filterOffers(raw, nq);
        await saveOffers(deps.db, id, offers);
        await updateRunStoreStatus(deps.db, id, c.id, { ok: true, count: offers.length });
      } catch (e) {
        const err = asConnectorError(e);
        await updateRunStoreStatus(deps.db, id, c.id, { ok: false, error: err.code, message: err.message.slice(0, 200) });
      }
    }),
  );

  await finishRun(deps.db, id);
  return id;
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run apps/worker`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/queue apps/worker
git commit -m "feat(worker): fila BullMQ e execução de busca com retry e status por loja"
```

---

### Task 10: Agendador 24h e processo do worker

**Files:**
- Create: `apps/worker/src/scheduler.ts`, `apps/worker/src/main.ts`, `apps/worker/seed/trending.json`
- Create: `docker-compose.yml`, `.env.example`
- Test: `apps/worker/test/scheduler.test.ts`

**Interfaces:**
- Consumes: `normalizeQuery` (core); `Db`, `listWatchedQueries`, `queriesWithRecentChange`, `createDb`, `migrateDb` (db); `createConnectors`, `closeBrowser` (connectors); `QUEUE_NAME`, `SearchJob`, `redisConnection`, `createSearchQueue`, `enqueueSearch` (queue); `runSearch` (Task 9).
- Produces: `pickStartupQueries(watched: string[], trending: string[], n?: number): string[]`; `isDue(lastRunAt: Date | null, recentlyChanged: boolean, now: Date, baseMin?: number, fastMin?: number): boolean`; `dueQueries(db: Db, now: Date, cfg?: { baseMin?: number; fastMin?: number }): Promise<string[]>`.

- [ ] **Step 1: Escrever o teste (falhando)**

`apps/worker/test/scheduler.test.ts`:
```ts
import { normalizeQuery } from "@buskativa/core";
import { createRun, finishRun, upsertQuery } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { dueQueries, isDue, pickStartupQueries } from "../src/scheduler";

describe("pickStartupQueries", () => {
  it("prioriza vigiadas, remove duplicadas e limita a 20", () => {
    const trending = Array.from({ length: 30 }, (_, i) => `produto ${i}`);
    const picked = pickStartupQueries(["fone bluetooth", "Bluetooth Fone"], ["FONE BLUETOOTH", ...trending]);
    expect(picked).toHaveLength(20);
    expect(picked[0]).toBe("fone bluetooth");
    expect(picked.filter((p) => normalizeQuery(p).hash === normalizeQuery("fone bluetooth").hash)).toHaveLength(1);
  });
});

describe("isDue", () => {
  const now = new Date("2026-05-01T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60e3);
  it("nunca executada está vencida", () => expect(isDue(null, false, now)).toBe(true));
  it("60 min normal, 30 min com variação", () => {
    expect(isDue(ago(45), false, now)).toBe(false);
    expect(isDue(ago(60), false, now)).toBe(true);
    expect(isDue(ago(30), true, now)).toBe(true);
    expect(isDue(ago(20), true, now)).toBe(false);
  });
});

describe("dueQueries", () => {
  it("lista só as consultas vencidas", async () => {
    const db = await createTestDb();
    const now = new Date();
    const a = await upsertQuery(db, normalizeQuery("fone bluetooth"));
    const r = await createRun(db, a.id);
    await finishRun(db, r, new Date(now.getTime() - 10 * 60e3));
    await upsertQuery(db, normalizeQuery("air fryer"));
    expect(await dueQueries(db, now)).toEqual(["air fryer"]);
  });
});
```

Run: `npx vitest run apps/worker/test/scheduler.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar `scheduler.ts`**

`apps/worker/src/scheduler.ts`:
```ts
import { normalizeQuery } from "@buskativa/core";
import { type Db, listWatchedQueries, queriesWithRecentChange } from "@buskativa/db";

export function pickStartupQueries(watched: string[], trending: string[], n = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of [...watched, ...trending]) {
    const hash = normalizeQuery(text).hash;
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push(text);
    if (out.length === n) break;
  }
  return out;
}

export function isDue(lastRunAt: Date | null, recentlyChanged: boolean, now: Date, baseMin = 60, fastMin = 30): boolean {
  if (!lastRunAt) return true;
  const interval = (recentlyChanged ? fastMin : baseMin) * 60e3;
  return now.getTime() - lastRunAt.getTime() >= interval;
}

export async function dueQueries(db: Db, now: Date, cfg: { baseMin?: number; fastMin?: number } = {}): Promise<string[]> {
  const watched = await listWatchedQueries(db, 500);
  const changed = await queriesWithRecentChange(db, now);
  return watched
    .filter((q) => isDue(q.lastRunAt, changed.has(q.id), now, cfg.baseMin, cfg.fastMin))
    .map((q) => q.original);
}
```

Run: `npx vitest run apps/worker`
Expected: PASS.

- [ ] **Step 3: Lista inicial de produtos populares**

`apps/worker/seed/trending.json`:
```json
[
  "iphone 15 128gb",
  "samsung galaxy s24",
  "redmi note 13",
  "fone bluetooth jbl",
  "airpods",
  "smart tv 50 polegadas",
  "air fryer",
  "notebook dell inspiron",
  "playstation 5",
  "nintendo switch",
  "smartwatch",
  "cafeteira expresso",
  "aspirador robo",
  "caixa de som bluetooth",
  "monitor gamer 27",
  "tenis nike",
  "kindle",
  "ssd 1tb",
  "teclado mecanico",
  "geladeira frost free"
]
```

- [ ] **Step 4: Processo principal do worker**

`apps/worker/src/main.ts`:
```ts
import { readFileSync } from "node:fs";
import { closeBrowser, createConnectors } from "@buskativa/connectors";
import { createDb, listWatchedQueries, migrateDb } from "@buskativa/db";
import { createSearchQueue, enqueueSearch, QUEUE_NAME, redisConnection, type SearchJob } from "@buskativa/queue";
import { Worker } from "bullmq";
import pino from "pino";
import { runSearch } from "./run-search";
import { dueQueries, pickStartupQueries } from "./scheduler";

const log = pino({ name: "buskativa-worker" });
const env = process.env;
if (!env.DATABASE_URL || !env.REDIS_URL) throw new Error("DATABASE_URL e REDIS_URL são obrigatórias");

const { db, pool } = createDb(env.DATABASE_URL);
await migrateDb(db);

const connection = redisConnection(env.REDIS_URL);
const connectors = createConnectors(env);
const queue = createSearchQueue(connection);
const baseMin = Number(env.SEARCH_INTERVAL_MIN ?? 60);
const fastMin = Number(env.SEARCH_FAST_INTERVAL_MIN ?? 30);

const worker = new Worker<SearchJob>(
  QUEUE_NAME,
  async (job) => {
    const runId = await runSearch({ db, connectors }, job.data.text, job.data.runId);
    log.info({ runId, text: job.data.text }, "busca concluída");
  },
  { connection, concurrency: Number(env.WORKER_CONCURRENCY ?? 3) },
);
worker.on("failed", (job, err) => log.error({ err, text: job?.data.text }, "job falhou"));

const trending: string[] = JSON.parse(readFileSync(new URL("../seed/trending.json", import.meta.url), "utf8"));
const watched = (await listWatchedQueries(db, 20)).map((q) => q.original);
const startup = pickStartupQueries(watched, trending, 20);
for (const text of startup) await enqueueSearch(queue, { text });
log.info({ count: startup.length, stores: connectors.map((c) => c.id) }, "worker ativo: buscas iniciais enfileiradas");

async function tick() {
  const due = await dueQueries(db, new Date(), { baseMin, fastMin });
  for (const text of due) await enqueueSearch(queue, { text });
  if (due.length) log.info({ count: due.length }, "buscas recorrentes enfileiradas");
}
const timer = setInterval(() => tick().catch((err) => log.error({ err }, "falha no agendador")), 5 * 60e3);

async function shutdown() {
  clearInterval(timer);
  await worker.close();
  await queue.close();
  await closeBrowser();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

- [ ] **Step 5: Infra local e variáveis de ambiente**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: buskativa
      POSTGRES_PASSWORD: buskativa
      POSTGRES_DB: buskativa
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```

`.env.example`:
```
DATABASE_URL=postgres://buskativa:buskativa@localhost:5432/buskativa
REDIS_URL=redis://localhost:6379
# "demo" usa lojas falsas (desenvolvimento/E2E); vazio usa as lojas reais
CONNECTORS=demo
ML_ACCESS_TOKEN=
AMAZON_PAAPI_ACCESS_KEY=
AMAZON_PAAPI_SECRET_KEY=
AMAZON_PAAPI_PARTNER_TAG=
KWAI_ENABLED=false
SEARCH_INTERVAL_MIN=60
SEARCH_FAST_INTERVAL_MIN=30
WORKER_CONCURRENCY=3
# Parâmetros de afiliado por loja, no formato query string
AFFILIATE_PARAMS_AMAZON=tag=seutag-20
AFFILIATE_PARAMS_MERCADOLIVRE=
AFFILIATE_PARAMS_SHOPEE=
AFFILIATE_PARAMS_MAGALU=
AFFILIATE_PARAMS_ALIEXPRESS=
```

- [ ] **Step 6: Rodar o worker localmente em modo demo**

Run:
```bash
cp .env.example .env
docker compose up -d
npm run start -w @buskativa/worker
```
Expected: log `worker ativo: buscas iniciais enfileiradas` com `count: 20`, seguido de 20 linhas `busca concluída`. Pare com Ctrl+C e confirme que o processo encerra sem erro.

- [ ] **Step 7: Commit**

```bash
git add apps/worker docker-compose.yml .env.example
git commit -m "feat(worker): agendador 24h com 20 buscas iniciais e recorrência"
```

---

### Task 11: API web (busca, histórico, redirecionamento com afiliado)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/next-env.d.ts`
- Create: `apps/web/lib/server.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/lib/search-service.ts`, `apps/web/lib/redirect.ts`
- Create: `apps/web/app/api/buscas/route.ts`, `apps/web/app/api/buscas/[id]/route.ts`, `apps/web/app/api/produtos/[id]/historico/route.ts`, `apps/web/app/ir/[id]/route.ts`
- Test: `apps/web/test/rate-limit.test.ts`, `apps/web/test/search-service.test.ts`, `apps/web/test/redirect.test.ts`

**Interfaces:**
- Consumes: core (`normalizeQuery`, `groupSimilar`, `affiliateUrl`, `computeStats`); db (`Db`, repo, `createDb`, `createTestDb`); queue (`createSearchQueue`, `enqueueSearch`, `redisConnection`, `SearchJob`).
- Produces:
  - `createRateLimiter(limit: number, windowMs: number): (key: string, now?: number) => boolean`
  - `startSearch(deps: { db: Db; enqueue: (job: SearchJob) => Promise<void>; now?: Date }, text: string): Promise<{ runId: number; cached: boolean }>`
  - `searchResults(db: Db, runId: number): Promise<SearchResponse | null>` com `SearchResponse = { status: "running" | "done"; tipo: "generica" | "especifica"; original: string; storeStatus: Partial<Record<StoreId, StoreStatus>>; results: SearchResultItem[] }` e `SearchResultItem = { productId: number; store: StoreId; title: string; imageUrl: string | null; priceCents: number; shippingCents: number | null; totalCents: number; groupId: number }`
  - `resolveRedirect(db: Db, productId: number, env: Record<string, string | undefined>, referer: string | null): Promise<string | null>`
  - `getDb(): Db`; `getQueue(): Queue<SearchJob>`
  - Rotas HTTP: `POST /api/buscas` body `{ q: string }` → `{ runId, cached }` (400 se `q` tiver menos de 2 ou mais de 120 caracteres; 429 acima do limite); `GET /api/buscas/:id` → `SearchResponse`; `GET /api/produtos/:id/historico` → `{ product, points: { price: number; observedAt: string }[], stats }`; `GET /ir/:id` → 302 para a loja.

- [ ] **Step 1: Criar o app Next.js**

`apps/web/package.json`:
```json
{
  "name": "@buskativa/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit -p .",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@buskativa/core": "*",
    "@buskativa/db": "*",
    "@buskativa/queue": "*"
  }
}
```

Run: `npm i -w @buskativa/web next react react-dom recharts && npm i -w @buskativa/web -D @types/react @types/react-dom @playwright/test`
Expected: instala sem erros.

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": false,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next-env.d.ts`:
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`apps/web/next.config.ts`:
```ts
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// `npm run <script> -w @buskativa/web` roda com cwd = apps/web; a raiz do monorepo fica dois níveis acima.
const root = path.resolve(process.cwd(), "../..");
loadEnvConfig(root);

const config: NextConfig = {
  transpilePackages: ["@buskativa/core", "@buskativa/db", "@buskativa/queue"],
  serverExternalPackages: ["pg", "bullmq"],
  output: "standalone",
  outputFileTracingRoot: root,
};

export default config;
```

- [ ] **Step 2: Escrever os testes da lógica do servidor (falhando)**

`apps/web/test/rate-limit.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../lib/rate-limit";

describe("createRateLimiter", () => {
  it("permite até o limite por janela e libera depois", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 10)).toBe(true);
    expect(allow("ip", 20)).toBe(false);
    expect(allow("outro", 20)).toBe(true);
    expect(allow("ip", 1001)).toBe(true);
  });
});
```

`apps/web/test/search-service.test.ts`:
```ts
import type { SearchJob } from "@buskativa/queue";
import { saveOffers, finishRun } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { searchResults, startSearch } from "../lib/search-service";

describe("startSearch", () => {
  it("enfileira a primeira busca e reaproveita a mesma consulta logo depois", async () => {
    const db = await createTestDb();
    const jobs: SearchJob[] = [];
    const enqueue = async (j: SearchJob) => {
      jobs.push(j);
    };
    const a = await startSearch({ db, enqueue }, "Fone Bluetooth");
    const b = await startSearch({ db, enqueue }, "bluetooth fone");
    expect(a.cached).toBe(false);
    expect(b).toEqual({ runId: a.runId, cached: true });
    expect(jobs).toEqual([{ text: "Fone Bluetooth", runId: a.runId }]);
  });
});

describe("searchResults", () => {
  it("ordena por preço total e agrupa títulos parecidos em consulta genérica", async () => {
    const db = await createTestDb();
    const { runId } = await startSearch({ db, enqueue: async () => {} }, "fone bluetooth");
    const base = { currency: "BRL" as const, attributes: {}, store: "mercadolivre" as const };
    await saveOffers(db, runId, [
      { ...base, externalId: "1", title: "Fone Bluetooth JBL Tune 510BT Preto", url: "https://www.mercadolivre.com.br/1", price: 200, shipping: 20 },
      { ...base, externalId: "2", title: "JBL Tune 510BT Fone Bluetooth Preto Original", url: "https://www.mercadolivre.com.br/2", price: 210, shipping: 0 },
      { ...base, externalId: "3", title: "Fone Bluetooth I12", url: "https://www.mercadolivre.com.br/3", price: 40, shipping: null },
    ]);
    await finishRun(db, runId);
    const res = await searchResults(db, runId);
    expect(res!.status).toBe("done");
    expect(res!.results.map((r) => r.totalCents)).toEqual([4000, 21000, 22000]);
    expect(res!.results[1].groupId).toBe(res!.results[2].groupId);
    expect(res!.results[0].groupId).not.toBe(res!.results[1].groupId);
  });

  it("retorna null para execução inexistente", async () => {
    expect(await searchResults(await createTestDb(), 999)).toBeNull();
  });
});
```

`apps/web/test/redirect.test.ts`:
```ts
import { normalizeQuery } from "@buskativa/core";
import { createRun, saveOffers, upsertQuery } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { resolveRedirect } from "../lib/redirect";

describe("resolveRedirect", () => {
  it("aplica o afiliado e registra o clique", async () => {
    const db = await createTestDb();
    const q = await upsertQuery(db, normalizeQuery("kindle"));
    const run = await createRun(db, q.id);
    const [id] = await saveOffers(db, run, [
      { store: "amazon", externalId: "B0K", title: "Kindle", url: "https://www.amazon.com.br/dp/B0K", price: 499, shipping: null, currency: "BRL", attributes: {} },
    ]);
    const url = await resolveRedirect(db, id, { AFFILIATE_PARAMS_AMAZON: "tag=meutag-20" }, "https://buskativa.app/busca");
    expect(url).toBe("https://www.amazon.com.br/dp/B0K?tag=meutag-20");
    expect(await resolveRedirect(db, 12345, {}, null)).toBeNull();
  });
});
```

Run: `npx vitest run apps/web`
Expected: FAIL (módulos de `lib/` não existem).

- [ ] **Step 3: Implementar a lógica do servidor**

`apps/web/lib/rate-limit.ts`:
```ts
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const allowed = recent.length < limit;
    if (allowed) recent.push(now);
    hits.set(key, recent);
    return allowed;
  };
}
```

`apps/web/lib/search-service.ts`:
```ts
import { groupSimilar, normalizeQuery, type StoreId, type StoreStatus } from "@buskativa/core";
import { createRun, type Db, getRecentRunForHash, getRunWithResults, upsertQuery } from "@buskativa/db";
import type { SearchJob } from "@buskativa/queue";

export interface SearchResultItem {
  productId: number;
  store: StoreId;
  title: string;
  imageUrl: string | null;
  priceCents: number;
  shippingCents: number | null;
  totalCents: number;
  groupId: number;
}

export interface SearchResponse {
  status: "running" | "done";
  tipo: "generica" | "especifica";
  original: string;
  storeStatus: Partial<Record<StoreId, StoreStatus>>;
  results: SearchResultItem[];
}

export async function startSearch(
  deps: { db: Db; enqueue: (job: SearchJob) => Promise<void>; now?: Date },
  text: string,
): Promise<{ runId: number; cached: boolean }> {
  const now = deps.now ?? new Date();
  const nq = normalizeQuery(text);
  const recent = await getRecentRunForHash(deps.db, nq.hash, now);
  if (recent) return { runId: recent, cached: true };
  const q = await upsertQuery(deps.db, nq);
  const runId = await createRun(deps.db, q.id, now);
  await deps.enqueue({ text: nq.original, runId });
  return { runId, cached: false };
}

export async function searchResults(db: Db, runId: number): Promise<SearchResponse | null> {
  const run = await getRunWithResults(db, runId);
  if (!run) return null;
  const items = run.results.map((r) => ({ ...r, totalCents: r.priceCents + (r.shippingCents ?? 0), groupId: 0 }));
  if (run.query.tipo === "generica") {
    groupSimilar(items).forEach((group, gi) => group.forEach((it) => (it.groupId = gi)));
  } else {
    items.forEach((it, i) => (it.groupId = i));
  }
  return {
    status: run.status,
    tipo: run.query.tipo,
    original: run.query.original,
    storeStatus: run.storeStatus,
    results: items,
  };
}
```

`apps/web/lib/redirect.ts`:
```ts
import { affiliateUrl } from "@buskativa/core";
import { type Db, getProduct, recordClick } from "@buskativa/db";

export async function resolveRedirect(
  db: Db,
  productId: number,
  env: Record<string, string | undefined>,
  referer: string | null,
): Promise<string | null> {
  const product = await getProduct(db, productId);
  if (!product) return null;
  const url = affiliateUrl(product.url, product.store, env);
  await recordClick(db, productId, referer);
  return url;
}
```

`apps/web/lib/server.ts`:
```ts
import { createDb, type Db } from "@buskativa/db";
import { createSearchQueue, redisConnection, type SearchJob } from "@buskativa/queue";
import type { Queue } from "bullmq";
import { createRateLimiter } from "./rate-limit";

const g = globalThis as unknown as { __db?: Db; __queue?: Queue<SearchJob>; __limiter?: ReturnType<typeof createRateLimiter> };

export function getDb(): Db {
  g.__db ??= createDb(process.env.DATABASE_URL!).db;
  return g.__db;
}

export function getQueue(): Queue<SearchJob> {
  g.__queue ??= createSearchQueue(redisConnection(process.env.REDIS_URL!));
  return g.__queue;
}

export function allowSearch(ip: string): boolean {
  g.__limiter ??= createRateLimiter(30, 60e3);
  return g.__limiter(ip);
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
```

Também é preciso declarar `bullmq` no web, porque `lib/server.ts` importa o tipo `Queue` dele. Run: `npm i -w @buskativa/web bullmq`.

Run: `npx vitest run apps/web`
Expected: PASS (5 testes).

- [ ] **Step 4: Rotas HTTP**

`apps/web/app/api/buscas/route.ts`:
```ts
import { enqueueSearch } from "@buskativa/queue";
import { NextResponse } from "next/server";
import { startSearch } from "../../../lib/search-service";
import { allowSearch, clientIp, getDb, getQueue } from "../../../lib/server";

export async function POST(req: Request) {
  if (!allowSearch(clientIp(req))) {
    return NextResponse.json({ error: "Muitas buscas seguidas. Tente de novo em 1 minuto." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { q?: unknown };
  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (q.length < 2 || q.length > 120) {
    return NextResponse.json({ error: "Digite entre 2 e 120 caracteres." }, { status: 400 });
  }
  const result = await startSearch({ db: getDb(), enqueue: (job) => enqueueSearch(getQueue(), job) }, q);
  return NextResponse.json(result);
}
```

`apps/web/app/api/buscas/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { searchResults } from "../../../../lib/search-service";
import { getDb } from "../../../../lib/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const res = await searchResults(getDb(), id);
  if (!res) return NextResponse.json({ error: "busca não encontrada" }, { status: 404 });
  return NextResponse.json(res);
}
```

`apps/web/app/api/produtos/[id]/historico/route.ts`:
```ts
import { computeStats } from "@buskativa/core";
import { getPriceHistory, getProduct } from "@buskativa/db";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const product = Number.isInteger(id) ? await getProduct(db, id) : null;
  if (!product) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });
  const points = await getPriceHistory(db, id);
  return NextResponse.json({
    product,
    points: points.map((p) => ({ price: p.price, observedAt: p.observedAt.toISOString() })),
    stats: computeStats(points, new Date()),
  });
}
```

`apps/web/app/ir/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { resolveRedirect } from "../../../lib/redirect";
import { getDb } from "../../../lib/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  try {
    const url = Number.isInteger(id) ? await resolveRedirect(getDb(), id, process.env, req.headers.get("referer")) : null;
    if (!url) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });
    return NextResponse.redirect(url, 302);
  } catch {
    return NextResponse.json({ error: "link de loja não permitido" }, { status: 400 });
  }
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros em nenhum workspace.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json apps/web
git commit -m "feat(web): API de busca com cache e rate limit, histórico e redirecionamento com afiliado"
```

---

### Task 12: Páginas web (início, resultados, produto com gráfico)

> Ao implementar, carregue a skill `frontend-design` para a direção visual. O CSS abaixo é a base funcional mínima e pode ser refinado sem mudar a estrutura nem os textos.

**Files:**
- Create: `apps/web/lib/format.ts`
- Create: `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx`
- Create: `apps/web/app/busca/page.tsx`, `apps/web/app/busca/search-results.tsx`
- Create: `apps/web/app/produto/[id]/page.tsx`, `apps/web/app/produto/[id]/price-chart.tsx`
- Test: `apps/web/test/format.test.ts`

**Interfaces:**
- Consumes: `STORES` via `@buskativa/core/stores` (pode ir para o cliente); `computeStats`, `similarity` (core, só no servidor); `getProduct`, `getPriceHistory`, `latestRunIdForProduct`, `topDrops` (db); `searchResults`, `SearchResponse` (Task 11); `getDb` (Task 11).
- Produces: `formatBRL(cents: number): string`; `WEEKDAYS: string[]`; `hourBlockLabel(block: number): string`; `CONFIDENCE_LABEL: Record<Confidence, string>`; `formatDateTime(d: Date | string): string`.

- [ ] **Step 1: Teste de formatação (falhando)**

`apps/web/test/format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatBRL, formatDateTime, hourBlockLabel, WEEKDAYS } from "../lib/format";

describe("format", () => {
  it("formata reais a partir de centavos", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
  it("rótulos de dia e horário", () => {
    expect(WEEKDAYS[2]).toBe("terça-feira");
    expect(hourBlockLabel(0)).toBe("0h–3h");
    expect(hourBlockLabel(7)).toBe("21h–24h");
  });
  it("data e hora em Brasília", () => {
    expect(formatDateTime("2026-01-06T03:00:00Z")).toBe("06/01/2026, 00:00");
  });
});
```

Run: `npx vitest run apps/web/test/format.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar `format.ts`**

`apps/web/lib/format.ts`:
```ts
import type { Confidence } from "@buskativa/core";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatBRL = (cents: number) => brl.format(cents / 100);

export const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export const hourBlockLabel = (block: number) => `${block * 3}h–${block * 3 + 3}h`;

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  baixa: "confiança baixa (poucos dados ainda)",
  media: "confiança média",
  alta: "confiança alta",
};

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
```

Observação: `format.ts` importa só um tipo de `@buskativa/core`, que some na compilação, então é seguro usar no cliente.

Run: `npx vitest run apps/web/test/format.test.ts`
Expected: PASS.

- [ ] **Step 3: Layout, estilos e página inicial**

`apps/web/app/globals.css`:
```css
:root {
  --bg: #f7f7f5; --surface: #ffffff; --text: #18181b; --muted: #6b7280;
  --accent: #16a34a; --accent-ink: #ffffff; --border: #e5e7eb; --warn: #b45309;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f1115; --surface: #171a21; --text: #f4f4f5; --muted: #9ca3af; --border: #2a2f3a; }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
a { color: inherit; }
main { max-width: 960px; margin: 0 auto; padding: 16px; }
header.top { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
header.top a.logo { font-weight: 800; text-decoration: none; color: var(--accent); }
form.search { display: flex; gap: 8px; width: 100%; }
form.search input { flex: 1; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 16px; }
button, .btn { padding: 12px 16px; border-radius: 10px; border: 0; background: var(--accent); color: var(--accent-ink); font-weight: 700; text-decoration: none; cursor: pointer; display: inline-block; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; display: flex; gap: 14px; align-items: center; }
.card img { width: 72px; height: 72px; object-fit: contain; border-radius: 8px; background: #fff; }
.card .info { flex: 1; min-width: 0; }
.card .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.price { font-size: 20px; font-weight: 800; }
.muted { color: var(--muted); font-size: 14px; }
.list { display: grid; gap: 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.chip { font-size: 13px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); }
.chip.fail { color: var(--warn); border-color: var(--warn); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 16px 0; }
.stats .card { flex-direction: column; align-items: flex-start; }
@media (max-width: 560px) { .card { flex-wrap: wrap; } .card .btn { width: 100%; text-align: center; } }
```

`apps/web/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BUSKATIVA",
  description: "O menor preço agora, em várias lojas, com histórico e o melhor horário para comprar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="top">
          <a className="logo" href="/">BUSKATIVA</a>
          <form className="search" action="/busca">
            <input name="q" placeholder="Busque um produto: ex. iPhone 15 128GB preto" required minLength={2} maxLength={120} />
            <button type="submit">Buscar</button>
          </form>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

`apps/web/app/page.tsx`:
```tsx
import { STORES } from "@buskativa/core/stores";
import { topDrops } from "@buskativa/db";
import { formatBRL } from "../lib/format";
import { getDb } from "../lib/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const drops = await topDrops(getDb(), new Date(), 12);
  return (
    <>
      <h1>O menor preço, agora.</h1>
      <p className="muted">Pesquisamos Mercado Livre, Amazon, Magalu, Shopee, AliExpress e TikTok Shop 24 horas por dia.</p>
      <h2>Maiores quedas nas últimas 24h</h2>
      {drops.length === 0 ? (
        <p className="muted">Ainda juntando histórico. Faça uma busca acima.</p>
      ) : (
        <div className="list">
          {drops.map((d) => (
            <a key={d.productId} className="card" href={`/produto/${d.productId}`} style={{ textDecoration: "none" }}>
              {d.imageUrl && <img src={d.imageUrl} alt="" />}
              <div className="info">
                <div className="title">{d.title}</div>
                <div className="muted">{STORES[d.store].name} · era {formatBRL(d.prevAvgCents)} em média</div>
              </div>
              <div>
                <div className="price">{formatBRL(d.nowCents)}</div>
                <div className="muted">−{Math.round(d.drop * 100)}%</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Página de resultados**

`apps/web/app/busca/page.tsx`:
```tsx
import { SearchResults } from "./search-results";

export default async function BuscaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  if (q.length < 2) return <p>Digite o que você procura no campo acima.</p>;
  return (
    <>
      <h1>Resultados para “{q}”</h1>
      <SearchResults q={q} />
    </>
  );
}
```

`apps/web/app/busca/search-results.tsx`:
```tsx
"use client";
import { STORES } from "@buskativa/core/stores";
import { useEffect, useState } from "react";
import { formatBRL } from "../../lib/format";
import type { SearchResponse, SearchResultItem } from "../../lib/search-service";

function Offer({ r }: { r: SearchResultItem }) {
  return (
    <div className="card" data-testid="offer">
      {r.imageUrl && <img src={r.imageUrl} alt="" />}
      <div className="info">
        <a className="title" href={`/produto/${r.productId}`}>{r.title}</a>
        <div className="muted">
          {STORES[r.store].name} ·{" "}
          {r.shippingCents === null ? "frete a calcular" : r.shippingCents === 0 ? "frete grátis" : `frete ${formatBRL(r.shippingCents)}`}
        </div>
      </div>
      <div className="price">{formatBRL(r.totalCents)}</div>
      <a className="btn" href={`/ir/${r.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
    </div>
  );
}

export function SearchResults({ q }: { q: string }) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setData(null);
    setError(null);
    (async () => {
      const res = await fetch("/api/buscas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "Erro na busca.");
      const started = Date.now();
      const poll = async () => {
        if (stopped) return;
        const r = await fetch(`/api/buscas/${body.runId}`);
        const d = (await r.json()) as SearchResponse;
        if (stopped) return;
        setData(d);
        if (d.status !== "done" && Date.now() - started < 90_000) timer = setTimeout(poll, 2000);
      };
      await poll();
    })().catch((e) => setError(String(e)));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [q]);

  if (error) return <p className="chip fail">{error}</p>;
  if (!data) return <p className="muted">Procurando nas lojas…</p>;

  const groups = new Map<number, SearchResultItem[]>();
  for (const r of data.results) groups.set(r.groupId, [...(groups.get(r.groupId) ?? []), r]);

  return (
    <>
      <div className="chips">
        {Object.entries(data.storeStatus).map(([id, s]) => (
          <span key={id} className={`chip ${s?.ok ? "" : "fail"}`}>
            {STORES[id as keyof typeof STORES].name}: {s?.ok ? `${s.count} ofertas` : "indisponível agora"}
          </span>
        ))}
        {data.status !== "done" && <span className="chip">buscando…</span>}
      </div>
      {data.results.length === 0 && data.status === "done" && <p>Nenhuma oferta encontrada.</p>}
      <div className="list">
        {[...groups.values()].map((items) =>
          items.length === 1 ? (
            <Offer key={items[0].productId} r={items[0]} />
          ) : (
            <div key={items[0].productId}>
              <Offer r={items[0]} />
              <details>
                <summary className="muted">+{items.length - 1} ofertas parecidas</summary>
                <div className="list">{items.slice(1).map((r) => <Offer key={r.productId} r={r} />)}</div>
              </details>
            </div>
          ),
        )}
      </div>
    </>
  );
}
```

Observação: `search-results.tsx` importa de `search-service.ts` apenas tipos (`import type`), então o código do servidor não entra no bundle do cliente.

- [ ] **Step 5: Página do produto com gráfico**

`apps/web/app/produto/[id]/price-chart.tsx`:
```tsx
"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatDateTime } from "../../../lib/format";

export function PriceChart({ points }: { points: { price: number; observedAt: string }[] }) {
  const data = points.map((p) => ({ t: new Date(p.observedAt).getTime(), price: p.price }));
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          />
          <YAxis width={90} tickFormatter={(v) => formatBRL(Math.round(Number(v) * 100))} domain={["auto", "auto"]} />
          <Tooltip
            labelFormatter={(t) => formatDateTime(new Date(Number(t)))}
            formatter={(v) => [formatBRL(Math.round(Number(v) * 100)), "Preço"]}
          />
          <Line type="stepAfter" dataKey="price" stroke="#16a34a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

`apps/web/app/produto/[id]/page.tsx`:
```tsx
import { computeStats, similarity } from "@buskativa/core";
import { STORES } from "@buskativa/core/stores";
import { getPriceHistory, getProduct, latestRunIdForProduct } from "@buskativa/db";
import { notFound } from "next/navigation";
import { CONFIDENCE_LABEL, formatBRL, formatDateTime, hourBlockLabel, WEEKDAYS } from "../../../lib/format";
import { searchResults } from "../../../lib/search-service";
import { getDb } from "../../../lib/server";
import { PriceChart } from "./price-chart";

export const dynamic = "force-dynamic";

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const product = Number.isInteger(id) ? await getProduct(db, id) : null;
  if (!product) notFound();

  const points = await getPriceHistory(db, id);
  const stats = computeStats(points, new Date());
  const runId = await latestRunIdForProduct(db, id);
  const run = runId ? await searchResults(db, runId) : null;
  const others = (run?.results ?? []).filter(
    (r) => r.productId !== id && r.store !== product.store && similarity(r.title, product.title) >= 0.6,
  );

  return (
    <>
      <div className="card">
        {product.imageUrl && <img src={product.imageUrl} alt="" />}
        <div className="info">
          <h1 style={{ fontSize: 20, margin: 0 }}>{product.title}</h1>
          <div className="muted">{STORES[product.store].name}</div>
        </div>
        {stats && <div className="price">{formatBRL(Math.round(stats.current * 100))}</div>}
        <a className="btn" href={`/ir/${product.id}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
      </div>

      {stats && (
        <div className="stats">
          <div className="card">
            <span className="muted">Menor preço</span>
            <span className="price">{formatBRL(Math.round(stats.lowest.price * 100))}</span>
            <span className="muted">em {formatDateTime(stats.lowest.observedAt)}</span>
          </div>
          <div className="card">
            <span className="muted">Melhor dia</span>
            <strong>{WEEKDAYS[stats.bestWeekday]}</strong>
            <span className="muted">Melhor horário: {hourBlockLabel(stats.bestHourBlock)}</span>
          </div>
          <div className="card">
            <span className="muted">Próxima queda provável</span>
            <strong>{formatDateTime(stats.nextLowWindow)}</strong>
            <span className="muted">Estimativa, {CONFIDENCE_LABEL[stats.confidence]}</span>
          </div>
          <div className="card">
            <span className="muted">Média 30 dias</span>
            <strong>{formatBRL(Math.round(stats.avg30d * 100))}</strong>
            <span className="muted">
              Agora está {Math.abs(Math.round(stats.changeVsAvg30d * 100))}% {stats.changeVsAvg30d <= 0 ? "abaixo" : "acima"} da média
            </span>
          </div>
        </div>
      )}

      <h2>Histórico de preço</h2>
      <PriceChart points={points.map((p) => ({ price: p.price, observedAt: p.observedAt.toISOString() }))} />

      {others.length > 0 && (
        <>
          <h2>Mesmo produto em outras lojas</h2>
          <div className="list">
            {others.map((r) => (
              <div key={r.productId} className="card">
                <div className="info">
                  <a className="title" href={`/produto/${r.productId}`}>{r.title}</a>
                  <div className="muted">{STORES[r.store].name}</div>
                </div>
                <div className="price">{formatBRL(r.totalCents)}</div>
                <a className="btn" href={`/ir/${r.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Verificar build**

Run: `npm run typecheck && npm run build -w @buskativa/web`
Expected: typecheck sem erros e `next build` concluído.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): páginas de início, resultados e produto com gráfico de histórico"
```

---

### Task 13: Teste E2E do fluxo de busca

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/busca.spec.ts`

**Interfaces:**
- Consumes: app web (Tasks 11–12), worker em `CONNECTORS=demo` (Task 10), `docker compose` (Postgres + Redis).

- [ ] **Step 1: Configuração do Playwright Test**

`apps/web/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://buskativa:buskativa@localhost:5432/buskativa",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  CONNECTORS: "demo",
  AFFILIATE_PARAMS_MERCADOLIVRE: "matt_tool=e2e",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: [
    { command: "npm run start -w @buskativa/worker", cwd: "../..", env, reuseExistingServer: false, timeout: 60_000, wait: { stdout: /worker ativo/ } },
    { command: "npm run dev", port: 3000, env, reuseExistingServer: false, timeout: 120_000 },
  ],
});
```

Se a versão instalada do `@playwright/test` não aceitar `wait` em `webServer`, remova essa chave. O teste de busca já espera os resultados por polling.

- [ ] **Step 2: Escrever o teste**

`apps/web/e2e/busca.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("busca, mostra ofertas ordenadas, abre produto e o link vai para a loja com afiliado", async ({ page, request }) => {
  const termo = `fone e2e ${Date.now()}`;
  await page.goto("/");
  await page.getByPlaceholder(/Busque um produto/).fill(termo);
  await page.getByRole("button", { name: "Buscar" }).click();

  const offers = page.getByTestId("offer");
  await expect(offers.first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Mercado Livre: \d+ ofertas/)).toBeVisible({ timeout: 45_000 });

  const prices = await page.locator('[data-testid="offer"] .price').allInnerTexts();
  const values = prices.map((p) => Number(p.replace(/[^\d,]/g, "").replace(",", ".")));
  expect(values).toEqual([...values].sort((a, b) => a - b));

  const irHref = await offers.first().getByRole("link", { name: "Ir para a loja" }).getAttribute("href");
  const redirect = await request.get(irHref!, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toMatch(/^https:\/\/www\.(mercadolivre\.com\.br|amazon\.com\.br|magazineluiza\.com\.br)\//);

  await offers.first().locator("a.title").click();
  await expect(page.getByText("Menor preço")).toBeVisible();
  await expect(page.getByText("Histórico de preço")).toBeVisible();
});
```

- [ ] **Step 3: Rodar o E2E**

Run:
```bash
docker compose up -d
npx playwright install chromium
npm run e2e -w @buskativa/web
```
Expected: 1 teste PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e
git commit -m "test(web): E2E da busca com conectores demo"
```

---

### Task 14: Deploy na nuvem (Docker, Render) e README

**Files:**
- Create: `Dockerfile.web`, `Dockerfile.worker`, `.dockerignore`, `render.yaml`, `README.md`

**Interfaces:**
- Consumes: scripts `build`/`start` do web (Task 11) e `start` do worker (Task 10); variáveis do `.env.example` (Task 10).

- [ ] **Step 1: Dockerfiles**

`.dockerignore`:
```
node_modules
**/node_modules
.next
**/.next
.env
.git
test-results
playwright-report
```

`Dockerfile.web`:
```dockerfile
FROM node:24-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w @buskativa/web

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

`Dockerfile.worker`:
```dockerfile
FROM node:24-slim
WORKDIR /app
COPY . .
RUN npm ci && npx playwright install --with-deps chromium
ENV NODE_ENV=production
CMD ["npm", "run", "start", "-w", "@buskativa/worker"]
```

Run: `docker build -f Dockerfile.web -t buskativa-web . && docker build -f Dockerfile.worker -t buskativa-worker .`
Expected: as duas imagens são construídas sem erro.

- [ ] **Step 2: `render.yaml`**

```yaml
services:
  - type: web
    name: buskativa-web
    runtime: docker
    dockerfilePath: ./Dockerfile.web
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        fromService: { type: keyvalue, name: buskativa-redis, property: connectionString }
      - key: AFFILIATE_PARAMS_AMAZON
        sync: false
      - key: AFFILIATE_PARAMS_MERCADOLIVRE
        sync: false
      - key: AFFILIATE_PARAMS_SHOPEE
        sync: false
      - key: AFFILIATE_PARAMS_MAGALU
        sync: false
      - key: AFFILIATE_PARAMS_ALIEXPRESS
        sync: false
  - type: worker
    name: buskativa-worker
    runtime: docker
    dockerfilePath: ./Dockerfile.worker
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        fromService: { type: keyvalue, name: buskativa-redis, property: connectionString }
      - key: ML_ACCESS_TOKEN
        sync: false
      - key: AMAZON_PAAPI_ACCESS_KEY
        sync: false
      - key: AMAZON_PAAPI_SECRET_KEY
        sync: false
      - key: AMAZON_PAAPI_PARTNER_TAG
        sync: false
  - type: keyvalue
    name: buskativa-redis
    ipAllowList: []
    maxmemoryPolicy: noeviction
```

- [ ] **Step 3: README**

`README.md`:
````markdown
# BUSKATIVA

Busca 24h o menor preço de um produto em lojas reais (Mercado Livre, Amazon, Magalu, Shopee, AliExpress, TikTok Shop), guarda o histórico e mostra o melhor dia/horário para comprar.

## Rodar localmente

```bash
cp .env.example .env          # CONNECTORS=demo usa lojas falsas
docker compose up -d          # Postgres + Redis
npm install
npx playwright install chromium
npm run start -w @buskativa/worker   # em um terminal
npm run dev -w @buskativa/web        # em outro: http://localhost:3000
```

Para as lojas reais, deixe `CONNECTORS` vazio no `.env`.

## Testes

```bash
npm test                         # unitários (Vitest)
npm run e2e -w @buskativa/web    # E2E (precisa do docker compose)
npm run smoke -w @buskativa/connectors -- amazon fone bluetooth   # checagem ao vivo de uma loja
```

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres (Supabase em produção) |
| `REDIS_URL` | Redis da fila |
| `CONNECTORS` | `demo` para lojas falsas; vazio para as reais |
| `ML_ACCESS_TOKEN` | Token do Mercado Livre, se a API de busca exigir |
| `AMAZON_PAAPI_*` | Credenciais do PA-API; sem elas a Amazon usa o navegador |
| `KWAI_ENABLED` | `true` liga o conector experimental do Kwai Shop |
| `SEARCH_INTERVAL_MIN` / `SEARCH_FAST_INTERVAL_MIN` | Intervalo das buscas recorrentes (60 / 30) |
| `AFFILIATE_PARAMS_<LOJA>` | Parâmetros de afiliado, ex.: `tag=seutag-20` |

## Deploy (Render + Supabase)

1. Crie um projeto no Supabase e copie a connection string (modo "session") para `DATABASE_URL`.
2. No Render, crie um Blueprint apontando para este repositório (usa `render.yaml`).
3. Preencha as variáveis marcadas como `sync: false`.
4. O worker roda as migrações ao iniciar e já dispara 20 buscas.

## Estado das lojas

Registre aqui o resultado do smoke test de cada loja (ok / BLOCKED / precisa de parser específico).
````

Depois de rodar o smoke test da Task 8 (Step 9), substitua a última linha do README por uma tabela com o resultado real de cada loja.

- [ ] **Step 4: Rodar tudo uma última vez**

Run: `npm test && npm run typecheck && npm run build -w @buskativa/web`
Expected: todos os testes PASS, typecheck sem erros e build concluído.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.web Dockerfile.worker .dockerignore render.yaml README.md
git commit -m "chore: Dockerfiles, blueprint do Render e README"
```
