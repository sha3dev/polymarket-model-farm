/**
 * @section imports:externals
 */

import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as tf from "@tensorflow/tfjs-node";

/**
 * @section imports:internals
 */

import config from "../config.ts";
import type { AssetWindow, ModelMetadata, TrainingLedger } from "./index.ts";

/**
 * @section types
 */

type ModelStoreServiceOptions = { storageDirectoryPath: string };
type ModelArtifactPaths = { pairDirectoryPath: string; modelDirectoryPath: string; modelJsonPath: string; ledgerPath: string; metadataPath: string };

/**
 * @section public:properties
 */

export class ModelStoreService {
  private readonly storageDirectoryPath: string;

  /**
   * @section constructor
   */

  public constructor(options: ModelStoreServiceOptions) {
    this.storageDirectoryPath = options.storageDirectoryPath;
  }

  /**
   * @section factory
   */

  public static createDefault(): ModelStoreService {
    return new ModelStoreService({ storageDirectoryPath: config.MODEL_STORAGE_DIR });
  }

  /**
   * @section private:methods
   */

  private async readJsonFile<TValue>(filePath: string): Promise<TValue | null> {
    let parsedValue: TValue | null = null;
    const hasFile = this.pathExists(filePath);
    if (hasFile) {
      const fileContent = await fs.readFile(filePath, "utf8");
      parsedValue = JSON.parse(fileContent) as TValue;
    }
    return parsedValue;
  }

  private async writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
    const temporaryPath = `${filePath}.tmp`;
    const payload = JSON.stringify(value, null, 2);
    await fs.writeFile(temporaryPath, payload, "utf8");
    await fs.rename(temporaryPath, filePath);
  }

  private pathExists(filePath: string): boolean {
    return existsSync(filePath);
  }

  private resolvePaths(pair: AssetWindow): ModelArtifactPaths {
    const pairDirectoryPath = path.resolve(this.storageDirectoryPath, `${pair.asset}-${pair.window}`);
    const modelDirectoryPath = path.resolve(pairDirectoryPath, "model");
    return {
      pairDirectoryPath,
      modelDirectoryPath,
      modelJsonPath: path.resolve(modelDirectoryPath, "model.json"),
      ledgerPath: path.resolve(pairDirectoryPath, "ledger.json"),
      metadataPath: path.resolve(pairDirectoryPath, "metadata.json"),
    };
  }

  /**
   * @section public:methods
   */

  public async ensureStorageDirectory(): Promise<void> {
    await fs.mkdir(this.storageDirectoryPath, { recursive: true });
  }

  public describePaths(pair: AssetWindow): ModelArtifactPaths {
    return this.resolvePaths(pair);
  }

  public async loadMetadata(pair: AssetWindow): Promise<ModelMetadata | null> {
    const metadata = await this.readJsonFile<ModelMetadata>(this.resolvePaths(pair).metadataPath);
    return metadata;
  }

  public async loadLedger(pair: AssetWindow): Promise<TrainingLedger | null> {
    const ledger = await this.readJsonFile<TrainingLedger>(this.resolvePaths(pair).ledgerPath);
    return ledger;
  }

  public async loadModel(pair: AssetWindow): Promise<tf.LayersModel | null> {
    const paths = this.resolvePaths(pair);
    const hasModel = this.pathExists(paths.modelJsonPath);
    let model: tf.LayersModel | null = null;
    if (hasModel) {
      model = await tf.loadLayersModel(pathToFileURL(paths.modelJsonPath).href);
    }
    return model;
  }

  public async saveModelArtifacts(pair: AssetWindow, model: tf.LayersModel, metadata: ModelMetadata): Promise<void> {
    const paths = this.resolvePaths(pair);
    await fs.mkdir(paths.pairDirectoryPath, { recursive: true });
    await fs.mkdir(paths.modelDirectoryPath, { recursive: true });
    await model.save(`file://${paths.modelDirectoryPath}`);
    await this.writeJsonAtomically(paths.metadataPath, metadata);
  }

  public async saveLedger(pair: AssetWindow, ledger: TrainingLedger): Promise<void> {
    const paths = this.resolvePaths(pair);
    await fs.mkdir(paths.pairDirectoryPath, { recursive: true });
    await this.writeJsonAtomically(paths.ledgerPath, ledger);
  }
}
