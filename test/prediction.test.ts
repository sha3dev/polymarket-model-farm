import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import config from "../src/config.ts";
import { PredictionHistoryService } from "../src/history/index.ts";
import type { PredictionHistoryEntry } from "../src/history/index.ts";
import { ModelRegistryService } from "../src/model/index.ts";
import { LivePredictionService, PredictionOpportunityService, PredictionService } from "../src/prediction/index.ts";
import type { PredictionItem, PredictionMarketInput } from "../src/prediction/index.ts";

type PredictionServiceOptions = ConstructorParameters<typeof PredictionService>[0];
type LivePredictionServiceOptions = ConstructorParameters<typeof LivePredictionService>[0];
type CollectorStatePayload = Awaited<ReturnType<LivePredictionServiceOptions["collectorClientService"]["loadState"]>>;
type MarketSnapshotPayload = Awaited<ReturnType<LivePredictionServiceOptions["collectorClientService"]["loadMarketSnapshots"]>>;
type MutableConfig = { SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP: boolean };

const BASE_LIVE_SNAPSHOT = {
  asset: "btc" as const,
  window: "5m" as const,
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
};

const BASE_PREDICTION_SNAPSHOT = {
  asset: "btc" as const,
  window: "5m" as const,
  marketId: null,
  marketSlug: "btc-5m-test",
  marketConditionId: null,
  marketStart: "2026-03-13T00:00:00.000Z",
  marketEnd: "2026-03-13T00:05:00.000Z",
  priceToBeat: 100,
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
};

test("config defaults the live opportunity guards", () => {
  assert.equal(config.CONFIDENCE_MODEL_WEIGHT, 1);
  assert.equal(config.CONFIDENCE_MARKET_WEIGHT, 1);
  assert.equal(config.MAX_MODEL_MARKET_DISAGREEMENT, 0.25);
  assert.equal(config.MIN_VALID_ENTRY_PRICE, 0.4);
  assert.equal(config.MAX_VALID_ENTRY_PRICE, 0.8);
  assert.equal(config.MIN_VALID_PREDICTION_CONFIDENCE, 0.75);
  assert.equal(config.MIN_OPPORTUNITY_PROGRESS, 0.7);
  assert.equal(config.MAX_OPPORTUNITY_PROGRESS, 0.92);
  assert.equal(config.MIN_PROGRESS_DELTA_FOR_REEVAL, 0.02);
  assert.equal(config.MIN_PRICE_DELTA_FOR_REEVAL, 0.03);
  assert.equal(config.MIN_PREDICTION_EDGE, 0.08);
  assert.equal(config.MIN_OPPORTUNITY_SCORE, 0.18);
  assert.equal(config.MIN_RESOLVED_PREDICTIONS_FOR_HIT_RATE_GATING, 20);
  assert.equal(config.MIN_VALID_HIT_RATE_FOR_EXECUTION, 75);
});

test("PredictionService builds a blended confidence instead of trusting the model alone", async () => {
  const predictionService = buildPredictionService({ predict: async () => 0.05, recentReferenceDelta: 0.0005 });

  const prediction = await predictionService.buildPrediction(buildMarketInput({ upPrice: 0.1, downPrice: 0.9 }));

  assert.equal(prediction.predictedDirection, "UP");
  assert.ok(prediction.predictedDelta > 0);
  assert.ok(prediction.modelConfidence > prediction.confidence);
  assert.ok(prediction.confidence > 0.5);
});

test("PredictionService rejects markets without enough training history or price-to-beat history", async () => {
  const predictionService = buildPredictionService({ predict: async () => 0.2, recentReferenceDelta: 0.003, trainedMarketCount: 99 });

  await assert.rejects(async () => predictionService.buildPrediction(buildMarketInput()), /at least 100 trained markets/);
  await assert.rejects(async () => predictionService.buildPrediction({ ...buildMarketInput(), prevPriceToBeat: [] }), /prevPriceToBeat/);
});

