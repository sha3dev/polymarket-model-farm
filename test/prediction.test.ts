import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import config from "../src/config.ts";
import { PredictionHistoryService } from "../src/history/index.ts";
import type { PredictionHistoryEntry } from "../src/history/index.ts";
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
  assert.ok(prediction.confidence >= 0);
  assert.ok(prediction.confidence <= 1);
  assert.equal(prediction.modelVersion, "model-v1");
});

test("PredictionService does not collapse confidence around fifty percent when recent deltas are small", async () => {
  const predictionService = new PredictionService({
    modelRegistryService: {
      predict: async () => 0.05,
      getPredictionContext: () => ({ metadata: null, trainedMarketCount: 120, modelVersion: "model-v1", hasCheckpoint: true, recentReferenceDelta: 0.0005 }),
    } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["progress"], rows: [[0.5]], maxSequenceLength: 600 }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["marketFeatureProjectorService"],
    now: () => "2026-03-13T00:00:00.000Z",
  });

  const prediction = await predictionService.buildPrediction(buildMarketInput({ upPrice: null, downPrice: null }));

  assert.ok(prediction.confidence > 0.9);
});

test("PredictionService tempers model confidence when the market strongly prices the opposite side", async () => {
  const predictionService = new PredictionService({
    modelRegistryService: {
      predict: async () => 0.05,
      getPredictionContext: () => ({ metadata: null, trainedMarketCount: 120, modelVersion: "model-v1", hasCheckpoint: true, recentReferenceDelta: 0.0005 }),
    } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["progress"], rows: [[0.5]], maxSequenceLength: 600 }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["marketFeatureProjectorService"],
    now: () => "2026-03-13T00:00:00.000Z",
  });

  const prediction = await predictionService.buildPrediction(buildMarketInput({ upPrice: 0.1, downPrice: 0.9 }));

  assert.equal(prediction.predictedDirection, "UP");
  assert.ok(prediction.confidence < 0.5);
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

test("LivePredictionService records the first threshold that clears confidence", async () => {
  const recordedPredictions: Array<Pick<PredictionHistoryEntry, "progressWhenPredicted" | "upPrice" | "downPrice" | "confidence">> = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: { loadState: async () => buildLivePredictionStatePayload(), loadMarketSnapshots: async () => buildLivePredictionMarketPayload() } as unknown as ConstructorParameters<
      typeof LivePredictionService
    >[0]["collectorClientService"],
    predictionService: {
      buildPrediction: async (market: PredictionMarketInput) => {
        const latestSnapshot = market.snapshots[market.snapshots.length - 1];
        if (latestSnapshot?.generatedAt === Date.parse("2026-03-13T18:07:30.000Z")) {
          return {
            slug: market.slug,
            asset: market.asset,
            window: market.window,
            snapshotCount: market.snapshots.length,
            progress: 0.5,
            confidence: 0.55,
            predictedDelta: 0.01,
            predictedDirection: "UP",
            observedPrice: 71010,
            modelVersion: "model-v1",
            trainedMarketCount: 200,
            generatedAt: "2026-03-13T18:07:30.000Z",
          };
        }
        return {
          slug: market.slug,
          asset: market.asset,
          window: market.window,
          snapshotCount: market.snapshots.length,
          progress: 0.75,
          confidence: 0.82,
          predictedDelta: -0.01,
          predictedDirection: "DOWN",
          observedPrice: 70990,
          modelVersion: "model-v1",
          trainedMarketCount: 200,
          generatedAt: "2026-03-13T18:08:45.000Z",
        };
      },
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async (
        _pair: { asset: string; window: string },
        entry: PredictionHistoryEntry,
      ) => {
        recordedPredictions.push({ progressWhenPredicted: entry.progressWhenPredicted, upPrice: entry.upPrice, downPrice: entry.downPrice, confidence: entry.confidence });
      },
      loadHistory: async () => ({ entries: [] }),
      resolvePrediction: async () => {},
    } as unknown as ConstructorParameters<typeof LivePredictionService>[0]["predictionHistoryService"],
    now: () => "2026-03-13T18:09:31.000Z",
  });

  await livePredictionService.refreshOnce();

  assert.deepEqual(recordedPredictions, [{ progressWhenPredicted: 0.75, upPrice: 0.27, downPrice: 0.73, confidence: 0.82 }]);
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

test("PredictionHistoryService recalculates stored confidence values during initialization", async () => {
  const storageDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "prediction-history-test-"));
  const predictionHistoryService = new PredictionHistoryService({ storageDirectoryPath, referenceDeltaReader: () => 0.04 });
  await fs.writeFile(
    path.join(storageDirectoryPath, "btc-5m.json"),
    JSON.stringify({
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
          predictedDelta: 0.02,
          confidence: 0.01,
          predictedDirection: "UP",
          modelVersion: "btc-5m-2026-03-13T18:07:48.948Z",
          actualDelta: null,
          actualDirection: null,
          isCorrect: null,
        },
      ],
    }),
    "utf8",
  );

  await predictionHistoryService.initialize();

  const history = await predictionHistoryService.loadHistory({ asset: "btc", window: "5m" });
  const modelLogit = 0.02 / (0.04 * config.CONFIDENCE_DELTA_FACTOR);
  const modelProbability = 1 / (1 + Math.exp(-modelLogit));
  const marketLogit = Math.log(0.3 / 0.7);
  const blendedLogit = Math.log(modelProbability / (1 - modelProbability)) * config.CONFIDENCE_MODEL_WEIGHT + marketLogit * config.CONFIDENCE_MARKET_WEIGHT;
  const expectedConfidence = 1 / (1 + Math.exp(-blendedLogit));

  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0]?.confidence, expectedConfidence);
});

