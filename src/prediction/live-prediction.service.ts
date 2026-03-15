/**
 * @section imports:internals
 */

import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import type { AssetWindow, CollectorClientService } from "../collector/index.ts";
import type { CollectorStateMarket } from "../collector/index.ts";
import type { Snapshot } from "../collector/index.ts";
import config from "../config.ts";
import type { PredictionHistoryService } from "../history/index.ts";
import type { PredictionHistoryEntry } from "../history/index.ts";
import LOGGER from "../logger.ts";
import type { PredictionFilter, PredictionItem } from "./index.ts";
import { PredictionOpportunityService } from "./prediction-opportunity.service.ts";
import type { EvaluationCheckpoint, HitRateSummary, PredictionDecision } from "./prediction-opportunity.types.ts";
import type { PredictionService } from "./prediction.service.ts";

/**
 * @section types
 */

const RESOLUTION_RETRY_DELAY_MS = 30000;

type LivePredictionServiceOptions = {
  collectorClientService: CollectorClientService;
  predictionService: PredictionService;
  predictionHistoryService: PredictionHistoryService;
  now: () => string;
};

type PendingResolutionEntry = {
  pair: AssetWindow;
  entry: PredictionHistoryEntry;
  nextAttemptAtTs: number;
};

type MarketSnapshotPayload = Awaited<ReturnType<CollectorClientService["loadMarketSnapshots"]>>;

type PredictionAttempt = {
  item: PredictionItem;
  snapshot: Snapshot;
};

/**
 * @section public:properties
 */

export class LivePredictionService {
  private readonly collectorClientService: CollectorClientService;

  private readonly predictionService: PredictionService;

  private readonly predictionOpportunityService: PredictionOpportunityService;

  private readonly predictionHistoryService: PredictionHistoryService;

  private readonly now: () => string;

  private loopTimer: NodeJS.Timeout | null;

  private isRunning: boolean;

  private isRefreshing: boolean;

  private readonly pendingResolutionMap: Map<string, PendingResolutionEntry>;

  private readonly evaluationCheckpointMap: Map<string, EvaluationCheckpoint>;

  private hasInitializedPendingResolutions: boolean;

  /**
   * @section constructor
   */

  public constructor(options: LivePredictionServiceOptions) {
    this.collectorClientService = options.collectorClientService;
    this.predictionService = options.predictionService;
    this.predictionOpportunityService = PredictionOpportunityService.createDefault();
    this.predictionHistoryService = options.predictionHistoryService;
    this.now = options.now;
    this.loopTimer = null;
    this.isRunning = false;
    this.isRefreshing = false;
    this.pendingResolutionMap = new Map();
    this.evaluationCheckpointMap = new Map();
    this.hasInitializedPendingResolutions = false;
  }

  /**
   * @section factory
   */

  public static createDefault(
    collectorClientService: CollectorClientService,
    predictionService: PredictionService,
    predictionHistoryService: PredictionHistoryService,
    now: () => string,
  ): LivePredictionService {
    return new LivePredictionService({ collectorClientService, predictionService, predictionHistoryService, now });
  }

  /**
   * @section private:methods
   */

  private readProgress(marketState: CollectorStateMarket): number {
    const marketStartTs = Date.parse(marketState.market?.marketStart || "");
    const marketEndTs = Date.parse(marketState.market?.marketEnd || "");
    const latestGeneratedAt = marketState.latestSnapshot?.generatedAt || marketStartTs;
    const totalDurationMs = Math.max(marketEndTs - marketStartTs, 1);
    const hasValidBounds = !Number.isNaN(marketStartTs) && !Number.isNaN(marketEndTs);
    const progress = hasValidBounds ? Math.min(Math.max((latestGeneratedAt - marketStartTs) / totalDurationMs, 0), 1) : 0;
    return progress;
  }

  private isPairSelected(filter: PredictionFilter, item: PredictionItem): boolean {
    const matchesAsset = filter.asset === undefined || filter.asset === item.asset;
    const matchesWindow = filter.window === undefined || filter.window === item.window;
    const isPairSelected = matchesAsset && matchesWindow;
    return isPairSelected;
  }

  private trackPendingResolution(pair: AssetWindow, entry: PredictionHistoryEntry): void {
    const currentTs = Date.parse(this.now());
    this.pendingResolutionMap.set(`${pair.asset}-${pair.window}-${entry.slug}`, { pair, entry, nextAttemptAtTs: Number.isNaN(currentTs) ? 0 : currentTs });
  }

  private untrackPendingResolution(pair: AssetWindow, slug: string): void {
    this.pendingResolutionMap.delete(`${pair.asset}-${pair.window}-${slug}`);
  }