test("PredictionOpportunityService keeps only predictions that fit the market guards", () => {
  const predictionOpportunityService = PredictionOpportunityService.createDefault();
  const basePrediction = buildPredictionItem();
  const validSnapshot = buildLivePredictionSnapshot("2026-03-13T18:09:30.000Z", 0.48, 0.52);
  const disagreementPrediction = { ...basePrediction, modelConfidence: 0.95 };
  const expensiveSnapshot = buildLivePredictionSnapshot("2026-03-13T18:09:30.000Z", 0.19, 0.81);

  assert.equal(predictionOpportunityService.shouldAcceptPrediction(basePrediction, validSnapshot), true);
  assert.equal(predictionOpportunityService.shouldAcceptPrediction(disagreementPrediction, validSnapshot), false);
  assert.equal(predictionOpportunityService.shouldAcceptPrediction(basePrediction, expensiveSnapshot), false);
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

test("LivePredictionService keeps predictions in shadow until the slot has enough resolved history", async () => {
  const recordedEntries: PredictionHistoryEntry[] = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: { loadState: async () => buildLivePredictionStatePayload(), loadMarketSnapshots: async () => buildLivePredictionMarketPayload() } as unknown as
      LivePredictionServiceOptions["collectorClientService"],
    predictionService: { buildPrediction: async () => buildPredictionItem() } as unknown as LivePredictionServiceOptions["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async (_pair: { asset: string; window: string }, entry: PredictionHistoryEntry) => {
        recordedEntries.push(entry);
      },
      loadHistory: async () => ({ entries: [] }),
      resolvePrediction: async () => {},
    } as unknown as LivePredictionServiceOptions["predictionHistoryService"],
    now: () => "2026-03-13T18:09:31.000Z",
  });

  await livePredictionService.refreshOnce();

  assert.equal(recordedEntries.length, 1);
  assert.equal(recordedEntries[0]?.isExecuted, false);
  assert.equal(recordedEntries[0]?.skipReason, "low_hit_rate");
  assert.equal(recordedEntries[0]?.confidence, 0.82);
  assert.equal(recordedEntries[0]?.downPrice, 0.52);
});

test("LivePredictionService records an executed prediction once the slot clears hit-rate gating", async () => {
  const recordedEntries: PredictionHistoryEntry[] = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: { loadState: async () => buildLivePredictionStatePayload(), loadMarketSnapshots: async () => buildLivePredictionMarketPayload() } as unknown as
      LivePredictionServiceOptions["collectorClientService"],
    predictionService: { buildPrediction: async () => buildPredictionItem() } as unknown as LivePredictionServiceOptions["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async (_pair: { asset: string; window: string }, entry: PredictionHistoryEntry) => {
        recordedEntries.push(entry);
      },
      loadHistory: async (pair: { asset: string; window: string }) => {
        let entries: PredictionHistoryEntry[] = [];
        if (pair.window === "5m" && pair.asset === "btc") {
          entries = buildResolvedHistoryEntries("btc", "5m", 20, 16);
        }
        if (pair.window === "5m" && pair.asset === "eth") {
          entries = buildResolvedHistoryEntries("eth", "5m", 20, 12);
        }
        return { entries };
      },
      resolvePrediction: async () => {},
    } as unknown as LivePredictionServiceOptions["predictionHistoryService"],
    now: () => "2026-03-13T18:09:31.000Z",
  });

  await livePredictionService.refreshOnce();

  assert.equal(recordedEntries.length, 1);
  assert.equal(recordedEntries[0]?.isExecuted, true);
  assert.equal(recordedEntries[0]?.skipReason, null);
});

test("LivePredictionService keeps shadow predictions for low-hit-rate slots", async () => {
  const recordedEntries: PredictionHistoryEntry[] = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: { loadState: async () => buildLivePredictionStatePayload(), loadMarketSnapshots: async () => buildLivePredictionMarketPayload() } as unknown as
      LivePredictionServiceOptions["collectorClientService"],
    predictionService: { buildPrediction: async () => buildPredictionItem() } as unknown as LivePredictionServiceOptions["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async (_pair: { asset: string; window: string }, entry: PredictionHistoryEntry) => {
        recordedEntries.push(entry);
      },
      loadHistory: async (pair: { asset: string; window: string }) => {
        let entries: PredictionHistoryEntry[] = [];
        if (pair.window === "5m" && pair.asset === "btc") {
          entries = buildResolvedHistoryEntries("btc", "5m", 20, 8);
        }
        if (pair.window === "5m" && pair.asset === "eth") {
          entries = buildResolvedHistoryEntries("eth", "5m", 20, 15);
        }
        return { entries };
      },
      resolvePrediction: async () => {},
    } as unknown as LivePredictionServiceOptions["predictionHistoryService"],
    now: () => "2026-03-13T18:09:31.000Z",
  });

  await livePredictionService.refreshOnce();

  assert.equal(recordedEntries.length, 1);
  assert.equal(recordedEntries[0]?.isExecuted, false);
  assert.equal(recordedEntries[0]?.skipReason, "low_hit_rate");
});

