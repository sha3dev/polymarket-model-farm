/**
 * @section imports:internals
 */

import type { OrderBook, ProviderKey, ProviderOrderBook, Snapshot, SupportedAsset, SupportedWindow } from "../collector/index.ts";

/**
 * @section types
 */

export type FeatureProjectionInput = {
  asset: SupportedAsset;
  window: SupportedWindow;
  marketStart: string;
  marketEnd: string;
  priceToBeat: number;
  snapshots: Snapshot[];
};

export type FeatureProjectionResult = {
  labels: string[];
  rows: number[][];
  maxSequenceLength: number;
};

export type ProviderSnapshotAccessor = {
  price: number | null;
  orderBook: ProviderOrderBook | null;
};

export type OrderBookAccessor = {
  currentBook: OrderBook | null;
  oppositeBook: OrderBook | null;
};

export type ProviderSnapshotState = { providerKey: ProviderKey; snapshot: Snapshot };
