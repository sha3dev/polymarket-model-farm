/**
 * @section imports:internals
 */

import type { AssetWindow, SupportedAsset, SupportedWindow } from "../collector/index.ts";

/**
 * @section types
 */

export type ModelMetadata = {
  modelVersion: string;
  featureSchemaVersion: string;
  targetKind: string;
  featureCount: number;
  maxSequenceLength: number;
  gruUnitsPrimary: number;
  gruUnitsSecondary: number;
  dropoutRate: number;
  learningRate: number;
  l2Regularization: number;
  resampleSeconds: number;
  checkpointedAt: string;
};

export type TrainingLedger = {
  asset: SupportedAsset;
  window: SupportedWindow;
  trainedMarketSlugs: string[];
  trainedMarketCount: number;
  lastTrainedSlug: string | null;
  lastTrainedAt: string | null;
  modelVersion: string;
  recentTargetValues: number[];
};

export type ModelPredictionContext = {
  metadata: ModelMetadata | null;
  trainedMarketCount: number;
  lastTrainedAt: string | null;
  hasCheckpoint: boolean;
};

export type ModelSlotStatus = {
  asset: SupportedAsset;
  window: SupportedWindow;
  modelVersion: string;
  hasCheckpoint: boolean;
  trainedMarketCount: number;
  lastTrainedSlug: string | null;
  lastTrainedAt: string | null;
  isTraining: boolean;
  latestTrainingError: string | null;
  checkpointPath: string;
  ledgerPath: string;
};

export type ModelSlotState = {
  pair: AssetWindow;
  model: import("@tensorflow/tfjs-node").LayersModel | null;
  metadata: ModelMetadata | null;
  ledger: TrainingLedger;
  hasCheckpoint: boolean;
  isTraining: boolean;
  latestTrainingError: string | null;
  checkpointPath: string;
  ledgerPath: string;
};
