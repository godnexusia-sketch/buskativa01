export const STORE_IDS = [
  "mercadolivre",
  "amazon",
  "shopee",
  "magalu",
  "aliexpress",
  "tiktokshop",
  "kwaishop",
  "lomadee",
] as const;
export type StoreId = (typeof STORE_IDS)[number];

export interface QueryAttributes {
  marca?: string;
  modelo?: string;
  capacidade?: string;
  cor?: string;
  tamanho?: string;
  voltagem?: string;
}

export interface NormalizedQuery {
  original: string;
  termo: string;
  tipo: "generica" | "especifica";
  atributos: QueryAttributes;
  hash: string;
}

export interface Offer {
  store: StoreId;
  externalId: string;
  title: string;
  url: string;
  price: number;
  /** Price before the discount (the "de" price). */
  originalPrice?: number;
  shipping: number | null;
  currency: "BRL";
  sellerName?: string;
  sellerRating?: number;
  imageUrl?: string;
  /** `pagamento`: "app" or "pix" when the price only applies that way. */
  attributes: Record<string, string>;
}

export type ConnectorErrorCode = "BLOCKED" | "TIMEOUT" | "NETWORK" | "PARSE";

export class ConnectorError extends Error {
  constructor(
    public readonly code: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export interface Connector {
  id: StoreId;
  experimental?: boolean;
  search(q: NormalizedQuery, opts: { limit: number }): Promise<Offer[]>;
}

export interface PricePoint {
  price: number;
  observedAt: Date;
}

export interface StoreStatus {
  ok: boolean;
  count?: number;
  error?: ConnectorErrorCode;
  message?: string;
}