test("PredictionHistoryService keeps recalculated confidence expressive for small reference deltas", async () => {
  const storageDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "prediction-history-test-"));
  const predictionHistoryService = new PredictionHistoryService({ storageDirectoryPath, referenceDeltaReader: () => 0.0005 });
  await fs.writeFile(
    path.join(storageDirectoryPath, "btc-5m.json"),
    JSON.stringify({
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
          upPrice: null,
          downPrice: null,
          predictedDelta: 0.001,
          confidence: 0.01,
          predictedDirection: "UP",
          modelVersion: "btc-5m-2026-03-13T18:07:48.948Z",
          actualDelta: null,
          actualDirection: null,
          isCorrect: null,
        },
      ],
    }),
    "utf8",
  );

  await predictionHistoryService.initialize();

  const history = await predictionHistoryService.loadHistory({ asset: "btc", window: "5m" });

  assert.equal(history.entries.length, 1);
  assert.ok((history.entries[0]?.confidence || 0) > 0.9);
});

test("PredictionHistoryService can skip stored confidence recalculation on startup", async () => {
  const storageDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "prediction-history-test-"));
  const previousToggle = config.SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP;
  const predictionHistoryService = new PredictionHistoryService({ storageDirectoryPath, referenceDeltaReader: () => 0.04 });
  await fs.writeFile(
    path.join(storageDirectoryPath, "btc-5m.json"),
    JSON.stringify({
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
          predictedDelta: 0.02,
          confidence: 0.01,
          predictedDirection: "UP",
          modelVersion: "btc-5m-2026-03-13T18:07:48.948Z",
          actualDelta: null,
          actualDirection: null,
          isCorrect: null,
        },
      ],
    }),
    "utf8",
  );

  (config as { SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP: boolean }).SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP = false;

  try {
    await predictionHistoryService.initialize();
  } finally {
    (config as { SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP: boolean }).SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP = previousToggle;
  }

  const history = await predictionHistoryService.loadHistory({ asset: "btc", window: "5m" });

  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0]?.confidence, 0.01);
});

function buildMarketInput(options?: { upPrice?: number | null; downPrice?: number | null }): PredictionMarketInput {
  const upPrice = options?.upPrice === undefined ? 0.59 : options.upPrice;
  const downPrice = options?.downPrice === undefined ? 0.41 : options.downPrice;
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
      buildPredictionSnapshot("2026-03-13T00:04:00.000Z", upPrice, downPrice, 100.82, 100.8, 100.75, 100.78, 100.76),
    ],
  };
}

