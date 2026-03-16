/**
 * @section imports:internals
 */

import type { AssetWindow, Snapshot, SupportedAsset, SupportedWindow } from "../collector/index.ts";

/**
 * @section types
 */

export type TrainingMarketCandidate = {
  slug: string;
  asset: SupportedAsset;
  window: SupportedWindow;
  priceToBeat: number;
  marketStart: string;
  marketEnd: string;
  snapshots: Snapshot[];
};

export type TrainingPairCycleResult = {
  pair: AssetWindow;
  trainedMarketCount: number;
  hadWork: boolean;
  pendingClosedMarketCount: number;
};
