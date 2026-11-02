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
