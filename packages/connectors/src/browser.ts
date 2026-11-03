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
const LOGIN_URL = /\/(login|signin|buyer\/login)/i;

export async function fetchRendered(url: string, timeoutMs = 30000): Promise<string> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1366, height: 900 },
  });
  try {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (e) {
      throw new ConnectorError(/timeout/i.test(String(e)) ? "TIMEOUT" : "NETWORK", String(e));
    }
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    if (LOGIN_URL.test(page.url())) throw new ConnectorError("BLOCKED", `redirecionado para login: ${page.url()}`);
    const visible = await page.innerText("body").catch(() => "");
    if (BLOCK_TEXT.test(visible)) throw new ConnectorError("BLOCKED", "página de verificação/CAPTCHA");
    return await page.content();
  } finally {
    await ctx.close();
  }
}
