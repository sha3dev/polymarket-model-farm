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
  snapshots: Snapshot[];
};

export type PredictionItem = {
  slug: string;
  asset: SupportedAsset;
  window: SupportedWindow;
  snapshotCount: number;
  marketStart: string;
  marketEnd: string;
  predictedFinalPrice: number;
  predictedDirection: "UP" | "DOWN";
  observedPrice: number;
  priceToBeat: number;
  predictedLogReturn: number;
  lastTrainedAt: string | null;
  trainedMarketCount: number;
  generatedAt: string;
};

export type PredictionFilter = { asset: SupportedAsset | null; window: SupportedWindow | null };
export type PredictionResponsePayload = { predictions: PredictionItem[] };
