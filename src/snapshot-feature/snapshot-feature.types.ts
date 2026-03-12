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

export type FeatureProjectionInput = {
  asset: SupportedAsset;
  window: SupportedWindow;
  marketStart: string;
  marketEnd: string;
  priceToBeat: number;
  prevPriceToBeat?: number[];
  snapshots: Snapshot[];
};

export type FeatureProjectionResult = {
  labels: string[];
  rows: number[][];
  maxSequenceLength: number;
};
