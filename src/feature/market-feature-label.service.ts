/**
 * @section imports:internals
 */

import { PROVIDER_KEYS } from "../collector/index.ts";

/**
 * @section consts
 */

const MARKET_CONTEXT_LABELS = ["time-remaining-norm", "chainlink-delta-to-strike", "chainlink-momentum-short", "chainlink-momentum-long"] as const;
const EXCHANGE_STATISTIC_LABELS = ["availability", "delta-to-strike", "momentum-short", "momentum-long", "obi", "relative-spread", "depth-ratio"] as const;

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
      if (providerKey !== "chainlink") {
        for (const statisticLabel of EXCHANGE_STATISTIC_LABELS) {
          labels.push(`${providerKey}-${statisticLabel}`);
        }
      }
    }
  }

  /**
   * @section public:methods
   */

  public buildLabels(): string[] {
    const labels: string[] = [...MARKET_CONTEXT_LABELS];
    this.buildExchangeLabels(labels);
    return labels;
  }
}
