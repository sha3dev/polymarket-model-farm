import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { Snapshot } from "../src/collector/index.ts";
import { PredictionQueryService, PredictionService } from "../src/prediction/index.ts";
import type { PredictionFilter, PredictionMarketInput } from "../src/prediction/index.ts";

const BASE_SNAPSHOT: Snapshot = {
  asset: "btc",
  window: "5m",
  generatedAt: Date.parse("2026-03-13T00:04:00.000Z"),
  marketId: null,
  marketSlug: "btc-5m-test",
  marketConditionId: null,
  marketStart: "2026-03-13T00:00:00.000Z",
  marketEnd: "2026-03-13T00:05:00.000Z",
  priceToBeat: 100,
  upAssetId: null,
  upPrice: 0.4,
  upOrderBook: null,
  upEventTs: null,
  downAssetId: null,
  downPrice: 0.6,
  downOrderBook: null,
  downEventTs: null,
  binancePrice: 100.8,
  binanceOrderBook: {
    type: "orderbook",
    provider: "binance",
    symbol: "btc",
    ts: Date.parse("2026-03-13T00:04:00.000Z"),
    bids: [{ price: 100.78, size: 3 }],
    asks: [{ price: 100.82, size: 4 }],
  },
  binanceEventTs: null,
  coinbasePrice: 100.7,
  coinbaseOrderBook: {
    type: "orderbook",
    provider: "coinbase",
    symbol: "btc",
    ts: Date.parse("2026-03-13T00:04:00.000Z"),
    bids: [{ price: 100.69, size: 3 }],
    asks: [{ price: 100.73, size: 4 }],
  },
  coinbaseEventTs: null,
  krakenPrice: 100.75,
  krakenOrderBook: {
    type: "orderbook",
    provider: "kraken",
    symbol: "btc",
    ts: Date.parse("2026-03-13T00:04:00.000Z"),
    bids: [{ price: 100.74, size: 3 }],
    asks: [{ price: 100.76, size: 4 }],
  },
  krakenEventTs: null,
  okxPrice: 100.72,
  okxOrderBook: {
    type: "orderbook",
    provider: "okx",
    symbol: "btc",
    ts: Date.parse("2026-03-13T00:04:00.000Z"),
    bids: [{ price: 100.71, size: 3 }],
    asks: [{ price: 100.73, size: 4 }],
  },
  okxEventTs: null,
  chainlinkPrice: 101,
  chainlinkOrderBook: null,
  chainlinkEventTs: null,
};

test("PredictionService returns predicted final price from a log return", async () => {
  const predictionService = buildPredictionService({ predictedLogReturn: 0.05 });

  const prediction = await predictionService.buildPrediction(buildMarketInput());
  const expectedPredictedFinalPrice = 100 * Math.exp(0.05);

  assert.equal(prediction.predictedDirection, "UP");
  assert.equal(prediction.predictedLogReturn, 0.05);
  assert.ok(Math.abs(prediction.predictedFinalPrice - expectedPredictedFinalPrice) < 0.0000001);
});

test("PredictionService no longer requires previous strike history", async () => {
  const predictionService = buildPredictionService({ predictedLogReturn: -0.03 });

  const prediction = await predictionService.buildPrediction(buildMarketInput());

  assert.equal(prediction.predictedDirection, "DOWN");
  assert.equal("prevPriceToBeat" in prediction, false);
});

test("PredictionService rejects prediction requests when no checkpoint is available", async () => {
  const predictionService = new PredictionService({
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["feature"], rows: [[1]], maxSequenceLength: 60 }) } as unknown as ConstructorParameters<
      typeof PredictionService
    >[0]["marketFeatureProjectorService"],
    modelRegistryService: { predict: async () => 0.05, getPredictionContext: () => ({ metadata: null, trainedMarketCount: 0, lastTrainedAt: null, hasCheckpoint: false }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"],
    now: () => "2026-03-13T00:04:30.000Z",
  });

  await assert.rejects(async () => predictionService.buildPrediction(buildMarketInput()), /checkpoint is not available/);
});

test("PredictionQueryService builds filtered live predictions from current Polymarket slugs", async () => {
  const predictionQueryService = new PredictionQueryService({
    collectorClientService: {
      loadMarketSnapshots: async () => ({ slug: "btc-5m-live", asset: "btc", window: "5m", marketStart: "2026-03-13T00:00:00.000Z", marketEnd: "2026-03-13T00:05:00.000Z", snapshots: [BASE_SNAPSHOT] }),
      listMarkets: async () => [],
    } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["collectorClientService"],
    marketCatalogService: { buildCryptoWindowSlugs: () => ["btc-5m-live"] } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["marketCatalogService"],
    modelRegistryService: { getPredictionContext: () => ({ metadata: null, trainedMarketCount: 150, lastTrainedAt: "2026-03-13T00:03:00.000Z", hasCheckpoint: true }) } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["modelRegistryService"],
    predictionService: {
      buildPrediction: async (marketInput: PredictionMarketInput) => ({
        slug: marketInput.slug,
        asset: marketInput.asset,
        window: marketInput.window,
        snapshotCount: marketInput.snapshots.length,
        marketStart: marketInput.marketStart,
        marketEnd: marketInput.marketEnd,
        predictedFinalPrice: 101,
        predictedDirection: "UP",
        observedPrice: 101,
        priceToBeat: 100,
        predictedLogReturn: 0.01,
        lastTrainedAt: "2026-03-13T00:03:00.000Z",
        trainedMarketCount: 150,
        generatedAt: "2026-03-13T00:04:30.000Z",
      }),
    } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["predictionService"],
    now: () => Date.parse("2026-03-13T00:04:30.000Z"),
  });

  const payload = await predictionQueryService.buildResponse(buildPredictionFilter());

  assert.equal(payload.predictions.length, 1);
  assert.equal(payload.predictions[0]?.asset, "btc");
  assert.equal(payload.predictions[0]?.window, "5m");
});

