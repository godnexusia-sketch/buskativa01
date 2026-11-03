import { CATEGORIES } from "@buskativa/core/categories";
import { STORE_IDS } from "@buskativa/core";
import { STORES } from "@buskativa/core/stores";
import { formatBRL } from "../lib/format";
import { loadHomeSections, loadTopDrops } from "../lib/home";
import { AdSlot } from "./ad-slot";
import { CategoryNav } from "./category-nav";
import { discountPercent } from "@buskativa/core/discount";
import { Carousel } from "./carousel";
import { DepthShowcase } from "./depth-showcase";
import { ProductCard, storeLabel } from "./product-card";
import { SearchIcon } from "./icons";
import { CountTo } from "./motion";
import { Ticker, type TickerItem } from "./ticker";
import { Radar } from "./radar";
import { loadRadar } from "../lib/radar";
import { getDb } from "../lib/server";

export const dynamic = "force-dynamic";

const SUGESTOES = ["iPhone 15", "Air fryer", "PlayStation 5", "Smart TV 50", "Notebook", "Fone JBL"];

export default async function Home() {
  const radarAt = new Date().toISOString();
  const [home, drops, radar] = await Promise.all([
    loadHomeSections(),
    loadTopDrops(new Date(), 8),
    loadRadar(getDb(), new Date()).catch((err) => {
      console.error("falha no radar", err);
      return [];
    }),
  ]);
  const empty = home.total === 0;
  // real drops of the last 24 h first, then the biggest "de/por" discounts
  const ticker: TickerItem[] = [
    ...drops.map((d) => ({ productId: d.productId, title: d.title, imageUrl: d.imageUrl, priceCents: d.nowCents, pct: Math.round(d.drop * 100) })),
    ...home.deals.map((p) => ({
      productId: p.productId,
      title: p.title,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      pct: discountPercent(p.priceCents / 100, p.originalPriceCents == null ? null : p.originalPriceCents / 100) ?? 0,
    })),
  ].filter((t, i, all) => t.pct > 0 && all.findIndex((o) => o.productId === t.productId) === i);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>O menor preço de cada produto, lado a lado.</h1>
          <form className="hero-search" action="/busca" role="search">
            <SearchIcon />
            <input name="q" aria-label="Buscar produto" placeholder="Busque um produto e compare as lojas" required minLength={2} maxLength={120} />
            <button type="submit">Comparar</button>
          </form>
          <p>
            {empty ? (
              "Comparamos lojas e guardamos o histórico de preço de cada produto."
            ) : (
              <>
                <strong className="hero-count"><CountTo to={home.total} /></strong> produtos acompanhados, com histórico de preço e cupons.
              </>
            )}
          </p>
          <div className="hero-suggest" aria-label="Buscas populares">
            {SUGESTOES.map((s) => (
              <a key={s} href={`/busca?q=${encodeURIComponent(s)}`}>{s}</a>
            ))}
          </div>
        </div>
        <ul className="hero-stores" aria-label="Lojas comparadas">
          {STORE_IDS.map((id, n) => <li key={id} style={{ "--n": n } as React.CSSProperties}>{STORES[id].name}</li>)}
        </ul>
      </section>

      <Ticker items={ticker} />

      <DepthShowcase
        items={home.deals.slice(0, 8).map((p) => ({
          productId: p.productId,
          title: p.title,
          imageUrl: p.imageUrl,
          store: storeLabel(p.store, p.sellerName),
          priceCents: p.priceCents,
          originalPriceCents: p.originalPriceCents,
          pct: discountPercent(p.priceCents / 100, p.originalPriceCents == null ? null : p.originalPriceCents / 100),
        }))}
      />

      <CategoryNav counts={home.counts} />

      {empty && (
        <p className="empty">Ainda estamos juntando os primeiros preços. Busque um produto acima para começar.</p>
      )}

      <Radar initial={radar} initialAt={radarAt} />

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} />

      {drops.length > 0 && (
        <section className="shelf">
          <header className="shelf-head">
            <h2>Caíram de preço nas últimas 24 horas</h2>
          </header>
          <ol className="drops">
            {drops.map((d) => (
              <li key={d.productId}>
                <a href={`/produto/${d.productId}`}>
                  {d.imageUrl ? <img src={d.imageUrl} alt="" loading="lazy" /> : <span className="pcard-noimg" />}
                  <span className="drops-title">{d.title}</span>
                  <span className="drops-store">{STORES[d.store].name}</span>
                  <span className="drops-price">
                    <strong>{formatBRL(d.nowCents)}</strong>
                    <span className="drops-pct">−{Math.round(d.drop * 100)}%</span>
                  </span>
                  <span className="drops-was">média anterior {formatBRL(d.prevAvgCents)}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {home.rails.map((r) => (
        <section key={r.category} className="shelf">
          <header className="shelf-head">
            <h2>{CATEGORIES[r.category].name}</h2>
            <a href={`/ofertas?categoria=${r.category}`}>Ver tudo</a>
          </header>
          <Carousel label={CATEGORIES[r.category].name}>
            {r.items.map((p) => <ProductCard key={p.productId} p={p} />)}
          </Carousel>
        </section>
      ))}

      <section className="trust" aria-labelledby="como-funciona">
        <h2 id="como-funciona">Como o BUSKATIVA funciona</h2>
        <ol>
          <li>
            <strong>Comparamos as lojas</strong>
            <span>Buscamos o mesmo produto em várias lojas e mostramos o preço total, com frete quando a loja informa.</span>
          </li>
          <li>
            <strong>Guardamos o histórico</strong>
            <span>Cada preço visto entra no gráfico, para você saber se o desconto é real ou se o preço só voltou ao normal.</span>
          </li>
          <li>
            <strong>Você compra na loja</strong>
            <span>O pagamento é feito no site da loja. Alguns links são de afiliado: podemos ganhar uma comissão, sem custo para você.</span>
          </li>
        </ol>
      </section>
    </>
  );
}
