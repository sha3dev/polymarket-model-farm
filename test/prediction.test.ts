import * as assert from "node:assert/strict";
import { test } from "node:test";

import { ModelRegistryService } from "../src/model/index.ts";
import type { PredictionMarketInput } from "../src/prediction/index.ts";
import { LivePredictionService, PredictionService } from "../src/prediction/index.ts";

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

test("ModelRegistryService recompiles loaded models before training reuse", async () => {
  let compileCallCount = 0;
  const loadedModel = { compile: () => { compileCallCount += 1; } };
  const modelRegistryService = new ModelRegistryService({
    modelDefinitionService: {
      createModel: () => {
        throw new Error("createModel should not be used for a loaded checkpoint");
      },
      compileModel: () => {
        compileCallCount += 1;
      },
      buildMetadata: () => ({
        modelVersion: "btc-15m-2026-03-13T00:00:00.000Z",
        featureCount: 91,
        maxSequenceLength: 1800,
        gruUnits: 72,
        dropoutRate: 0.15,
        learningRate: 0.0005,
        l2Regularization: 0.00001,
        checkpointedAt: "2026-03-13T00:00:00.000Z",
      }),
    } as unknown as ConstructorParameters<typeof ModelRegistryService>[0]["modelDefinitionService"],
    modelStoreService: {
      ensureStorageDirectory: async () => {},
      loadMetadata: async ({ asset, window }: { asset: string; window: string }) =>
        asset === "btc" && window === "15m"
          ? {
              modelVersion: "btc-15m-2026-03-13T00:00:00.000Z",
              featureCount: 91,
              maxSequenceLength: 1800,
              gruUnits: 72,
              dropoutRate: 0.15,
              learningRate: 0.0005,
              l2Regularization: 0.00001,
              checkpointedAt: "2026-03-13T00:00:00.000Z",
            }
          : null,
      loadModel: async ({ asset, window }: { asset: string; window: string }) => (asset === "btc" && window === "15m" ? (loadedModel as never) : null),
      loadLedger: async () => null,
      describePaths: () => ({
        pairDirectoryPath: "/tmp/pair",
        modelDirectoryPath: "/tmp/model",
        modelJsonPath: "/tmp/model/model.json",
        ledgerPath: "/tmp/ledger.json",
        metadataPath: "/tmp/metadata.json",
      }),
      saveModelArtifacts: async () => {},
      saveLedger: async () => {},
    } as unknown as ConstructorParameters<typeof ModelRegistryService>[0]["modelStoreService"],
    featureCount: 91,
  });

  await modelRegistryService.initialize();

  assert.equal(compileCallCount, 1);
});

test("LivePredictionService resolves closed predictions from final up/down prices", async () => {
  const resolvedPredictions: Array<{ slug: string; actualDelta: number }> = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: {
      loadState: async () => ({ generatedAt: "2026-03-13T18:10:30.000Z", markets: [] }),
      loadMarketSnapshots: async () => ({
        slug: "btc-updown-5m-1773425100",
        asset: "btc",
        window: "5m",
        marketStart: "2026-03-13T18:05:00.000Z",
        marketEnd: "2026-03-13T18:10:00.000Z",
        snapshots: [
          {
            asset: "btc",
            window: "5m",
            generatedAt: Date.parse("2026-03-13T18:10:00.000Z"),
            marketId: null,
            marketSlug: "btc-updown-5m-1773425100",
            marketConditionId: null,
            marketStart: "2026-03-13T18:05:00.000Z",
            marketEnd: "2026-03-13T18:10:00.000Z",
            priceToBeat: 71000,
            upAssetId: null,
            upPrice: 0.73,
            upOrderBook: null,
            upEventTs: null,
            downAssetId: null,
            downPrice: 0.21,
            downOrderBook: null,
            downEventTs: null,
            binancePrice: null,
            binanceOrderBook: null,
            binanceEventTs: null,
            coinbasePrice: null,
            coinbaseOrderBook: null,
            coinbaseEventTs: null,
            krakenPrice: null,
            krakenOrderBook: null,
            krakenEventTs: null,
            okxPrice: null,
            okxOrderBook: null,
            okxEventTs: null,
            chainlinkPrice: null,
            chainlinkOrderBook: null,
            chainlinkEventTs: null,
          },
        ],
      }),
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["collectorClientService"],
    predictionService: { buildPrediction: async () => { throw new Error("not expected"); } } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async () => {},
      loadHistory: async (pair: { asset: string; window: string }) =>
        pair.asset === "btc" && pair.window === "5m"
          ? {
              entries: [
                {
                  slug: "btc-updown-5m-1773425100",
                  asset: "btc",
                  window: "5m",
                  marketStart: "2026-03-13T18:05:00.000Z",
                  marketEnd: "2026-03-13T18:10:00.000Z",
                  predictionMadeAt: "2026-03-13T18:08:51.626Z",
                  progressWhenPredicted: 0.76,
                  observedPrice: 71038.28,
                  upPrice: 0.3,
                  downPrice: 0.71,
                  predictedDelta: 0.0005,
                  confidence: 0.72,
                  predictedDirection: "UP",
                  modelVersion: "btc-5m-2026-03-13T18:07:48.948Z",
                  actualDelta: null,
                  actualDirection: null,
                  isCorrect: null,
                },
              ],
            }
          : { entries: [] },
      resolvePrediction: async (_pair: { asset: string; window: string }, slug: string, actualDelta: number) => {
        resolvedPredictions.push({ slug, actualDelta });
      },
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionHistoryService"],
    now: () => "2026-03-13T18:10:30.000Z",
  });

  await livePredictionService.refreshOnce();

  assert.deepEqual(resolvedPredictions, [{ slug: "btc-updown-5m-1773425100", actualDelta: 0.52 }]);
});

