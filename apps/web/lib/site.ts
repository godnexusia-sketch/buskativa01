export const DEFAULT_SITE_URL = "http://localhost:3000";
export const DEFAULT_CONTACT_EMAIL = "godnexus.ia@gmail.com";

export const INSTITUTIONAL_PATHS = ["/sobre", "/privacidade", "/termos", "/contato"] as const;

/** URL canônica do site, sem barra final. Valor ausente ou inválido cai em localhost. */
export function resolveSiteUrl(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_SITE_URL;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return DEFAULT_SITE_URL;
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function siteUrl(): string {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

export function contactEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;
}

/** Client do AdSense só vale no formato ca-pub-<dígitos>. */
export function normalizeAdsenseClient(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  return /^ca-pub-\d+$/.test(v) ? v : null;
}

/** Linha do ads.txt (sem client válido, null). */
export function adsTxtLine(client: string | undefined | null): string | null {
  const v = normalizeAdsenseClient(client);
  return v ? `google.com, ${v.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : null;
}

/** ID do GA4 só vale no formato G-XXXX. */
export function normalizeGaId(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  return /^G-[A-Z0-9]+$/i.test(v) ? v : null;
}
