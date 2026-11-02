import { type Connector, ConnectorError, type Offer } from "@buskativa/core";
// @ts-expect-error pacote sem tipos
import amazonPaapi from "amazon-paapi";

export interface PaapiItem {
  ASIN: string;
  DetailPageURL: string;
  ItemInfo?: { Title?: { DisplayValue?: string } };
  Offers?: { Listings?: { Price?: { Amount?: number } }[] };
  Images?: { Primary?: { Medium?: { URL?: string } } };
}
export type SearchItemsFn = (keywords: string, count: number) => Promise<PaapiItem[]>;

export function paapiSearchItems(cfg: { accessKey: string; secretKey: string; partnerTag: string }): SearchItemsFn {
  return async (keywords, count) => {
    const res = await amazonPaapi.SearchItems(
      {
        AccessKey: cfg.accessKey,
        SecretKey: cfg.secretKey,
        PartnerTag: cfg.partnerTag,
        PartnerType: "Associates",
        Marketplace: "www.amazon.com.br",
      },
      {
        Keywords: keywords,
        SearchIndex: "All",
        ItemCount: Math.min(count, 10),
        Resources: ["ItemInfo.Title", "Offers.Listings.Price", "Images.Primary.Medium"],
      },
    );
    return (res?.SearchResult?.Items ?? []) as PaapiItem[];
  };
}

export function amazonPaapiConnector(opts: { searchItems: SearchItemsFn }): Connector {
  return {
    id: "amazon",
    async search(q, { limit }) {
      let items: PaapiItem[];
      try {
        items = await opts.searchItems(q.termo, limit);
      } catch (e) {
        const msg = String(e);
        throw new ConnectorError(/429|TooManyRequests|Unauthorized|403/i.test(msg) ? "BLOCKED" : "NETWORK", msg);
      }
      return items.flatMap((it): Offer[] => {
        const price = it.Offers?.Listings?.[0]?.Price?.Amount;
        const title = it.ItemInfo?.Title?.DisplayValue;
        if (price === undefined || !title) return [];
        return [
          {
            store: "amazon",
            externalId: it.ASIN,
            title,
            url: it.DetailPageURL,
            price,
            shipping: null,
            currency: "BRL",
            imageUrl: it.Images?.Primary?.Medium?.URL,
            attributes: {},
          },
        ];
      });
    },
  };
}
