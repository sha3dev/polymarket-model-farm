/**
 * @section imports:internals
 */

import type { ProviderKey, ProviderOrderBook, Snapshot } from "../collector/index.ts";

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

  public readBestBid(orderBook: ProviderOrderBook | null): number {
    const bestBid = orderBook === null || orderBook.bids.length === 0 ? 0 : orderBook.bids[0]?.price || 0;
    return bestBid;
  }

  public readBestAsk(orderBook: ProviderOrderBook | null): number {
    const bestAsk = orderBook === null || orderBook.asks.length === 0 ? 0 : orderBook.asks[0]?.price || 0;
    return bestAsk;
  }

  public readOrderBookMid(orderBook: ProviderOrderBook | null): number {
    const bestBid = this.readBestBid(orderBook);
    const bestAsk = this.readBestAsk(orderBook);
    const midPrice = bestBid === 0 && bestAsk === 0 ? 0 : (bestBid + bestAsk) / 2;
    return midPrice;
  }

  public readTopDepth(orderBook: ProviderOrderBook | null, sideKey: "bids" | "asks"): number {
    const topDepth = orderBook === null || orderBook[sideKey].length === 0 ? 0 : orderBook[sideKey][0]?.size || 0;
    return topDepth;
  }

  public computeImbalance(bidDepth: number, askDepth: number): number {
    const denominator = bidDepth + askDepth;
    const imbalance = denominator === 0 ? 0 : (bidDepth - askDepth) / denominator;
    return imbalance;
  }

  public computeRelativeSpread(bestBid: number, bestAsk: number, midPrice: number): number {
    const relativeSpread = bestBid <= 0 || bestAsk <= 0 || midPrice <= 0 ? 0 : (bestAsk - bestBid) / midPrice;
    return relativeSpread;
  }

  public computeDepthRatio(bidDepth: number, askDepth: number, referencePrice: number): number {
    const depthRatio = referencePrice <= 0 ? 0 : (bidDepth + askDepth) / referencePrice;
    return depthRatio;
  }

  public computeMomentum(values: Array<number | null>, lookbackSteps: number, referencePrice: number): number {
    const currentValue = values[values.length - 1] || null;
    const targetIndex = Math.max(values.length - 1 - lookbackSteps, 0);
    const previousValue = values[targetIndex] || null;
    const momentum = currentValue === null || previousValue === null || referencePrice <= 0 ? 0 : (currentValue - previousValue) / referencePrice;
    return momentum;
  }

  public normalizeDelta(price: number | null, referencePrice: number): number {
    const normalizedDelta = price === null || referencePrice <= 0 ? 0 : (price - referencePrice) / referencePrice;
    return normalizedDelta;
  }

  public clamp(value: number, lowerBound: number, upperBound: number): number {
    const clampedValue = Math.min(Math.max(value, lowerBound), upperBound);
    return clampedValue;
  }
}
