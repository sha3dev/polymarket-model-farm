/**
 * @section imports:internals
 */

import type { SupportedAsset, SupportedWindow } from "../model/index.ts";

/**
 * @section types
 */

export type TrainerStatusItem = {
  asset: SupportedAsset;
  window: SupportedWindow;
  modelVersion: string;
  hasCheckpoint: boolean;
  trainedMarketCount: number;
  lastTrainedSlug: string | null;
  lastTrainedAt: string | null;
  lastSeenClosedMarketEnd: string | null;
  pendingClosedMarketCount: number;
  isTraining: boolean;
  latestTrainingError: string | null;
  checkpointPath: string;
  ledgerPath: string;
};

export type TrainerStatusPayload = {
  generatedAt: string;
  models: TrainerStatusItem[];
};