test("LivePredictionService keeps shadow predictions when the slot leads its window but stays below 75% hit rate", async () => {
  const recordedEntries: PredictionHistoryEntry[] = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: { loadState: async () => buildLivePredictionStatePayload(), loadMarketSnapshots: async () => buildLivePredictionMarketPayload() } as unknown as
      LivePredictionServiceOptions["collectorClientService"],
    predictionService: { buildPrediction: async () => buildPredictionItem() } as unknown as LivePredictionServiceOptions["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async (_pair: { asset: string; window: string }, entry: PredictionHistoryEntry) => {
        recordedEntries.push(entry);
      },
      loadHistory: async (pair: { asset: string; window: string }) => {
        let entries: PredictionHistoryEntry[] = [];
        if (pair.window === "5m" && pair.asset === "btc") {
          entries = buildResolvedHistoryEntries("btc", "5m", 20, 14);
        }
        if (pair.window === "5m" && pair.asset === "eth") {
          entries = buildResolvedHistoryEntries("eth", "5m", 20, 12);
        }
        return { entries };
      },
      resolvePrediction: async () => {},
    } as unknown as LivePredictionServiceOptions["predictionHistoryService"],
    now: () => "2026-03-13T18:09:31.000Z",
  });

  await livePredictionService.refreshOnce();

  assert.equal(recordedEntries.length, 1);
  assert.equal(recordedEntries[0]?.isExecuted, false);
  assert.equal(recordedEntries[0]?.skipReason, "low_hit_rate");
});

test("LivePredictionService avoids repeated inference when the live market barely changes", async () => {
  let buildPredictionCallCount = 0;
  let latestGeneratedAtIso = "2026-03-13T18:09:30.000Z";
  const livePredictionService = new LivePredictionService({
    collectorClientService: {
      loadState: async () => buildLivePredictionStatePayload(latestGeneratedAtIso, 0.48, 0.52),
      loadMarketSnapshots: async () => buildLivePredictionMarketPayload(latestGeneratedAtIso, 0.48, 0.52),
    } as unknown as LivePredictionServiceOptions["collectorClientService"],
    predictionService: { buildPrediction: async () => recordPredictionCall(buildPredictionCallCount += 1) } as unknown as LivePredictionServiceOptions["predictionService"],
    predictionHistoryService: { getLatestPrediction: async () => null, recordPrediction: async () => {}, loadHistory: async () => ({ entries: [] }), resolvePrediction: async () => {} } as unknown as
      LivePredictionServiceOptions["predictionHistoryService"],
    now: () => "2026-03-13T18:09:31.000Z",
  });

  await livePredictionService.refreshOnce();
  latestGeneratedAtIso = "2026-03-13T18:09:35.000Z";
  await livePredictionService.refreshOnce();

  assert.equal(buildPredictionCallCount, 1);
});

test("LivePredictionService resolves closed predictions from final up/down prices", async () => {
  const resolvedEntries: Array<{ slug: string; actualDelta: number }> = [];
  const livePredictionService = new LivePredictionService({
    collectorClientService: {
      loadState: async () => ({ generatedAt: "2026-03-13T18:10:30.000Z", markets: [] }),
      loadMarketSnapshots: async () => buildResolutionMarketPayload(0.73, 0.21),
    } as unknown as LivePredictionServiceOptions["collectorClientService"],
    predictionService: { buildPrediction: async () => { throw new Error("not expected"); } } as unknown as LivePredictionServiceOptions["predictionService"],
    predictionHistoryService: {
      getLatestPrediction: async () => null,
      recordPrediction: async () => {},
      loadHistory: async (pair: { asset: string; window: string }) => {
        const entries = pair.asset === "btc" && pair.window === "5m" ? [buildUnresolvedHistoryEntry()] : [];
        return { entries };
      },
      resolvePrediction: async (_pair: { asset: string; window: string }, slug: string, actualDelta: number) => {
        resolvedEntries.push({ slug, actualDelta });
      },
    } as unknown as LivePredictionServiceOptions["predictionHistoryService"],
    now: () => "2026-03-13T18:10:30.000Z",
  });

  await livePredictionService.refreshOnce();

  assert.deepEqual(resolvedEntries, [{ slug: "btc-updown-5m-1773425100", actualDelta: 0.52 }]);
});

