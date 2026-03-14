import type { ServerType } from "@hono/node-server";

/**
 * @section imports:internals
 */

import { AppInfoService } from "../app-info/app-info.service.ts";
import { CollectorClientService } from "../collector/index.ts";
import config from "../config.ts";
import { DashboardPageService, DashboardService } from "../dashboard/index.ts";
import { MarketFeatureProjectorService } from "../feature/index.ts";
import { PredictionHistoryService } from "../history/index.ts";
import { HttpServerService } from "../http/http-server.service.ts";
import LOGGER from "../logger.ts";
import { ModelRegistryService } from "../model/index.ts";
import { LivePredictionService, PredictionService } from "../prediction/index.ts";
import { TrainingOrchestratorService } from "../training/index.ts";

/**
 * @section types
 */

type ServiceRuntimeOptions = {
  httpServerService: HttpServerService;
  modelRegistryService: ModelRegistryService;
  predictionHistoryService: PredictionHistoryService;
  trainingOrchestratorService: TrainingOrchestratorService;
  livePredictionService: LivePredictionService;
};

/**
 * @section public:properties
 */

export class ServiceRuntime {
  private readonly httpServerService: HttpServerService;

  private readonly modelRegistryService: ModelRegistryService;

  private readonly predictionHistoryService: PredictionHistoryService;

  private readonly trainingOrchestratorService: TrainingOrchestratorService;

  private readonly livePredictionService: LivePredictionService;

  private server: ServerType | null;

  /**
   * @section constructor
   */

  public constructor(options: ServiceRuntimeOptions) {
    this.httpServerService = options.httpServerService;
    this.modelRegistryService = options.modelRegistryService;
    this.predictionHistoryService = options.predictionHistoryService;
    this.trainingOrchestratorService = options.trainingOrchestratorService;
    this.livePredictionService = options.livePredictionService;
    this.server = null;
  }

  /**
   * @section factory
   */

  public static createDefault(): ServiceRuntime {
    const collectorClientService = CollectorClientService.createDefault();
    const marketFeatureProjectorService = MarketFeatureProjectorService.createDefault();
    const modelRegistryService = ModelRegistryService.createDefault(marketFeatureProjectorService.getFeatureLabels().length);
    const predictionHistoryService = PredictionHistoryService.createDefault((pair) => modelRegistryService.getPredictionContext(pair).recentReferenceDelta);
    const predictionService = PredictionService.createDefault(modelRegistryService, marketFeatureProjectorService);
    const livePredictionService = LivePredictionService.createDefault(collectorClientService, predictionService, predictionHistoryService, () =>
      new Date().toISOString(),
    );
    const dashboardService = new DashboardService({
      collectorClientService,
      modelRegistryService,
      predictionHistoryService,
      livePredictionService,
      dashboardPageService: new DashboardPageService(),
      now: () => new Date().toISOString(),
    });
    const httpServerService = new HttpServerService({ appInfoService: AppInfoService.createDefault(), dashboardService, livePredictionService });
    const trainingOrchestratorService = TrainingOrchestratorService.createDefault(
      collectorClientService,
      modelRegistryService,
      marketFeatureProjectorService,
      predictionHistoryService,
    );
    return new ServiceRuntime({ httpServerService, modelRegistryService, predictionHistoryService, trainingOrchestratorService, livePredictionService });
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
    await this.predictionHistoryService.initialize();
    this.trainingOrchestratorService.start();
    this.livePredictionService.start();
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
    this.livePredictionService.stop();
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
