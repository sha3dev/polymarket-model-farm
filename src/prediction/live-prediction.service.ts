/**
 * @section imports:internals
 */

import type { CollectorClientService } from "../collector/index.ts";
import type { CollectorStateMarket } from "../collector/index.ts";
import config from "../config.ts";
import type { PredictionHistoryService } from "../history/index.ts";
import type { PredictionHistoryEntry } from "../history/index.ts";
import LOGGER from "../logger.ts";
import type { PredictionFilter, PredictionItem } from "./index.ts";
import type { PredictionService } from "./prediction.service.ts";

/**
 * @section types
 */

type LivePredictionServiceOptions = {
  collectorClientService: CollectorClientService;
  predictionService: PredictionService;
  predictionHistoryService: PredictionHistoryService;
  now: () => string;
};

/**
 * @section public:properties
 */

export class LivePredictionService {
  private readonly collectorClientService: CollectorClientService;

  private readonly predictionService: PredictionService;

  private readonly predictionHistoryService: PredictionHistoryService;

  private readonly now: () => string;

  private loopTimer: NodeJS.Timeout | null;

  private isRunning: boolean;

  private isRefreshing: boolean;

  /**
   * @section constructor
   */

  public constructor(options: LivePredictionServiceOptions) {
    this.collectorClientService = options.collectorClientService;
    this.predictionService = options.predictionService;
    this.predictionHistoryService = options.predictionHistoryService;
    this.now = options.now;
    this.loopTimer = null;
    this.isRunning = false;
    this.isRefreshing = false;
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

  private async buildHistoryEntry(item: PredictionItem, marketState: CollectorStateMarket): Promise<PredictionHistoryEntry> {
    const market = marketState.market;
    const latestSnapshot = marketState.latestSnapshot;
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
      upPrice: latestSnapshot?.upPrice || null,
      downPrice: latestSnapshot?.downPrice || null,
      predictedDelta: item.predictedDelta,
      confidence: item.confidence,
      predictedDirection: item.predictedDirection,
      modelVersion: item.modelVersion,
      actualDelta: null,
      actualDirection: null,
      isCorrect: null,
    };
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

  private async refreshMarketPrediction(marketState: CollectorStateMarket): Promise<void> {
    const market = marketState.market;
    const progress = this.readProgress(marketState);
    if (market && progress >= config.LIVE_PREDICTION_PROGRESS) {
      const pair = { asset: market.asset, window: market.window };
      const existingPrediction = await this.predictionHistoryService.getLatestPrediction(pair, market.slug);
      if (!existingPrediction) {
        try {
          const marketPayload = await this.collectorClientService.loadMarketSnapshots(market.slug);
          const prediction = await this.predictionService.buildPrediction({
            asset: market.asset,
            window: market.window,
            slug: market.slug,
            marketStart: market.marketStart,
            marketEnd: market.marketEnd,
            priceToBeat: market.priceToBeat || 0,
            prevPriceToBeat: market.prevPriceToBeat || [],
            snapshots: marketPayload.snapshots,
          });
          await this.predictionHistoryService.recordPrediction(pair, await this.buildHistoryEntry(prediction, marketState));
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
        for (const marketState of statePayload.markets) {
          await this.refreshMarketPrediction(marketState);
        }
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