test("LivePredictionService initializes unresolved history only once across refresh cycles", async () => {
  let loadHistoryCallCount = 0;
  let loadMarketSnapshotsCallCount = 0;
  const resolvedPredictions: Array<{ slug: string; actualDelta: number }> = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: {
      loadState: async () => ({ generatedAt: "2026-03-13T18:10:30.000Z", markets: [] }),
      loadMarketSnapshots: async () => {
        loadMarketSnapshotsCallCount += 1;
        return {
          slug: "btc-updown-5m-1773425100",
          asset: "btc",
          window: "5m",
          marketStart: "2026-03-13T18:05:00.000Z",
          marketEnd: "2026-03-13T18:10:00.000Z",
          snapshots: [
            {
              asset: "btc",
              window: "5m",
              generatedAt: Date.parse("2026-03-13T18:10:00.000Z"),
              marketId: null,
              marketSlug: "btc-updown-5m-1773425100",
              marketConditionId: null,
              marketStart: "2026-03-13T18:05:00.000Z",
              marketEnd: "2026-03-13T18:10:00.000Z",
              priceToBeat: 71000,
              upAssetId: null,
              upPrice: 0.73,
              upOrderBook: null,
              upEventTs: null,
              downAssetId: null,
              downPrice: 0.21,
              downOrderBook: null,
              downEventTs: null,
              binancePrice: null,
              binanceOrderBook: null,
              binanceEventTs: null,
              coinbasePrice: null,
              coinbaseOrderBook: null,
              coinbaseEventTs: null,
              krakenPrice: null,
              krakenOrderBook: null,
              krakenEventTs: null,
              okxPrice: null,
              okxOrderBook: null,
              okxEventTs: null,
              chainlinkPrice: null,
              chainlinkOrderBook: null,
              chainlinkEventTs: null,
            },
          ],
        };
      },
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["collectorClientService"],
    predictionService: { buildPrediction: async () => { throw new Error("not expected"); } } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async () => {},
      loadHistory: async (pair: { asset: string; window: string }) => {
        loadHistoryCallCount += 1;
        return pair.asset === "btc" && pair.window === "5m"
          ? {
              entries: [
                {
                  slug: "btc-updown-5m-1773425100",
                  asset: "btc",
                  window: "5m",
                  marketStart: "2026-03-13T18:05:00.000Z",
                  marketEnd: "2026-03-13T18:10:00.000Z",
                  predictionMadeAt: "2026-03-13T18:08:51.626Z",
                  progressWhenPredicted: 0.76,
                  observedPrice: 71038.28,
                  upPrice: 0.3,
                  downPrice: 0.71,
                  predictedDelta: 0.0005,
                  confidence: 0.72,
                  predictedDirection: "UP",
                  modelVersion: "btc-5m-2026-03-13T18:07:48.948Z",
                  actualDelta: null,
                  actualDirection: null,
                  isCorrect: null,
                },
              ],
            }
          : { entries: [] };
      },
      resolvePrediction: async (_pair: { asset: string; window: string }, slug: string, actualDelta: number) => {
        resolvedPredictions.push({ slug, actualDelta });
      },
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionHistoryService"],
    now: () => "2026-03-13T18:10:30.000Z",
  });

  await livePredictionService.refreshOnce();
  await livePredictionService.refreshOnce();

  assert.equal(loadHistoryCallCount, 8);
  assert.equal(loadMarketSnapshotsCallCount, 1);
  assert.deepEqual(resolvedPredictions, [{ slug: "btc-updown-5m-1773425100", actualDelta: 0.52 }]);
});

