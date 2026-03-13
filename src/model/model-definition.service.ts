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

/**
 * @section public:properties
 */

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

  /**
   * @section public:methods
   */

  public compileModel(model: tf.LayersModel): void {
    model.compile(this.buildCompileOptions());
  }

  public createModel(pair: AssetWindow, featureCount: number): tf.LayersModel {
    const gruUnits = pair.window === "5m" ? config.MODEL_GRU_UNITS_5M : config.MODEL_GRU_UNITS_15M;
    const regularizer = tf.regularizers.l2({ l2: config.MODEL_L2_REGULARIZATION });
    const model = tf.sequential();
    model.add(tf.layers.masking({ maskValue: 0, inputShape: [null, featureCount] }));
    model.add(tf.layers.gru({ units: gruUnits, returnSequences: true, dropout: config.MODEL_DROPOUT_RATE, kernelRegularizer: regularizer, recurrentRegularizer: regularizer }));
    model.add(tf.layers.gru({ units: gruUnits, dropout: config.MODEL_DROPOUT_RATE, kernelRegularizer: regularizer, recurrentRegularizer: regularizer }));
    model.add(tf.layers.dense({ units: 32, activation: "relu", kernelRegularizer: regularizer }));
    model.add(tf.layers.dense({ units: 1, activation: "tanh" }));
    this.compileModel(model);
    return model;
  }

  public buildMetadata(pair: AssetWindow, featureCount: number, checkpointedAt: string): ModelMetadata {
    const metadata = {
      modelVersion: `${pair.asset}-${pair.window}-${checkpointedAt}`,
      featureCount,
      maxSequenceLength: pair.window === "5m" ? 600 : 1800,
      gruUnits: pair.window === "5m" ? config.MODEL_GRU_UNITS_5M : config.MODEL_GRU_UNITS_15M,
      dropoutRate: config.MODEL_DROPOUT_RATE,
      learningRate: config.MODEL_LEARNING_RATE,
      l2Regularization: config.MODEL_L2_REGULARIZATION,
      checkpointedAt,
    };
    return metadata;
  }
}
