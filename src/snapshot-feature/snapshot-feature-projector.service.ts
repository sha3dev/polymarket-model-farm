/**
 * @section imports:externals
 */

import type { Snapshot } from "@sha3/polymarket-snapshot";

/**
 * @section imports:internals
 */

import { ORDERBOOK_SIDES, PROVIDER_KEYS } from "../model/index.ts";
import type { FeatureProjectionInput, FeatureProjectionResult } from "./index.ts";
import { SnapshotFeatureLabelService } from "./snapshot-feature-label.service.ts";
import { SnapshotFeatureStatService } from "./snapshot-feature-stat.service.ts";

/**
 * @section public:properties
 */

export class SnapshotFeatureProjectorService {
  private readonly featureLabels: string[];

  private readonly snapshotFeatureStatService: SnapshotFeatureStatService;

  /**
   * @section constructor
   */

  public constructor() {
    this.featureLabels = SnapshotFeatureLabelService.createDefault().buildLabels();
    this.snapshotFeatureStatService = SnapshotFeatureStatService.createDefault();
  }

  /**
   * @section factory
   */

  public static createDefault(): SnapshotFeatureProjectorService {
    return new SnapshotFeatureProjectorService();
  }

  /**
   * @section private:methods
   */

  private projectSnapshotRow(input: FeatureProjectionInput, snapshot: Snapshot, index: number): number[] {
    const features = [...this.projectMarketContext(input, snapshot)];
    features.push(...this.projectExchangeState(input, index));
    features.push(...this.projectExternalStructure(snapshot));
    features.push(...this.projectPolymarketState(input, snapshot));
    features.push(...this.projectPolymarketOrderBooks(snapshot));
    return features;
  }

  private projectMarketContext(input: FeatureProjectionInput, snapshot: Snapshot): number[] {
    const marketStartTs = Date.parse(input.marketStart);
    const marketEndTs = Date.parse(input.marketEnd);
    const totalDurationMs = Math.max(marketEndTs - marketStartTs, 1);
    const elapsedMs = this.snapshotFeatureStatService.clamp(snapshot.generatedAt - marketStartTs, 0, totalDurationMs);
    const progress = elapsedMs / totalDurationMs;
    const prevBeatMeanDelta = this.snapshotFeatureStatService.computePrevBeatMeanDelta(input.priceToBeat, input.prevPriceToBeat || []);
    return [progress, input.priceToBeat, Math.log(Math.max(input.priceToBeat, 1e-9)), prevBeatMeanDelta];
  }

  private projectExchangeState(input: FeatureProjectionInput, index: number): number[] {
    const features: number[] = [];
    const snapshot = this.snapshotFeatureStatService.readSnapshotAt(input.snapshots, index);
    for (const providerKey of PROVIDER_KEYS) {
      const currentPrice = this.snapshotFeatureStatService.readProviderPrice(snapshot, providerKey);
      const history = this.snapshotFeatureStatService.collectProviderHistory(input.snapshots, index, providerKey);
      const orderBook = this.snapshotFeatureStatService.readProviderOrderBook(snapshot, providerKey);
      const bestBid = this.snapshotFeatureStatService.readBestBid(orderBook);
      const bestAsk = this.snapshotFeatureStatService.readBestAsk(orderBook);
      const mid = this.snapshotFeatureStatService.readExternalOrderBookMid(orderBook);
      const spread = Math.max(bestAsk - bestBid, 0);
      const bidDepth1 = this.snapshotFeatureStatService.readDepth(orderBook, "bids", 1);
      const askDepth1 = this.snapshotFeatureStatService.readDepth(orderBook, "asks", 1);
      const bidDepth3 = this.snapshotFeatureStatService.readDepth(orderBook, "bids", 3);
      const askDepth3 = this.snapshotFeatureStatService.readDepth(orderBook, "asks", 3);
      features.push(...this.projectExchangeFeatureRow(currentPrice, history, input.priceToBeat, bestBid, bestAsk, spread, mid, bidDepth1, askDepth1, bidDepth3, askDepth3));
    }
    return features;
  }

