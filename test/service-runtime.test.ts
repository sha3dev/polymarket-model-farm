import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import type { Snapshot } from "@sha3/polymarket-snapshot";

import { AppInfoService } from "../src/app-info/app-info.service.ts";
import { ServiceRuntime } from "../src/app/service-runtime.service.ts";
import { CollectorClientService } from "../src/collector-client/index.ts";
import { HttpServerService } from "../src/http/http-server.service.ts";
import { ModelDefinitionService, ModelRegistryService, ModelStoreService } from "../src/model/index.ts";
import { PredictionService } from "../src/prediction/index.ts";
import { SnapshotFeatureProjectorService } from "../src/snapshot-feature/index.ts";
import { TrainerStatusService } from "../src/trainer-state/index.ts";
import { TrainingOrchestratorService } from "../src/training/index.ts";

const BASE_SNAPSHOT: Snapshot = {
  asset: "btc",
  window: "5m",
  generatedAt: Date.parse("2026-03-12T00:00:00.000Z"),
  marketId: "market-id",
  marketSlug: "btc-5m-training",
  marketConditionId: "condition-id",
  marketStart: "2026-03-12T00:00:00.000Z",
  marketEnd: "2026-03-12T00:05:00.000Z",
  priceToBeat: 100,
  upAssetId: "up-asset",
  upPrice: 0.55,
  upOrderBook: { bids: [{ price: 0.54, size: 10 }], asks: [{ price: 0.56, size: 12 }] },
  upEventTs: 1,
  downAssetId: "down-asset",
  downPrice: 0.45,
  downOrderBook: { bids: [{ price: 0.44, size: 9 }], asks: [{ price: 0.46, size: 10 }] },
  downEventTs: 1,
  binancePrice: 100.1,
  binanceOrderBook: { type: "orderbook", provider: "binance", symbol: "btc", ts: 1, bids: [{ price: 100, size: 1 }], asks: [{ price: 100.2, size: 1 }] },
  binanceEventTs: 1,
  coinbasePrice: 100.1,
  coinbaseOrderBook: { type: "orderbook", provider: "coinbase", symbol: "btc", ts: 1, bids: [{ price: 100, size: 1 }], asks: [{ price: 100.2, size: 1 }] },
  coinbaseEventTs: 1,
  krakenPrice: 100.1,
  krakenOrderBook: { type: "orderbook", provider: "kraken", symbol: "btc", ts: 1, bids: [{ price: 100, size: 1 }], asks: [{ price: 100.2, size: 1 }] },
  krakenEventTs: 1,
  okxPrice: 100.1,
  okxOrderBook: { type: "orderbook", provider: "okx", symbol: "btc", ts: 1, bids: [{ price: 100, size: 1 }], asks: [{ price: 100.2, size: 1 }] },
  okxEventTs: 1,
  chainlinkPrice: 100.1,
  chainlinkOrderBook: { type: "orderbook", provider: "chainlink", symbol: "btc", ts: 1, bids: [{ price: 100.1, size: 1 }], asks: [{ price: 100.1, size: 1 }] },
  chainlinkEventTs: 1,
};

