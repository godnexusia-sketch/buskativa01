/** Discount in whole percent, only when `originalPrice` is above `price` and the discount is 1% to 95%. */
export function discountPercent(price: number, originalPrice?: number | null): number | null {
  if (originalPrice == null || !(price > 0) || !(originalPrice > price)) return null;
  const pct = Math.round((1 - price / originalPrice) * 100);
  return pct >= 1 && pct <= 95 ? pct : null;
}
