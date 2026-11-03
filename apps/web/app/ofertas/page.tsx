import { STORE_IDS } from "@buskativa/core";
import { CATEGORIES } from "@buskativa/core/categories";
import { STORES } from "@buskativa/core/stores";
import { categoryCounts, listProducts, PRODUCT_ORDERS } from "@buskativa/db";
import type { Metadata } from "next";
import { formatReais } from "../../lib/offer-filters";
import { OFERTAS_PAGE_SIZE, ofertasHref, parseOfertasParams, type OfertasParams } from "../../lib/ofertas-params";
import { getDb } from "../../lib/server";
import { CategoryNav } from "../category-nav";
import { ProductCard } from "../product-card";
import { Reveal } from "../reveal";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const p = parseOfertasParams(await searchParams);
  return { title: p.categoria ? `${CATEGORIES[p.categoria].name}: menores preços` : "Todas as ofertas" };
}

const ORDEM_LABEL = { "menor-preco": "Menor preço", "maior-desconto": "Maior desconto", recentes: "Atualizados recentemente" } as const;

export default async function OfertasPage({ searchParams }: { searchParams: Search }) {
  const p = parseOfertasParams(await searchParams);
  const db = getDb();
  const [{ items, total }, counts] = await Promise.all([
    listProducts(db, {
      store: p.loja ?? undefined,
      category: p.categoria ?? undefined,
      onlyDiscount: p.desconto,
      minCents: p.minCents,
      maxCents: p.maxCents,
      order: p.ordem,
      limit: OFERTAS_PAGE_SIZE,
      offset: (p.pagina - 1) * OFERTAS_PAGE_SIZE,
    }),
    categoryCounts(db),
  ]);
  const pages = Math.max(1, Math.ceil(total / OFERTAS_PAGE_SIZE));
  const link = (over: Partial<OfertasParams>) => ofertasHref({ ...p, pagina: 1, ...over });
  const heading = p.categoria ? CATEGORIES[p.categoria].name : "Todas as ofertas";
  const activeFilters = [p.loja, p.minCents, p.maxCents, p.desconto || undefined].filter((v) => v != null).length;

  return (
    <>
      <CategoryNav current={p.categoria} counts={counts} />
      <div className="catalog-head">
        <h1>{heading}</h1>
        <p className="muted">
          {total} {total === 1 ? "produto" : "produtos"}, com o último preço de cada um. O preço mostrado já soma o frete quando a loja informa.
        </p>
      </div>

      <div className="catalog">
        <div className="filters-panel">
          <input type="checkbox" id="filtros" className="filters-toggle" defaultChecked={activeFilters > 0} />
          <label htmlFor="filtros" className="filters-summary">
            Filtros e ordem{activeFilters > 0 && <span className="count">{activeFilters}</span>}
          </label>
          <form className="filters" action="/ofertas" method="get">
            {p.categoria && <input type="hidden" name="categoria" value={p.categoria} />}
            <fieldset>
              <legend>Loja</legend>
              <label className="radio"><input type="radio" name="loja" value="" defaultChecked={p.loja === null} /> Todas</label>
              {STORE_IDS.map((id) => (
                <label key={id} className="radio">
                  <input type="radio" name="loja" value={id} defaultChecked={p.loja === id} /> {STORES[id].name}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Preço (R$)</legend>
              <div className="range">
                <input name="min" aria-label="Preço mínimo" inputMode="decimal" defaultValue={formatReais(p.minCents)} placeholder="mín." />
                <input name="max" aria-label="Preço máximo" inputMode="decimal" defaultValue={formatReais(p.maxCents)} placeholder="máx." />
              </div>
            </fieldset>
            <label className="check">
              <input type="checkbox" name="desconto" value="1" defaultChecked={p.desconto} /> Só produtos com desconto
            </label>
            <label className="select">Ordenar por
              <select name="ordem" defaultValue={p.ordem}>
                {PRODUCT_ORDERS.map((o) => <option key={o} value={o}>{ORDEM_LABEL[o]}</option>)}
              </select>
            </label>
            <div className="filter-actions">
              <button type="submit">Aplicar filtros</button>
              {activeFilters > 0 && <a className="btn ghost" href={link({ loja: null, minCents: undefined, maxCents: undefined, desconto: false })}>Limpar</a>}
            </div>
          </form>
        </div>

        <div className="catalog-results">
          {items.length === 0 ? (
            <div className="empty">
              <p>Nenhum produto com esses filtros.</p>
              {p.pagina > 1 ? <a href={link({ pagina: 1 })}>Voltar à primeira página</a> : <a href="/ofertas">Ver todas as ofertas</a>}
            </div>
          ) : (
            <>
              <Reveal className="grid">
                {items.map((i) => <ProductCard key={i.productId} p={i} />)}
              </Reveal>
              <nav className="pager" aria-label="Paginação">
                {p.pagina > 1 ? <a className="btn ghost" rel="prev" href={link({ pagina: p.pagina - 1 })}>Anterior</a> : <span />}
                <span className="muted">Página {p.pagina} de {pages}</span>
                {p.pagina < pages ? <a className="btn ghost" rel="next" href={link({ pagina: p.pagina + 1 })}>Próxima</a> : <span />}
              </nav>
            </>
          )}
        </div>
      </div>
    </>
  );
}
