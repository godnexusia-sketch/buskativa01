// Prefer thousands-grouped values ("1.234,56"); otherwise accept ungrouped digits ("1234,56").
// The lookahead stops a partial match inside a longer number (e.g. "123" out of "1234").
const WITH_SYMBOL_SRC = String.raw`R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?![\d.,]*\d)`;
const WITHOUT_SYMBOL_SRC = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})`;
const WITH_SYMBOL = new RegExp(WITH_SYMBOL_SRC);
const WITHOUT_SYMBOL = new RegExp(WITHOUT_SYMBOL_SRC);

function toNumber(raw: string): number | null {
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** First BRL amount in the text (amounts with "R$" take precedence). */
export function parseBRL(text: string): number | null {
  const m = text.match(WITH_SYMBOL) ?? text.match(WITHOUT_SYMBOL);
  return m ? toNumber(m[1]) : null;
}

interface Amount {
  value: number;
  before: string;
  after: string;
}

function amounts(text: string): Amount[] {
  const collect = (src: string) =>
    [...text.matchAll(new RegExp(src, "g"))].flatMap((m): Amount[] => {
      const value = toNumber(m[1]);
      if (value === null) return [];
      const start = m.index ?? 0;
      const end = start + m[0].length;
      return [{ value, before: text.slice(Math.max(0, start - 40), start), after: text.slice(end, end + 40) }];
    });
  const withSymbol = collect(WITH_SYMBOL_SRC);
  return withSymbol.length > 0 ? withSymbol : collect(WITHOUT_SYMBOL_SRC);
}

/** Every BRL amount in the text, in order; amounts without "R$" only when none has it. */
export function parseAllBRL(text: string): number[] {
  return amounts(text).map((a) => a.value);
}

// "10x de", "10x sem juros de", "em 10x" ... up to three words between "Nx" and the amount
const INSTALLMENT_BEFORE = /\d+\s*x\s*(?:\p{L}+\s*){0,3}$/iu;
const EXTRA_BEFORE =
  /(?:(?:frete|entrega)\s+gr[aá]tis\s+(?:acima de|a partir de)|(?:frete|entrega|cashback|economize|desconto|ganhe)\s*:?\s*(?:de\s*)?)\s*$/i;
const EXTRA_AFTER =
  /^\s*(?:(?:de\s+)?(?:cashback|desconto|off)\b|de\s+volta\b|volta\b|frete\b(?!\s*(?:gr[aá]tis|:?\s*(?:R\$|\d)))|de\s+frete\b|(?:por|ao)\s+m[eê]s\b|\/\s*m[eê]s\b|\/\s*un\b|\/\s*\d+\s*(?:kg|g|ml|l)\b)/iu;
// "R$ 1.199 em 10x" is an installment total, unlike "R$ 279,90 em 10x R$ 27,99"
const INSTALLMENT_TOTAL_AFTER =
  /^\s*em\s+(?:até\s+)?\d+\s*x(?!\s*(?:\p{L}+\s*){0,3}(?:R\$\s*)?\d)/iu;
// a candidate far below the largest one is an unrelated figure (unit price, tip, fee)
const MIN_SHARE_OF_LARGEST = 0.1;

export interface CardPrices {
  price: number;
  /** Largest non-excluded amount, when it is greater than `price` (the old "de" price). */
  originalPrice?: number;
  /** "app" or "pix" when the text right after the chosen price says so. */
  pagamento?: "app" | "pix";
}

/**
 * Current price (and original price, when shown) in a product card: the lowest amount that is
 * not an installment ("10x sem juros de R$ 27,99"), a shipping/cashback/discount figure, a
 * recurring or unit price, zero, or a tiny fraction of the largest amount. Falls back to the
 * first positive amount when every amount was excluded.
 */
export function pickCardPrices(text: string): CardPrices | null {
  const all = amounts(text).filter((a) => a.value > 0);
  if (all.length === 0) return null;
  const candidates = all.filter(
    (a) =>
      !INSTALLMENT_BEFORE.test(a.before) &&
      !EXTRA_BEFORE.test(a.before) &&
      !EXTRA_AFTER.test(a.after) &&
      !INSTALLMENT_TOTAL_AFTER.test(a.after),
  );
  // "R$ 1.199 em 10x de R$ 119,90": A is the installment total when A is about N times the next amount.
  // It is dropped only if a lower amount exists, so a lone "R$ 279,90 em 10x R$ 27,99" stays the price.
  const isTotal = (a: Amount) => {
    const n = a.after.match(/^\s*(?:em\s+)?(?:até\s+)?(\d+)\s*x\b/iu);
    const next = all[all.indexOf(a) + 1];
    return !!n && !!next && Math.abs(a.value - Number(n[1]) * next.value) <= Math.max(1, a.value * 0.02);
  };
  const others = candidates.filter((a) => !isTotal(a));
  const kept = candidates.filter((a) => !isTotal(a) || !others.some((o) => o.value < a.value));
  if (kept.length === 0) return { price: all[0].value };
  const largest = Math.max(...kept.map((a) => a.value));
  const values = kept.map((a) => a.value).filter((v) => v >= largest * MIN_SHARE_OF_LARGEST);
  const price = Math.min(...values);
  const chosen = kept.find((a) => a.value === price)!;
  const pagamento = detectPagamento(chosen.after);
  return {
    price,
    ...(largest > price ? { originalPrice: largest } : {}),
    ...(pagamento ? { pagamento } : {}),
  };
}

export function pickCardPrice(text: string): number | null {
  return pickCardPrices(text)?.price ?? null;
}

/** Whether the text right after the price (about 30 characters) says it only applies in the app or via Pix. */
export function detectPagamento(afterPrice: string): "app" | "pix" | undefined {
  const near = afterPrice.slice(0, 30);
  const m = near.match(/(?:(?:no|pelo) app|exclusivo (?:no|do) app)\b|no pix\b/i);
  // "5% de desconto no Pix" is an extra discount, not the price condition
  if (!m || /desconto/i.test(near.slice(0, m.index))) return undefined;
  return /pix/i.test(m[0]) ? "pix" : "app";
}

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}
