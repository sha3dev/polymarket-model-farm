/**
 * @section imports:internals
 */

import config from "../config.ts";
import type { MarketFeatureProjectorService } from "../feature/index.ts";
import type { ModelRegistryService } from "../model/index.ts";
import type { PredictionItem, PredictionMarketInput } from "./index.ts";

/**
 * @section types
 */

type PredictionServiceOptions = {
  modelRegistryService: ModelRegistryService;
  marketFeatureProjectorService: MarketFeatureProjectorService;
  now: () => string;
};

/**
 * @section public:properties
 */

export class PredictionService {
  private readonly modelRegistryService: ModelRegistryService;

  private readonly marketFeatureProjectorService: MarketFeatureProjectorService;

  private readonly now: () => string;

  /**
   * @section constructor
   */

  public constructor(options: PredictionServiceOptions) {
    this.modelRegistryService = options.modelRegistryService;
    this.marketFeatureProjectorService = options.marketFeatureProjectorService;
    this.now = options.now;
  }

  /**
   * @section factory
   */

  public static createDefault(modelRegistryService: ModelRegistryService, marketFeatureProjectorService: MarketFeatureProjectorService): PredictionService {
    return new PredictionService({ modelRegistryService, marketFeatureProjectorService, now: () => new Date().toISOString() });
  }

  /**
   * @section private:methods
   */

  private clamp(value: number, lowerBound: number, upperBound: number): number {
    const clampedValue = Math.min(Math.max(value, lowerBound), upperBound);
    return clampedValue;
  }

  private readProgress(market: PredictionMarketInput): number {
    const latestSnapshot = market.snapshots[market.snapshots.length - 1];
    const marketStartTs = Date.parse(market.marketStart);
    const marketEndTs = Date.parse(market.marketEnd);
    const totalDurationMs = Math.max(marketEndTs - marketStartTs, 1);
    const generatedAt = latestSnapshot?.generatedAt || marketStartTs;
    const progress = this.clamp((generatedAt - marketStartTs) / totalDurationMs, 0, 1);
    return progress;
  }

  private readObservedPrice(market: PredictionMarketInput): number {
    const latestSnapshot = market.snapshots[market.snapshots.length - 1] || null;
    const observedPrice =
      latestSnapshot?.chainlinkPrice || latestSnapshot?.binancePrice || latestSnapshot?.coinbasePrice || latestSnapshot?.krakenPrice || latestSnapshot?.okxPrice || market.priceToBeat;
    return observedPrice;
  }

  private readPrevBeatMeanDelta(market: PredictionMarketInput): number {
    const previousPriceToBeatValues = (market.prevPriceToBeat || []).filter((previousPriceToBeat) => Number.isFinite(previousPriceToBeat) && previousPriceToBeat > 0);
    const prevBeatMeanDelta =
      previousPriceToBeatValues.length === 0
        ? 0
        : previousPriceToBeatValues.map((previousPriceToBeat) => Math.abs((market.priceToBeat - previousPriceToBeat) / previousPriceToBeat)).reduce((sum, value) => sum + value, 0) /
          previousPriceToBeatValues.length;
    return prevBeatMeanDelta;
  }

  private computeConfidence(market: PredictionMarketInput, predictedDelta: number): number {
    const predictionContext = this.modelRegistryService.getPredictionContext({ asset: market.asset, window: market.window });
    const fallbackReferenceDelta = this.readPrevBeatMeanDelta(market);
    const confidenceReferenceDelta = Math.max(predictionContext.recentReferenceDelta, fallbackReferenceDelta, config.DELTA_TARGET_SCALE, 1e-9);
    const confidenceLogit = predictedDelta / (confidenceReferenceDelta * config.CONFIDENCE_DELTA_FACTOR);
    const upProbability = 1 / (1 + Math.exp(-confidenceLogit));
    const confidence = predictedDelta >= 0 ? upProbability : 1 - upProbability;
    return confidence;
  }

  private assertValidMarketInput(market: PredictionMarketInput): void {
    if (market.priceToBeat <= 0 || !Number.isFinite(market.priceToBeat)) {
      throw new Error("priceToBeat must be a positive number");
    }
    if (market.snapshots.length === 0) {
      throw new Error("snapshots must not be empty");
    }
    if ((market.prevPriceToBeat || []).length === 0) {
      throw new Error("prevPriceToBeat must contain at least one value");
    }
  }

  private assertPredictionReadiness(market: PredictionMarketInput): void {
    const predictionContext = this.modelRegistryService.getPredictionContext({ asset: market.asset, window: market.window });
    if (!predictionContext.hasCheckpoint) {
      throw new Error(`model checkpoint is not available for ${market.asset}/${market.window}`);
    }
    if (predictionContext.trainedMarketCount < config.MIN_TRAINED_MARKETS_FOR_PREDICTION) {
      throw new Error(
        `prediction requires at least ${config.MIN_TRAINED_MARKETS_FOR_PREDICTION} trained markets for ${market.asset}/${market.window}`,
      );
    }
  }

  /**
   * @section public:methods
   */

  public async buildPrediction(market: PredictionMarketInput): Promise<PredictionItem> {
    this.assertValidMarketInput(market);
    this.assertPredictionReadiness(market);
    const featureProjection = this.marketFeatureProjectorService.projectSequence(market);
    const boundedPrediction = await this.modelRegistryService.predict({ asset: market.asset, window: market.window }, featureProjection.rows);
    const predictedDelta = Math.atanh(this.clamp(boundedPrediction, -0.999999, 0.999999)) * config.DELTA_TARGET_SCALE;
    const predictionContext = this.modelRegistryService.getPredictionContext({ asset: market.asset, window: market.window });
    return {
      slug: market.slug,
      asset: market.asset,
      window: market.window,
      snapshotCount: market.snapshots.length,
      progress: this.readProgress(market),
      confidence: this.computeConfidence(market, predictedDelta),
      predictedDelta,
      predictedDirection: predictedDelta >= 0 ? "UP" : "DOWN",
      observedPrice: this.readObservedPrice(market),
      modelVersion: predictionContext.modelVersion,
      trainedMarketCount: predictionContext.trainedMarketCount,
      generatedAt: this.now(),
    };
  }
}
