import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteUrl } from "../lib/site";
import { Analytics } from "./analytics";
import { CookieBanner, CookieSettingsButton } from "./cookie-banner";
import "./globals.css";

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
    <html lang="pt-BR">
      <body>
        <header className="top">
          <a className="logo" href="/">BUSKATIVA</a>
          <form className="search" action="/busca">
            <input name="q" placeholder="Busque um produto: ex. iPhone 15 128GB preto" required minLength={2} maxLength={120} />
            <button type="submit">Buscar</button>
          </form>
          <nav className="main" aria-label="Principal">
            <a href="/">Início</a>
            <a href="/ofertas">Ofertas</a>
            <a href="/cupons">Cupons</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
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
