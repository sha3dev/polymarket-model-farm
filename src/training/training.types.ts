/**
 * @section imports:externals
 */

import type { Snapshot } from "@sha3/polymarket-snapshot";

/**
 * @section imports:internals
 */

import type { AssetWindow, SupportedAsset, SupportedWindow } from "../model/index.ts";

/**
 * @section types
 */

export type TrainingMarketCandidate = {
  slug: string;
  asset: SupportedAsset;
  window: SupportedWindow;
  priceToBeat: number;
  prevPriceToBeat: number[];
  marketStart: string;
  marketEnd: string;
  snapshots: Snapshot[];
};

export type TrainingPairCycleResult = {
  pair: AssetWindow;
  trainedMarketCount: number;
  hadWork: boolean;
};
