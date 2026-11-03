/** Discount in whole percent, only when `originalPrice` is above `price` and the discount is 1% to 95%. */
export function discountPercent(price: number, originalPrice?: number | null): number | null {
  if (originalPrice == null || !(price > 0) || !(originalPrice > price)) return null;
  const pct = Math.round((1 - price / originalPrice) * 100);
  return pct >= 1 && pct <= 95 ? pct : null;
}

/** Spread into an Offer: `originalPrice` only when it is a number above `price`. */
export function withOriginalPrice(price: number, original: unknown): { originalPrice?: number } {
  const value = typeof original === "string" ? Number(original) : original;
  return typeof value === "number" && Number.isFinite(value) && value > price ? { originalPrice: value } : {};
}
