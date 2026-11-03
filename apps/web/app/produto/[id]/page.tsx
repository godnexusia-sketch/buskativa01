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
import { storeLabel } from "../../product-card";
import { CountTo } from "../../motion";
import { buyVerdict, highestPoint } from "../../../lib/verdict";
import { CATEGORIES } from "@buskativa/core/categories";

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

  const current = stats ? Math.round(stats.current * 100) : null;
  const top = highestPoint(points);
  const verdict = buyVerdict(points, stats);
  const category = product.category && product.category !== "outros" ? product.category : null;
  const comparison = [...others].sort((a, b) => a.totalCents - b.totalCents);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <nav className="crumbs" aria-label="Você está em">
        <a href="/">Início</a>
        <a href="/ofertas">Ofertas</a>
        {category && <a href={`/ofertas?categoria=${category}`}>{CATEGORIES[category].name}</a>}
      </nav>

      <section className="pdp">
        <div className="pdp-media">
          {product.imageUrl ? <img src={product.imageUrl} alt={product.title} width={600} height={600} /> : <span className="pcard-noimg" />}
        </div>
        <div className="pdp-info">
          <span className="pcard-store">{storeLabel(product.store, product.sellerName)}</span>
          <h1>{product.title}</h1>
          {current !== null && (
            <div className="pdp-price">
              <span className="price">
                <CountTo to={current} from={originalCents !== null && originalCents > current ? originalCents : current} format="brl" duration={1.2} />
              </span>
              <PriceBadges priceCents={current} originalPriceCents={originalCents} pagamento={pagamento} />
              {belowAvg && (
                <div className="badges"><span className="badge below">Abaixo da média de 30 dias</span></div>
              )}
            </div>
          )}
          <div className={`verdict ${verdict.kind}`} role="status">
            <strong>{verdict.title}</strong>
            <span>{verdict.detail}</span>
          </div>
          <a className="btn btn-big" href={`/ir/${product.id}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
          {points.length > 0 && (
            <p className="muted small">
              Preço visto em {formatDateTime(points[points.length - 1].observedAt)}. Pode ter mudado na loja.
            </p>
          )}
        </div>
      </section>

      {stats && (
        <section className="facts" aria-label="Resumo do preço">
          <div className="fact">
            <span className="fact-label">Menor preço</span>
            <strong className="fact-value good">{formatBRL(Math.round(stats.lowest.price * 100))}</strong>
            <span className="fact-sub">em {formatDateTime(stats.lowest.observedAt)}</span>
          </div>
          {top && top.price !== stats.lowest.price && (
            <div className="fact">
              <span className="fact-label">Maior preço</span>
              <strong className="fact-value bad">{formatBRL(Math.round(top.price * 100))}</strong>
              <span className="fact-sub">em {formatDateTime(top.observedAt)}</span>
            </div>
          )}
          <div className="fact">
            <span className="fact-label">Média 30 dias</span>
            <strong className="fact-value">{formatBRL(Math.round(stats.avg30d * 100))}</strong>
            <span className="fact-sub">
              Agora {Math.abs(Math.round(stats.changeVsAvg30d * 100))}% {stats.changeVsAvg30d <= 0 ? "abaixo" : "acima"}
            </span>
          </div>
          <div className="fact">
            <span className="fact-label">Próxima queda provável</span>
            <strong className="fact-value">{formatDateTime(stats.nextLowWindow)}</strong>
            <span className="fact-sub">
              Costuma baixar {WEEKDAYS[stats.bestWeekday]}, {hourBlockLabel(stats.bestHourBlock)}. Estimativa, {CONFIDENCE_LABEL[stats.confidence]}
            </span>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Histórico de preço</h2>
        <PriceChart
          points={points.map((p) => ({ price: p.price, observedAt: p.observedAt.toISOString() }))}
          avg={stats ? stats.avg30d : undefined}
        />
      </section>

      {comparison.length > 0 && (
        <section className="panel">
          <h2>Mesmo produto em outras lojas</h2>
          <ol className="compare">
            {comparison.map((r, i) => (
              <li key={r.productId}>
                <div className="compare-info">
                  <span className="pcard-store">{storeLabel(r.store, r.sellerName)}{i === 0 && current !== null && r.totalCents < current ? " · mais barato" : ""}</span>
                  <a className="title" href={`/produto/${r.productId}`}>{r.title}</a>
                  <PriceBadges priceCents={r.priceCents} originalPriceCents={r.originalPriceCents} pagamento={r.pagamento} />
                </div>
                <span className="price">{formatBRL(r.totalCents)}</span>
                <a className="btn btn-store" href={`/ir/${r.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_PRODUCT} />

      {coupons.length > 0 && (
        <section className="panel">
          <h2>Cupons para {STORES[product.store].name}</h2>
          <div className="list">
            {coupons.map((c) => <CouponCard key={c.id} coupon={c} showStore={false} />)}
          </div>
        </section>
      )}
    </>
  );
}