test("LivePredictionService backs off collector retries for unresolved closed markets", async () => {
  let currentIso = "2026-03-13T18:10:30.000Z";
  let loadMarketSnapshotsCallCount = 0;
  const livePredictionService = new LivePredictionService({
    collectorClientService: {
      loadState: async () => ({ generatedAt: currentIso, markets: [] }),
      loadMarketSnapshots: async () => {
        loadMarketSnapshotsCallCount += 1;
        return {
          slug: "btc-updown-5m-1773425100",
          asset: "btc",
          window: "5m",
          marketStart: "2026-03-13T18:05:00.000Z",
          marketEnd: "2026-03-13T18:10:00.000Z",
          snapshots: [
            {
              asset: "btc",
              window: "5m",
              generatedAt: Date.parse("2026-03-13T18:10:00.000Z"),
              marketId: null,
              marketSlug: "btc-updown-5m-1773425100",
              marketConditionId: null,
              marketStart: "2026-03-13T18:05:00.000Z",
              marketEnd: "2026-03-13T18:10:00.000Z",
              priceToBeat: 71000,
              upAssetId: null,
              upPrice: null,
              upOrderBook: null,
              upEventTs: null,
              downAssetId: null,
              downPrice: null,
              downOrderBook: null,
              downEventTs: null,
              binancePrice: null,
              binanceOrderBook: null,
              binanceEventTs: null,
              coinbasePrice: null,
              coinbaseOrderBook: null,
              coinbaseEventTs: null,
              krakenPrice: null,
              krakenOrderBook: null,
              krakenEventTs: null,
              okxPrice: null,
              okxOrderBook: null,
              okxEventTs: null,
              chainlinkPrice: null,
              chainlinkOrderBook: null,
              chainlinkEventTs: null,
            },
          ],
        };
      },
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["collectorClientService"],
    predictionService: { buildPrediction: async () => { throw new Error("not expected"); } } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async () => {},
      loadHistory: async (pair: { asset: string; window: string }) =>
        pair.asset === "btc" && pair.window === "5m"
          ? {
              entries: [
                {
                  slug: "btc-updown-5m-1773425100",
                  asset: "btc",
                  window: "5m",
                  marketStart: "2026-03-13T18:05:00.000Z",
                  marketEnd: "2026-03-13T18:10:00.000Z",
                  predictionMadeAt: "2026-03-13T18:08:51.626Z",
                  progressWhenPredicted: 0.76,
                  observedPrice: 71038.28,
                  upPrice: 0.3,
                  downPrice: 0.71,
                  predictedDelta: 0.0005,
                  confidence: 0.72,
                  predictedDirection: "UP",
                  modelVersion: "btc-5m-2026-03-13T18:07:48.948Z",
                  actualDelta: null,
                  actualDirection: null,
                  isCorrect: null,
                },
              ],
            }
          : { entries: [] },
      resolvePrediction: async () => {},
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionHistoryService"],
    now: () => currentIso,
  });

  await livePredictionService.refreshOnce();
  await livePredictionService.refreshOnce();
  currentIso = "2026-03-13T18:11:01.000Z";
  await livePredictionService.refreshOnce();

  assert.equal(loadMarketSnapshotsCallCount, 2);
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
    snapshots: [
      buildPredictionSnapshot("2026-03-13T00:00:00.000Z", 0.53, 0.47, 100.14, 100.2, 100.15, 100.1, 100.18),
      buildPredictionSnapshot("2026-03-13T00:04:00.000Z", 0.59, 0.41, 100.82, 100.8, 100.75, 100.78, 100.76),
    ],
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

function buildExchangeFields(
  chainlinkPrice: number,
  binancePrice: number,
  coinbasePrice: number,
  krakenPrice: number,
  okxPrice: number,
): Pick<
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
