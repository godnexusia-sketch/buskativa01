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
const LOGIN_URL = /\/(login|signin|buyer\/login|verify\/traffic)/i;

/** Devolve o motivo do bloqueio ou null. Só detecta; nunca tenta contornar. */
export function detectBlock(page: { status: number | null; url: string; text: string }): string | null {
  if (page.status === 403 || page.status === 429) return `HTTP ${page.status}`;
  if (LOGIN_URL.test(page.url)) return `redirecionado para login/verificação: ${page.url}`;
  if (BLOCK_TEXT.test(page.text)) return "página de verificação/CAPTCHA";
  if (page.text.trim().length < 20) return "página vazia (provável bloqueio anti-bot)";
  return null;
}

export async function fetchRendered(url: string, timeoutMs = 30000): Promise<string> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1366, height: 900 },
  });
  try {
    const page = await ctx.newPage();
    let status: number | null = null;
    try {
      status = (await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs }))?.status() ?? null;
    } catch (e) {
      throw new ConnectorError(/timeout/i.test(String(e)) ? "TIMEOUT" : "NETWORK", String(e));
    }
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const visible = await page.innerText("body").catch(() => "");
    const blocked = detectBlock({ status, url: page.url(), text: visible });
    if (blocked) throw new ConnectorError("BLOCKED", blocked);
    return await page.content();
  } finally {
    await ctx.close();
  }
}
