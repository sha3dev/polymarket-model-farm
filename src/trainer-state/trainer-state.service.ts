/**
 * @section imports:internals
 */

import { CollectorClientService } from "../collector-client/index.ts";
import config from "../config.ts";
import LOGGER from "../logger.ts";
import type { ModelRegistryService } from "../model/index.ts";
import type { TrainerStatusPayload } from "./index.ts";

/**
 * @section types
 */

type TrainerStatusServiceOptions = {
  collectorClientService: CollectorClientService;
  modelRegistryService: ModelRegistryService;
  now: () => string;
};

/**
 * @section public:properties
 */

export class TrainerStatusService {
  private readonly collectorClientService: CollectorClientService;

  private readonly modelRegistryService: ModelRegistryService;

  private readonly now: () => string;

  /**
   * @section constructor
   */

  public constructor(options: TrainerStatusServiceOptions) {
    this.collectorClientService = options.collectorClientService;
    this.modelRegistryService = options.modelRegistryService;
    this.now = options.now;
  }

  /**
   * @section factory
   */

  public static createDefault(modelRegistryService: ModelRegistryService): TrainerStatusService {
    return new TrainerStatusService({ collectorClientService: CollectorClientService.createDefault(), modelRegistryService, now: () => new Date().toISOString() });
  }

  /**
   * @section public:methods
   */

  public async buildPayload(): Promise<TrainerStatusPayload> {
    const slotStatuses = this.modelRegistryService.getStatuses();
    const models = [];
    for (const slotStatus of slotStatuses) {
      let pendingClosedMarketCount = 0;
      let lastSeenClosedMarketEnd: string | null = null;
      try {
        const marketSummaries = await this.collectorClientService.listMarkets({ asset: slotStatus.asset, window: slotStatus.window });
        const eligibleMarkets = marketSummaries.filter((marketSummary) => {
          const marketEndTs = Date.parse(marketSummary.marketEnd);
          const hasClosed = marketEndTs <= Date.now() - config.TRAINING_CLOSE_GRACE_MS;
          const hasPriceToBeat = marketSummary.priceToBeat !== null;
          return hasClosed && hasPriceToBeat;
        });
        pendingClosedMarketCount = eligibleMarkets.filter((marketSummary) => !this.modelRegistryService.hasTrainedMarket({ asset: slotStatus.asset, window: slotStatus.window }, marketSummary.slug)).length;
        lastSeenClosedMarketEnd = eligibleMarkets.length === 0 ? null : eligibleMarkets[eligibleMarkets.length - 1]?.marketEnd || null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pendingClosedMarketCount = -1;
        lastSeenClosedMarketEnd = null;
        this.modelRegistryService.setLatestTrainingError({ asset: slotStatus.asset, window: slotStatus.window }, message);
        LOGGER.error(`trainer-state build failed for ${slotStatus.asset}/${slotStatus.window}: ${message}`);
      }
      models.push({ ...slotStatus, pendingClosedMarketCount, lastSeenClosedMarketEnd });
    }
    const payload = { generatedAt: this.now(), models };
    return payload;
  }
}
