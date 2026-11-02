import { type Connector, type Offer, STORES, type StoreId } from "@buskativa/core";

const DEMO_STORES: StoreId[] = ["mercadolivre", "amazon", "magalu"];

function seed(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return h;
}

/** Conectores falsos e determinísticos, para desenvolvimento local e E2E (CONNECTORS=demo). */
export function demoConnectors(): Connector[] {
  return DEMO_STORES.map((store, s) => ({
    id: store,
    async search(q) {
      const base = 100 + seed(q.termo);
      return [1, 2, 3].map(
        (n): Offer => ({
          store,
          externalId: `demo-${store}-${seed(q.termo)}-${n}`,
          title: `${q.original} - Oferta ${n}`,
          url: `https://www.${STORES[store].domains[0]}/demo-${seed(q.termo)}-${n}`,
          price: base + s * 10 + n * 5,
          shipping: n === 1 ? 0 : null,
          currency: "BRL",
          attributes: {},
        }),
      );
    },
  }));
}
