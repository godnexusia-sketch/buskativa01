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
      return [{ value, before: text.slice(Math.max(0, start - 25), start), after: text.slice(end, end + 20) }];
    });
  const withSymbol = collect(WITH_SYMBOL_SRC);
  return withSymbol.length > 0 ? withSymbol : collect(WITHOUT_SYMBOL_SRC);
}

/** Every BRL amount in the text, in order; amounts without "R$" only when none has it. */
export function parseAllBRL(text: string): number[] {
  return amounts(text).map((a) => a.value);
}

const INSTALLMENT_BEFORE = /\d+\s*x\s*(de\s*)?$/i;
const EXTRA_BEFORE = /(frete|entrega|cashback|economize|desconto)\s*:?\s*(de\s*)?$/i;
const EXTRA_AFTER = /^\s*(de\s+)?(cashback|desconto|off)\b/i;

/**
 * Current price shown in a product card: the lowest amount that is not an installment
 * ("10x de R$ 27,99") or a shipping/cashback/discount figure. Falls back to the first amount
 * when every amount was excluded.
 */
export function pickCardPrice(text: string): number | null {
  const all = amounts(text);
  if (all.length === 0) return null;
  const candidates = all.filter(
    (a) => !INSTALLMENT_BEFORE.test(a.before) && !EXTRA_BEFORE.test(a.before) && !EXTRA_AFTER.test(a.after),
  );
  return candidates.length > 0 ? Math.min(...candidates.map((a) => a.value)) : all[0].value;
}

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}
