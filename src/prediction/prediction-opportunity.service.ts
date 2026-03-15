/**
 * @section imports:internals
 */

import type { AssetWindow, CollectorStateMarket, Snapshot, SupportedAsset } from "../collector/index.ts";
import { SUPPORTED_ASSETS } from "../collector/index.ts";
import config from "../config.ts";
import type { PredictionHistoryEntry } from "../history/index.ts";
import type { PredictionItem } from "./index.ts";
import type { EvaluationCheckpoint, HitRateSummary, PredictionDecision } from "./prediction-opportunity.types.ts";

/**
 * @section public:properties
 */

export class PredictionOpportunityService {
  /**
   * @section factory
   */

  public static createDefault(): PredictionOpportunityService {
    return new PredictionOpportunityService();
  }

  /**
   * @section private:methods
   */

  private readPriceDelta(leftPrice: number | null, rightPrice: number | null): number {
    const hasComparablePrices = leftPrice !== null && rightPrice !== null;
    const priceDelta = hasComparablePrices ? Math.abs(leftPrice - rightPrice) : Number.POSITIVE_INFINITY;
    return priceDelta;
  }

  private readPriceBalance(marketSideProbability: number | null): number {
    const priceBalance = marketSideProbability === null ? 0 : Math.max(0, 1 - Math.abs(marketSideProbability - 0.6) / 0.2);
    return priceBalance;
  }

  /**
   * @section public:methods
   */

  public buildPairSlugKey(pair: AssetWindow, slug: string): string {
    const pairSlugKey = `${pair.asset}-${pair.window}-${slug}`;
    return pairSlugKey;
  }

  public isProgressInOpportunityWindow(progress: number): boolean {
    const isProgressInOpportunityWindow = progress >= config.MIN_OPPORTUNITY_PROGRESS && progress <= config.MAX_OPPORTUNITY_PROGRESS;
    return isProgressInOpportunityWindow;
  }

  public shouldEvaluateMarket(marketState: CollectorStateMarket, evaluationCheckpoint: EvaluationCheckpoint | null, progress: number): boolean {
    const latestSnapshot = marketState.latestSnapshot || null;
    const progressDelta = evaluationCheckpoint ? progress - evaluationCheckpoint.progress : Number.POSITIVE_INFINITY;
    const upPriceDelta = this.readPriceDelta(latestSnapshot?.upPrice || null, evaluationCheckpoint?.upPrice || null);
    const downPriceDelta = this.readPriceDelta(latestSnapshot?.downPrice || null, evaluationCheckpoint?.downPrice || null);
    const priceDelta = Math.max(upPriceDelta, downPriceDelta);
    const isProgressChangeMaterial = progressDelta >= config.MIN_PROGRESS_DELTA_FOR_REEVAL;
    const isPriceChangeMaterial = priceDelta >= config.MIN_PRICE_DELTA_FOR_REEVAL;
    const shouldEvaluateMarket = latestSnapshot !== null && this.isProgressInOpportunityWindow(progress) && (evaluationCheckpoint === null || isProgressChangeMaterial || isPriceChangeMaterial);
    return shouldEvaluateMarket;
  }

  public buildEvaluationCheckpoint(marketState: CollectorStateMarket, progress: number): EvaluationCheckpoint | null {
    const latestSnapshot = marketState.latestSnapshot || null;
    const evaluationCheckpoint =
      latestSnapshot === null ? null : { progress, upPrice: latestSnapshot.upPrice || null, downPrice: latestSnapshot.downPrice || null };
    return evaluationCheckpoint;
  }

  public readMarketSideProbability(snapshot: Snapshot, predictedDirection: PredictionItem["predictedDirection"]): number | null {
    const marketSideProbability = predictedDirection === "UP" ? snapshot.upPrice : snapshot.downPrice;
    return marketSideProbability;
  }

  public hasValidEntryPrice(prediction: PredictionItem, predictionSnapshot: Snapshot): boolean {
    const entryPrice = this.readMarketSideProbability(predictionSnapshot, prediction.predictedDirection);
    const hasValidEntryPrice = entryPrice !== null && entryPrice >= config.MIN_VALID_ENTRY_PRICE && entryPrice <= config.MAX_VALID_ENTRY_PRICE;
    return hasValidEntryPrice;
  }

