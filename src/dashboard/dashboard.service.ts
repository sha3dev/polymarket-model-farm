/**
 * @section imports:internals
 */

import type { CollectorClientService } from "../collector/index.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import type { CollectorStateMarket } from "../collector/index.ts";
import config from "../config.ts";
import type { PredictionHistoryService } from "../history/index.ts";
import type { ModelRegistryService, ModelSlotStatus } from "../model/index.ts";
import type { LivePredictionService } from "../prediction/index.ts";
import type { DashboardPageService } from "./dashboard-page.service.ts";
import type { DashboardModelCard, DashboardPayload } from "./index.ts";

/**
 * @section types
 */

type DashboardServiceOptions = {
  collectorClientService: CollectorClientService;
  modelRegistryService: ModelRegistryService;
  predictionHistoryService: PredictionHistoryService;
  livePredictionService: LivePredictionService;
  dashboardPageService: DashboardPageService;
  now: () => string;
};

/**
 * @section public:properties
 */

export class DashboardService {
  private readonly collectorClientService: CollectorClientService;

  private readonly modelRegistryService: ModelRegistryService;

  private readonly predictionHistoryService: PredictionHistoryService;

  private readonly livePredictionService: LivePredictionService;

  private readonly dashboardPageService: DashboardPageService;

  private readonly now: () => string;

  /**
   * @section constructor
   */

  public constructor(options: DashboardServiceOptions) {
    this.collectorClientService = options.collectorClientService;
    this.modelRegistryService = options.modelRegistryService;
    this.predictionHistoryService = options.predictionHistoryService;
    this.livePredictionService = options.livePredictionService;
    this.dashboardPageService = options.dashboardPageService;
    this.now = options.now;
  }

  /**
   * @section private:methods
   */

  private readProgress(marketState: CollectorStateMarket): number {
    const marketStartTs = Date.parse(marketState.market?.marketStart || "");
    const marketEndTs = Date.parse(marketState.market?.marketEnd || "");
    const generatedAt = marketState.latestSnapshot?.generatedAt || marketStartTs;
    const totalDurationMs = Math.max(marketEndTs - marketStartTs, 1);
    const progress = Number.isNaN(marketStartTs) || Number.isNaN(marketEndTs) ? 0 : Math.min(Math.max((generatedAt - marketStartTs) / totalDurationMs, 0), 1);
    return progress;
  }

  private readReferencePrice(marketState: CollectorStateMarket): number | null {
    const latestSnapshot = marketState.latestSnapshot;
    const referencePrice = latestSnapshot?.chainlinkPrice || null;
    return referencePrice;
  }

  private readDirection(marketState: CollectorStateMarket): "UP" | "DOWN" | "FLAT" {
    const priceToBeat = marketState.market?.priceToBeat || null;
    const referencePrice = this.readReferencePrice(marketState);
    const direction = priceToBeat === null || referencePrice === null ? "FLAT" : referencePrice >= priceToBeat ? "UP" : "DOWN";
    return direction;
  }

  private async readPendingClosedMarketCount(status: ModelSlotStatus): Promise<number> {
    const marketSummaries = await this.collectorClientService.listMarkets({ asset: status.asset, window: status.window });
    const pendingClosedMarketCount = marketSummaries.filter((marketSummary) => {
      const hasClosed = Date.parse(marketSummary.marketEnd) <= Date.now() - config.TRAINING_CLOSE_GRACE_MS;
      const hasPriceToBeat = typeof marketSummary.priceToBeat === "number";
      const hasTrainedMarket = this.modelRegistryService.hasTrainedMarket({ asset: status.asset, window: status.window }, marketSummary.slug);
      return hasClosed && hasPriceToBeat && !hasTrainedMarket;
    }).length;
    return pendingClosedMarketCount;
  }

