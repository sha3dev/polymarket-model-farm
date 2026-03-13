/**
 * @section imports:externals
 */

import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * @section imports:internals
 */

import type { AssetWindow } from "../collector/index.ts";
import config from "../config.ts";
import type { PredictionHistory, PredictionHistoryEntry } from "./index.ts";

/**
 * @section types
 */

type PredictionHistoryServiceOptions = { storageDirectoryPath: string };

/**
 * @section public:properties
 */

export class PredictionHistoryService {
  private readonly storageDirectoryPath: string;

  private readonly cache: Map<string, PredictionHistory>;

  /**
   * @section constructor
   */

  public constructor(options: PredictionHistoryServiceOptions) {
    this.storageDirectoryPath = options.storageDirectoryPath;
    this.cache = new Map();
  }

  /**
   * @section factory
   */

  public static createDefault(): PredictionHistoryService {
    return new PredictionHistoryService({ storageDirectoryPath: config.HISTORY_STORAGE_DIR });
  }

  /**
   * @section private:methods
   */

  private buildPairKey(pair: AssetWindow): string {
    const pairKey = `${pair.asset}-${pair.window}`;
    return pairKey;
  }

  private buildFilePath(pair: AssetWindow): string {
    const filePath = path.resolve(this.storageDirectoryPath, `${this.buildPairKey(pair)}.json`);
    return filePath;
  }

  private async writeHistory(pair: AssetWindow, history: PredictionHistory): Promise<void> {
    const filePath = this.buildFilePath(pair);
    await fs.mkdir(this.storageDirectoryPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(history, null, 2), "utf8");
    this.cache.set(this.buildPairKey(pair), history);
  }

  private normalizeEntry(entry: PredictionHistoryEntry): PredictionHistoryEntry {
    const normalizedEntry = { ...entry, upPrice: entry.upPrice ?? null, downPrice: entry.downPrice ?? null };
    return normalizedEntry;
  }

  /**
   * @section public:methods
   */

  public async initialize(): Promise<void> {
    await fs.mkdir(this.storageDirectoryPath, { recursive: true });
  }

  public async loadHistory(pair: AssetWindow): Promise<PredictionHistory> {
    const cacheKey = this.buildPairKey(pair);
    const cachedHistory = this.cache.get(cacheKey) || null;
    let history: PredictionHistory = { entries: [] };
    if (!cachedHistory) {
      const filePath = this.buildFilePath(pair);
      history = existsSync(filePath) ? (JSON.parse(await fs.readFile(filePath, "utf8")) as PredictionHistory) : { entries: [] };
      this.cache.set(cacheKey, history);
    } else {
      history = cachedHistory;
    }
    return { entries: history.entries.map((entry) => this.normalizeEntry(entry)) };
  }

  public async recordPrediction(pair: AssetWindow, entry: PredictionHistoryEntry): Promise<void> {
    const history = await this.loadHistory(pair);
    const entryIndex = history.entries.findIndex((historyEntry) => historyEntry.slug === entry.slug);
    const nextEntries = history.entries.slice();
    if (entryIndex === -1) {
      nextEntries.unshift(entry);
    } else {
      nextEntries[entryIndex] = entry;
    }
    await this.writeHistory(pair, { entries: nextEntries.slice(0, config.PREDICTION_HISTORY_LIMIT) });
  }

  public async resolvePrediction(pair: AssetWindow, slug: string, actualDelta: number): Promise<void> {
    const history = await this.loadHistory(pair);
    const nextEntries = history.entries.map((entry) => {
      let nextEntry = entry;
      if (entry.slug === slug) {
        const actualDirection = actualDelta >= 0 ? "UP" : "DOWN";
        nextEntry = { ...entry, actualDelta, actualDirection, isCorrect: actualDirection === entry.predictedDirection };
      }
      return nextEntry;
    });
    await this.writeHistory(pair, { entries: nextEntries });
  }

  public async getLatestPrediction(pair: AssetWindow, slug: string): Promise<PredictionHistoryEntry | null> {
    const history = await this.loadHistory(pair);
    const latestPrediction = history.entries.find((entry) => entry.slug === slug) || null;
    return latestPrediction;
  }
}
