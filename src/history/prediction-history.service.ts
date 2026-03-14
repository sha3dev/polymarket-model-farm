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

type PredictionHistoryServiceOptions = {
  storageDirectoryPath: string;
  referenceDeltaReader: (pair: AssetWindow) => number;
};

/**
 * @section public:properties
 */

export class PredictionHistoryService {
  private static readonly MIN_CONFIDENCE_REFERENCE_DELTA = 0.0001;

  private readonly storageDirectoryPath: string;

  private readonly referenceDeltaReader: (pair: AssetWindow) => number;

  private readonly cache: Map<string, PredictionHistory>;

  /**
   * @section constructor
   */

  public constructor(options: PredictionHistoryServiceOptions) {
    this.storageDirectoryPath = options.storageDirectoryPath;
    this.referenceDeltaReader = options.referenceDeltaReader;
    this.cache = new Map();
  }

  /**
   * @section factory
   */

  public static createDefault(referenceDeltaReader?: (pair: AssetWindow) => number): PredictionHistoryService {
    return new PredictionHistoryService({ storageDirectoryPath: config.HISTORY_STORAGE_DIR, referenceDeltaReader: referenceDeltaReader || (() => 0) });
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

  private readRecalculatedConfidence(pair: AssetWindow, predictedDelta: number): number {
    const referenceDelta = this.referenceDeltaReader(pair);
    const confidenceReferenceDelta =
      Number.isFinite(referenceDelta) && referenceDelta > 0
        ? Math.max(referenceDelta, PredictionHistoryService.MIN_CONFIDENCE_REFERENCE_DELTA)
        : PredictionHistoryService.MIN_CONFIDENCE_REFERENCE_DELTA;
    const confidenceLogit = predictedDelta / (confidenceReferenceDelta * config.CONFIDENCE_DELTA_FACTOR);
    const upProbability = 1 / (1 + Math.exp(-confidenceLogit));
    const recalculatedConfidence = predictedDelta >= 0 ? upProbability : 1 - upProbability;
    return recalculatedConfidence;
  }

  private async refreshStoredHistoryConfidence(fileName: string): Promise<void> {
    const filePath = path.resolve(this.storageDirectoryPath, fileName);
    const history = JSON.parse(await fs.readFile(filePath, "utf8")) as PredictionHistory;
    const nextEntries = history.entries.map((entry) => {
      const normalizedEntry = this.normalizeEntry(entry);
      const recalculatedConfidence = this.readRecalculatedConfidence(
        { asset: normalizedEntry.asset, window: normalizedEntry.window },
        normalizedEntry.predictedDelta,
      );
      return { ...normalizedEntry, confidence: recalculatedConfidence };
    });
    const nextHistory = { entries: nextEntries };
    this.cache.set(fileName.replace(/\.json$/, ""), nextHistory);
    await fs.writeFile(filePath, JSON.stringify(nextHistory, null, 2), "utf8");
  }

  private async refreshStoredConfidenceValues(): Promise<void> {
    const fileNames = await fs.readdir(this.storageDirectoryPath);
    for (const fileName of fileNames) {
      if (fileName.endsWith(".json")) {
        await this.refreshStoredHistoryConfidence(fileName);
      }
    }
  }

  /**
   * @section public:methods
   */

  public async initialize(): Promise<void> {
    await fs.mkdir(this.storageDirectoryPath, { recursive: true });
    if (config.SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP) {
      await this.refreshStoredConfidenceValues();
    }
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