test("ServiceRuntime serves health, trainer status, and predictions after training", async () => {
  const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-model-farm-"));
  const fakeCollector = await startFakeCollectorServer();
  const snapshotFeatureProjectorService = SnapshotFeatureProjectorService.createDefault();
  const modelRegistryService = new ModelRegistryService({
    modelDefinitionService: ModelDefinitionService.createDefault(),
    modelStoreService: new ModelStoreService({ storageDirectoryPath: tempDirectoryPath }),
    featureCount: snapshotFeatureProjectorService.getFeatureLabels().length,
  });
  const collectorClientService = new CollectorClientService({ baseUrl: fakeCollector.baseUrl, fetchFn: fetch });
  const predictionService = new PredictionService({ modelRegistryService, snapshotFeatureProjectorService, now: () => "2026-03-12T00:00:00.000Z" });
  const trainerStatusService = new TrainerStatusService({ collectorClientService, modelRegistryService, now: () => "2026-03-12T00:00:00.000Z" });
  const trainingOrchestratorService = new TrainingOrchestratorService({ collectorClientService, modelRegistryService, snapshotFeatureProjectorService, now: () => Date.parse("2026-03-12T01:00:00.000Z") });
  const runtime = new ServiceRuntime({
    httpServerService: new HttpServerService({ appInfoService: AppInfoService.createDefault(), predictionService, trainerStatusService }),
    modelRegistryService,
    trainingOrchestratorService,
  });

  await modelRegistryService.initialize();
  await trainingOrchestratorService.runTrainingCycle();
  const server = runtime.buildServer();
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind runtime test server");
  }

  const rootResponse = await fetch(`http://127.0.0.1:${address.port}/`);
  const trainerStatusResponse = await fetch(`http://127.0.0.1:${address.port}/trainer-status`);
  const predictionResponse = await fetch(`http://127.0.0.1:${address.port}/predictions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      markets: [
        {
          asset: "btc",
          window: "5m",
          slug: "btc-5m-training",
          marketStart: "2026-03-12T00:00:00.000Z",
          marketEnd: "2026-03-12T00:05:00.000Z",
          priceToBeat: 100,
          prevPriceToBeat: [99.2, 100.8],
          snapshots: buildSnapshots(),
        },
      ],
    }),
  });

  assert.equal(rootResponse.status, 200);
  assert.equal(trainerStatusResponse.status, 200);
  assert.equal(predictionResponse.status, 200);
  assert.equal((await trainerStatusResponse.json()).models[0].trainedMarketCount >= 1, true);
  assert.equal((await predictionResponse.json()).predictions[0].snapshotCount, 3);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  await fakeCollector.close();
});

async function startFakeCollectorServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const snapshots = buildSnapshots();
  const server = createServer((request, response) => handleCollectorRequest(request, response, snapshots));

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind fake collector server");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

function writeJson(response: ServerResponse<IncomingMessage>, payload: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function handleCollectorRequest(request: IncomingMessage, response: ServerResponse<IncomingMessage>, snapshots: Snapshot[]): void {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/markets") {
    writeJson(response, { markets: [buildMarketSummary()] });
  } else {
    if (request.method === "GET" && url.pathname === "/markets/btc-5m-training/snapshots") {
      writeJson(response, { slug: "btc-5m-training", asset: "btc", window: "5m", marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z", snapshots });
    } else {
      if (request.method === "GET" && url.pathname === "/state") {
        writeJson(response, buildStatePayload(snapshots));
      } else {
        writeJson(response, { error: "not found" }, 404);
      }
    }
  }
}

function buildStatePayload(snapshots: Snapshot[]): unknown {
  return {
    generatedAt: "2026-03-12T00:00:00.000Z",
    markets: [
      {
        asset: "btc",
        window: "5m",
        market: buildMarketSummary(),
        snapshotCount: snapshots.length,
        latestSnapshot: {
          generatedAt: snapshots[snapshots.length - 1]?.generatedAt || 0,
          priceToBeat: 100,
          upPrice: 0.7,
          downPrice: 0.3,
          chainlinkPrice: 101.2,
          binancePrice: 101.1,
          coinbasePrice: 101.15,
          krakenPrice: 101.05,
          okxPrice: 101.08,
        },
      },
    ],
  };
}

function buildMarketSummary(): { slug: string; asset: "btc"; window: "5m"; priceToBeat: number; prevPriceToBeat: number[]; marketStart: string; marketEnd: string } {
  return { slug: "btc-5m-training", asset: "btc", window: "5m", priceToBeat: 100, prevPriceToBeat: [99.2, 100.8], marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z" };
}

function buildSnapshots(): Snapshot[] {
  return [
    buildSnapshot({ generatedAt: Date.parse("2026-03-12T00:00:00.000Z"), chainlinkPrice: 100.1 }),
    buildSnapshot({ generatedAt: Date.parse("2026-03-12T00:00:10.000Z"), chainlinkPrice: 100.6, upPrice: 0.6, downPrice: 0.4 }),
    buildSnapshot({ generatedAt: Date.parse("2026-03-12T00:00:20.000Z"), chainlinkPrice: 101.2, upPrice: 0.7, downPrice: 0.3 }),
  ];
}

function buildSnapshot(overrides: Partial<Snapshot>): Snapshot {
  return { ...BASE_SNAPSHOT, ...overrides };
}
