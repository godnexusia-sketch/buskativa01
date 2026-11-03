import { computeStats, similarity } from "@buskativa/core";
import { STORES } from "@buskativa/core/stores";
import { getLatestOriginalPriceCents, getPriceHistory, getProduct, latestRunIdForProduct } from "@buskativa/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AdSlot } from "../../ad-slot";
import { jsonLdString, productDescription, productJsonLd } from "../../../lib/seo";
import { siteUrl } from "../../../lib/site";
import { listCouponsPublic, type PublicCoupon } from "../../../lib/coupon-service";
import { CouponCard } from "../../cupons/coupon-card";
import { CONFIDENCE_LABEL, formatBRL, formatDateTime, hourBlockLabel, WEEKDAYS } from "../../../lib/format";
import { searchResults } from "../../../lib/search-service";
import { getDb } from "../../../lib/server";
import { PriceBadges } from "../../price-badges";
import { PriceChart } from "./price-chart";

export const dynamic = "force-dynamic";

const loadProduct = cache(async (id: number) => {
  const product = Number.isInteger(id) ? await getProduct(getDb(), id) : null;
  if (!product) return null;
  const points = await getPriceHistory(getDb(), id);
  return { product, points, stats: computeStats(points, new Date()) };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const loaded = await loadProduct(Number((await params).id));
  if (!loaded) return { title: "Produto não encontrado", robots: { index: false } };
  const { product, stats } = loaded;
  const price = stats ? formatBRL(Math.round(stats.current * 100)) : null;
  return {
    title: product.title,
    description: productDescription(product.title, STORES[product.store].name, price),
    alternates: { canonical: `/produto/${product.id}` },
    openGraph: {
      type: "website",
      siteName: "BUSKATIVA",
      locale: "pt_BR",
      url: `/produto/${product.id}`,
      title: product.title,
      description: productDescription(product.title, STORES[product.store].name, price),
      ...(product.imageUrl ? { images: [product.imageUrl] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      ...(product.imageUrl ? { images: [product.imageUrl] } : {}),
    },
  };
}

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const loaded = await loadProduct(id);
  if (!loaded) notFound();
  const { product, points, stats } = loaded;
  const originalCents = await getLatestOriginalPriceCents(db, id);
  const pagamento = product.attributes.pagamento === "app" || product.attributes.pagamento === "pix" ? product.attributes.pagamento : null;
  const belowAvg = stats !== null && stats.changeVsAvg30d <= -0.05;
  const runId = await latestRunIdForProduct(db, id);
  const run = runId ? await searchResults(db, runId) : null;
  const others = (run?.results ?? []).filter(
    (r) => r.productId !== id && r.store !== product.store && similarity(r.title, product.title) >= 0.6,
  );

  const coupons = ((await listCouponsPublic(db, product.store, new Date())).body as { coupons: PublicCoupon[] }).coupons;

  const ld = productJsonLd(siteUrl(), {
    id: product.id,
    title: product.title,
    imageUrl: product.imageUrl,
    storeName: STORES[product.store].name,
    priceCents: stats ? Math.round(stats.current * 100) : null,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
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

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_PRODUCT} />

      {coupons.length > 0 && (
        <>
          <h2>Cupons para {STORES[product.store].name}</h2>
          <div className="list">
            {coupons.map((c) => <CouponCard key={c.id} coupon={c} showStore={false} />)}
          </div>
        </>
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
