import { STORE_IDS, type StoreId } from "./types";

export const DISCOUNT_TYPES = ["percent", "fixed", "frete"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export const COUPON_SOURCES = ["oficial", "telegram", "manual"] as const;
export type CouponSource = (typeof COUPON_SOURCES)[number];
export type CouponConfidence = "alta" | "media" | "baixa" | "expirado";

export interface CouponValue {
  store: StoreId;
  code: string;
  title: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  minOrderCents: number | null;
  validUntil: Date | null;
  sourceUrl: string | null;
  source: CouponSource;
  active: boolean;
}

export type CouponValidation = { ok: true; value: CouponValue } | { ok: false; errors: string[] };

const MAX_CENTS = 100_000_000; // R$ 1.000.000,00
const CODE_RE = /^[A-Z0-9_-]{3,40}$/;

function isHttpsUrl(v: unknown): boolean {
  if (typeof v !== "string" || /\s/.test(v) || !/^https:\/\/[^/?#]/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname !== "";
  } catch {
    return false;
  }
}

/** Validates untrusted coupon input (admin API). Messages are pt-BR and accumulate. */
export function validateCoupon(input: unknown, now: Date): CouponValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["Corpo da requisição inválido."] };
  }
  const o = input as Record<string, unknown>;
  const errors: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const store = o.store as StoreId;
  if (!STORE_IDS.includes(store)) errors.push("Loja inválida.");

  const code = str(o.code).toUpperCase();
  if (!CODE_RE.test(code)) errors.push("Código deve ter de 3 a 40 caracteres (letras, números, _ ou -).");

  const title = str(o.title);
  if (title.length < 1 || title.length > 120) errors.push("Título é obrigatório (até 120 caracteres).");

  const description = str(o.description) || null;
  if (description && description.length > 500) errors.push("Descrição deve ter até 500 caracteres.");

  const discountType = o.discountType as DiscountType;
  const value = o.discountValue;
  if (!DISCOUNT_TYPES.includes(discountType)) {
    errors.push("Tipo de desconto inválido.");
  } else if (discountType === "percent") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 90) errors.push("Desconto percentual deve ficar entre 1 e 90.");
  } else if (discountType === "fixed") {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > MAX_CENTS) errors.push("Desconto fixo deve ser maior que zero e no máximo R$ 1.000.000,00 (em centavos).");
  } else if (value !== 0) {
    errors.push("Cupom de frete deve ter valor 0.");
  }

  let minOrderCents: number | null = null;
  if (o.minOrderCents !== undefined && o.minOrderCents !== null) {
    if (typeof o.minOrderCents !== "number" || !Number.isSafeInteger(o.minOrderCents) || o.minOrderCents <= 0 || o.minOrderCents > MAX_CENTS) {
      errors.push("Pedido mínimo deve ser um número inteiro de centavos entre 1 e 100000000.");
    } else minOrderCents = o.minOrderCents;
  }

  let validUntil: Date | null = null;
  if (o.validUntil !== undefined && o.validUntil !== null && o.validUntil !== "") {
    const d = typeof o.validUntil === "string" || o.validUntil instanceof Date ? new Date(o.validUntil) : new Date(NaN);
    if (Number.isNaN(d.getTime())) errors.push("Validade inválida.");
    else if (d.getTime() <= now.getTime()) errors.push("Cupom já vencido.");
    else validUntil = d;
  }

  let sourceUrl: string | null = null;
  if (o.sourceUrl !== undefined && o.sourceUrl !== null && o.sourceUrl !== "") {
    const raw = o.sourceUrl;
    const u = str(raw);
    if (!isHttpsUrl(raw) || u.length > 500) errors.push("Link de origem deve começar com https://.");
    else sourceUrl = u;
  }

  const source = o.source as CouponSource;
  if (!COUPON_SOURCES.includes(source)) errors.push("Fonte inválida.");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      store, code, title, description, discountType, discountValue: value as number,
      minOrderCents, validUntil, sourceUrl, source, active: o.active !== false,
    },
  };
}

export interface CouponTrust {
  worked: number;
  failed: number;
  validUntil: Date | null;
  source: CouponSource;
}

export function couponConfidence(c: CouponTrust, now: Date): CouponConfidence {
  if (c.validUntil && c.validUntil.getTime() <= now.getTime()) return "expirado";
  const votes = c.worked + c.failed;
  if (votes >= 3) {
    const rate = c.worked / votes;
    return rate >= 0.7 ? "alta" : rate >= 0.4 ? "media" : "baixa";
  }
  return c.source === "oficial" ? "media" : "baixa";
}

export const COUPON_CONFIDENCE_ORDER: Record<CouponConfidence, number> = { alta: 0, media: 1, baixa: 2, expirado: 3 };

export const CONFIDENCE_BADGE: Record<CouponConfidence, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
  expirado: "Expirado",
};

/** One-line human summary of the discount, e.g. "10% de desconto". */
export function describeDiscount(type: DiscountType, value: number): string {
  if (type === "percent") return `${value}% de desconto`;
  if (type === "frete") return "Frete grátis";
  return `R$ ${(value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de desconto`;
}

const brl = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);

/**
 * Discount read from a coupon's own text ("20% OFF", "R$ 30,00 de desconto", "frete grátis", "acima de
 * R$ 149,90"). Null when the text states no amount: such a coupon is not shown rather than guessed.
 */
export function parseCouponText(text: string): { discountType: DiscountType; discountValue: number; minOrderCents: number | null } | null {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const min = t.match(/(?:acima|a partir) de r\$\s*([\d.]+(?:,\d{1,2})?)/);
  const minOrderCents = min ? brl(min[1]) : null;
  const pct = t.match(/(\d{1,2})(?:[.,]\d+)?\s*%/);
  if (pct) {
    const v = Number(pct[1]);
    return v >= 1 && v <= 90 ? { discountType: "percent", discountValue: v, minOrderCents } : null;
  }
  // the fixed amount is the one not tied to the minimum order
  const fixed = [...t.matchAll(/r\$\s*([\d.]+(?:,\d{1,2})?)/g)].find((m) => !min || m.index !== t.indexOf(min[0]) + min[0].indexOf(m[0]));
  if (fixed && /desconto|off|\bde r\$/.test(t)) {
    const v = brl(fixed[1]);
    if (v > 0 && v !== minOrderCents) return { discountType: "fixed", discountValue: v, minOrderCents };
  }
  if (/frete gratis|frete gratuito/.test(t)) return { discountType: "frete", discountValue: 0, minOrderCents };
  return null;
}
