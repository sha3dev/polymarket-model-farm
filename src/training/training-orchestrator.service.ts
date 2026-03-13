/**
 * @section imports:internals
 */

import { CollectorClientService } from "../collector-client/index.ts";
import config from "../config.ts";
import LOGGER from "../logger.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../model/index.ts";
import type { AssetWindow, ModelRegistryService } from "../model/index.ts";
import type { SnapshotFeatureProjectorService } from "../snapshot-feature/index.ts";
import type { TrainingMarketCandidate, TrainingPairCycleResult } from "./index.ts";

/**
 * @section types
 */

type TrainingOrchestratorServiceOptions = {
  collectorClientService: CollectorClientService;
  modelRegistryService: ModelRegistryService;
  snapshotFeatureProjectorService: SnapshotFeatureProjectorService;
  now: () => number;
};

/**
 * @section public:properties
 */

export class TrainingOrchestratorService {
  private readonly collectorClientService: CollectorClientService;

  private readonly modelRegistryService: ModelRegistryService;

  private readonly snapshotFeatureProjectorService: SnapshotFeatureProjectorService;

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
    this.snapshotFeatureProjectorService = options.snapshotFeatureProjectorService;
    this.now = options.now;
    this.loopTimer = null;
    this.isRunning = false;
    this.isCycleRunning = false;
    this.cycleWaiters = [];
  }

  /**
   * @section factory
   */

  public static createDefault(modelRegistryService: ModelRegistryService, snapshotFeatureProjectorService: SnapshotFeatureProjectorService): TrainingOrchestratorService {
    return new TrainingOrchestratorService({ collectorClientService: CollectorClientService.createDefault(), modelRegistryService, snapshotFeatureProjectorService, now: () => Date.now() });
  }

  /**
   * @section private:methods
   */

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      const cycleResults = await this.runTrainingCycle();
      const hadWork = cycleResults.some((cycleResult) => cycleResult.hadWork);
      const delayMs = hadWork ? config.TRAINING_POLL_INTERVAL_MS : config.TRAINING_IDLE_BACKOFF_MS;
      await this.wait(delayMs);
    }
  }

  private async acquireCycleSlot(): Promise<void> {
    // Serialize full training cycles so the process cannot train multiple models at once
    // when runTrainingCycle is triggered concurrently from different call sites.
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

  private async executeTrainingCycle(): Promise<TrainingPairCycleResult[]> {
    const cycleResults: TrainingPairCycleResult[] = [];
    for (const asset of SUPPORTED_ASSETS) {
      for (const window of SUPPORTED_WINDOWS) {
        const pair = { asset, window };
        const pairResult = await this.runPairCycle(pair);
        cycleResults.push(pairResult);
      }
    }
    return cycleResults;
  }

  private async runPairCycle(pair: AssetWindow): Promise<TrainingPairCycleResult> {
    let trainedMarketCount = 0;
    const candidates = await this.collectTrainingCandidates(pair);
    const marketLimit = Math.min(candidates.length, config.TRAINING_MAX_MARKETS_PER_CYCLE);
    for (const candidate of candidates.slice(0, marketLimit)) {
      try {
        await this.trainCandidate(pair, candidate);
        trainedMarketCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.modelRegistryService.setLatestTrainingError(pair, message);
        LOGGER.error(`training cycle failed for ${pair.asset}/${pair.window}: ${message}`);
      }
    }
    const result = { pair, trainedMarketCount, hadWork: candidates.length > 0 };
    return result;
  }

  private async collectTrainingCandidates(pair: AssetWindow): Promise<TrainingMarketCandidate[]> {
    const marketSummaries = await this.collectorClientService.listMarkets(pair);
    const nowTs = this.now();
    const candidates: TrainingMarketCandidate[] = [];
    for (const marketSummary of marketSummaries) {
      const marketEndTs = Date.parse(marketSummary.marketEnd);
      const hasClosed = marketEndTs <= nowTs - config.TRAINING_CLOSE_GRACE_MS;
      const hasPriceToBeat = typeof marketSummary.priceToBeat === "number";
      const hasTrainedMarket = this.modelRegistryService.hasTrainedMarket(pair, marketSummary.slug);
      if (hasClosed && hasPriceToBeat && !hasTrainedMarket) {
        const marketPayload = await this.collectorClientService.loadMarketSnapshots(marketSummary.slug);
        const candidate = this.buildCandidateFromPayload(pair, marketSummary.priceToBeat || 0, marketSummary.prevPriceToBeat || [], marketPayload);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  private buildCandidateFromPayload(
    pair: AssetWindow,
    priceToBeat: number,
    prevPriceToBeat: number[],
    marketPayload: TrainingMarketCandidate | { slug: string; marketStart: string; marketEnd: string; snapshots: TrainingMarketCandidate["snapshots"] },
  ): TrainingMarketCandidate | null {
    const snapshots = marketPayload.snapshots;
    const finalSnapshot = snapshots[snapshots.length - 1] || null;
    const maxSequenceLength = pair.window === "5m" ? 600 : 1800;
    let candidate: TrainingMarketCandidate | null = null;
    if (snapshots.length > 0 && snapshots.length <= maxSequenceLength && finalSnapshot?.chainlinkPrice !== null && finalSnapshot?.chainlinkPrice !== undefined) {
      candidate = {
        slug: marketPayload.slug,
        asset: pair.asset,
        window: pair.window,
        priceToBeat,
        prevPriceToBeat,
        marketStart: marketPayload.marketStart,
        marketEnd: marketPayload.marketEnd,
        snapshots,
      };
    }
    return candidate;
  }

  private async trainCandidate(pair: AssetWindow, candidate: TrainingMarketCandidate): Promise<void> {
    const projection = this.snapshotFeatureProjectorService.projectSequence({
      asset: candidate.asset,
      window: candidate.window,
      marketStart: candidate.marketStart,
      marketEnd: candidate.marketEnd,
      priceToBeat: candidate.priceToBeat,
      prevPriceToBeat: candidate.prevPriceToBeat,
      snapshots: candidate.snapshots,
    });
    const finalSnapshot = candidate.snapshots[candidate.snapshots.length - 1];
    const rawDelta = ((finalSnapshot?.chainlinkPrice || candidate.priceToBeat) - candidate.priceToBeat) / candidate.priceToBeat;
    const boundedTarget = Math.tanh(rawDelta / config.DELTA_TARGET_SCALE);
    const trainedAt = new Date(this.now()).toISOString();
    await this.modelRegistryService.train(pair, projection.rows, boundedTarget);
    await this.modelRegistryService.markMarketAsTrained(pair, candidate.slug, trainedAt);
  }

  private async wait(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.loopTimer = setTimeout(() => {
        this.loopTimer = null;
        resolve();
      }, delayMs);
    });
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
