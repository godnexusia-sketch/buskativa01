/**
 * Reads a positive finite number from an env value. Missing/empty uses the fallback silently;
 * an invalid value uses the fallback and reports it through `warn`.
 */
export function positiveNumber(
  name: string,
  value: string | undefined,
  fallback: number,
  warn: (message: string) => void = () => {},
  opts: { integer?: boolean } = {},
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  const valid = Number.isFinite(n) && n > 0 && (!opts.integer || Number.isInteger(n));
  if (valid) return n;
  warn(`${name}=${JSON.stringify(value)} inválido (esperado número ${opts.integer ? "inteiro " : ""}positivo); usando ${fallback}`);
  return fallback;
}
