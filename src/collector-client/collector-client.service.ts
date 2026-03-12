/**
 * @section imports:internals
 */

import config from "../config.ts";
import type { AssetWindow } from "../model/index.ts";
import type { CollectorStatePayload, MarketSnapshotsPayload, MarketSummary } from "./index.ts";

/**
 * @section types
 */

type CollectorClientServiceOptions = { baseUrl: string; fetchFn: typeof fetch };

/**
 * @section public:properties
 */

export class CollectorClientService {
  private readonly baseUrl: string;

  private readonly fetchFn: typeof fetch;

  /**
   * @section constructor
   */

  public constructor(options: CollectorClientServiceOptions) {
    this.baseUrl = options.baseUrl;
    this.fetchFn = options.fetchFn;
  }

  /**
   * @section factory
   */

  public static createDefault(): CollectorClientService {
    return new CollectorClientService({ baseUrl: config.COLLECTOR_BASE_URL, fetchFn: fetch });
  }

  /**
   * @section private:methods
   */

  private buildMarketsUrl(url: URL, pair: AssetWindow): URL {
    const mutableUrl = url;
    mutableUrl.searchParams.set("asset", pair.asset);
    mutableUrl.searchParams.set("window", pair.window);
    return mutableUrl;
  }

  private async assertSuccessfulResponse(response: Response, message: string): Promise<void> {
    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`${message}: ${response.status} ${responseBody}`);
    }
  }

  /**
   * @section public:methods
   */

  public async listMarkets(pair: AssetWindow): Promise<MarketSummary[]> {
    const url = new URL("/markets", this.baseUrl);
    const response = await this.fetchFn(this.buildMarketsUrl(url, pair));
    await this.assertSuccessfulResponse(response, "collector markets request failed");
    const payload = (await response.json()) as { markets: MarketSummary[] };
    const markets = payload.markets.slice().sort((left, right) => left.marketStart.localeCompare(right.marketStart));
    return markets;
  }

  public async loadMarketSnapshots(slug: string): Promise<MarketSnapshotsPayload> {
    const response = await this.fetchFn(new URL(`/markets/${slug}/snapshots`, this.baseUrl));
    await this.assertSuccessfulResponse(response, `collector snapshot request failed for slug ${slug}`);
    const payload = (await response.json()) as MarketSnapshotsPayload;
    return payload;
  }

  public async loadState(): Promise<CollectorStatePayload> {
    const response = await this.fetchFn(new URL("/state", this.baseUrl));
    await this.assertSuccessfulResponse(response, "collector state request failed");
    const payload = (await response.json()) as CollectorStatePayload;
    return payload;
  }
}
