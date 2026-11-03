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

/** Every BRL amount in the text, in order; amounts without "R$" only when none has it. */
export function parseAllBRL(text: string): number[] {
  const collect = (src: string) =>
    [...text.matchAll(new RegExp(src, "g"))].map((m) => toNumber(m[1])).filter((v): v is number => v !== null);
  const withSymbol = collect(WITH_SYMBOL_SRC);
  return withSymbol.length > 0 ? withSymbol : collect(WITHOUT_SYMBOL_SRC);
}

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}
