/**
 * @section imports:externals
 */

import type { Snapshot } from "@sha3/polymarket-snapshot";

/**
 * @section imports:internals
 */

import type { SupportedAsset, SupportedWindow } from "../model/index.ts";

/**
 * @section types
 */

export type MarketSummary = {
  slug: string;
  window: SupportedWindow;
  asset: SupportedAsset;
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
  latestSnapshot: {
    generatedAt: number;
    priceToBeat: number | null;
    upPrice: number | null;
    downPrice: number | null;
    chainlinkPrice: number | null;
    binancePrice: number | null;
    coinbasePrice: number | null;
    krakenPrice: number | null;
    okxPrice: number | null;
  } | null;
};

export type CollectorStatePayload = {
  generatedAt: string;
  markets: CollectorStateMarket[];
};
