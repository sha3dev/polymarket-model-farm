/**
 * @section imports:internals
 */

import type { OrderBook, ProviderKey, ProviderOrderBook, Snapshot } from "../collector/index.ts";

/**
 * @section public:properties
 */

export class MarketFeatureStatService {
  /**
   * @section factory
   */

  public static createDefault(): MarketFeatureStatService {
    return new MarketFeatureStatService();
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

  private readProviderOrderBookValue(snapshot: Snapshot, providerKey: ProviderKey): ProviderOrderBook | null {
    let providerOrderBook: ProviderOrderBook | null = null;
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

  public readProviderOrderBook(snapshot: Snapshot, providerKey: ProviderKey): ProviderOrderBook | null {
    const providerOrderBook = this.readProviderOrderBookValue(snapshot, providerKey);
    return providerOrderBook;
  }

  public readMedianExternalPrice(snapshot: Snapshot, providerKeys: readonly ProviderKey[]): number | null {
    const prices = providerKeys.map((providerKey) => this.readProviderPrice(snapshot, providerKey)).filter((price): price is number => price !== null).sort((left, right) => left - right);
    const middleIndex = Math.floor(prices.length / 2);
    const medianPrice = prices.length === 0 ? null : prices.length % 2 === 0 ? ((prices[middleIndex - 1] || 0) + (prices[middleIndex] || 0)) / 2 : prices[middleIndex] || null;
    return medianPrice;
  }

  public collectProviderHistory(snapshots: Snapshot[], index: number, providerKey: ProviderKey): number[] {
    const history = snapshots.slice(0, index + 1).map((snapshot) => this.readProviderPrice(snapshot, providerKey)).filter((price): price is number => price !== null);
    return history;
  }

  public computeMomentum(history: number[], maxSamples: number): number {
    const values = history.slice(Math.max(history.length - maxSamples, 0));
    const momentum = values.length < 2 ? 0 : (values[values.length - 1] || 0) / (values[0] || 1) - 1;
    return momentum;
  }

  public computeVolatility(history: number[], maxSamples: number): number {
    const values = history.slice(Math.max(history.length - maxSamples, 0));
    const returns = values.map((value, index) => {
      const previousValue = index === 0 ? value : values[index - 1] || value;
      return value <= 0 || previousValue <= 0 ? 0 : Math.log(value / previousValue);
    });
    const volatility = this.computeStandardDeviation(returns);
    return volatility;
  }

  public computeStandardDeviation(values: number[]): number {
    const meanValue = this.computeMean(values);
    const variance = values.length === 0 ? 0 : values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  public computeMean(values: number[]): number {
    const meanValue = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
    return meanValue;
  }

  public readBestBid(orderBook: OrderBook | ProviderOrderBook | null): number {
    const bestBid = orderBook === null || orderBook.bids.length === 0 ? 0 : orderBook.bids[0]?.price || 0;
    return bestBid;
  }

  public readBestAsk(orderBook: OrderBook | ProviderOrderBook | null): number {
    const bestAsk = orderBook === null || orderBook.asks.length === 0 ? 0 : orderBook.asks[0]?.price || 0;
    return bestAsk;
  }

  public readOrderBookMid(orderBook: OrderBook | ProviderOrderBook | null): number {
    const bestBid = this.readBestBid(orderBook);
    const bestAsk = this.readBestAsk(orderBook);
    const midPrice = bestBid === 0 && bestAsk === 0 ? 0 : (bestBid + bestAsk) / 2;
    return midPrice;
  }

  public readTopDepth(orderBook: OrderBook | ProviderOrderBook | null, sideKey: "bids" | "asks"): number {
    const topDepth = orderBook === null || orderBook[sideKey].length === 0 ? 0 : orderBook[sideKey][0]?.size || 0;
    return topDepth;
  }

  public computeImbalance(bidDepth: number, askDepth: number): number {
    const denominator = bidDepth + askDepth;
    const imbalance = denominator === 0 ? 0 : (bidDepth - askDepth) / denominator;
    return imbalance;
  }

  public normalizePrice(price: number | null, denominator: number): number {
    const normalizedPrice = price === null || denominator <= 0 ? 0 : price / denominator - 1;
    return normalizedPrice;
  }

  public normalizeSpread(spread: number, denominator: number): number {
    const normalizedSpread = denominator <= 0 ? 0 : spread / denominator;
    return normalizedSpread;
  }

  public computePrevBeatMeanDelta(priceToBeat: number, prevPriceToBeat: number[]): number {
    const deltas = prevPriceToBeat.filter((previousPriceToBeat) => Number.isFinite(previousPriceToBeat) && previousPriceToBeat > 0).map((previousPriceToBeat) => Math.abs((priceToBeat - previousPriceToBeat) / previousPriceToBeat));
    const prevBeatMeanDelta = this.computeMean(deltas);
    return prevBeatMeanDelta;
  }

  public clamp(value: number, lowerBound: number, upperBound: number): number {
    const clampedValue = Math.min(Math.max(value, lowerBound), upperBound);
    return clampedValue;
  }

  public safeNumber(value: number | null): number {
    const safeValue = value === null || !Number.isFinite(value) ? 0 : value;
    return safeValue;
  }
}
