/**
 * @section imports:externals
 */

import type { ServerType } from "@hono/node-server";

/**
 * @section imports:internals
 */

import { AppInfoService } from "../app-info/app-info.service.ts";
import { CollectorClientService } from "../collector-client/index.ts";
import config from "../config.ts";
import { HttpServerService } from "../http/http-server.service.ts";
import LOGGER from "../logger.ts";
import { ModelRegistryService } from "../model/index.ts";
import { PredictionService } from "../prediction/index.ts";
import { SnapshotFeatureProjectorService } from "../snapshot-feature/index.ts";
import { TrainerStatusService } from "../trainer-state/index.ts";
import { TrainingOrchestratorService } from "../training/index.ts";

/**
 * @section types
 */

type ServiceRuntimeOptions = {
  httpServerService: HttpServerService;
  modelRegistryService: ModelRegistryService;
  trainingOrchestratorService: TrainingOrchestratorService;
};

/**
 * @section public:properties
 */

export class ServiceRuntime {
  private readonly httpServerService: HttpServerService;

  private readonly modelRegistryService: ModelRegistryService;

  private readonly trainingOrchestratorService: TrainingOrchestratorService;

  private server: ServerType | null;

  /**
   * @section constructor
   */

  public constructor(options: ServiceRuntimeOptions) {
    this.httpServerService = options.httpServerService;
    this.modelRegistryService = options.modelRegistryService;
    this.trainingOrchestratorService = options.trainingOrchestratorService;
    this.server = null;
  }

  /**
   * @section factory
   */

  public static createDefault(): ServiceRuntime {
    const snapshotFeatureProjectorService = SnapshotFeatureProjectorService.createDefault();
    const modelRegistryService = ModelRegistryService.createDefault(snapshotFeatureProjectorService.getFeatureLabels().length);
    const predictionService = PredictionService.createDefault(modelRegistryService, snapshotFeatureProjectorService);
    const collectorClientService = CollectorClientService.createDefault();
    const trainerStatusService = new TrainerStatusService({ collectorClientService, modelRegistryService, now: () => new Date().toISOString() });
    const httpServerService = new HttpServerService({ appInfoService: AppInfoService.createDefault(), predictionService, trainerStatusService });
    const trainingOrchestratorService = new TrainingOrchestratorService({ collectorClientService, modelRegistryService, snapshotFeatureProjectorService, now: () => Date.now() });
    return new ServiceRuntime({ httpServerService, modelRegistryService, trainingOrchestratorService });
  }

  /**
   * @section public:methods
   */

  public buildServer(): ServerType {
    const server = this.httpServerService.buildServer();
    return server;
  }

  public async startServer(): Promise<ServerType> {
    await this.modelRegistryService.initialize();
    this.trainingOrchestratorService.start();
    const server = this.buildServer();
    await new Promise<void>((resolve) => {
      server.listen(config.DEFAULT_PORT, config.HTTP_HOST, () => {
        LOGGER.info(`service listening on http://${config.HTTP_HOST}:${config.DEFAULT_PORT}`);
        resolve();
      });
    });
    this.server = server;
    return server;
  }

  public async stop(): Promise<void> {
    this.trainingOrchestratorService.stop();
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      this.server = null;
    }
  }
}