test("PredictionHistoryService recalculates stored confidence when enabled and leaves it intact when disabled", async () => {
  const enabledDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "prediction-history-enabled-"));
  const disabledDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "prediction-history-disabled-"));
  await writeHistoryFixture(enabledDirectoryPath, 0.01);
  await writeHistoryFixture(disabledDirectoryPath, 0.01);
  const previousToggle = config.SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP;

  try {
    (config as MutableConfig).SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP = true;
    const enabledService = new PredictionHistoryService({ storageDirectoryPath: enabledDirectoryPath, referenceDeltaReader: () => 0.04 });
    await enabledService.initialize();

    (config as MutableConfig).SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP = false;
    const disabledService = new PredictionHistoryService({ storageDirectoryPath: disabledDirectoryPath, referenceDeltaReader: () => 0.04 });
    await disabledService.initialize();

    const enabledHistory = await enabledService.loadHistory({ asset: "btc", window: "5m" });
    const disabledHistory = await disabledService.loadHistory({ asset: "btc", window: "5m" });

    assert.ok((enabledHistory.entries[0]?.confidence || 0) > 0.01);
    assert.equal(disabledHistory.entries[0]?.confidence, 0.01);
  } finally {
    (config as MutableConfig).SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP = previousToggle;
  }
});

function buildPredictionService(options?: {
  predict?: () => Promise<number>;
  recentReferenceDelta?: number;
  trainedMarketCount?: number;
}): PredictionService {
  const predictionServiceOptions: PredictionServiceOptions = {
    modelRegistryService: {
      predict: options?.predict || (async () => 0.5),
      getPredictionContext: () => ({
        metadata: null,
        trainedMarketCount: options?.trainedMarketCount ?? 120,
        modelVersion: "model-v1",
        hasCheckpoint: true,
        recentReferenceDelta: options?.recentReferenceDelta ?? 0.004,
      }),
    } as unknown as PredictionServiceOptions["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["progress"], rows: [[0.5]], maxSequenceLength: 600 }) } as unknown as
      PredictionServiceOptions["marketFeatureProjectorService"],
    now: () => "2026-03-13T00:00:00.000Z",
  };
  return new PredictionService(predictionServiceOptions);
}

function buildPredictionItem(overrides?: Partial<PredictionItem>): PredictionItem {
  return {
    slug: "btc-updown-5m-1773425100",
    asset: "btc",
    window: "5m",
    snapshotCount: 3,
    progress: 0.9,
    modelConfidence: 0.7,
    confidence: 0.82,
    predictedDelta: -0.01,
    predictedDirection: "DOWN",
    observedPrice: 70990,
    modelVersion: "model-v1",
    trainedMarketCount: 200,
    generatedAt: "2026-03-13T18:09:30.000Z",
    ...overrides,
  };
}

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

function buildResolvedHistoryEntries(asset: string, window: string, resolvedPredictionCount: number, correctPredictionCount: number): PredictionHistoryEntry[] {
  const entries: PredictionHistoryEntry[] = [];
  for (let index = 0; index < resolvedPredictionCount; index += 1) {
    const isCorrect = index < correctPredictionCount;
    entries.push({
      slug: `${asset}-${window}-${index}`,
      asset: asset as PredictionHistoryEntry["asset"],
      window: window as PredictionHistoryEntry["window"],
      marketStart: "2026-03-13T18:05:00.000Z",
      marketEnd: "2026-03-13T18:10:00.000Z",
      predictionMadeAt: "2026-03-13T18:08:51.626Z",
      progressWhenPredicted: 0.8,
      observedPrice: 71038.28,
      upPrice: 0.48,
      downPrice: 0.52,
      predictedDelta: isCorrect ? -0.01 : 0.01,
      confidence: 0.8,
      predictedDirection: isCorrect ? "DOWN" : "UP",
      modelVersion: `${asset}-${window}-model`,
      isExecuted: true,
      skipReason: null,
      actualDelta: -0.02,
      actualDirection: "DOWN",
      isCorrect,
    });
  }
  return entries;
}

function buildUnresolvedHistoryEntry(): PredictionHistoryEntry {
  return {
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
    isExecuted: true,
    skipReason: null,
    actualDelta: null,
    actualDirection: null,
    isCorrect: null,
  };
}

function buildLivePredictionStatePayload(latestGeneratedAtIso = "2026-03-13T18:09:30.000Z", upPrice = 0.48, downPrice = 0.52): CollectorStatePayload {
  return {
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
        latestSnapshot: { ...buildLivePredictionSnapshot(latestGeneratedAtIso, upPrice, downPrice), chainlinkPrice: 70980 },
      },
    ],
  };
}

