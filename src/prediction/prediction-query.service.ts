/**
 * @section imports:externals
 */

import type { CryptoSymbol, MarketCatalogService } from "@sha3/polymarket";

/**
 * @section imports:internals
 */

import type { AssetWindow, CollectorClientService, Snapshot } from "../collector/index.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import LOGGER from "../logger.ts";
import type { ModelRegistryService } from "../model/index.ts";
import type { PredictionFilter, PredictionItem, PredictionResponsePayload } from "./index.ts";
import type { PredictionService } from "./prediction.service.ts";

/**
 * @section types
 */

type PredictionQueryServiceOptions = {
  collectorClientService: CollectorClientService;
  marketCatalogService: MarketCatalogService;
  modelRegistryService: ModelRegistryService;
  predictionService: PredictionService;
  now: () => number;
};

export class PredictionQueryService {
  /**
   * @section private:properties
   */

  private readonly collectorClientService: CollectorClientService;

  private readonly marketCatalogService: MarketCatalogService;

  private readonly modelRegistryService: ModelRegistryService;

  private readonly predictionService: PredictionService;

  private readonly now: () => number;

  /**
   * @section constructor
   */

  public constructor(options: PredictionQueryServiceOptions) {
    this.collectorClientService = options.collectorClientService;
    this.marketCatalogService = options.marketCatalogService;
    this.modelRegistryService = options.modelRegistryService;
    this.predictionService = options.predictionService;
    this.now = options.now;
  }

  /**
   * @section private:methods
   */

  private buildSelectedPairs(filter: PredictionFilter): AssetWindow[] {
    const pairs: AssetWindow[] = [];
    for (const asset of SUPPORTED_ASSETS) {
      for (const window of SUPPORTED_WINDOWS) {
        const isSelectedAsset = !filter.asset || filter.asset === asset;
        const isSelectedWindow = !filter.window || filter.window === window;
        if (isSelectedAsset && isSelectedWindow) {
          pairs.push({ asset, window });
        }
      }
    }
    return pairs;
  }

  private readLiveSlug(pair: AssetWindow, now: Date): string {
    const liveSlugs = this.marketCatalogService.buildCryptoWindowSlugs({ date: now, window: pair.window, symbols: [pair.asset as CryptoSymbol] });
    const liveSlug = liveSlugs[0] || "";
    if (!liveSlug) {
      throw new Error(`failed to build current Polymarket slug for ${pair.asset}/${pair.window}`);
    }
    return liveSlug;
  }

  private readPriceToBeat(snapshots: Snapshot[]): number | null {
    let priceToBeat: number | null = null;
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      const snapshotPriceToBeat = snapshots[index]?.priceToBeat;
      const hasPriceToBeat = typeof snapshotPriceToBeat === "number" && Number.isFinite(snapshotPriceToBeat) && snapshotPriceToBeat > 0;
      if (hasPriceToBeat) {
        priceToBeat = snapshotPriceToBeat;
        break;
      }
    }
    return priceToBeat;
  }

  private async buildPredictionForPair(pair: AssetWindow, now: Date): Promise<PredictionItem | null> {
    const hasCheckpoint = this.modelRegistryService.getPredictionContext(pair).hasCheckpoint;
    let prediction: PredictionItem | null = null;
    if (hasCheckpoint) {
      const liveSlug = this.readLiveSlug(pair, now);
      try {
        const marketSnapshotsPayload = await this.collectorClientService.loadMarketSnapshots(liveSlug);
        const hasSnapshots = marketSnapshotsPayload.snapshots.length > 0;
        const priceToBeat = this.readPriceToBeat(marketSnapshotsPayload.snapshots);
        const hasPriceToBeat = priceToBeat !== null;
        if (hasSnapshots && hasPriceToBeat) {
          prediction = await this.predictionService.buildPrediction({
            asset: pair.asset,
            window: pair.window,
            slug: liveSlug,
            marketStart: marketSnapshotsPayload.marketStart,
            marketEnd: marketSnapshotsPayload.marketEnd,
            priceToBeat,
            snapshots: marketSnapshotsPayload.snapshots,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LOGGER.error(`prediction skipped for ${pair.asset}/${pair.window}: ${message}`);
      }
    }
    return prediction;
  }

  /**
   * @section public:methods
   */

  public async buildResponse(filter: PredictionFilter): Promise<PredictionResponsePayload> {
    const now = new Date(this.now());
    const predictions: PredictionResponsePayload["predictions"] = [];
    for (const pair of this.buildSelectedPairs(filter)) {
      const prediction = await this.buildPredictionForPair(pair, now);
      // The endpoint only returns predictions that can actually be built now.
      if (prediction) {
        predictions.push(prediction);
      }
    }
    return { predictions };
  }
}
