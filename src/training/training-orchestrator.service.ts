/**
 * @section imports:internals
 */

import type { CollectorClientService } from "../collector/index.ts";
import type { AssetWindow } from "../collector/index.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import config from "../config.ts";
import type { MarketFeatureProjectorService } from "../feature/index.ts";
import type { PredictionHistoryService } from "../history/index.ts";
import LOGGER from "../logger.ts";
import type { ModelRegistryService } from "../model/index.ts";
import type { TrainingMarketCandidate, TrainingPairCycleResult } from "./index.ts";

/**
 * @section types
 */

type TrainingOrchestratorServiceOptions = {
  collectorClientService: CollectorClientService;
  modelRegistryService: ModelRegistryService;
  marketFeatureProjectorService: MarketFeatureProjectorService;
  predictionHistoryService: PredictionHistoryService;
  now: () => number;
};

/**
 * @section public:properties
 */

export class TrainingOrchestratorService {
  private readonly collectorClientService: CollectorClientService;

  private readonly modelRegistryService: ModelRegistryService;

  private readonly marketFeatureProjectorService: MarketFeatureProjectorService;

  private readonly predictionHistoryService: PredictionHistoryService;

  private readonly now: () => number;

  private loopTimer: NodeJS.Timeout | null;

  private isRunning: boolean;

  private isCycleRunning: boolean;

  private readonly cycleWaiters: Array<() => void>;

  /**
   * @section constructor
   */

  public constructor(options: TrainingOrchestratorServiceOptions) {
    this.collectorClientService = options.collectorClientService;
    this.modelRegistryService = options.modelRegistryService;
    this.marketFeatureProjectorService = options.marketFeatureProjectorService;
    this.predictionHistoryService = options.predictionHistoryService;
    this.now = options.now;
    this.loopTimer = null;
    this.isRunning = false;
    this.isCycleRunning = false;
    this.cycleWaiters = [];
  }

  /**
   * @section factory
   */

  public static createDefault(
    collectorClientService: CollectorClientService,
    modelRegistryService: ModelRegistryService,
    marketFeatureProjectorService: MarketFeatureProjectorService,
    predictionHistoryService: PredictionHistoryService,
  ): TrainingOrchestratorService {
    return new TrainingOrchestratorService({ collectorClientService, modelRegistryService, marketFeatureProjectorService, predictionHistoryService, now: () => Date.now() });
  }

  /**
   * @section private:methods
   */

