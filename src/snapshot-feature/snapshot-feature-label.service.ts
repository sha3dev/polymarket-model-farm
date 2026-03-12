/**
 * @section imports:internals
 */

import { ORDERBOOK_SIDES, PROVIDER_KEYS } from "../model/index.ts";

/**
 * @section consts
 */

const EXCHANGE_STATISTICS = [
  "availability",
  "price-vs-price-to-beat",
  "momentum10s",
  "momentum60s",
  "volatility10s",
  "volatility60s",
  "best-bid-vs-price-to-beat",
  "best-ask-vs-price-to-beat",
  "spread-normalized-by-mid",
  "mid-vs-price-to-beat",
  "top-book-imbalance",
  "bid-depth-1",
  "ask-depth-1",
  "bid-depth-3",
  "ask-depth-3",
] as const;
const BASE_LABELS = ["progress", "price-to-beat", "log-price-to-beat", "prev-beat-mean-delta"] as const;
const EXTERNAL_STRUCTURE_LABELS = ["external-price-range-normalized", "external-stddev-normalized", "external-source-count-normalized"] as const;
const POLYMARKET_STATE_LABELS = ["up-price", "down-price", "up-down-price-difference", "up-mid", "down-mid", "up-mid-minus-down-mid", "polymarket-direction-gap-vs-external"] as const;

/**
 * @section public:properties
 */

export class SnapshotFeatureLabelService {
  /**
   * @section factory
   */

  public static createDefault(): SnapshotFeatureLabelService {
    return new SnapshotFeatureLabelService();
  }

  /**
   * @section private:methods
   */

  private buildExchangeLabels(labels: string[]): void {
    for (const providerKey of PROVIDER_KEYS) {
      for (const statName of EXCHANGE_STATISTICS) {
        labels.push(`${providerKey}-${statName}`);
      }
    }
  }

  private buildOrderBookLabels(labels: string[]): void {
    for (const sideKey of ORDERBOOK_SIDES) {
      labels.push(`${sideKey}-best-bid`, `${sideKey}-best-ask`, `${sideKey}-spread`, `${sideKey}-mid`, `${sideKey}-top-book-imbalance`);
    }
  }

  /**
   * @section public:methods
   */

  public buildLabels(): string[] {
    const labels: string[] = [...BASE_LABELS];
    this.buildExchangeLabels(labels);
    labels.push(...EXTERNAL_STRUCTURE_LABELS);
    labels.push(...POLYMARKET_STATE_LABELS);
    this.buildOrderBookLabels(labels);
    return labels;
  }
}
