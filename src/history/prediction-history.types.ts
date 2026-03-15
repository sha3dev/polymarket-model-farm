/**
 * @section imports:internals
 */

import type { SupportedAsset, SupportedWindow } from "../collector/index.ts";

/**
 * @section types
 */

export type PredictionDirection = "UP" | "DOWN";

export type PredictionHistoryEntry = {
  slug: string;
  asset: SupportedAsset;
  window: SupportedWindow;
  marketStart: string;
  marketEnd: string;
  predictionMadeAt: string;
  progressWhenPredicted: number;
  observedPrice: number;
  upPrice: number | null;
  downPrice: number | null;
  predictedDelta: number;
  confidence: number;
  predictedDirection: PredictionDirection;
  modelVersion: string;
  isExecuted: boolean;
  skipReason: string | null;
  actualDelta: number | null;
  actualDirection: PredictionDirection | null;
  isCorrect: boolean | null;
};

export type PredictionHistory = { entries: PredictionHistoryEntry[] };
