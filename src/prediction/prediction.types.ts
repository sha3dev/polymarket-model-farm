/**
 * @section imports:internals
 */

import type { Snapshot, SupportedAsset, SupportedWindow } from "../collector/index.ts";

/**
 * @section types
 */

export type PredictionMarketInput = {
  asset: SupportedAsset;
  window: SupportedWindow;
  slug: string;
  marketStart: string;
  marketEnd: string;
  priceToBeat: number;
  prevPriceToBeat?: number[];
  snapshots: Snapshot[];
};

export type PredictionItem = {
  slug: string;
  asset: SupportedAsset;
  window: SupportedWindow;
  snapshotCount: number;
  progress: number;
  modelConfidence: number;
  confidence: number;
  predictedDelta: number;
  predictedDirection: "UP" | "DOWN";
  observedPrice: number;
  modelVersion: string;
  trainedMarketCount: number;
  generatedAt: string;
};

export type PredictionResponsePayload = { predictions: PredictionItem[] };

export type PredictionFilter = { asset?: SupportedAsset; window?: SupportedWindow };
