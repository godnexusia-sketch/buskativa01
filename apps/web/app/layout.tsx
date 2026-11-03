import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { siteUrl } from "../lib/site";
import { Analytics } from "./analytics";
import { CookieBanner, CookieSettingsButton } from "./cookie-banner";
import "./globals.css";
import { Logo, SearchIcon } from "./icons";
import { MotionProvider } from "./motion";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const viewport: Viewport = { themeColor: "#0e1b2c", width: "device-width", initialScale: 1 };

const DESCRIPTION = "O menor preço agora, em várias lojas, com histórico e o melhor horário para comprar.";

export function generateMetadata(): Metadata {
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: "BUSKATIVA: o menor preço, agora", template: "%s | BUSKATIVA" },
    description: DESCRIPTION,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "BUSKATIVA",
      title: "BUSKATIVA: o menor preço, agora",
      description: DESCRIPTION,
    },
    ...(google ? { verification: { google } } : {}),
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="top">
          <div className="top-inner">
            <a className="logo" href="/" aria-label="BUSKATIVA, página inicial">
              <Logo />
              <span>BUSKATIVA</span>
            </a>
            <form className="search" action="/busca" role="search">
              <span className="search-icon"><SearchIcon /></span>
              <input name="q" aria-label="Buscar produto" placeholder="Qual produto você procura?" required minLength={2} maxLength={120} />
              <button type="submit">Buscar</button>
            </form>
            <nav className="main" aria-label="Principal">
              <a href="/ofertas">Ofertas</a>
              <a href="/cupons">Cupons</a>
            </nav>
          </div>
        </header>
        <MotionProvider>
          <main>{children}</main>
        </MotionProvider>
        <footer className="site-footer">
          <div className="footer-brand">
            <Logo />
            <p>Comparamos o preço de cada produto em várias lojas e guardamos o histórico, para você comprar na hora certa.</p>
          </div>
          <nav aria-label="Institucional">
            <a href="/sobre">Sobre</a>
            <a href="/privacidade">Privacidade</a>
            <a href="/termos">Termos</a>
            <a href="/contato">Contato</a>
            <CookieSettingsButton />
          </nav>
          <p className="muted">
            Alguns links são de afiliado: se você comprar por eles, o BUSKATIVA pode receber uma comissão, sem custo
            extra para você. Preços e disponibilidade podem mudar na loja.
          </p>
        </footer>
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  );
}
