import { STORES } from "@buskativa/core/stores";
import { topDrops } from "@buskativa/db";
import { formatBRL } from "../lib/format";
import { getDb } from "../lib/server";
import { AdSlot } from "./ad-slot";

export const dynamic = "force-dynamic";

export default async function Home() {
  const drops = await topDrops(getDb(), new Date(), 12);
  return (
    <>
      <h1>O menor preço, agora.</h1>
      <p className="muted">Pesquisamos Mercado Livre, Amazon, Magalu, Shopee, AliExpress e TikTok Shop 24 horas por dia.</p>
      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} />
      <h2>Maiores quedas nas últimas 24h</h2>
      {drops.length === 0 ? (
        <p className="muted">Ainda juntando histórico. Faça uma busca acima.</p>
      ) : (
        <div className="list">
          {drops.map((d) => (
            <a key={d.productId} className="card" href={`/produto/${d.productId}`} style={{ textDecoration: "none" }}>
              {d.imageUrl && <img src={d.imageUrl} alt="" />}
              <div className="info">
                <div className="title">{d.title}</div>
                <div className="muted">{STORES[d.store].name} · era {formatBRL(d.prevAvgCents)} em média</div>
              </div>
              <div>
                <div className="price">{formatBRL(d.nowCents)}</div>
                <div className="muted">−{Math.round(d.drop * 100)}%</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