  private shouldEvaluateMarket(pair: AssetWindow, marketState: CollectorStateMarket): boolean {
    const progress = this.readProgress(marketState);
    const pairSlugKey = this.predictionOpportunityService.buildPairSlugKey(pair, marketState.market?.slug || "");
    const evaluationCheckpoint = this.evaluationCheckpointMap.get(pairSlugKey) || null;
    const shouldEvaluateMarket = this.predictionOpportunityService.shouldEvaluateMarket(marketState, evaluationCheckpoint, progress);
    return shouldEvaluateMarket;
  }

  private updateEvaluationCheckpoint(pair: AssetWindow, marketState: CollectorStateMarket): void {
    const evaluationCheckpoint = this.predictionOpportunityService.buildEvaluationCheckpoint(marketState, this.readProgress(marketState));
    if (evaluationCheckpoint) {
      const pairSlugKey = this.predictionOpportunityService.buildPairSlugKey(pair, marketState.market?.slug || "");
      this.evaluationCheckpointMap.set(pairSlugKey, evaluationCheckpoint);
    }
  }

  private async buildMarketPrediction(market: NonNullable<CollectorStateMarket["market"]>, marketPayload: MarketSnapshotPayload): Promise<PredictionItem> {
    return await this.predictionService.buildPrediction({
      asset: market.asset,
      window: market.window,
      slug: market.slug,
      marketStart: market.marketStart,
      marketEnd: market.marketEnd,
      priceToBeat: market.priceToBeat || 0,
      prevPriceToBeat: market.prevPriceToBeat || [],
      snapshots: marketPayload.snapshots,
    });
  }

  private async readPredictionAttempt(pair: AssetWindow, marketState: CollectorStateMarket, marketPayload: MarketSnapshotPayload): Promise<PredictionAttempt | null> {
    const market = marketState.market;
    let predictionAttempt: PredictionAttempt | null = null;
    if (market) {
      const predictionSnapshot = marketPayload.snapshots[marketPayload.snapshots.length - 1] || null;
      if (predictionSnapshot) {
        const prediction = await this.buildMarketPrediction(market, marketPayload);
        if (this.predictionOpportunityService.shouldAcceptPrediction(prediction, predictionSnapshot)) {
          predictionAttempt = { item: prediction, snapshot: predictionSnapshot };
        }
      }
    }
    return predictionAttempt;
  }

  private async initializePendingResolutions(): Promise<void> {
    if (!this.hasInitializedPendingResolutions) {
      for (const asset of SUPPORTED_ASSETS) {
        for (const window of SUPPORTED_WINDOWS) {
          const pair = { asset, window };
          const history = await this.predictionHistoryService.loadHistory(pair);
          for (const entry of history.entries) {
            if (entry.actualDirection === null) {
              this.trackPendingResolution(pair, entry);
            }
          }
        }
      }
      this.hasInitializedPendingResolutions = true;
    }
  }

  private async resolveTrackedPrediction(pendingResolution: PendingResolutionEntry): Promise<void> {
    const { pair, entry } = pendingResolution;
    const marketEndTs = Date.parse(entry.marketEnd);
    const currentTs = Date.parse(this.now());
    const hasClosedEntry = !Number.isNaN(marketEndTs) && !Number.isNaN(currentTs) && marketEndTs <= currentTs - config.TRAINING_CLOSE_GRACE_MS;
    const canAttemptResolution = !Number.isNaN(currentTs) && currentTs >= pendingResolution.nextAttemptAtTs;
    if (hasClosedEntry && canAttemptResolution) {
      try {
        const marketPayload = await this.collectorClientService.loadMarketSnapshots(entry.slug);
        const finalSnapshot = marketPayload.snapshots[marketPayload.snapshots.length - 1] || null;
        const upPrice = finalSnapshot?.upPrice || null;
        const downPrice = finalSnapshot?.downPrice || null;
        const actualDelta = upPrice === null || downPrice === null ? null : upPrice - downPrice;
        if (actualDelta !== null) {
          await this.predictionHistoryService.resolvePrediction(pair, entry.slug, actualDelta);
          this.untrackPendingResolution(pair, entry.slug);
        } else {
          if (!Number.isNaN(currentTs)) {
            pendingResolution.nextAttemptAtTs = currentTs + RESOLUTION_RETRY_DELAY_MS;
          }
        }
      } catch (error) {
        if (!Number.isNaN(currentTs)) {
          pendingResolution.nextAttemptAtTs = currentTs + RESOLUTION_RETRY_DELAY_MS;
        }
        const message = error instanceof Error ? error.message : String(error);
        LOGGER.error(`history resolution failed for ${entry.slug}: ${message}`);
      }
    }
  }

  private async resolveClosedPredictions(): Promise<void> {
    await this.initializePendingResolutions();
    for (const pendingResolution of this.pendingResolutionMap.values()) {
      await this.resolveTrackedPrediction(pendingResolution);
    }
  }

  private async readWindowHitRateMap(): Promise<Map<string, HitRateSummary>> {
    const hitRateMap = new Map<string, HitRateSummary>();
    for (const asset of SUPPORTED_ASSETS) {
      for (const window of SUPPORTED_WINDOWS) {
        const pair = { asset, window };
        const history = await this.predictionHistoryService.loadHistory(pair);
        hitRateMap.set(`${asset}-${window}`, this.predictionOpportunityService.readHitRateSummary(history.entries));
      }
    }
    return hitRateMap;
  }

