/**
 * @section imports:internals
 */

import { ORDERBOOK_SIDES, PROVIDER_KEYS } from "../collector/index.ts";

/**
 * @section consts
 */

const MARKET_CONTEXT_LABELS = ["progress", "price-to-beat", "log-price-to-beat", "prev-beat-mean-delta"] as const;
const EXCHANGE_STATISTIC_LABELS = [
  "availability",
  "price-vs-price-to-beat",
  "momentum10s",
  "momentum30s",
  "momentum60s",
  "volatility10s",
  "volatility30s",
  "volatility60s",
  "best-bid-vs-price-to-beat",
  "best-ask-vs-price-to-beat",
  "spread-normalized-by-mid",
  "mid-vs-price-to-beat",
  "top-book-imbalance",
] as const;
const EXTERNAL_STRUCTURE_LABELS = ["external-price-range-normalized", "external-stddev-normalized", "external-source-count-normalized"] as const;
const POLYMARKET_STATE_LABELS = ["up-price", "down-price", "up-down-price-gap", "up-mid", "down-mid", "up-mid-minus-down-mid", "polymarket-gap-vs-external"] as const;
const POLYMARKET_BOOK_STATISTIC_LABELS = ["best-bid", "best-ask", "spread", "mid", "top-book-imbalance"] as const;

/**
 * @section public:properties
 */

export class MarketFeatureLabelService {
  /**
   * @section factory
   */

  public static createDefault(): MarketFeatureLabelService {
    return new MarketFeatureLabelService();
  }

  /**
   * @section private:methods
   */

  private buildExchangeLabels(labels: string[]): void {
    for (const providerKey of PROVIDER_KEYS) {
      for (const statisticLabel of EXCHANGE_STATISTIC_LABELS) {
        labels.push(`${providerKey}-${statisticLabel}`);
      }
    }
  }

  private buildPolymarketBookLabels(labels: string[]): void {
    for (const sideKey of ORDERBOOK_SIDES) {
      for (const statisticLabel of POLYMARKET_BOOK_STATISTIC_LABELS) {
        labels.push(`${sideKey}-${statisticLabel}`);
      }
    }
  }

  /**
   * @section public:methods
   */

  public buildLabels(): string[] {
    const labels: string[] = [...MARKET_CONTEXT_LABELS];
    this.buildExchangeLabels(labels);
    labels.push(...EXTERNAL_STRUCTURE_LABELS);
    labels.push(...POLYMARKET_STATE_LABELS);
    this.buildPolymarketBookLabels(labels);
    return labels;
  }
}
