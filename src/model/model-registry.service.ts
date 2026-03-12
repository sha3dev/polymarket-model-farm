/**
 * @section imports:externals
 */

import * as tf from "@tensorflow/tfjs-node";

/**
 * @section imports:internals
 */

import config from "../config.ts";
import { ModelDefinitionService, ModelStoreService, SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "./index.ts";
import type { AssetWindow, ModelMetadata, ModelPredictionContext, ModelSlotStatus, TrainingLedger } from "./index.ts";

/**
 * @section types
 */

type ModelRegistryServiceOptions = {
  modelDefinitionService: ModelDefinitionService;
  modelStoreService: ModelStoreService;
  featureCount: number;
};

type ModelSlotState = {
  pair: AssetWindow;
  model: tf.LayersModel | null;
  metadata: ModelMetadata | null;
  ledger: TrainingLedger;
  hasCheckpoint: boolean;
  isTraining: boolean;
  latestTrainingError: string | null;
  checkpointPath: string;
  ledgerPath: string;
};

/**
 * @section public:properties
 */

export class ModelRegistryService {
  private readonly modelDefinitionService: ModelDefinitionService;

  private readonly modelStoreService: ModelStoreService;

  private readonly featureCount: number;

  private readonly slots: Map<string, ModelSlotState>;

  /**
   * @section constructor
   */

  public constructor(options: ModelRegistryServiceOptions) {
    this.modelDefinitionService = options.modelDefinitionService;
    this.modelStoreService = options.modelStoreService;
    this.featureCount = options.featureCount;
    this.slots = new Map();
  }

  /**
   * @section factory
   */

  public static createDefault(featureCount: number): ModelRegistryService {
    return new ModelRegistryService({ modelDefinitionService: ModelDefinitionService.createDefault(), modelStoreService: ModelStoreService.createDefault(), featureCount });
  }

  /**
   * @section private:methods
   */

  private buildSlotState(pair: AssetWindow, model: tf.LayersModel | null, metadata: ModelMetadata | null, ledger: TrainingLedger | null): ModelSlotState {
    const artifactPaths = this.modelStoreService.describePaths(pair);
    const slot = {
      pair,
      model,
      metadata,
      ledger: ledger || {
        asset: pair.asset,
        window: pair.window,
        trainedMarketSlugs: [],
        trainedMarketCount: 0,
        lastTrainedSlug: null,
        lastTrainedAt: null,
        modelVersion: "untrained",
      },
      hasCheckpoint: metadata !== null,
      isTraining: false,
      latestTrainingError: null,
      checkpointPath: artifactPaths.modelDirectoryPath,
      ledgerPath: artifactPaths.ledgerPath,
    };
    return slot;
  }

  private buildSlotKey(pair: AssetWindow): string {
    const slotKey = `${pair.asset}-${pair.window}`;
    return slotKey;
  }

  private requireSlot(pair: AssetWindow): ModelSlotState {
    const slot = this.slots.get(this.buildSlotKey(pair));
    if (!slot) {
      throw new Error(`model slot is not initialized for ${pair.asset}/${pair.window}`);
    }
    return slot;
  }

  private buildInputTensor(pair: AssetWindow, sequence: number[][]): tf.Tensor3D {
    const maxSequenceLength = pair.window === "5m" ? 600 : 1800;
    const boundedSequence = sequence.slice(0, maxSequenceLength).map((row) => row.slice());
    const sequenceLength = Math.max(boundedSequence.length, 1);
    if (boundedSequence.length === 0) {
      boundedSequence.push(new Array(this.featureCount).fill(0));
    }
    const tensor = tf.tensor3d([boundedSequence], [1, sequenceLength, this.featureCount]);
    return tensor;
  }

  private clamp(value: number, lowerBound: number, upperBound: number): number {
    const clampedValue = Math.min(Math.max(value, lowerBound), upperBound);
    return clampedValue;
  }

  private ensureModel(slot: ModelSlotState): tf.LayersModel {
    let model = slot.model;
    if (!model) {
      model = this.modelDefinitionService.createModel(slot.pair, this.featureCount);
      slot.model = model;
    }
    return model;
  }

  /**
   * @section public:methods
   */

  public async initialize(): Promise<void> {
    await this.modelStoreService.ensureStorageDirectory();
    for (const asset of SUPPORTED_ASSETS) {
      for (const window of SUPPORTED_WINDOWS) {
        const pair = { asset, window };
        const metadata = await this.modelStoreService.loadMetadata(pair);
        const loadedModel = await this.modelStoreService.loadModel(pair);
        const loadedLedger = await this.modelStoreService.loadLedger(pair);
        const slot = this.buildSlotState(pair, loadedModel, metadata, loadedLedger);
        this.slots.set(this.buildSlotKey(pair), slot);
      }
    }
  }

  public getFeatureCount(): number {
    const featureCount = this.featureCount;
    return featureCount;
  }

  public async train(pair: AssetWindow, sequence: number[][], boundedTarget: number): Promise<void> {
    const slot = this.requireSlot(pair);
    const model = this.ensureModel(slot);
    const timestamp = new Date().toISOString();
    slot.isTraining = true;
    slot.latestTrainingError = null;
    try {
      const inputTensor = this.buildInputTensor(pair, sequence);
      const targetTensor = tf.tensor2d([[boundedTarget]]);
      await model.fit(inputTensor, targetTensor, { epochs: config.TRAINING_EPOCHS_PER_MARKET, batchSize: config.TRAINING_BATCH_SIZE, verbose: 0, shuffle: false });
      inputTensor.dispose();
      targetTensor.dispose();
      const metadata = this.modelDefinitionService.buildMetadata(pair, this.featureCount, timestamp);
      slot.metadata = metadata;
      await this.modelStoreService.saveModelArtifacts(pair, model, metadata);
      slot.hasCheckpoint = true;
      slot.ledger.modelVersion = metadata.modelVersion;
    } catch (error) {
      slot.latestTrainingError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      slot.isTraining = false;
    }
  }

  public async markMarketAsTrained(pair: AssetWindow, slug: string, trainedAt: string): Promise<void> {
    const slot = this.requireSlot(pair);
    if (!slot.ledger.trainedMarketSlugs.includes(slug)) {
      slot.ledger.trainedMarketSlugs = [...slot.ledger.trainedMarketSlugs, slug];
      slot.ledger.trainedMarketCount += 1;
      slot.ledger.lastTrainedSlug = slug;
      slot.ledger.lastTrainedAt = trainedAt;
      slot.ledger.modelVersion = slot.metadata?.modelVersion || slot.ledger.modelVersion;
      await this.modelStoreService.saveLedger(pair, slot.ledger);
    }
  }

  public async predict(pair: AssetWindow, sequence: number[][]): Promise<number> {
    const slot = this.requireSlot(pair);
    if (!slot.hasCheckpoint || slot.metadata === null) {
      throw new Error(`model checkpoint is not available for ${pair.asset}/${pair.window}`);
    }
    const model = this.ensureModel(slot);
    const inputTensor = this.buildInputTensor(pair, sequence);
    const predictionTensor = model.predict(inputTensor) as tf.Tensor;
    const predictionValues = await predictionTensor.data();
    inputTensor.dispose();
    predictionTensor.dispose();
    const confidence = this.clamp(predictionValues[0] || 0, -1, 1);
    return confidence;
  }

  public hasTrainedMarket(pair: AssetWindow, slug: string): boolean {
    const slot = this.requireSlot(pair);
    const hasTrainedMarket = slot.ledger.trainedMarketSlugs.includes(slug);
    return hasTrainedMarket;
  }

  public getPredictionContext(pair: AssetWindow): ModelPredictionContext {
    const slot = this.requireSlot(pair);
    const predictionContext = {
      metadata: slot.metadata,
      trainedMarketCount: slot.ledger.trainedMarketCount,
      modelVersion: slot.metadata?.modelVersion || slot.ledger.modelVersion,
      hasCheckpoint: slot.hasCheckpoint,
    };
    return predictionContext;
  }

  public getStatuses(): ModelSlotStatus[] {
    const statuses = [...this.slots.values()].map((slot) => ({
      asset: slot.pair.asset,
      window: slot.pair.window,
      modelVersion: slot.metadata?.modelVersion || slot.ledger.modelVersion,
      hasCheckpoint: slot.hasCheckpoint,
      trainedMarketCount: slot.ledger.trainedMarketCount,
      lastTrainedSlug: slot.ledger.lastTrainedSlug,
      lastTrainedAt: slot.ledger.lastTrainedAt,
      isTraining: slot.isTraining,
      latestTrainingError: slot.latestTrainingError,
      checkpointPath: slot.checkpointPath,
      ledgerPath: slot.ledgerPath,
    }));
    return statuses;
  }

  public setLatestTrainingError(pair: AssetWindow, message: string | null): void {
    const slot = this.requireSlot(pair);
    slot.latestTrainingError = message;
  }
}
