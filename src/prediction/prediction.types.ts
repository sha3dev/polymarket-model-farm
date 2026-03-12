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

export type PredictionMarketInput = {
  asset: SupportedAsset;
  window: SupportedWindow;
  slug: string | null;
  marketStart: string;
  marketEnd: string;
  priceToBeat: number;
  prevPriceToBeat?: number[];
  snapshots: Snapshot[];
};

export type PredictionRequestPayload = {
  markets: PredictionMarketInput[];
};

export type PredictionItem = {
  slug: string | null;
  asset: SupportedAsset;
  window: SupportedWindow;
  snapshotCount: number;
  confidence: number;
  predictedDelta: number;
  predictedDirection: "UP" | "DOWN";
  modelVersion: string;
  trainedMarketCount: number;
  generatedAt: string;
};

export type PredictionResponsePayload = {
  predictions: PredictionItem[];
};
