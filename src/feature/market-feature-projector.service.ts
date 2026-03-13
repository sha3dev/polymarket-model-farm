/**
 * @section imports:internals
 */

import { ORDERBOOK_SIDES, PROVIDER_KEYS } from "../collector/index.ts";
import type { FeatureProjectionInput, FeatureProjectionResult } from "./index.ts";
import { MarketFeatureLabelService } from "./market-feature-label.service.ts";
import { MarketFeatureStatService } from "./market-feature-stat.service.ts";

/**
 * @section public:properties
 */

export class MarketFeatureProjectorService {
  private readonly featureLabels: string[];

  private readonly marketFeatureStatService: MarketFeatureStatService;

  /**
   * @section constructor
   */

  public constructor() {
    this.featureLabels = MarketFeatureLabelService.createDefault().buildLabels();
    this.marketFeatureStatService = MarketFeatureStatService.createDefault();
  }

  /**
   * @section factory
   */

  public static createDefault(): MarketFeatureProjectorService {
    return new MarketFeatureProjectorService();
  }

  /**
   * @section private:methods
   */

  private projectMarketContext(input: FeatureProjectionInput, index: number): number[] {
    const marketStartTs = Date.parse(input.marketStart);
    const marketEndTs = Date.parse(input.marketEnd);
    const totalDurationMs = Math.max(marketEndTs - marketStartTs, 1);
    const generatedAt = input.snapshots[index]?.generatedAt || marketStartTs;
    const progress = this.marketFeatureStatService.clamp((generatedAt - marketStartTs) / totalDurationMs, 0, 1);
    const prevBeatMeanDelta = this.marketFeatureStatService.computePrevBeatMeanDelta(input.priceToBeat, input.prevPriceToBeat || []);
    return [progress, input.priceToBeat, Math.log(Math.max(input.priceToBeat, 1e-9)), prevBeatMeanDelta];
  }

  private projectExchangeState(input: FeatureProjectionInput, index: number): number[] {
    const snapshot = input.snapshots[index];
    const features: number[] = [];
    if (!snapshot) {
      throw new Error(`snapshot index ${index} is out of range`);
    }
    for (const providerKey of PROVIDER_KEYS) {
      features.push(...this.projectExchangeRow(input, index, providerKey, snapshot));
    }
    return features;
  }

  private projectExchangeRow(input: FeatureProjectionInput, index: number, providerKey: (typeof PROVIDER_KEYS)[number], snapshot: FeatureProjectionInput["snapshots"][number]): number[] {
    const history = this.marketFeatureStatService.collectProviderHistory(input.snapshots, index, providerKey);
    const currentPrice = this.marketFeatureStatService.readProviderPrice(snapshot, providerKey);
    const orderBook = this.marketFeatureStatService.readProviderOrderBook(snapshot, providerKey);
    const bestBid = this.marketFeatureStatService.readBestBid(orderBook);
    const bestAsk = this.marketFeatureStatService.readBestAsk(orderBook);
    const midPrice = this.marketFeatureStatService.readOrderBookMid(orderBook);
    const topBidDepth = this.marketFeatureStatService.readTopDepth(orderBook, "bids");
    const topAskDepth = this.marketFeatureStatService.readTopDepth(orderBook, "asks");
    const spread = Math.max(bestAsk - bestBid, 0);
    return [
      currentPrice === null ? 0 : 1,
      this.marketFeatureStatService.normalizePrice(currentPrice, input.priceToBeat),
      this.marketFeatureStatService.computeMomentum(history, 20),
      this.marketFeatureStatService.computeMomentum(history, 60),
      this.marketFeatureStatService.computeMomentum(history, 120),
      this.marketFeatureStatService.computeVolatility(history, 20),
      this.marketFeatureStatService.computeVolatility(history, 60),
      this.marketFeatureStatService.computeVolatility(history, 120),
      this.marketFeatureStatService.normalizePrice(bestBid === 0 ? null : bestBid, input.priceToBeat),
      this.marketFeatureStatService.normalizePrice(bestAsk === 0 ? null : bestAsk, input.priceToBeat),
      this.marketFeatureStatService.normalizeSpread(spread, midPrice),
      this.marketFeatureStatService.normalizePrice(midPrice === 0 ? null : midPrice, input.priceToBeat),
      this.marketFeatureStatService.computeImbalance(topBidDepth, topAskDepth),
    ];
  }

