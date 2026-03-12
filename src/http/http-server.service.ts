/**
 * @section imports:externals
 */

import { createAdaptorServer } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { Hono } from "hono";
import type { Context } from "hono";

/**
 * @section imports:internals
 */

import type { AppInfoService } from "../app-info/app-info.service.ts";
import config from "../config.ts";
import LOGGER from "../logger.ts";
import type { PredictionService } from "../prediction/index.ts";
import type { TrainerStatusService } from "../trainer-state/index.ts";

/**
 * @section types
 */

type HttpServerServiceOptions = {
  appInfoService: AppInfoService;
  predictionService: PredictionService;
  trainerStatusService: TrainerStatusService;
};

/**
 * @section public:properties
 */

export class HttpServerService {
  private readonly appInfoService: AppInfoService;

  private readonly predictionService: PredictionService;

  private readonly trainerStatusService: TrainerStatusService;

  /**
   * @section constructor
   */

  public constructor(options: HttpServerServiceOptions) {
    this.appInfoService = options.appInfoService;
    this.predictionService = options.predictionService;
    this.trainerStatusService = options.trainerStatusService;
  }

  /**
   * @section private:methods
   */

  private buildRootResponse(context: Context): Response {
    const payload = this.appInfoService.buildPayload();
    context.header("content-type", config.RESPONSE_CONTENT_TYPE);
    return context.json(payload, 200);
  }

  private async buildTrainerStatusResponse(context: Context): Promise<Response> {
    let response: Response;
    try {
      const payload = await this.trainerStatusService.buildPayload();
      context.header("content-type", config.RESPONSE_CONTENT_TYPE);
      response = context.json(payload, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LOGGER.error(`trainer-status request failed: ${message}`);
      response = context.json({ error: message }, 500);
    }
    return response;
  }

  private async buildPredictionResponse(context: Context): Promise<Response> {
    let response: Response;
    try {
      const requestPayload = this.predictionService.validateRequestPayload(await context.req.json());
      const responsePayload = await this.predictionService.buildPredictionPayload(requestPayload);
      context.header("content-type", config.RESPONSE_CONTENT_TYPE);
      response = context.json(responsePayload, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes("checkpoint") ? 503 : 400;
      LOGGER.error(`prediction request failed: ${message}`);
      response = context.json({ error: message }, statusCode);
    }
    return response;
  }

  /**
   * @section public:methods
   */

  public buildServer(): ServerType {
    const app = new Hono();
    app.get("/", (context) => this.buildRootResponse(context));
    app.get("/trainer-status", async (context) => this.buildTrainerStatusResponse(context));
    app.post("/predictions", async (context) => this.buildPredictionResponse(context));
    return createAdaptorServer({ fetch: app.fetch });
  }
}
