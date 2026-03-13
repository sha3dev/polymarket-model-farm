import * as assert from "node:assert/strict";
import { test } from "node:test";

import { AppInfoService } from "../src/app-info/app-info.service.ts";
import { HttpServerService } from "../src/http/http-server.service.ts";

test("HttpServerService exposes predictions and dashboard routes", async () => {
  const httpServerService = new HttpServerService({
    appInfoService: new AppInfoService({ serviceName: "farm" }),
    dashboardService: { buildPayload: async () => ({ generatedAt: "2026-03-13T00:00:00.000Z", cards: [] }), buildHtmlDocument: async () => "<html><body>dashboard</body></html>" } as unknown as ConstructorParameters<
      typeof HttpServerService
    >[0]["dashboardService"],
    livePredictionService: {
      listCurrentPredictions: async () => [
        {
          slug: "btc-5m-test",
          asset: "btc",
          window: "5m",
          snapshotCount: 200,
          progress: 0.8,
          confidence: 0.9,
          predictedDelta: 0.01,
          predictedDirection: "UP",
          observedPrice: 101,
          modelVersion: "model-v1",
          trainedMarketCount: 20,
          generatedAt: "2026-03-13T00:00:00.000Z",
        },
      ],
    } as unknown as ConstructorParameters<typeof HttpServerService>[0]["livePredictionService"],
  });
  const server = httpServerService.buildServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server failed to bind");
  }

  const predictionResponse = await fetch(`http://127.0.0.1:${address.port}/predictions?asset=btc&window=5m`);
  const dashboardResponse = await fetch(`http://127.0.0.1:${address.port}/api/dashboard`);
  const pageResponse = await fetch(`http://127.0.0.1:${address.port}/dashboard`);

  assert.equal(predictionResponse.status, 200);
  assert.equal(dashboardResponse.status, 200);
  assert.equal(pageResponse.status, 200);
  assert.equal(((await predictionResponse.json()) as { predictions: unknown[] }).predictions.length, 1);
  assert.equal(((await dashboardResponse.json()) as { cards: unknown[] }).cards.length, 0);
  assert.match(await pageResponse.text(), /dashboard/);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});