  private projectExternalStructure(input: FeatureProjectionInput, index: number): number[] {
    const snapshot = input.snapshots[index];
    if (!snapshot) {
      throw new Error(`snapshot index ${index} is out of range`);
    }
    const externalPrices = PROVIDER_KEYS.map((providerKey) => this.marketFeatureStatService.readProviderPrice(snapshot, providerKey)).filter((price): price is number => price !== null);
    const sortedPrices = externalPrices.slice().sort((left, right) => left - right);
    const medianPrice = this.marketFeatureStatService.readMedianExternalPrice(snapshot, PROVIDER_KEYS) || 0;
    const priceRange = externalPrices.length === 0 ? 0 : (sortedPrices[sortedPrices.length - 1] || 0) - (sortedPrices[0] || 0);
    return [
      this.marketFeatureStatService.normalizeSpread(priceRange, medianPrice),
      this.marketFeatureStatService.normalizeSpread(this.marketFeatureStatService.computeStandardDeviation(externalPrices), medianPrice),
      externalPrices.length / PROVIDER_KEYS.length,
    ];
  }

  private projectPolymarketState(input: FeatureProjectionInput, index: number): number[] {
    const snapshot = input.snapshots[index];
    if (!snapshot) {
      throw new Error(`snapshot index ${index} is out of range`);
    }
    const upMid = this.marketFeatureStatService.readOrderBookMid(snapshot.upOrderBook);
    const downMid = this.marketFeatureStatService.readOrderBookMid(snapshot.downOrderBook);
    const externalMedianPrice = this.marketFeatureStatService.readMedianExternalPrice(snapshot, PROVIDER_KEYS);
    return [
      this.marketFeatureStatService.safeNumber(snapshot.upPrice),
      this.marketFeatureStatService.safeNumber(snapshot.downPrice),
      this.marketFeatureStatService.safeNumber(snapshot.upPrice) - this.marketFeatureStatService.safeNumber(snapshot.downPrice),
      upMid,
      downMid,
      upMid - downMid,
      (this.marketFeatureStatService.safeNumber(snapshot.upPrice) - this.marketFeatureStatService.safeNumber(snapshot.downPrice)) -
        this.marketFeatureStatService.normalizePrice(externalMedianPrice, input.priceToBeat),
    ];
  }

  private projectPolymarketOrderBooks(input: FeatureProjectionInput, index: number): number[] {
    const snapshot = input.snapshots[index];
    if (!snapshot) {
      throw new Error(`snapshot index ${index} is out of range`);
    }
    const features: number[] = [];
    for (const sideKey of ORDERBOOK_SIDES) {
      const orderBook = sideKey === "up" ? snapshot.upOrderBook : snapshot.downOrderBook;
      const bestBid = this.marketFeatureStatService.readBestBid(orderBook);
      const bestAsk = this.marketFeatureStatService.readBestAsk(orderBook);
      const midPrice = this.marketFeatureStatService.readOrderBookMid(orderBook);
      const topBidDepth = this.marketFeatureStatService.readTopDepth(orderBook, "bids");
      const topAskDepth = this.marketFeatureStatService.readTopDepth(orderBook, "asks");
      features.push(bestBid, bestAsk, Math.max(bestAsk - bestBid, 0), midPrice, this.marketFeatureStatService.computeImbalance(topBidDepth, topAskDepth));
    }
    return features;
  }

  private projectSnapshotRow(input: FeatureProjectionInput, index: number): number[] {
    const row = [
      ...this.projectMarketContext(input, index),
      ...this.projectExchangeState(input, index),
      ...this.projectExternalStructure(input, index),
      ...this.projectPolymarketState(input, index),
      ...this.projectPolymarketOrderBooks(input, index),
    ];
    return row;
  }

  /**
   * @section public:methods
   */

  public projectSequence(input: FeatureProjectionInput): FeatureProjectionResult {
    const rows = input.snapshots.map((_snapshot, index) => this.projectSnapshotRow(input, index));
    const maxSequenceLength = input.window === "5m" ? 600 : 1800;
    return { labels: this.featureLabels.slice(), rows, maxSequenceLength };
  }

  public getFeatureLabels(): string[] {
    const featureLabels = this.featureLabels.slice();
    return featureLabels;
  }
}
