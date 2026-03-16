/**
 * @section imports:externals
 */

import { createAdaptorServer } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";

/**
 * @section imports:internals
 */

import type { AppInfoService } from "../app-info/app-info.service.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import config from "../config.ts";
import LOGGER from "../logger.ts";
import type { PredictionFilter, PredictionQueryService } from "../prediction/index.ts";

/**
 * @section types
 */

type HttpServerServiceOptions = {
  appInfoService: AppInfoService;
  predictionQueryService: PredictionQueryService;
};

export class HttpServerService {
  /**
   * @section private:properties
   */

  private readonly appInfoService: AppInfoService;

  private readonly predictionQueryService: PredictionQueryService;

  /**
   * @section constructor
   */

  public constructor(options: HttpServerServiceOptions) {
    this.appInfoService = options.appInfoService;
    this.predictionQueryService = options.predictionQueryService;
  }

  /**
   * @section private:methods
   */

  private readOptionalAsset(rawAsset: string | undefined): PredictionFilter["asset"] {
    const asset = rawAsset || null;
    if (asset && !SUPPORTED_ASSETS.includes(asset as (typeof SUPPORTED_ASSETS)[number])) {
      throw new Error(`asset must be one of: ${SUPPORTED_ASSETS.join(", ")}`);
    }
    return asset as PredictionFilter["asset"];
  }

  private readOptionalWindow(rawWindow: string | undefined): PredictionFilter["window"] {
    const window = rawWindow || null;
    if (window && !SUPPORTED_WINDOWS.includes(window as (typeof SUPPORTED_WINDOWS)[number])) {
      throw new Error(`window must be one of: ${SUPPORTED_WINDOWS.join(", ")}`);
    }
    return window as PredictionFilter["window"];
  }

  private readPredictionFilter(searchParams: URLSearchParams): PredictionFilter {
    const asset = this.readOptionalAsset(searchParams.get("asset") || undefined);
    const window = this.readOptionalWindow(searchParams.get("window") || undefined);
    const predictionFilter = { asset, window };
    return predictionFilter;
  }

  private buildPredictionHandler(): (context: Context) => Promise<Response> {
    return async (context) => {
      let response: Response;
      try {
        const predictionFilter = this.readPredictionFilter(new URL(context.req.url).searchParams);
        context.header("content-type", config.RESPONSE_CONTENT_TYPE);
        response = context.json(await this.predictionQueryService.buildResponse(predictionFilter), 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LOGGER.error(`prediction request failed: ${message}`);
        response = context.json({ error: message }, 400);
      }
      return response;
    };
  }

  /**
   * @section public:methods
   */

  public buildServer(): ServerType {
    const app = new Hono();
    app.get("/", (context) => {
      context.header("content-type", config.RESPONSE_CONTENT_TYPE);
      return context.json(this.appInfoService.buildPayload(), 200);
    });
    app.get("/predictions", this.buildPredictionHandler());
    return createAdaptorServer({ fetch: app.fetch });
  }
}
