import { computeStats, similarity } from "@buskativa/core";
import { STORES } from "@buskativa/core/stores";
import { getLatestOriginalPriceCents, getPriceHistory, getProduct, latestRunIdForProduct } from "@buskativa/db";
import { notFound } from "next/navigation";
import { CONFIDENCE_LABEL, formatBRL, formatDateTime, hourBlockLabel, WEEKDAYS } from "../../../lib/format";
import { searchResults } from "../../../lib/search-service";
import { getDb } from "../../../lib/server";
import { PriceBadges } from "../../price-badges";
import { PriceChart } from "./price-chart";

export const dynamic = "force-dynamic";

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const product = Number.isInteger(id) ? await getProduct(db, id) : null;
  if (!product) notFound();

  const points = await getPriceHistory(db, id);
  const stats = computeStats(points, new Date());
  const originalCents = await getLatestOriginalPriceCents(db, id);
  const pagamento = product.attributes.pagamento === "app" || product.attributes.pagamento === "pix" ? product.attributes.pagamento : null;
  const belowAvg = stats !== null && stats.changeVsAvg30d <= -0.05;
  const runId = await latestRunIdForProduct(db, id);
  const run = runId ? await searchResults(db, runId) : null;
  const others = (run?.results ?? []).filter(
    (r) => r.productId !== id && r.store !== product.store && similarity(r.title, product.title) >= 0.6,
  );

  return (
    <>
      <div className="card">
        {product.imageUrl && <img src={product.imageUrl} alt="" />}
        <div className="info">
          <h1 style={{ fontSize: 20, margin: 0 }}>{product.title}</h1>
          <div className="muted">{STORES[product.store].name}</div>
          {stats && (
            <PriceBadges priceCents={Math.round(stats.current * 100)} originalPriceCents={originalCents} pagamento={pagamento} />
          )}
          {belowAvg && (
            <div className="badges">
              <span className="badge below">Abaixo da média de 30 dias</span>
            </div>
          )}
        </div>
        {stats && <div className="price">{formatBRL(Math.round(stats.current * 100))}</div>}
        <a className="btn" href={`/ir/${product.id}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
      </div>

      {stats && (
        <div className="stats">
          <div className="card">
            <span className="muted">Menor preço</span>
            <span className="price">{formatBRL(Math.round(stats.lowest.price * 100))}</span>
            <span className="muted">em {formatDateTime(stats.lowest.observedAt)}</span>
          </div>
          <div className="card">
            <span className="muted">Melhor dia</span>
            <strong>{WEEKDAYS[stats.bestWeekday]}</strong>
            <span className="muted">Melhor horário: {hourBlockLabel(stats.bestHourBlock)}</span>
          </div>
          <div className="card">
            <span className="muted">Próxima queda provável</span>
            <strong>{formatDateTime(stats.nextLowWindow)}</strong>
            <span className="muted">Estimativa, {CONFIDENCE_LABEL[stats.confidence]}</span>
          </div>
          <div className="card">
            <span className="muted">Média 30 dias</span>
            <strong>{formatBRL(Math.round(stats.avg30d * 100))}</strong>
            <span className="muted">
              Agora está {Math.abs(Math.round(stats.changeVsAvg30d * 100))}% {stats.changeVsAvg30d <= 0 ? "abaixo" : "acima"} da média
            </span>
          </div>
        </div>
      )}

      <h2>Histórico de preço</h2>
      <PriceChart points={points.map((p) => ({ price: p.price, observedAt: p.observedAt.toISOString() }))} />

      {others.length > 0 && (
        <>
          <h2>Mesmo produto em outras lojas</h2>
          <div className="list">
            {others.map((r) => (
              <div key={r.productId} className="card">
                <div className="info">
                  <a className="title" href={`/produto/${r.productId}`}>{r.title}</a>
                  <div className="muted">{STORES[r.store].name}</div>
                  <PriceBadges priceCents={r.priceCents} originalPriceCents={r.originalPriceCents} pagamento={r.pagamento} />
                </div>
                <div className="price">{formatBRL(r.totalCents)}</div>
                <a className="btn" href={`/ir/${r.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
