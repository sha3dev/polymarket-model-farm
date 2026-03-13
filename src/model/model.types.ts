/**
 * @section imports:internals
 */

import type { AssetWindow, SupportedAsset, SupportedWindow } from "../collector/index.ts";

/**
 * @section types
 */

export type ModelMetadata = {
  modelVersion: string;
  featureCount: number;
  maxSequenceLength: number;
  gruUnits: number;
  dropoutRate: number;
  learningRate: number;
  l2Regularization: number;
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
  recentTargetDeltas: number[];
};

export type ModelPredictionContext = {
  metadata: ModelMetadata | null;
  trainedMarketCount: number;
  modelVersion: string;
  hasCheckpoint: boolean;
  recentReferenceDelta: number;
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
  recentReferenceDelta: number;
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
