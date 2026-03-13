/**
 * @section consts
 */

export const SUPPORTED_ASSETS = ["btc", "eth", "sol", "xrp"] as const;
export const SUPPORTED_WINDOWS = ["5m", "15m"] as const;
export const PROVIDER_KEYS = ["chainlink", "binance", "coinbase", "kraken", "okx"] as const;
export const ORDERBOOK_SIDES = ["up", "down"] as const;

/**
 * @section types
 */

export type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];
export type SupportedWindow = (typeof SUPPORTED_WINDOWS)[number];
export type ProviderKey = (typeof PROVIDER_KEYS)[number];
export type OrderBookSideKey = (typeof ORDERBOOK_SIDES)[number];
export type AssetWindow = { asset: SupportedAsset; window: SupportedWindow };
export type CacheEntry<TValue> = { expiresAt: number; value: TValue };
export type OrderBookLevel = { price: number; size: number };
export type OrderBook = { bids: OrderBookLevel[]; asks: OrderBookLevel[] };
export type ProviderOrderBook = { type: string; provider: string; symbol: string; ts: number; bids: OrderBookLevel[]; asks: OrderBookLevel[] };

export type Snapshot = {
  asset: SupportedAsset;
  window: SupportedWindow;
  generatedAt: number;
  marketId: string | null;
  marketSlug: string | null;
  marketConditionId: string | null;
  marketStart: string | null;
  marketEnd: string | null;
  priceToBeat: number | null;
  upAssetId: string | null;
  upPrice: number | null;
  upOrderBook: OrderBook | null;
  upEventTs: number | null;
  downAssetId: string | null;
  downPrice: number | null;
  downOrderBook: OrderBook | null;
  downEventTs: number | null;
  binancePrice: number | null;
  binanceOrderBook: ProviderOrderBook | null;
  binanceEventTs: number | null;
  coinbasePrice: number | null;
  coinbaseOrderBook: ProviderOrderBook | null;
  coinbaseEventTs: number | null;
  krakenPrice: number | null;
  krakenOrderBook: ProviderOrderBook | null;
  krakenEventTs: number | null;
  okxPrice: number | null;
  okxOrderBook: ProviderOrderBook | null;
  okxEventTs: number | null;
  chainlinkPrice: number | null;
  chainlinkOrderBook: ProviderOrderBook | null;
  chainlinkEventTs: number | null;
};

export type MarketSummary = {
  slug: string;
  asset: SupportedAsset;
  window: SupportedWindow;
  priceToBeat: number | null;
  prevPriceToBeat?: number[];
  marketStart: string;
  marketEnd: string;
};

export type MarketSnapshotsPayload = {
  slug: string;
  asset: SupportedAsset;
  window: SupportedWindow;
  marketStart: string;
  marketEnd: string;
  snapshots: Snapshot[];
};

export type CollectorStateMarket = {
  asset: SupportedAsset;
  window: SupportedWindow;
  market: MarketSummary | null;
  snapshotCount: number;
  latestSnapshot: Snapshot | null;
};

export type CollectorStatePayload = {
  generatedAt: string;
  markets: CollectorStateMarket[];
};
