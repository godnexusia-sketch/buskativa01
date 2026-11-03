import { STORE_IDS } from "@buskativa/core";
import { STORES } from "@buskativa/core/stores";
import { listProducts, PRODUCT_ORDERS } from "@buskativa/db";
import { formatBRL } from "../../lib/format";
import { formatReais } from "../../lib/offer-filters";
import { OFERTAS_PAGE_SIZE, ofertasHref, parseOfertasParams, type OfertasParams } from "../../lib/ofertas-params";
import { getDb } from "../../lib/server";
import { PriceBadges } from "../price-badges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Todas as ofertas | BUSKATIVA" };

const ORDEM_LABEL = { "menor-preco": "Menor preço", "maior-desconto": "Maior desconto", recentes: "Atualizados recentemente" } as const;

export default async function OfertasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseOfertasParams(await searchParams);
  const { items, total } = await listProducts(getDb(), {
    store: p.loja ?? undefined,
    minCents: p.minCents,
    maxCents: p.maxCents,
    order: p.ordem,
    limit: OFERTAS_PAGE_SIZE,
    offset: (p.pagina - 1) * OFERTAS_PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / OFERTAS_PAGE_SIZE));
  const link = (over: Partial<OfertasParams>) => ofertasHref({ ...p, pagina: 1, ...over });

  return (
    <>
      <h1>Todas as ofertas</h1>
      <p className="muted">Último preço de cada produto que acompanhamos. O filtro de preço considera o total (com frete, quando informado).</p>
      <nav className="chips" aria-label="Filtrar por loja">
        <a className={`chip ${p.loja === null ? "sel" : ""}`} href={link({ loja: null })}>Todas as lojas</a>
        {STORE_IDS.map((id) => (
          <a key={id} className={`chip ${p.loja === id ? "sel" : ""}`} href={link({ loja: id })}>{STORES[id].name}</a>
        ))}
      </nav>
      <form className="filters" action="/ofertas" method="get">
        {p.loja && <input type="hidden" name="loja" value={p.loja} />}
        <label>Preço total mínimo (R$)<input name="min" inputMode="decimal" defaultValue={formatReais(p.minCents)} placeholder="0" /></label>
        <label>Preço total máximo (R$)<input name="max" inputMode="decimal" defaultValue={formatReais(p.maxCents)} placeholder="sem limite" /></label>
        <label>Ordenar por
          <select name="ordem" defaultValue={p.ordem}>
            {PRODUCT_ORDERS.map((o) => <option key={o} value={o}>{ORDEM_LABEL[o]}</option>)}
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>
      {items.length === 0 ? (
        <p>
          Nenhuma oferta encontrada com esses filtros.{" "}
          {p.pagina > 1 && <a href={link({ pagina: 1 })}>Voltar à primeira página</a>}
        </p>
      ) : (
        <>
          <p className="muted">{total} {total === 1 ? "produto" : "produtos"} · página {p.pagina} de {pages}</p>
          <div className="list">
            {items.map((i) => (
              <div key={i.productId} className="card" data-testid="offer">
                {i.imageUrl && <img src={i.imageUrl} alt="" />}
                <div className="info">
                  <a className="title" href={`/produto/${i.productId}`}>{i.title}</a>
                  <div className="muted">
                    {STORES[i.store].name} ·{" "}
                    {i.shippingCents === null ? "frete a calcular" : i.shippingCents === 0 ? "frete grátis" : `frete ${formatBRL(i.shippingCents)}`}
                  </div>
                  <PriceBadges priceCents={i.priceCents} originalPriceCents={i.originalPriceCents} pagamento={i.pagamento} />
                </div>
                <div className="price">{formatBRL(i.priceCents + (i.shippingCents ?? 0))}</div>
                <a className="btn" href={`/ir/${i.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
              </div>
            ))}
          </div>
          <nav className="pager" aria-label="Paginação">
            {p.pagina > 1 ? <a className="chip" rel="prev" href={link({ pagina: p.pagina - 1 })}>← Anterior</a> : <span />}
            {p.pagina < pages && <a className="chip" rel="next" href={link({ pagina: p.pagina + 1 })}>Próxima →</a>}
          </nav>
        </>
      )}
    </>
  );
}