  private async wait(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.loopTimer = setTimeout(() => {
        this.loopTimer = null;
        resolve();
      }, delayMs);
    });
  }

  private async acquireCycleSlot(): Promise<void> {
    if (this.isCycleRunning) {
      await new Promise<void>((resolve) => {
        this.cycleWaiters.push(resolve);
      });
    }
    this.isCycleRunning = true;
  }

  private releaseCycleSlot(): void {
    const nextWaiter = this.cycleWaiters.shift() || null;
    if (nextWaiter) {
      nextWaiter();
    } else {
      this.isCycleRunning = false;
    }
  }

  private buildCandidate(payload: TrainingMarketCandidate): TrainingMarketCandidate | null {
    const finalSnapshot = payload.snapshots[payload.snapshots.length - 1] || null;
    const maxSequenceLength = payload.window === "5m" ? 600 : 1800;
    const hasPrevPriceToBeat = payload.prevPriceToBeat.length > 0;
    const hasFinalChainlink = finalSnapshot?.chainlinkPrice !== null && finalSnapshot?.chainlinkPrice !== undefined;
    const isValidLength = payload.snapshots.length > 0 && payload.snapshots.length <= maxSequenceLength;
    const candidate = hasPrevPriceToBeat && hasFinalChainlink && isValidLength ? payload : null;
    return candidate;
  }

  private async collectTrainingCandidates(pair: AssetWindow): Promise<TrainingMarketCandidate[]> {
    const marketSummaries = await this.collectorClientService.listMarkets(pair);
    const candidates: TrainingMarketCandidate[] = [];
    for (const marketSummary of marketSummaries) {
      if (candidates.length >= config.TRAINING_MAX_MARKETS_PER_CYCLE) {
        break;
      }
      const hasClosed = Date.parse(marketSummary.marketEnd) <= this.now() - config.TRAINING_CLOSE_GRACE_MS;
      const hasPriceToBeat = typeof marketSummary.priceToBeat === "number";
      const hasTrainedMarket = this.modelRegistryService.hasTrainedMarket(pair, marketSummary.slug);
      if (hasClosed && hasPriceToBeat && !hasTrainedMarket) {
        const marketPayload = await this.collectorClientService.loadMarketSnapshots(marketSummary.slug);
        const candidate = this.buildCandidate({
          slug: marketPayload.slug,
          asset: marketPayload.asset,
          window: marketPayload.window,
          priceToBeat: marketSummary.priceToBeat || 0,
          prevPriceToBeat: marketSummary.prevPriceToBeat || [],
          marketStart: marketPayload.marketStart,
          marketEnd: marketPayload.marketEnd,
          snapshots: marketPayload.snapshots,
        });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  private async trainCandidate(pair: AssetWindow, candidate: TrainingMarketCandidate): Promise<void> {
    const featureProjection = this.marketFeatureProjectorService.projectSequence(candidate);
    const finalSnapshot = candidate.snapshots[candidate.snapshots.length - 1];
    const finalChainlinkPrice = finalSnapshot?.chainlinkPrice || candidate.priceToBeat;
    const rawTargetDelta = (finalChainlinkPrice - candidate.priceToBeat) / candidate.priceToBeat;
    const boundedTarget = Math.tanh(rawTargetDelta / config.DELTA_TARGET_SCALE);
    const trainedAt = new Date(this.now()).toISOString();
    await this.modelRegistryService.train(pair, featureProjection.rows, boundedTarget);
    await this.modelRegistryService.markMarketAsTrained(pair, candidate.slug, trainedAt, rawTargetDelta);
    await this.predictionHistoryService.resolvePrediction(pair, candidate.slug, rawTargetDelta);
  }

  private async runPairCycle(pair: AssetWindow): Promise<TrainingPairCycleResult> {
    const candidates = await this.collectTrainingCandidates(pair);
    let trainedMarketCount = 0;
    for (const candidate of candidates) {
      try {
        await this.trainCandidate(pair, candidate);
        trainedMarketCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.modelRegistryService.setLatestTrainingError(pair, message);
        LOGGER.error(`training market failed for ${pair.asset}/${pair.window}/${candidate.slug}: ${message}`);
      }
    }
    if (candidates.length <= 2) {
      LOGGER.info(`training backlog for ${pair.asset}/${pair.window} is ${candidates.length} closed market(s)`);
    }
    return { pair, trainedMarketCount, hadWork: candidates.length > 0, pendingClosedMarketCount: candidates.length };
  }

  private async executeTrainingCycle(): Promise<TrainingPairCycleResult[]> {
    const cycleResults: TrainingPairCycleResult[] = [];
    for (const asset of SUPPORTED_ASSETS) {
      for (const window of SUPPORTED_WINDOWS) {
        cycleResults.push(await this.runPairCycle({ asset, window }));
      }
    }
    return cycleResults;
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      const cycleResults = await this.runTrainingCycle();
      const hasWork = cycleResults.some((cycleResult) => cycleResult.hadWork);
      await this.wait(hasWork ? config.TRAINING_POLL_INTERVAL_MS : config.TRAINING_IDLE_BACKOFF_MS);
    }
  }

  /**
   * @section public:methods
   */

  public start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      void this.runLoop();
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public async runTrainingCycle(): Promise<TrainingPairCycleResult[]> {
    let cycleResults: TrainingPairCycleResult[] = [];
    await this.acquireCycleSlot();
    try {
      cycleResults = await this.executeTrainingCycle();
    } finally {
      this.releaseCycleSlot();
    }
    return cycleResults;
  }
}
