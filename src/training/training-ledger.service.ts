/**
 * @section imports:internals
 */

import { ModelStoreService } from "../model/index.ts";
import type { AssetWindow, TrainingLedger } from "../model/index.ts";

/**
 * @section types
 */

type TrainingLedgerServiceOptions = { modelStoreService: ModelStoreService };

/**
 * @section public:properties
 */

export class TrainingLedgerService {
  private readonly modelStoreService: ModelStoreService;

  /**
   * @section constructor
   */

  public constructor(options: TrainingLedgerServiceOptions) {
    this.modelStoreService = options.modelStoreService;
  }

  /**
   * @section factory
   */

  public static createDefault(): TrainingLedgerService {
    return new TrainingLedgerService({ modelStoreService: ModelStoreService.createDefault() });
  }

  /**
   * @section public:methods
   */

  public async loadLedger(pair: AssetWindow): Promise<TrainingLedger | null> {
    const ledger = await this.modelStoreService.loadLedger(pair);
    return ledger;
  }

  public async saveLedger(pair: AssetWindow, ledger: TrainingLedger): Promise<void> {
    await this.modelStoreService.saveLedger(pair, ledger);
  }
}
