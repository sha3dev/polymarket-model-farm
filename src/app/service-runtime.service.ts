/**
 * @section imports:externals
 */

import type { ServerType } from "@hono/node-server";
import { MarketCatalogService } from "@sha3/polymarket";

/**
 * @section imports:internals
 */

import { AppInfoService } from "../app-info/app-info.service.ts";
import { CollectorClientService } from "../collector/index.ts";
import config from "../config.ts";
import { MarketFeatureProjectorService } from "../feature/index.ts";
import { HttpServerService } from "../http/http-server.service.ts";
import LOGGER from "../logger.ts";
import { ModelRegistryService } from "../model/index.ts";
import { PredictionQueryService, PredictionService } from "../prediction/index.ts";
import { TrainingOrchestratorService } from "../training/index.ts";

/**
 * @section types
 */

type ServiceRuntimeOptions = {
  httpServerService: HttpServerService;
  modelRegistryService: ModelRegistryService;
  trainingOrchestratorService: TrainingOrchestratorService;
};

export class ServiceRuntime {
  /**
   * @section private:properties
   */

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
    const collectorClientService = CollectorClientService.createDefault();
    const marketCatalogService = MarketCatalogService.createDefault();
    const marketFeatureProjectorService = MarketFeatureProjectorService.createDefault();
    const modelRegistryService = ModelRegistryService.createDefault(marketFeatureProjectorService.getFeatureLabels().length);
    const predictionService = PredictionService.createDefault(modelRegistryService, marketFeatureProjectorService);
    const predictionQueryService = new PredictionQueryService({ collectorClientService, marketCatalogService, modelRegistryService, predictionService, now: () => Date.now() });
    const httpServerService = new HttpServerService({ appInfoService: AppInfoService.createDefault(), predictionQueryService });
    const trainingOrchestratorService = TrainingOrchestratorService.createDefault(collectorClientService, modelRegistryService, marketFeatureProjectorService);
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
    const server = this.buildServer();
    await this.modelRegistryService.initialize();
    this.trainingOrchestratorService.start();
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
