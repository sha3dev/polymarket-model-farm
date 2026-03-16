/**
 * @section imports:externals
 */

import * as tf from "@tensorflow/tfjs-node";

/**
 * @section imports:internals
 */

import type { AssetWindow } from "../collector/index.ts";
import config from "../config.ts";
import type { ModelMetadata } from "./index.ts";

export class ModelDefinitionService {
  /**
   * @section factory
   */

  public static createDefault(): ModelDefinitionService {
    return new ModelDefinitionService();
  }

  /**
   * @section private:methods
   */

  private buildCompileOptions(): Parameters<tf.LayersModel["compile"]>[0] {
    return { optimizer: tf.train.adam(config.MODEL_LEARNING_RATE), loss: tf.losses.huberLoss, metrics: ["mae"] };
  }

  private readPrimaryGruUnits(pair: AssetWindow): number {
    const primaryGruUnits = pair.window === "5m" ? config.MODEL_GRU_UNITS_5M_PRIMARY : config.MODEL_GRU_UNITS_15M_PRIMARY;
    return primaryGruUnits;
  }

  private readSecondaryGruUnits(pair: AssetWindow): number {
    const secondaryGruUnits = pair.window === "5m" ? config.MODEL_GRU_UNITS_5M_SECONDARY : config.MODEL_GRU_UNITS_15M_SECONDARY;
    return secondaryGruUnits;
  }

  private readMaxSequenceLength(pair: AssetWindow): number {
    const maxSequenceLength = pair.window === "5m" ? 60 : 90;
    return maxSequenceLength;
  }

  private readResampleSeconds(pair: AssetWindow): number {
    const resampleSeconds = pair.window === "5m" ? config.FEATURE_RESAMPLE_SECONDS_5M : config.FEATURE_RESAMPLE_SECONDS_15M;
    return resampleSeconds;
  }

  /**
   * @section public:methods
   */

  public compileModel(model: tf.LayersModel): void {
    model.compile(this.buildCompileOptions());
  }

  public createModel(pair: AssetWindow, featureCount: number): tf.LayersModel {
    const primaryGruUnits = this.readPrimaryGruUnits(pair);
    const secondaryGruUnits = this.readSecondaryGruUnits(pair);
    const regularizer = tf.regularizers.l2({ l2: config.MODEL_L2_REGULARIZATION });
    const model = tf.sequential();
    model.add(tf.layers.masking({ maskValue: 0, inputShape: [null, featureCount] }));
    model.add(tf.layers.gru({ units: primaryGruUnits, returnSequences: true, dropout: config.MODEL_DROPOUT_RATE, kernelRegularizer: regularizer, recurrentRegularizer: regularizer }));
    model.add(
      tf.layers.gru({ units: secondaryGruUnits, dropout: config.MODEL_DROPOUT_RATE, kernelRegularizer: regularizer, recurrentRegularizer: regularizer }),
    );
    model.add(tf.layers.dense({ units: 16, activation: "relu", kernelRegularizer: regularizer }));
    model.add(tf.layers.dense({ units: 1, activation: "linear" }));
    this.compileModel(model);
    return model;
  }

  public buildMetadata(pair: AssetWindow, featureCount: number, checkpointedAt: string): ModelMetadata {
    const metadata = {
      modelVersion: `${pair.asset}-${pair.window}-${checkpointedAt}`,
      featureSchemaVersion: "v2-exchange-light-book",
      targetKind: "log-return",
      featureCount,
      maxSequenceLength: this.readMaxSequenceLength(pair),
      gruUnitsPrimary: this.readPrimaryGruUnits(pair),
      gruUnitsSecondary: this.readSecondaryGruUnits(pair),
      dropoutRate: config.MODEL_DROPOUT_RATE,
      learningRate: config.MODEL_LEARNING_RATE,
      l2Regularization: config.MODEL_L2_REGULARIZATION,
      resampleSeconds: this.readResampleSeconds(pair),
      checkpointedAt,
    };
    return metadata;
  }
}
