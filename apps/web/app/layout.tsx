import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BUSKATIVA",
  description: "O menor preço agora, em várias lojas, com histórico e o melhor horário para comprar.",
};

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
            <a href="/cupons">Cupons</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