  private projectExchangeFeatureRow(
    currentPrice: number | null,
    history: number[],
    priceToBeat: number,
    bestBid: number,
    bestAsk: number,
    spread: number,
    mid: number,
    bidDepth1: number,
    askDepth1: number,
    bidDepth3: number,
    askDepth3: number,
  ): number[] {
    const isAvailable = currentPrice === null ? 0 : 1;
    const features = [
      isAvailable,
      this.snapshotFeatureStatService.normalizePrice(currentPrice, priceToBeat),
      this.snapshotFeatureStatService.computeMomentum(history, 20),
      this.snapshotFeatureStatService.computeMomentum(history, 120),
      this.snapshotFeatureStatService.computeVolatility(history, 20),
      this.snapshotFeatureStatService.computeVolatility(history, 120),
      this.snapshotFeatureStatService.normalizePrice(bestBid === 0 ? null : bestBid, priceToBeat),
      this.snapshotFeatureStatService.normalizePrice(bestAsk === 0 ? null : bestAsk, priceToBeat),
      this.snapshotFeatureStatService.normalizeSpread(spread, mid),
      this.snapshotFeatureStatService.normalizePrice(mid === 0 ? null : mid, priceToBeat),
      this.snapshotFeatureStatService.computeImbalance(bidDepth1, askDepth1),
      bidDepth1,
      askDepth1,
      bidDepth3,
      askDepth3,
    ];
    return currentPrice === null ? features.map(() => 0) : features;
  }

  private projectExternalStructure(snapshot: Snapshot): number[] {
    const externalPrices = PROVIDER_KEYS.map((providerKey) => this.snapshotFeatureStatService.readProviderPrice(snapshot, providerKey)).filter((price): price is number => price !== null);
    const medianPrice = this.snapshotFeatureStatService.readMedianExternalPrice(snapshot, PROVIDER_KEYS);
    const sortedPrices = externalPrices.slice().sort((left, right) => left - right);
    const rangeValue = externalPrices.length === 0 ? 0 : (sortedPrices[sortedPrices.length - 1] || 0) - (sortedPrices[0] || 0);
    return [
      this.snapshotFeatureStatService.normalizeSpread(rangeValue, medianPrice || 0),
      this.snapshotFeatureStatService.normalizeSpread(this.snapshotFeatureStatService.computeStandardDeviation(externalPrices), medianPrice || 0),
      externalPrices.length / PROVIDER_KEYS.length,
    ];
  }

  private projectPolymarketOrderBooks(snapshot: Snapshot): number[] {
    const features: number[] = [];
    const orderBooks = { up: snapshot.upOrderBook, down: snapshot.downOrderBook };
    for (const sideKey of ORDERBOOK_SIDES) {
      features.push(...this.projectOrderBookSide(orderBooks[sideKey]));
    }
    return features;
  }

  private projectPolymarketState(input: FeatureProjectionInput, snapshot: Snapshot): number[] {
    const upPrice = this.snapshotFeatureStatService.safeNumber(snapshot.upPrice);
    const downPrice = this.snapshotFeatureStatService.safeNumber(snapshot.downPrice);
    const upMid = this.snapshotFeatureStatService.readOrderBookMid(snapshot.upOrderBook);
    const downMid = this.snapshotFeatureStatService.readOrderBookMid(snapshot.downOrderBook);
    const externalMedianPrice = this.snapshotFeatureStatService.readMedianExternalPrice(snapshot, PROVIDER_KEYS);
    const externalDirection = this.snapshotFeatureStatService.normalizePrice(externalMedianPrice, input.priceToBeat);
    return [upPrice, downPrice, upPrice - downPrice, upMid, downMid, upMid - downMid, (upPrice - downPrice) - externalDirection];
  }

  private projectOrderBookSide(orderBook: Snapshot["upOrderBook"]): number[] {
    const bestBid = this.snapshotFeatureStatService.readBestBid(orderBook);
    const bestAsk = this.snapshotFeatureStatService.readBestAsk(orderBook);
    const mid = this.snapshotFeatureStatService.readOrderBookMid(orderBook);
    const bidDepth1 = this.snapshotFeatureStatService.readDepth(orderBook, "bids", 1);
    const askDepth1 = this.snapshotFeatureStatService.readDepth(orderBook, "asks", 1);
    return [bestBid, bestAsk, Math.max(bestAsk - bestBid, 0), mid, this.snapshotFeatureStatService.computeImbalance(bidDepth1, askDepth1)];
  }

  /**
   * @section public:methods
   */

  public projectSequence(input: FeatureProjectionInput): FeatureProjectionResult {
    const rows = input.snapshots.map((snapshot, index) => this.projectSnapshotRow(input, snapshot, index));
    const maxSequenceLength = input.window === "5m" ? 600 : 1800;
    return { labels: this.featureLabels.slice(), rows, maxSequenceLength };
  }

  public getFeatureLabels(): string[] {
    return this.featureLabels.slice();
  }
}