  private readScore(predictionHistory: DashboardModelCard["predictionHistory"]): {
    resolvedPredictionCount: number;
    correctPredictionCount: number;
    hitRatePercent: number | null;
    resultUsd: number | null;
  } {
    const resolvedModelEntries = predictionHistory.filter((entry) => entry.actualDirection !== null);
    const recentResolvedModelEntries = resolvedModelEntries.slice(0, config.HIT_RATE_MOVING_WINDOW_SIZE);
    const resolvedTradeEntries = predictionHistory.filter(
      (entry) => entry.actualDirection !== null && entry.isExecuted === true && entry.confidence >= config.MIN_VALID_PREDICTION_CONFIDENCE,
    );
    const resolvedPredictionCount = recentResolvedModelEntries.length;
    const correctPredictionCount = recentResolvedModelEntries.filter((entry) => entry.isCorrect === true).length;
    const realizedUsd = resolvedTradeEntries.reduce((sum, entry) => {
      const entryPrice = entry.predictedDirection === "UP" ? entry.upPrice : entry.downPrice;
      const tradeResultUsd = entryPrice === null ? 0 : (entry.isCorrect === true ? 1 - entryPrice : -entryPrice) * 5;
      return sum + tradeResultUsd;
    }, 0);
    const hitRatePercent = resolvedPredictionCount === 0 ? null : (correctPredictionCount / resolvedPredictionCount) * 100;
    const resultUsd = resolvedPredictionCount === 0 ? null : realizedUsd;
    return { resolvedPredictionCount, correctPredictionCount, hitRatePercent, resultUsd };
  }

  private async buildCard(
    asset: (typeof SUPPORTED_ASSETS)[number],
    window: (typeof SUPPORTED_WINDOWS)[number],
    marketState: CollectorStateMarket,
    modelStatus: ModelSlotStatus,
  ): Promise<DashboardModelCard> {
    const latestPrediction = marketState.market ? await this.predictionHistoryService.getLatestPrediction({ asset, window }, marketState.market.slug) : null;
    const predictionHistory = (await this.predictionHistoryService.loadHistory({ asset, window })).entries;
    const score = this.readScore(predictionHistory);
    const card: DashboardModelCard = {
      asset,
      window,
      liveMarketSlug: marketState.market?.slug || null,
      currentDirection: this.readDirection(marketState),
      liveUpPrice: marketState.latestSnapshot?.upPrice || null,
      liveDownPrice: marketState.latestSnapshot?.downPrice || null,
      priceToBeat: marketState.market?.priceToBeat || null,
      referencePrice: this.readReferencePrice(marketState),
      progress: this.readProgress(marketState),
      snapshotCount: marketState.snapshotCount,
      pendingClosedMarketCount: await this.readPendingClosedMarketCount(modelStatus),
      resolvedPredictionCount: score.resolvedPredictionCount,
      correctPredictionCount: score.correctPredictionCount,
      hitRatePercent: score.hitRatePercent,
      resultUsd: score.resultUsd,
      modelStatus,
      latestPrediction,
      predictionHistory,
    };
    return card;
  }

  /**
   * @section public:methods
   */

  public async buildPayload(): Promise<DashboardPayload> {
    await this.livePredictionService.refreshOnce();
    const statePayload = await this.collectorClientService.loadState();
    const statusMap = new Map<string, ModelSlotStatus>(
      this.modelRegistryService.getStatuses().map((status) => [`${status.asset}-${status.window}`, status] as const),
    );
    const stateMap = new Map<string, CollectorStateMarket>(
      statePayload.markets.map((marketState) => [`${marketState.asset}-${marketState.window}`, marketState] as const),
    );
    const cards: DashboardModelCard[] = [];
    for (const asset of SUPPORTED_ASSETS) {
      for (const window of SUPPORTED_WINDOWS) {
        const pairKey = `${asset}-${window}`;
        const modelStatus = statusMap.get(pairKey);
        const marketState = stateMap.get(pairKey);
        if (modelStatus && marketState) {
          cards.push(await this.buildCard(asset, window, marketState, modelStatus));
        }
      }
    }
    const totalResultUsd5m = cards.filter((card) => card.window === "5m").reduce((sum, card) => sum + (card.resultUsd || 0), 0);
    const totalResultUsd15m = cards.filter((card) => card.window === "15m").reduce((sum, card) => sum + (card.resultUsd || 0), 0);
    return { generatedAt: this.now(), totalResultUsd5m, totalResultUsd15m, cards };
  }

  public async buildHtmlDocument(): Promise<string> {
    const payload = await this.buildPayload();
    const htmlDocument = this.dashboardPageService.renderDocument(payload);
    return htmlDocument;
  }
}
