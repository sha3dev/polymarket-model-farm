/**
 * @section imports:internals
 */

import config from "../config.ts";
import type { AssetWindow, CacheEntry, CollectorStatePayload, MarketSnapshotsPayload, MarketSummary } from "./index.ts";

/**
 * @section types
 */

type CollectorClientServiceOptions = {
  baseUrl: string;
  fetchFn: typeof fetch;
  now: () => number;
};

/**
 * @section public:properties
 */

export class CollectorClientService {
  private readonly baseUrl: string;

  private readonly fetchFn: typeof fetch;

  private readonly now: () => number;

  private readonly stateCache: Map<string, CacheEntry<CollectorStatePayload>>;

  private readonly marketCache: Map<string, CacheEntry<MarketSummary[]>>;

  private readonly snapshotCache: Map<string, CacheEntry<MarketSnapshotsPayload>>;

  /**
   * @section constructor
   */

  public constructor(options: CollectorClientServiceOptions) {
    this.baseUrl = options.baseUrl;
    this.fetchFn = options.fetchFn;
    this.now = options.now;
    this.stateCache = new Map();
    this.marketCache = new Map();
    this.snapshotCache = new Map();
  }

  /**
   * @section factory
   */

  public static createDefault(): CollectorClientService {
    return new CollectorClientService({ baseUrl: config.COLLECTOR_BASE_URL, fetchFn: fetch, now: () => Date.now() });
  }

  /**
   * @section private:methods
   */

  private readCacheEntry<TValue>(cache: Map<string, CacheEntry<TValue>>, key: string): TValue | null {
    const cacheEntry = cache.get(key) || null;
    let cachedValue: TValue | null = null;
    if (cacheEntry && cacheEntry.expiresAt > this.now()) {
      cachedValue = cacheEntry.value;
    }
    return cachedValue;
  }

  private writeCacheEntry<TValue>(cache: Map<string, CacheEntry<TValue>>, key: string, value: TValue, ttlMs: number): TValue {
    cache.set(key, { value, expiresAt: this.now() + ttlMs });
    return value;
  }

  private async assertSuccessfulResponse(response: Response, message: string): Promise<void> {
    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`${message}: ${response.status} ${responseBody}`);
    }
  }

  private buildPairKey(pair: AssetWindow): string {
    const pairKey = `${pair.asset}-${pair.window}`;
    return pairKey;
  }

  /**
   * @section public:methods
   */

  public async listMarkets(pair: AssetWindow): Promise<MarketSummary[]> {
    const cacheKey = this.buildPairKey(pair);
    const cachedMarkets = this.readCacheEntry(this.marketCache, cacheKey);
    let markets = cachedMarkets || [];
    if (!cachedMarkets) {
      const url = new URL("/markets", this.baseUrl);
      url.searchParams.set("asset", pair.asset);
      url.searchParams.set("window", pair.window);
      const response = await this.fetchFn(url);
      await this.assertSuccessfulResponse(response, "collector markets request failed");
      const payload = (await response.json()) as { markets: MarketSummary[] };
      markets = payload.markets.slice().sort((left, right) => left.marketStart.localeCompare(right.marketStart));
      this.writeCacheEntry(this.marketCache, cacheKey, markets, config.COLLECTOR_MARKET_CACHE_TTL_MS);
    }
    return markets.slice();
  }

  public async loadMarketSnapshots(slug: string): Promise<MarketSnapshotsPayload> {
    const cachedPayload = this.readCacheEntry(this.snapshotCache, slug);
    let payload = cachedPayload;
    if (!cachedPayload) {
      const response = await this.fetchFn(new URL(`/markets/${slug}/snapshots`, this.baseUrl));
      await this.assertSuccessfulResponse(response, `collector snapshot request failed for slug ${slug}`);
      payload = (await response.json()) as MarketSnapshotsPayload;
      this.writeCacheEntry(this.snapshotCache, slug, payload, config.COLLECTOR_SNAPSHOT_CACHE_TTL_MS);
    }
    if (!payload) {
      throw new Error(`collector snapshot payload is unavailable for slug ${slug}`);
    }
    return { ...payload, snapshots: payload.snapshots.slice() };
  }

  public async loadState(): Promise<CollectorStatePayload> {
    const cachedState = this.readCacheEntry(this.stateCache, "state");
    let payload = cachedState;
    if (!cachedState) {
      const response = await this.fetchFn(new URL("/state", this.baseUrl));
      await this.assertSuccessfulResponse(response, "collector state request failed");
      payload = (await response.json()) as CollectorStatePayload;
      this.writeCacheEntry(this.stateCache, "state", payload, config.COLLECTOR_STATE_CACHE_TTL_MS);
    }
    if (!payload) {
      throw new Error("collector state payload is unavailable");
    }
    return { ...payload, markets: payload.markets.slice() };
  }
}