  private buildHistoryEntry(
    item: PredictionItem,
    marketState: CollectorStateMarket,
    predictionSnapshot: Snapshot,
    predictionDecision: PredictionDecision,
  ): PredictionHistoryEntry {
    const market = marketState.market;
    if (!market) {
      throw new Error("market state is missing a live market");
    }
    return {
      slug: item.slug,
      asset: item.asset,
      window: item.window,
      marketStart: market.marketStart,
      marketEnd: market.marketEnd,
      predictionMadeAt: this.now(),
      progressWhenPredicted: item.progress,
      observedPrice: item.observedPrice,
      upPrice: predictionSnapshot.upPrice || null,
      downPrice: predictionSnapshot.downPrice || null,
      predictedDelta: item.predictedDelta,
      confidence: item.confidence,
      predictedDirection: item.predictedDirection,
      modelVersion: item.modelVersion,
      isExecuted: predictionDecision.shouldExecute,
      skipReason: predictionDecision.skipReason,
      actualDelta: null,
      actualDirection: null,
      isCorrect: null,
    };
  }

  private async recordMarketPrediction(pair: AssetWindow, historyEntry: PredictionHistoryEntry): Promise<void> {
    await this.predictionHistoryService.recordPrediction(pair, historyEntry);
    this.trackPendingResolution(pair, historyEntry);
  }

  private async readCurrentPredictionItem(marketState: CollectorStateMarket): Promise<PredictionItem | null> {
    const market = marketState.market;
    let item: PredictionItem | null = null;
    if (market) {
      const historyEntry = await this.predictionHistoryService.getLatestPrediction({ asset: market.asset, window: market.window }, market.slug);
      if (historyEntry) {
        item = {
          slug: historyEntry.slug,
          asset: historyEntry.asset,
          window: historyEntry.window,
          snapshotCount: marketState.snapshotCount,
          progress: historyEntry.progressWhenPredicted,
          modelConfidence: historyEntry.confidence,
          confidence: historyEntry.confidence,
          predictedDelta: historyEntry.predictedDelta,
          predictedDirection: historyEntry.predictedDirection,
          observedPrice: historyEntry.observedPrice,
          modelVersion: historyEntry.modelVersion,
          trainedMarketCount: 0,
          generatedAt: historyEntry.predictionMadeAt,
        };
      }
    }
    return item;
  }

  private async refreshMarketPrediction(marketState: CollectorStateMarket, hitRateMap: Map<string, HitRateSummary>): Promise<void> {
    const market = marketState.market;
    if (market) {
      const pair = { asset: market.asset, window: market.window };
      const existingPrediction = await this.predictionHistoryService.getLatestPrediction(pair, market.slug);
      const shouldEvaluateMarket = existingPrediction?.isExecuted === true ? false : this.shouldEvaluateMarket(pair, marketState);
      if (shouldEvaluateMarket) {
        try {
          const marketPayload = await this.collectorClientService.loadMarketSnapshots(market.slug);
          const predictionAttempt = await this.readPredictionAttempt(pair, marketState, marketPayload);
          this.updateEvaluationCheckpoint(pair, marketState);
          if (predictionAttempt) {
            const predictionDecision = this.predictionOpportunityService.readPredictionDecision(pair, hitRateMap);
            const historyEntry = this.buildHistoryEntry(predictionAttempt.item, marketState, predictionAttempt.snapshot, predictionDecision);
            await this.recordMarketPrediction(pair, historyEntry);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          LOGGER.error(`live prediction failed for ${market.slug}: ${message}`);
        }
      }
    }
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      await this.refreshOnce();
      await new Promise<void>((resolve) => {
        this.loopTimer = setTimeout(() => {
          this.loopTimer = null;
          resolve();
        }, config.LIVE_PREDICTION_POLL_INTERVAL_MS);
      });
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

  public async refreshOnce(): Promise<void> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      try {
        const statePayload = await this.collectorClientService.loadState();
        const hitRateMap = await this.readWindowHitRateMap();
        for (const marketState of statePayload.markets) {
          await this.refreshMarketPrediction(marketState, hitRateMap);
        }
        await this.resolveClosedPredictions();
      } finally {
        this.isRefreshing = false;
      }
    }
  }

  public async listCurrentPredictions(filter: PredictionFilter): Promise<PredictionItem[]> {
    await this.refreshOnce();
    const statePayload = await this.collectorClientService.loadState();
    const predictions: PredictionItem[] = [];
    for (const marketState of statePayload.markets) {
      const item = await this.readCurrentPredictionItem(marketState);
      if (item && this.isPairSelected(filter, item)) {
        predictions.push(item);
      }
    }
    return predictions;
  }
}
