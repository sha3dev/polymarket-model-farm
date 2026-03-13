/**
 * @section imports:externals
 */

import * as tf from "@tensorflow/tfjs-node";

/**
 * @section imports:internals
 */

import type { AssetWindow } from "../collector/index.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import config from "../config.ts";
import { ModelDefinitionService, ModelStoreService } from "./index.ts";
import type { ModelMetadata, ModelPredictionContext, ModelSlotState, ModelSlotStatus, TrainingLedger } from "./index.ts";

/**
 * @section types
 */

type ModelRegistryServiceOptions = {
  modelDefinitionService: ModelDefinitionService;
  modelStoreService: ModelStoreService;
  featureCount: number;
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

  private buildSlotKey(pair: AssetWindow): string {
    const slotKey = `${pair.asset}-${pair.window}`;
    return slotKey;
  }

  private buildLedger(pair: AssetWindow, ledger: TrainingLedger | null): TrainingLedger {
    const nextLedger = ledger || {
      asset: pair.asset,
      window: pair.window,
      trainedMarketSlugs: [],
      trainedMarketCount: 0,
      lastTrainedSlug: null,
      lastTrainedAt: null,
      modelVersion: "untrained",
      recentTargetDeltas: [],
    };
    return nextLedger;
  }

  private requireSlot(pair: AssetWindow): ModelSlotState {
    const slot = this.slots.get(this.buildSlotKey(pair)) || null;
    if (!slot) {
      throw new Error(`model slot is not initialized for ${pair.asset}/${pair.window}`);
    }
    return slot;
  }

  private ensureModel(slot: ModelSlotState): tf.LayersModel {
    let model = slot.model;
    if (!model) {
      model = this.modelDefinitionService.createModel(slot.pair, this.featureCount);
      slot.model = model;
    }
    return model;
  }

  private buildInputTensor(pair: AssetWindow, sequence: number[][]): tf.Tensor3D {
    const maxSequenceLength = pair.window === "5m" ? 600 : 1800;
    const boundedSequence = sequence.slice(0, maxSequenceLength).map((row) => row.slice());
    if (boundedSequence.length === 0) {
      boundedSequence.push(new Array(this.featureCount).fill(0));
    }
    return tf.tensor3d([boundedSequence], [1, boundedSequence.length, this.featureCount]);
  }

  private clamp(value: number, lowerBound: number, upperBound: number): number {
    const clampedValue = Math.min(Math.max(value, lowerBound), upperBound);
    return clampedValue;
  }

  private computeReferenceDelta(recentTargetDeltas: number[]): number {
    const absoluteDeltas = recentTargetDeltas.map((targetDelta) => Math.abs(targetDelta)).filter((targetDelta) => targetDelta > 0);
    const referenceDelta = absoluteDeltas.length === 0 ? 0 : absoluteDeltas.reduce((sum, value) => sum + value, 0) / absoluteDeltas.length;
    return referenceDelta;
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
        const model = await this.modelStoreService.loadModel(pair);
        const ledger = this.buildLedger(pair, await this.modelStoreService.loadLedger(pair));
        const paths = this.modelStoreService.describePaths(pair);
        this.slots.set(this.buildSlotKey(pair), {
          pair,
          model,
          metadata,
          ledger,
          hasCheckpoint: metadata !== null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: paths.modelDirectoryPath,
          ledgerPath: paths.ledgerPath,
        });
      }
    }
  }

  public async train(pair: AssetWindow, sequence: number[][], boundedTarget: number): Promise<void> {
    const slot = this.requireSlot(pair);
    const model = this.ensureModel(slot);
    const checkpointedAt = new Date().toISOString();
    slot.isTraining = true;
    slot.latestTrainingError = null;
    try {
      const inputTensor = this.buildInputTensor(pair, sequence);
      const targetTensor = tf.tensor2d([[boundedTarget]]);
      await model.fit(inputTensor, targetTensor, { epochs: config.TRAINING_EPOCHS_PER_MARKET, batchSize: config.TRAINING_BATCH_SIZE, verbose: 0, shuffle: false });
      inputTensor.dispose();
      targetTensor.dispose();
      slot.metadata = this.modelDefinitionService.buildMetadata(pair, this.featureCount, checkpointedAt);
      slot.hasCheckpoint = true;
      slot.ledger.modelVersion = slot.metadata.modelVersion;
      await this.modelStoreService.saveModelArtifacts(pair, model, slot.metadata);
    } catch (error) {
      slot.latestTrainingError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      slot.isTraining = false;
    }
  }

  public async markMarketAsTrained(pair: AssetWindow, slug: string, trainedAt: string, rawTargetDelta: number): Promise<void> {
    const slot = this.requireSlot(pair);
    if (!slot.ledger.trainedMarketSlugs.includes(slug)) {
      const recentTargetDeltas = [...slot.ledger.recentTargetDeltas, rawTargetDelta].slice(-config.RECENT_TARGET_DELTA_LIMIT);
      slot.ledger = {
        ...slot.ledger,
        trainedMarketSlugs: [...slot.ledger.trainedMarketSlugs, slug],
        trainedMarketCount: slot.ledger.trainedMarketCount + 1,
        lastTrainedSlug: slug,
        lastTrainedAt: trainedAt,
        modelVersion: slot.metadata?.modelVersion || slot.ledger.modelVersion,
        recentTargetDeltas,
      };
      await this.modelStoreService.saveLedger(pair, slot.ledger);
    }
  }

  public async predict(pair: AssetWindow, sequence: number[][]): Promise<number> {
    const slot = this.requireSlot(pair);
    if (!slot.hasCheckpoint || slot.metadata === null) {
      throw new Error(`model checkpoint is not available for ${pair.asset}/${pair.window}`);
    }
    const inputTensor = this.buildInputTensor(pair, sequence);
    const predictionTensor = this.ensureModel(slot).predict(inputTensor) as tf.Tensor;
    const predictionValues = await predictionTensor.data();
    inputTensor.dispose();
    predictionTensor.dispose();
    return this.clamp(predictionValues[0] || 0, -1, 1);
  }

  public hasTrainedMarket(pair: AssetWindow, slug: string): boolean {
    const hasTrainedMarket = this.requireSlot(pair).ledger.trainedMarketSlugs.includes(slug);
    return hasTrainedMarket;
  }

  public getPredictionContext(pair: AssetWindow): ModelPredictionContext {
    const slot = this.requireSlot(pair);
    return {
      metadata: slot.metadata,
      trainedMarketCount: slot.ledger.trainedMarketCount,
      modelVersion: slot.metadata?.modelVersion || slot.ledger.modelVersion,
      hasCheckpoint: slot.hasCheckpoint,
      recentReferenceDelta: this.computeReferenceDelta(slot.ledger.recentTargetDeltas),
    };
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
      recentReferenceDelta: this.computeReferenceDelta(slot.ledger.recentTargetDeltas),
    }));
    return statuses;
  }

  public setLatestTrainingError(pair: AssetWindow, message: string | null): void {
    this.requireSlot(pair).latestTrainingError = message;
  }
}
