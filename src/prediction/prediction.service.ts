/**
 * @section imports:externals
 */

import config from "../config.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../model/index.ts";
import type { ModelRegistryService } from "../model/index.ts";
import type { SnapshotFeatureProjectorService } from "../snapshot-feature/index.ts";
import type { PredictionItem, PredictionMarketInput, PredictionRequestPayload, PredictionResponsePayload } from "./index.ts";

/**
 * @section types
 */

type PredictionServiceOptions = {
  modelRegistryService: ModelRegistryService;
  snapshotFeatureProjectorService: SnapshotFeatureProjectorService;
  now: () => string;
};

/**
 * @section public:properties
 */

export class PredictionService {
  private readonly modelRegistryService: ModelRegistryService;

  private readonly snapshotFeatureProjectorService: SnapshotFeatureProjectorService;

  private readonly now: () => string;

  /**
   * @section constructor
   */

  public constructor(options: PredictionServiceOptions) {
    this.modelRegistryService = options.modelRegistryService;
    this.snapshotFeatureProjectorService = options.snapshotFeatureProjectorService;
    this.now = options.now;
  }

  /**
   * @section factory
   */

  public static createDefault(modelRegistryService: ModelRegistryService, snapshotFeatureProjectorService: SnapshotFeatureProjectorService): PredictionService {
    return new PredictionService({ modelRegistryService, snapshotFeatureProjectorService, now: () => new Date().toISOString() });
  }

  /**
   * @section private:methods
   */

  private async predictMarket(market: PredictionMarketInput): Promise<PredictionItem> {
    this.assertValidMarketInput(market);
    const projection = this.snapshotFeatureProjectorService.projectSequence(market);
    const boundedPrediction = await this.modelRegistryService.predict({ asset: market.asset, window: market.window }, projection.rows);
    const predictionContext = this.modelRegistryService.getPredictionContext({ asset: market.asset, window: market.window });
    const predictedDelta = Math.atanh(this.clamp(boundedPrediction, -0.999999, 0.999999)) * config.DELTA_TARGET_SCALE;
    const confidence = this.computeConfidence(market, predictedDelta);
    const predictedDirection: "UP" | "DOWN" = predictedDelta >= 0 ? "UP" : "DOWN";
    const prediction = {
      slug: market.slug,
      asset: market.asset,
      window: market.window,
      snapshotCount: market.snapshots.length,
      confidence,
      predictedDelta,
      predictedDirection,
      modelVersion: predictionContext.modelVersion,
      trainedMarketCount: predictionContext.trainedMarketCount,
      generatedAt: this.now(),
    };
    return prediction;
  }

  private isPredictionRequestPayload(payload: unknown): payload is PredictionRequestPayload {
    const hasShape = typeof payload === "object" && payload !== null && "markets" in payload && Array.isArray((payload as { markets?: unknown }).markets);
    return hasShape;
  }

  private assertValidMarketInput(market: PredictionMarketInput): void {
    if (!SUPPORTED_ASSETS.includes(market.asset)) {
      throw new Error(`unsupported asset ${market.asset}`);
    }
    if (!SUPPORTED_WINDOWS.includes(market.window)) {
      throw new Error(`unsupported window ${market.window}`);
    }
    if (!Number.isFinite(market.priceToBeat) || market.priceToBeat <= 0) {
      throw new Error("priceToBeat must be a positive number");
    }
    if (this.readPreviousPriceToBeatValues(market).length === 0) {
      throw new Error("prevPriceToBeat must contain at least one valid historical value");
    }
    if (market.snapshots.length === 0) {
      throw new Error("snapshots must not be empty");
    }
    if (Number.isNaN(Date.parse(market.marketStart)) || Number.isNaN(Date.parse(market.marketEnd))) {
      throw new Error("marketStart and marketEnd must be valid ISO timestamps");
    }
    const maxSequenceLength = market.window === "5m" ? 600 : 1800;
    if (market.snapshots.length > maxSequenceLength) {
      throw new Error(`snapshot count exceeds maximum for ${market.window}`);
    }
    if (this.readReferenceDelta(market) <= 0) {
      throw new Error("prevPriceToBeat must produce at least one non-zero reference delta");
    }
  }

  private clamp(value: number, lowerBound: number, upperBound: number): number {
    const clampedValue = Math.min(Math.max(value, lowerBound), upperBound);
    return clampedValue;
  }

  private readPreviousPriceToBeatValues(market: PredictionMarketInput): number[] {
    const previousPriceToBeatValues = (Array.isArray(market.prevPriceToBeat) ? market.prevPriceToBeat : []).filter(
      (previousPriceToBeat): previousPriceToBeat is number => typeof previousPriceToBeat === "number" && Number.isFinite(previousPriceToBeat) && previousPriceToBeat > 0,
    );
    return previousPriceToBeatValues;
  }

  private readReferenceDelta(market: PredictionMarketInput): number {
    const referenceDeltas = this.readPreviousPriceToBeatValues(market)
      .map((previousPriceToBeat) => Math.abs((market.priceToBeat - previousPriceToBeat) / previousPriceToBeat))
      .filter((referenceDelta) => referenceDelta > 0);
    const referenceDelta = referenceDeltas.length === 0 ? 0 : referenceDeltas.reduce((sum, value) => sum + value, 0) / referenceDeltas.length;
    return referenceDelta;
  }

  private computeConfidence(market: PredictionMarketInput, predictedDelta: number): number {
    const referenceDelta = this.readReferenceDelta(market);
    const confidenceMagnitude = referenceDelta === 0 ? 0 : this.clamp((Math.abs(predictedDelta) / referenceDelta) * config.CONFIDENCE_SCALING_FACTOR, 0, 1);
    const confidence = Math.sign(predictedDelta) * confidenceMagnitude;
    return confidence;
  }

  /**
   * @section public:methods
   */

  public validateRequestPayload(payload: unknown): PredictionRequestPayload {
    if (!this.isPredictionRequestPayload(payload)) {
      throw new Error("prediction request payload is invalid");
    }
    if (payload.markets.length === 0 || payload.markets.length > config.PREDICTION_MAX_MARKETS_PER_REQUEST) {
      throw new Error("prediction request market count is invalid");
    }
    return payload;
  }

  public async buildPredictionPayload(payload: PredictionRequestPayload): Promise<PredictionResponsePayload> {
    const predictions: PredictionItem[] = [];
    for (const market of payload.markets) {
      const prediction = await this.predictMarket(market);
      predictions.push(prediction);
    }
    const responsePayload = { predictions };
    return responsePayload;
  }
}