test("PredictionQueryService omits live slots without checkpoints", async () => {
  const predictionQueryService = new PredictionQueryService({
    collectorClientService: {
      loadMarketSnapshots: async () => ({ slug: "btc-5m-live", asset: "btc", window: "5m", marketStart: "2026-03-13T00:00:00.000Z", marketEnd: "2026-03-13T00:05:00.000Z", snapshots: [BASE_SNAPSHOT] }),
      listMarkets: async () => [],
    } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["collectorClientService"],
    marketCatalogService: { buildCryptoWindowSlugs: () => ["btc-5m-live"] } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["marketCatalogService"],
    modelRegistryService: { getPredictionContext: () => ({ metadata: null, trainedMarketCount: 0, lastTrainedAt: null, hasCheckpoint: false }) } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["modelRegistryService"],
    predictionService: { buildPrediction: async () => buildPredictionServiceOutput() } as unknown as ConstructorParameters<
      typeof PredictionQueryService
    >[0]["predictionService"],
    now: () => Date.parse("2026-03-13T00:04:30.000Z"),
  });

  const payload = await predictionQueryService.buildResponse(buildPredictionFilter());

  assert.equal(payload.predictions.length, 0);
});

test("PredictionQueryService omits live slots without snapshots", async () => {
  const predictionQueryService = new PredictionQueryService({
    collectorClientService: {
      loadMarketSnapshots: async () => ({ slug: "btc-5m-live", asset: "btc", window: "5m", marketStart: "2026-03-13T00:00:00.000Z", marketEnd: "2026-03-13T00:05:00.000Z", snapshots: [] }),
      listMarkets: async () => [],
    } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["collectorClientService"],
    marketCatalogService: { buildCryptoWindowSlugs: () => ["btc-5m-live"] } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["marketCatalogService"],
    modelRegistryService: { getPredictionContext: () => ({ metadata: null, trainedMarketCount: 150, lastTrainedAt: "2026-03-13T00:03:00.000Z", hasCheckpoint: true }) } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["modelRegistryService"],
    predictionService: { buildPrediction: async () => buildPredictionServiceOutput() } as unknown as ConstructorParameters<
      typeof PredictionQueryService
    >[0]["predictionService"],
    now: () => Date.parse("2026-03-13T00:04:30.000Z"),
  });

  const payload = await predictionQueryService.buildResponse(buildPredictionFilter());

  assert.equal(payload.predictions.length, 0);
});

test("PredictionQueryService omits live slots when the collector has not stored the built slug yet", async () => {
  const predictionQueryService = new PredictionQueryService({
    collectorClientService: { loadMarketSnapshots: async () => { throw new Error("collector snapshot request failed for slug btc-5m-live: 404 not found"); }, listMarkets: async () => [] } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["collectorClientService"],
    marketCatalogService: { buildCryptoWindowSlugs: () => ["btc-5m-live"] } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["marketCatalogService"],
    modelRegistryService: { getPredictionContext: () => ({ metadata: null, trainedMarketCount: 150, lastTrainedAt: "2026-03-13T00:03:00.000Z", hasCheckpoint: true }) } as unknown as ConstructorParameters<typeof PredictionQueryService>[0]["modelRegistryService"],
    predictionService: { buildPrediction: async () => buildPredictionServiceOutput() } as unknown as ConstructorParameters<
      typeof PredictionQueryService
    >[0]["predictionService"],
    now: () => Date.parse("2026-03-13T00:04:30.000Z"),
  });

  const payload = await predictionQueryService.buildResponse(buildPredictionFilter());

  assert.equal(payload.predictions.length, 0);
});

type BuildPredictionServiceArgs = { predictedLogReturn: number };

function buildPredictionService(args: BuildPredictionServiceArgs): PredictionService {
  return new PredictionService({
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["feature"], rows: [[1]], maxSequenceLength: 60 }) } as unknown as ConstructorParameters<
      typeof PredictionService
    >[0]["marketFeatureProjectorService"],
    modelRegistryService: {
      predict: async () => args.predictedLogReturn,
      getPredictionContext: () => ({ metadata: null, trainedMarketCount: 150, lastTrainedAt: "2026-03-13T00:03:00.000Z", hasCheckpoint: true }),
    } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"],
    now: () => "2026-03-13T00:04:30.000Z",
  });
}

function buildMarketInput() {
  return {
    asset: "btc" as const,
    window: "5m" as const,
    slug: "btc-5m-test",
    marketStart: "2026-03-13T00:00:00.000Z",
    marketEnd: "2026-03-13T00:05:00.000Z",
    priceToBeat: 100,
    snapshots: [BASE_SNAPSHOT],
  };
}

function buildPredictionFilter(): PredictionFilter {
  return { asset: "btc", window: "5m" };
}

function buildPredictionServiceOutput() {
  return {
    slug: "btc-5m-live",
    asset: "btc" as const,
    window: "5m" as const,
    snapshotCount: 1,
    marketStart: "2026-03-13T00:00:00.000Z",
    marketEnd: "2026-03-13T00:05:00.000Z",
    predictedFinalPrice: 101,
    predictedDirection: "UP" as const,
    observedPrice: 101,
    priceToBeat: 100,
    predictedLogReturn: 0.01,
    lastTrainedAt: "2026-03-13T00:03:00.000Z",
    trainedMarketCount: 150,
    generatedAt: "2026-03-13T00:04:30.000Z",
  };
}
