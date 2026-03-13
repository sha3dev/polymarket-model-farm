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
import config from "../config.ts";
import type { DashboardService } from "../dashboard/index.ts";
import LOGGER from "../logger.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import type { LivePredictionService } from "../prediction/index.ts";

/**
 * @section types
 */

type HttpServerServiceOptions = {
  appInfoService: AppInfoService;
  dashboardService: DashboardService;
  livePredictionService: LivePredictionService;
};

/**
 * @section public:properties
 */

export class HttpServerService {
  private readonly appInfoService: AppInfoService;

  private readonly dashboardService: DashboardService;

  private readonly livePredictionService: LivePredictionService;

  /**
   * @section constructor
   */

  public constructor(options: HttpServerServiceOptions) {
    this.appInfoService = options.appInfoService;
    this.dashboardService = options.dashboardService;
    this.livePredictionService = options.livePredictionService;
  }

  /**
   * @section private:methods
   */

  private buildPredictionHandler(): (context: Context) => Promise<Response> {
    return async (context) => {
      let response: Response;
      try {
        const assetParam = context.req.query("asset");
        const windowParam = context.req.query("window");
        const filter: { asset?: (typeof SUPPORTED_ASSETS)[number]; window?: (typeof SUPPORTED_WINDOWS)[number] } = {};
        if (assetParam) {
          if (!SUPPORTED_ASSETS.includes(assetParam as (typeof SUPPORTED_ASSETS)[number])) {
            throw new Error(`unsupported asset ${assetParam}`);
          }
          filter.asset = assetParam as (typeof SUPPORTED_ASSETS)[number];
        }
        if (windowParam) {
          if (!SUPPORTED_WINDOWS.includes(windowParam as (typeof SUPPORTED_WINDOWS)[number])) {
            throw new Error(`unsupported window ${windowParam}`);
          }
          filter.window = windowParam as (typeof SUPPORTED_WINDOWS)[number];
        }
        context.header("content-type", config.RESPONSE_CONTENT_TYPE);
        response = context.json({ predictions: await this.livePredictionService.listCurrentPredictions(filter) }, 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LOGGER.error(`prediction request failed: ${message}`);
        response = context.json({ error: message }, 400);
      }
      return response;
    };
  }

  private buildDashboardPayloadHandler(): (context: Context) => Promise<Response> {
    return async (context) => {
      let response: Response;
      try {
        context.header("content-type", config.RESPONSE_CONTENT_TYPE);
        response = context.json(await this.dashboardService.buildPayload(), 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LOGGER.error(`dashboard payload request failed: ${message}`);
        response = context.json({ error: message }, 500);
      }
      return response;
    };
  }

  private buildDashboardPageHandler(): (context: Context) => Promise<Response> {
    return async (context) => {
      let response: Response;
      try {
        context.header("content-type", config.HTML_CONTENT_TYPE);
        response = context.body(await this.dashboardService.buildHtmlDocument(), 200);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        LOGGER.error(`dashboard page request failed: ${message}`);
        response = context.json({ error: message }, 500);
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
    app.get("/api/dashboard", this.buildDashboardPayloadHandler());
    app.get("/dashboard", this.buildDashboardPageHandler());
    return createAdaptorServer({ fetch: app.fetch });
  }
}
