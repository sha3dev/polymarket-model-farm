/**
 * @section imports:internals
 */

import type { SupportedAsset, SupportedWindow } from "../collector/index.ts";
import type { PredictionHistoryEntry } from "../history/index.ts";
import type { ModelSlotStatus } from "../model/index.ts";

/**
 * @section types
 */

export type DashboardModelCard = {
  asset: SupportedAsset;
  window: SupportedWindow;
  liveMarketSlug: string | null;
  currentDirection: "UP" | "DOWN" | "FLAT";
  liveUpPrice: number | null;
  liveDownPrice: number | null;
  priceToBeat: number | null;
  referencePrice: number | null;
  progress: number;
  snapshotCount: number;
  pendingClosedMarketCount: number;
  resolvedPredictionCount: number;
  correctPredictionCount: number;
  scorePercent: number | null;
  modelStatus: ModelSlotStatus;
  latestPrediction: PredictionHistoryEntry | null;
  predictionHistory: PredictionHistoryEntry[];
};

export type DashboardPayload = {
  generatedAt: string;
  cards: DashboardModelCard[];
};
