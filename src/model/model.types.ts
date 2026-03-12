/**
 * @section consts
 */

export const SUPPORTED_ASSETS = ["btc", "eth", "sol", "xrp"] as const;
export const SUPPORTED_WINDOWS = ["5m", "15m"] as const;
export const PROVIDER_KEYS = ["chainlink", "binance", "coinbase", "kraken", "okx"] as const;
export const ORDERBOOK_SIDES = ["up", "down"] as const;

/**
 * @section types
 */

export type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];
export type SupportedWindow = (typeof SUPPORTED_WINDOWS)[number];
export type ProviderKey = (typeof PROVIDER_KEYS)[number];
export type OrderBookSideKey = (typeof ORDERBOOK_SIDES)[number];
export type ModelKey = `${SupportedAsset}-${SupportedWindow}`;

export type AssetWindow = { asset: SupportedAsset; window: SupportedWindow };

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
};

export type ModelPredictionContext = {
  metadata: ModelMetadata | null;
  trainedMarketCount: number;
  modelVersion: string;
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
