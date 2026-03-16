import * as assert from "node:assert/strict";
import { test } from "node:test";

import { AppInfoService } from "../src/app-info/app-info.service.ts";
import { HttpServerService } from "../src/http/http-server.service.ts";

test("HttpServerService serves status and raw prediction routes", async () => {
  const httpServerService = new HttpServerService({
    appInfoService: new AppInfoService({ serviceName: "farm" }),
    predictionQueryService: {
      buildResponse: async (filter: { asset: string | null; window: string | null }) => ({
        predictions: [
          {
            slug: `${filter.asset || "btc"}-${filter.window || "5m"}-test`,
            asset: filter.asset || "btc",
            window: filter.window || "5m",
            snapshotCount: 10,
            marketStart: "2026-03-13T00:00:00.000Z",
            marketEnd: "2026-03-13T00:05:00.000Z",
            predictedFinalPrice: 101,
            predictedDirection: "UP",
            observedPrice: 101,
            priceToBeat: 100,
            predictedLogReturn: 0.01,
            lastTrainedAt: "2026-03-13T00:03:00.000Z",
            trainedMarketCount: 120,
            generatedAt: "2026-03-13T00:00:00.000Z",
          },
        ],
      }),
    } as unknown as ConstructorParameters<typeof HttpServerService>[0]["predictionQueryService"],
  });
  const server = httpServerService.buildServer();

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server failed to bind");
  }

  const statusResponse = await fetch(`http://127.0.0.1:${address.port}/`);
  const predictionResponse = await fetch(`http://127.0.0.1:${address.port}/predictions?asset=btc&window=5m`);
  const invalidResponse = await fetch(`http://127.0.0.1:${address.port}/predictions?asset=ada`);
  const predictionPayload = (await predictionResponse.json()) as { predictions: Array<{ asset: string; window: string }> };

  assert.equal(statusResponse.status, 200);
  assert.equal(predictionResponse.status, 200);
  assert.equal(invalidResponse.status, 400);
  assert.equal(predictionPayload.predictions[0]?.asset, "btc");
  assert.equal(predictionPayload.predictions[0]?.window, "5m");

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