  public readEdge(prediction: PredictionItem, predictionSnapshot: Snapshot): number {
    const marketSideProbability = this.readMarketSideProbability(predictionSnapshot, prediction.predictedDirection);
    const edge = marketSideProbability === null ? Number.NEGATIVE_INFINITY : prediction.confidence - marketSideProbability;
    return edge;
  }

  public readOpportunityScore(prediction: PredictionItem, predictionSnapshot: Snapshot): number {
    const marketSideProbability = this.readMarketSideProbability(predictionSnapshot, prediction.predictedDirection);
    const edge = this.readEdge(prediction, predictionSnapshot);
    const disagreement = marketSideProbability === null ? 1 : Math.abs(prediction.modelConfidence - marketSideProbability);
    const opportunityScore = edge * 0.55 + prediction.confidence * 0.25 + (1 - disagreement) * 0.15 + this.readPriceBalance(marketSideProbability) * 0.05;
    return opportunityScore;
  }

  public shouldAcceptPrediction(prediction: PredictionItem, predictionSnapshot: Snapshot): boolean {
    const marketSideProbability = this.readMarketSideProbability(predictionSnapshot, prediction.predictedDirection);
    const hasAcceptableDisagreement =
      marketSideProbability === null || Math.abs(prediction.modelConfidence - marketSideProbability) <= config.MAX_MODEL_MARKET_DISAGREEMENT;
    const hasValidEntryPrice = this.hasValidEntryPrice(prediction, predictionSnapshot);
    const edge = this.readEdge(prediction, predictionSnapshot);
    const opportunityScore = this.readOpportunityScore(prediction, predictionSnapshot);
    const shouldAcceptPrediction =
      prediction.confidence >= config.MIN_VALID_PREDICTION_CONFIDENCE &&
      hasAcceptableDisagreement &&
      hasValidEntryPrice &&
      edge >= config.MIN_PREDICTION_EDGE &&
      opportunityScore >= config.MIN_OPPORTUNITY_SCORE;
    return shouldAcceptPrediction;
  }

  public readHitRateSummary(entries: PredictionHistoryEntry[]): HitRateSummary {
    const resolvedEntries = entries.filter((entry) => entry.actualDirection !== null);
    const resolvedPredictionCount = resolvedEntries.length;
    const correctPredictionCount = resolvedEntries.filter((entry) => entry.isCorrect === true).length;
    const hitRatePercent = resolvedPredictionCount === 0 ? null : (correctPredictionCount / resolvedPredictionCount) * 100;
    return { resolvedPredictionCount, hitRatePercent };
  }

  public readPredictionDecision(pair: AssetWindow, hitRateMap: Map<string, HitRateSummary>): PredictionDecision {
    const pairHitRate = hitRateMap.get(`${pair.asset}-${pair.window}`) || { resolvedPredictionCount: 0, hitRatePercent: null };
    const windowHitRates = SUPPORTED_ASSETS.map((asset: SupportedAsset) => hitRateMap.get(`${asset}-${pair.window}`) || { resolvedPredictionCount: 0, hitRatePercent: null });
    const eligibleWindowHitRates = windowHitRates.filter((summary) => summary.resolvedPredictionCount >= config.MIN_RESOLVED_PREDICTIONS_FOR_HIT_RATE_GATING && summary.hitRatePercent !== null);
    const bestWindowHitRate = eligibleWindowHitRates.reduce((best, summary) => Math.max(best, summary.hitRatePercent || 0), 0);
    const hasEnoughPairHistory = pairHitRate.resolvedPredictionCount >= config.MIN_RESOLVED_PREDICTIONS_FOR_HIT_RATE_GATING;
    const hasMinimumHitRate = (pairHitRate.hitRatePercent || 0) >= config.MIN_VALID_HIT_RATE_FOR_EXECUTION;
    const isWindowLeader = (pairHitRate.hitRatePercent || 0) >= bestWindowHitRate;
    const shouldExecute = hasEnoughPairHistory && hasMinimumHitRate && isWindowLeader;
    const skipReason = shouldExecute ? null : "low_hit_rate";
    return { shouldExecute, skipReason };
  }
}