function buildLivePredictionSnapshot(generatedAtIso: string, upPrice: number, downPrice: number): PredictionMarketInput["snapshots"][number] {
  const livePredictionSnapshot = { ...buildBaseLivePredictionSnapshot(generatedAtIso), upPrice, downPrice };
  return livePredictionSnapshot;
}

function buildBaseLivePredictionSnapshot(generatedAtIso: string): PredictionMarketInput["snapshots"][number] {
  const livePredictionSnapshot: PredictionMarketInput["snapshots"][number] = {
    asset: "btc", window: "5m", generatedAt: Date.parse(generatedAtIso),
    marketId: null, marketSlug: "btc-updown-5m-1773425100", marketConditionId: null,
    marketStart: "2026-03-13T18:05:00.000Z", marketEnd: "2026-03-13T18:10:00.000Z", priceToBeat: 71000,
    upAssetId: null, upPrice: null, upOrderBook: null, upEventTs: null,
    downAssetId: null, downPrice: null, downOrderBook: null, downEventTs: null,
    binancePrice: null, binanceOrderBook: null, binanceEventTs: null,
    coinbasePrice: null, coinbaseOrderBook: null, coinbaseEventTs: null,
    krakenPrice: null, krakenOrderBook: null, krakenEventTs: null,
    okxPrice: null, okxOrderBook: null, okxEventTs: null,
    chainlinkPrice: null, chainlinkOrderBook: null, chainlinkEventTs: null,
  };
  return livePredictionSnapshot;
}

function buildLivePredictionStatePayload(): Awaited<ReturnType<ConstructorParameters<typeof LivePredictionService>[0]["collectorClientService"]["loadState"]>> {
  const statePayload: Awaited<ReturnType<ConstructorParameters<typeof LivePredictionService>[0]["collectorClientService"]["loadState"]>> = {
    generatedAt: "2026-03-13T18:09:31.000Z",
    markets: [
      {
        asset: "btc",
        window: "5m",
        market: {
          slug: "btc-updown-5m-1773425100",
          asset: "btc",
          window: "5m",
          priceToBeat: 71000,
          prevPriceToBeat: [70950],
          marketStart: "2026-03-13T18:05:00.000Z",
          marketEnd: "2026-03-13T18:10:00.000Z",
        },
        snapshotCount: 3,
        latestSnapshot: { ...buildLivePredictionSnapshot("2026-03-13T18:09:30.000Z", 0.12, 0.88), chainlinkPrice: 70980 },
      },
    ],
  };
  return statePayload;
}

function buildLivePredictionMarketPayload(): Awaited<ReturnType<ConstructorParameters<typeof LivePredictionService>[0]["collectorClientService"]["loadMarketSnapshots"]>> {
  const marketPayload: Awaited<ReturnType<ConstructorParameters<typeof LivePredictionService>[0]["collectorClientService"]["loadMarketSnapshots"]>> = {
    slug: "btc-updown-5m-1773425100",
    asset: "btc",
    window: "5m",
    marketStart: "2026-03-13T18:05:00.000Z",
    marketEnd: "2026-03-13T18:10:00.000Z",
    snapshots: [
      buildLivePredictionSnapshot("2026-03-13T18:07:30.000Z", 0.41, 0.59),
      buildLivePredictionSnapshot("2026-03-13T18:08:45.000Z", 0.27, 0.73),
      buildLivePredictionSnapshot("2026-03-13T18:09:30.000Z", 0.12, 0.88),
    ],
  };
  return marketPayload;
}

function buildPredictionSnapshot(
  generatedAtIso: string,
  upPrice: number | null,
  downPrice: number | null,
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
    upOrderBook: upPrice === null ? null : { bids: [{ price: upPrice - 0.01, size: 1 }], asks: [{ price: upPrice + 0.01, size: 1 }] },
    upEventTs: null,
    downAssetId: null,
    downPrice,
    downOrderBook: downPrice === null ? null : { bids: [{ price: downPrice - 0.01, size: 1 }], asks: [{ price: downPrice + 0.01, size: 1 }] },
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
