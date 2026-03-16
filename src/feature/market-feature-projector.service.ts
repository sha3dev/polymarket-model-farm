/**
 * @section imports:internals
 */

import { PROVIDER_KEYS } from "../collector/index.ts";
import type { ProviderKey, Snapshot } from "../collector/index.ts";
import config from "../config.ts";
import type { FeatureProjectionInput, FeatureProjectionResult } from "./index.ts";
import { MarketFeatureLabelService } from "./market-feature-label.service.ts";
import { MarketFeatureStatService } from "./market-feature-stat.service.ts";

export class MarketFeatureProjectorService {
  /**
   * @section private:properties
   */

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

  private buildResampledSnapshots(input: FeatureProjectionInput): Snapshot[] {
    const resampleSeconds = input.window === "5m" ? config.FEATURE_RESAMPLE_SECONDS_5M : config.FEATURE_RESAMPLE_SECONDS_15M;
    const maxSequenceLength = input.window === "5m" ? 60 : 90;
    const marketStartTs = Date.parse(input.marketStart);
    const marketEndTs = Date.parse(input.marketEnd);
    const totalDurationMs = Math.max(marketEndTs - marketStartTs, 1);
    const bucketCount = Math.max(Math.ceil(totalDurationMs / (resampleSeconds * 1000)), 1);
    const latestSnapshotByBucket = new Map<number, Snapshot>();
    for (const snapshot of input.snapshots) {
      const relativeMs = Math.max(snapshot.generatedAt - marketStartTs, 0);
      const bucketIndex = this.marketFeatureStatService.clamp(Math.floor(relativeMs / (resampleSeconds * 1000)), 0, bucketCount - 1);
      latestSnapshotByBucket.set(bucketIndex, snapshot);
    }
    const resampledSnapshots: Snapshot[] = [];
    let previousSnapshot: Snapshot | null = null;
    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
      const currentSnapshot: Snapshot | null = latestSnapshotByBucket.get(bucketIndex) || previousSnapshot || null;
      if (currentSnapshot) {
        resampledSnapshots.push(currentSnapshot);
        previousSnapshot = currentSnapshot;
      }
    }
    return resampledSnapshots.slice(-maxSequenceLength);
  }

  private buildExchangeRow(input: FeatureProjectionInput, snapshots: Snapshot[], index: number, providerKey: ProviderKey): number[] {
    const snapshot = snapshots[index];
    if (!snapshot) {
      throw new Error(`resampled snapshot index ${index} is out of range`);
    }
    const currentPrice = this.marketFeatureStatService.readProviderPrice(snapshot, providerKey);
    const currentOrderBook = this.marketFeatureStatService.readProviderOrderBook(snapshot, providerKey);
    const bestBid = this.marketFeatureStatService.readBestBid(currentOrderBook);
    const bestAsk = this.marketFeatureStatService.readBestAsk(currentOrderBook);
    const midPrice = this.marketFeatureStatService.readOrderBookMid(currentOrderBook);
    const topBidDepth = this.marketFeatureStatService.readTopDepth(currentOrderBook, "bids");
    const topAskDepth = this.marketFeatureStatService.readTopDepth(currentOrderBook, "asks");
    const priceHistory = snapshots.slice(0, index + 1).map((historySnapshot) => this.marketFeatureStatService.readProviderPrice(historySnapshot, providerKey));
    const exchangeRow = [
      currentPrice === null ? 0 : 1,
      this.marketFeatureStatService.normalizeDelta(currentPrice, input.priceToBeat),
      this.marketFeatureStatService.computeMomentum(priceHistory, 3, input.priceToBeat),
      this.marketFeatureStatService.computeMomentum(priceHistory, 9, input.priceToBeat),
      this.marketFeatureStatService.computeImbalance(topBidDepth, topAskDepth),
      this.marketFeatureStatService.computeRelativeSpread(bestBid, bestAsk, midPrice),
      this.marketFeatureStatService.computeDepthRatio(topBidDepth, topAskDepth, currentPrice || 0),
    ];
    return exchangeRow;
  }

  private buildSnapshotRow(input: FeatureProjectionInput, snapshots: Snapshot[], index: number): number[] {
    const snapshot = snapshots[index];
    if (!snapshot) {
      throw new Error(`resampled snapshot index ${index} is out of range`);
    }
    const marketStartTs = Date.parse(input.marketStart);
    const marketEndTs = Date.parse(input.marketEnd);
    const totalDurationMs = Math.max(marketEndTs - marketStartTs, 1);
    const progress = this.marketFeatureStatService.clamp((snapshot.generatedAt - marketStartTs) / totalDurationMs, 0, 1);
    const chainlinkHistory = snapshots
      .slice(0, index + 1)
      .map((historySnapshot) => this.marketFeatureStatService.readProviderPrice(historySnapshot, "chainlink"));
    const row = [
      1 - progress,
      this.marketFeatureStatService.normalizeDelta(this.marketFeatureStatService.readProviderPrice(snapshot, "chainlink"), input.priceToBeat),
      this.marketFeatureStatService.computeMomentum(chainlinkHistory, 3, input.priceToBeat),
      this.marketFeatureStatService.computeMomentum(chainlinkHistory, 9, input.priceToBeat),
    ];
    for (const providerKey of PROVIDER_KEYS) {
      if (providerKey !== "chainlink") {
        row.push(...this.buildExchangeRow(input, snapshots, index, providerKey));
      }
    }
    return row;
  }

  /**
   * @section public:methods
   */

  public projectSequence(input: FeatureProjectionInput): FeatureProjectionResult {
    const resampledSnapshots = this.buildResampledSnapshots(input);
    const rows = resampledSnapshots.map((_snapshot, index) => this.buildSnapshotRow(input, resampledSnapshots, index));
    const projection = { labels: this.featureLabels.slice(), rows, maxSequenceLength: input.window === "5m" ? 60 : 90 };
    return projection;
  }

  public getFeatureLabels(): string[] {
    const featureLabels = this.featureLabels.slice();
    return featureLabels;
  }
}
