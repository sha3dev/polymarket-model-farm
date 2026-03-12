/**
 * @section imports:externals
 */

import type { OrderBookSnapshot } from "@sha3/crypto";
import type { OrderBook } from "@sha3/polymarket";
import type { Snapshot } from "@sha3/polymarket-snapshot";

/**
 * @section imports:internals
 */

import type { ProviderKey } from "../model/index.ts";

/**
 * @section public:properties
 */

export class SnapshotFeatureStatService {
  /**
   * @section factory
   */

  public static createDefault(): SnapshotFeatureStatService {
    return new SnapshotFeatureStatService();
  }

  /**
   * @section private:methods
   */

  private readProviderPriceValue(snapshot: Snapshot, providerKey: ProviderKey): number | null {
    let providerPrice: number | null = null;
    switch (providerKey) {
      case "chainlink": {
        providerPrice = snapshot.chainlinkPrice;
        break;
      }
      case "binance": {
        providerPrice = snapshot.binancePrice;
        break;
      }
      case "coinbase": {
        providerPrice = snapshot.coinbasePrice;
        break;
      }
      case "kraken": {
        providerPrice = snapshot.krakenPrice;
        break;
      }
      case "okx": {
        providerPrice = snapshot.okxPrice;
        break;
      }
    }
    return providerPrice;
  }

  private readProviderOrderBookValue(snapshot: Snapshot, providerKey: ProviderKey): OrderBookSnapshot | null {
    let providerOrderBook: OrderBookSnapshot | null = null;
    switch (providerKey) {
      case "chainlink": {
        providerOrderBook = snapshot.chainlinkOrderBook;
        break;
      }
      case "binance": {
        providerOrderBook = snapshot.binanceOrderBook;
        break;
      }
      case "coinbase": {
        providerOrderBook = snapshot.coinbaseOrderBook;
        break;
      }
      case "kraken": {
        providerOrderBook = snapshot.krakenOrderBook;
        break;
      }
      case "okx": {
        providerOrderBook = snapshot.okxOrderBook;
        break;
      }
    }
    return providerOrderBook;
  }

  /**
   * @section public:methods
   */

  public readProviderPrice(snapshot: Snapshot, providerKey: ProviderKey): number | null {
    const providerPrice = this.readProviderPriceValue(snapshot, providerKey);
    const normalizedPrice = typeof providerPrice === "number" && Number.isFinite(providerPrice) ? providerPrice : null;
    return normalizedPrice;
  }

  public readProviderOrderBook(snapshot: Snapshot, providerKey: ProviderKey): OrderBookSnapshot | null {
    const providerOrderBook = this.readProviderOrderBookValue(snapshot, providerKey);
    return providerOrderBook;
  }

  public readMedianExternalPrice(snapshot: Snapshot, providerKeys: readonly ProviderKey[]): number | null {
    const prices = providerKeys
      .map((providerKey) => this.readProviderPrice(snapshot, providerKey))
      .filter((price): price is number => price !== null)
      .sort((left, right) => left - right);
    const middleIndex = Math.floor(prices.length / 2);
    let medianPrice: number | null = null;
    if (prices.length > 0) {
      medianPrice = prices.length % 2 === 0 ? ((prices[middleIndex - 1] || 0) + (prices[middleIndex] || 0)) / 2 : (prices[middleIndex] ?? null);
    }
    return medianPrice;
  }

  public collectProviderHistory(snapshots: Snapshot[], index: number, providerKey: ProviderKey): number[] {
    return snapshots
      .slice(0, index + 1)
      .map((snapshot) => this.readProviderPrice(snapshot, providerKey))
      .filter((price): price is number => price !== null);
  }

  public computeVolatility(history: number[], maxSamples: number): number {
    const returns = history.slice(Math.max(history.length - maxSamples, 0)).map((value, index, values) => {
      const previousValue = index === 0 ? value : (values[index - 1] ?? value);
      return value <= 0 || previousValue <= 0 ? 0 : Math.log(value / previousValue);
    });
    return this.computeStandardDeviation(returns);
  }

  public computeMomentum(history: number[], maxSamples: number): number {
    const values = history.slice(Math.max(history.length - maxSamples, 0));
    const momentum = values.length < 2 ? 0 : (values[values.length - 1] || 0) - (values[0] || 0);
    return momentum;
  }

  public readOrderBookMid(orderBook: OrderBook | null): number {
    const bestBid = this.readBestBid(orderBook);
    const bestAsk = this.readBestAsk(orderBook);
    const mid = bestBid === 0 && bestAsk === 0 ? 0 : (bestBid + bestAsk) / 2;
    return mid;
  }

  public readExternalOrderBookMid(orderBook: OrderBookSnapshot | null): number {
    const bestBid = this.readBestBid(orderBook);
    const bestAsk = this.readBestAsk(orderBook);
    const mid = bestBid === 0 && bestAsk === 0 ? 0 : (bestBid + bestAsk) / 2;
    return mid;
  }

  public readBestBid(orderBook: OrderBook | OrderBookSnapshot | null): number {
    const bestBid = orderBook === null || orderBook.bids.length === 0 ? 0 : orderBook.bids[0]?.price || 0;
    return bestBid;
  }

  public readBestAsk(orderBook: OrderBook | OrderBookSnapshot | null): number {
    const bestAsk = orderBook === null || orderBook.asks.length === 0 ? 0 : orderBook.asks[0]?.price || 0;
    return bestAsk;
  }

  public readDepth(orderBook: OrderBook | null, sideKey: "bids" | "asks", maxLevels: number): number {
    const levels = orderBook === null ? [] : orderBook[sideKey].slice(0, maxLevels);
    const depth = levels.reduce((sum: number, level: { price: number; size: number }) => sum + level.size, 0);
    return depth;
  }

  public computeImbalance(bidDepth: number, askDepth: number): number {
    const denominator = bidDepth + askDepth;
    return denominator === 0 ? 0 : (bidDepth - askDepth) / denominator;
  }

  public computeMean(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  public computeStandardDeviation(values: number[]): number {
    const meanValue = this.computeMean(values);
    const variance = values.length === 0 ? 0 : values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  public normalizePrice(price: number | null, denominator: number): number {
    return price === null || denominator === 0 ? 0 : price / denominator - 1;
  }

  public normalizeSpread(spread: number, denominator: number): number {
    const normalizedSpread = denominator === 0 ? 0 : spread / denominator;
    return normalizedSpread;
  }

  public computePrevBeatMeanDelta(priceToBeat: number, prevPriceToBeat: number[]): number {
    const deltas = prevPriceToBeat
      .filter((previousPriceToBeat) => Number.isFinite(previousPriceToBeat) && previousPriceToBeat > 0)
      .map((previousPriceToBeat) => Math.abs((priceToBeat - previousPriceToBeat) / previousPriceToBeat));
    const prevBeatMeanDelta = this.computeMean(deltas);
    return prevBeatMeanDelta;
  }

  public safeNumber(value: number | null): number {
    return value === null || !Number.isFinite(value) ? 0 : value;
  }

  public clamp(value: number, lowerBound: number, upperBound: number): number {
    return Math.min(Math.max(value, lowerBound), upperBound);
  }

  public readSnapshotAt(snapshots: Snapshot[], index: number): Snapshot {
    const snapshot = snapshots[index];
    if (!snapshot) {
      throw new Error(`snapshot index ${index} is out of range`);
    }
    return snapshot;
  }
}
