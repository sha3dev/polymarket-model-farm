import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { PredictionMarketInput } from "../src/prediction/index.ts";
import { PredictionService } from "../src/prediction/index.ts";

test("PredictionService converts model delta into directional confidence", async () => {
  const predictionService = new PredictionService({
    modelRegistryService: {
      predict: async () => 0.5,
      getPredictionContext: () => ({ metadata: null, trainedMarketCount: 120, modelVersion: "model-v1", hasCheckpoint: true, recentReferenceDelta: 0.004 }),
    } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["progress"], rows: [[0.5]], maxSequenceLength: 600 }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["marketFeatureProjectorService"],
    now: () => "2026-03-13T00:00:00.000Z",
  });

  const prediction = await predictionService.buildPrediction(buildMarketInput());

  assert.equal(prediction.predictedDirection, "UP");
  assert.equal(prediction.snapshotCount, 2);
  assert.ok(prediction.predictedDelta > 0);
  assert.ok(prediction.confidence > 0);
  assert.ok(prediction.confidence <= 1);
  assert.equal(prediction.modelVersion, "model-v1");
});

test("PredictionService rejects markets without historical price-to-beat", async () => {
  const predictionService = new PredictionService({
    modelRegistryService: {
      predict: async () => 0,
      getPredictionContext: () => ({ metadata: null, trainedMarketCount: 0, modelVersion: "model-v1", hasCheckpoint: true, recentReferenceDelta: 0 }),
    } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["progress"], rows: [[0.1]], maxSequenceLength: 600 }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["marketFeatureProjectorService"],
    now: () => "2026-03-13T00:00:00.000Z",
  });

  await assert.rejects(async () => predictionService.buildPrediction({ ...buildMarketInput(), prevPriceToBeat: [] }), /prevPriceToBeat/);
});

test("PredictionService rejects pairs with fewer than 100 trained markets", async () => {
  const predictionService = new PredictionService({
    modelRegistryService: {
      predict: async () => 0.2,
      getPredictionContext: () => ({ metadata: null, trainedMarketCount: 99, modelVersion: "model-v1", hasCheckpoint: true, recentReferenceDelta: 0.003 }),
    } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["progress"], rows: [[0.5]], maxSequenceLength: 600 }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["marketFeatureProjectorService"],
    now: () => "2026-03-13T00:00:00.000Z",
  });

  await assert.rejects(async () => predictionService.buildPrediction(buildMarketInput()), /at least 100 trained markets/);
});

function buildMarketInput(): PredictionMarketInput {
  return {
    asset: "btc",
    window: "5m",
    slug: "btc-5m-test",
    marketStart: "2026-03-13T00:00:00.000Z",
    marketEnd: "2026-03-13T00:05:00.000Z",
    priceToBeat: 100,
    prevPriceToBeat: [99.8, 100.1],
    snapshots: [buildPredictionSnapshot("2026-03-13T00:00:00.000Z", 0.53, 0.47, 100.14, 100.2, 100.15, 100.1, 100.18), buildPredictionSnapshot("2026-03-13T00:04:00.000Z", 0.59, 0.41, 100.82, 100.8, 100.75, 100.78, 100.76)],
  };
}

function buildPredictionSnapshot(
  generatedAtIso: string,
  upPrice: number,
  downPrice: number,
  chainlinkPrice: number,
  binancePrice: number,
  coinbasePrice: number,
  krakenPrice: number,
  okxPrice: number,
): PredictionMarketInput["snapshots"][number] {
  const generatedAt = Date.parse(generatedAtIso);
  const exchangeFields = buildExchangeFields(chainlinkPrice, binancePrice, coinbasePrice, krakenPrice, okxPrice);
  return {
    asset: "btc",
    window: "5m",
    generatedAt,
    marketId: null,
    marketSlug: "btc-5m-test",
    marketConditionId: null,
    marketStart: "2026-03-13T00:00:00.000Z",
    marketEnd: "2026-03-13T00:05:00.000Z",
    priceToBeat: 100,
    upAssetId: null,
    upPrice,
    upOrderBook: { bids: [{ price: upPrice - 0.01, size: 1 }], asks: [{ price: upPrice + 0.01, size: 1 }] },
    upEventTs: null,
    downAssetId: null,
    downPrice,
    downOrderBook: { bids: [{ price: downPrice - 0.01, size: 1 }], asks: [{ price: downPrice + 0.01, size: 1 }] },
    downEventTs: null,
    ...exchangeFields,
  };
}

function buildProviderOrderBook(provider: string, price: number): NonNullable<PredictionMarketInput["snapshots"][number]["binanceOrderBook"]> {
  return { type: "orderbook", provider, symbol: "btc", ts: 1, bids: [{ price, size: 1 }], asks: [{ price: price + 0.1, size: 1 }] };
}

function buildExchangeFields(chainlinkPrice: number, binancePrice: number, coinbasePrice: number, krakenPrice: number, okxPrice: number): Pick<
  PredictionMarketInput["snapshots"][number],
  | "binancePrice"
  | "binanceOrderBook"
  | "binanceEventTs"
  | "coinbasePrice"
  | "coinbaseOrderBook"
  | "coinbaseEventTs"
  | "krakenPrice"
  | "krakenOrderBook"
  | "krakenEventTs"
  | "okxPrice"
  | "okxOrderBook"
  | "okxEventTs"
  | "chainlinkPrice"
  | "chainlinkOrderBook"
  | "chainlinkEventTs"
> {
  return {
    binancePrice,
    binanceOrderBook: buildProviderOrderBook("binance", binancePrice),
    binanceEventTs: null,
    coinbasePrice,
    coinbaseOrderBook: buildProviderOrderBook("coinbase", coinbasePrice),
    coinbaseEventTs: null,
    krakenPrice,
    krakenOrderBook: buildProviderOrderBook("kraken", krakenPrice),
    krakenEventTs: null,
    okxPrice,
    okxOrderBook: buildProviderOrderBook("okx", okxPrice),
    okxEventTs: null,
    chainlinkPrice,
    chainlinkOrderBook: buildProviderOrderBook("chainlink", chainlinkPrice),
    chainlinkEventTs: null,
  };
}