function buildLivePredictionMarketPayload(latestGeneratedAtIso = "2026-03-13T18:09:30.000Z", latestUpPrice = 0.48, latestDownPrice = 0.52): MarketSnapshotPayload {
  return {
    slug: "btc-updown-5m-1773425100",
    asset: "btc",
    window: "5m",
    marketStart: "2026-03-13T18:05:00.000Z",
    marketEnd: "2026-03-13T18:10:00.000Z",
    snapshots: [
      buildLivePredictionSnapshot("2026-03-13T18:07:30.000Z", 0.41, 0.59),
      buildLivePredictionSnapshot("2026-03-13T18:08:45.000Z", 0.44, 0.56),
      buildLivePredictionSnapshot(latestGeneratedAtIso, latestUpPrice, latestDownPrice),
    ],
  };
}

function buildResolutionMarketPayload(upPrice: number | null, downPrice: number | null): MarketSnapshotPayload {
  return {
    slug: "btc-updown-5m-1773425100",
    asset: "btc",
    window: "5m",
    marketStart: "2026-03-13T18:05:00.000Z",
    marketEnd: "2026-03-13T18:10:00.000Z",
    snapshots: [{ ...buildLivePredictionSnapshot("2026-03-13T18:10:00.000Z", 0.5, 0.5), upPrice, downPrice }],
  };
}

function buildLivePredictionSnapshot(generatedAtIso: string, upPrice: number, downPrice: number): PredictionMarketInput["snapshots"][number] {
  return { ...buildBaseLivePredictionSnapshot(generatedAtIso), upPrice, downPrice };
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
  return {
    ...buildBasePredictionSnapshot(generatedAtIso),
    upPrice,
    upOrderBook: buildPolymarketOrderBook(upPrice),
    downPrice,
    downOrderBook: buildPolymarketOrderBook(downPrice),
    binancePrice,
    binanceOrderBook: buildProviderOrderBook("binance", binancePrice),
    coinbasePrice,
    coinbaseOrderBook: buildProviderOrderBook("coinbase", coinbasePrice),
    krakenPrice,
    krakenOrderBook: buildProviderOrderBook("kraken", krakenPrice),
    okxPrice,
    okxOrderBook: buildProviderOrderBook("okx", okxPrice),
    chainlinkPrice,
    chainlinkOrderBook: buildProviderOrderBook("chainlink", chainlinkPrice),
  };
}

function buildBaseLivePredictionSnapshot(generatedAtIso: string): PredictionMarketInput["snapshots"][number] {
  return { ...BASE_LIVE_SNAPSHOT, generatedAt: Date.parse(generatedAtIso) };
}

function buildBasePredictionSnapshot(generatedAtIso: string): PredictionMarketInput["snapshots"][number] {
  return { ...BASE_PREDICTION_SNAPSHOT, generatedAt: Date.parse(generatedAtIso) };
}

function buildProviderOrderBook(provider: string, price: number): NonNullable<PredictionMarketInput["snapshots"][number]["binanceOrderBook"]> {
  return { type: "orderbook", provider, symbol: "btc", ts: 1, bids: [{ price, size: 1 }], asks: [{ price: price + 0.1, size: 1 }] };
}

function buildPolymarketOrderBook(price: number | null): NonNullable<PredictionMarketInput["snapshots"][number]["upOrderBook"]> | null {
  return price === null ? null : { bids: [{ price: price - 0.01, size: 1 }], asks: [{ price: price + 0.01, size: 1 }] };
}

async function recordPredictionCall(_: number): Promise<PredictionItem> {
  return buildPredictionItem();
}

async function writeHistoryFixture(storageDirectoryPath: string, confidence: number): Promise<void> {
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
          confidence,
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
}
