/**
 * @section imports:internals
 */

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

export class PredictionService {
  /**
   * @section private:properties
   */

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

  private readObservedPrice(market: PredictionMarketInput): number {
    const latestSnapshot = market.snapshots[market.snapshots.length - 1] || null;
    const observedPrice =
      latestSnapshot?.chainlinkPrice ||
      latestSnapshot?.binancePrice ||
      latestSnapshot?.coinbasePrice ||
      latestSnapshot?.krakenPrice ||
      latestSnapshot?.okxPrice ||
      market.priceToBeat;
    return observedPrice;
  }

  private assertValidMarketInput(market: PredictionMarketInput): void {
    if (market.priceToBeat <= 0 || !Number.isFinite(market.priceToBeat)) {
      throw new Error("priceToBeat must be a positive number");
    }
    if (market.snapshots.length === 0) {
      throw new Error("snapshots must not be empty");
    }
  }

  private assertPredictionReadiness(market: PredictionMarketInput): void {
    const predictionContext = this.modelRegistryService.getPredictionContext({ asset: market.asset, window: market.window });
    if (!predictionContext.hasCheckpoint) {
      throw new Error(`model checkpoint is not available for ${market.asset}/${market.window}`);
    }
  }

  /**
   * @section public:methods
   */

  public async buildPrediction(market: PredictionMarketInput): Promise<PredictionItem> {
    this.assertValidMarketInput(market);
    this.assertPredictionReadiness(market);
    const featureProjection = this.marketFeatureProjectorService.projectSequence(market);
    const predictedLogReturn = await this.modelRegistryService.predict({ asset: market.asset, window: market.window }, featureProjection.rows);
    const predictedFinalPrice = market.priceToBeat * Math.exp(predictedLogReturn);
    const predictionContext = this.modelRegistryService.getPredictionContext({ asset: market.asset, window: market.window });
    return {
      slug: market.slug,
      asset: market.asset,
      window: market.window,
      snapshotCount: market.snapshots.length,
      marketStart: market.marketStart,
      marketEnd: market.marketEnd,
      predictedFinalPrice,
      predictedDirection: predictedFinalPrice >= market.priceToBeat ? "UP" : "DOWN",
      observedPrice: this.readObservedPrice(market),
      priceToBeat: market.priceToBeat,
      predictedLogReturn,
      lastTrainedAt: predictionContext.lastTrainedAt,
      trainedMarketCount: predictionContext.trainedMarketCount,
      generatedAt: this.now(),
    };
  }
}
