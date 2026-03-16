import * as assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";

import type { Snapshot, SupportedAsset, SupportedWindow } from "../src/collector/index.ts";
import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../src/collector/index.ts";
import { TrainingOrchestratorService } from "../src/training/index.ts";

test("TrainingOrchestratorService serializes concurrent cycles across all pairs", async () => {
  const sequenceLog: string[] = [];
  let concurrentTrainCount = 0;
  let maxConcurrentTrainCount = 0;

  const trainingOrchestratorService = new TrainingOrchestratorService({
    collectorClientService: {
      listMarkets: async ({ asset, window }: { asset: SupportedAsset; window: SupportedWindow }) => [{ slug: `${asset}-${window}-market`, asset, window, priceToBeat: 100, marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z" }],
      loadMarketSnapshots: async (slug: string) => {
        const [asset, window] = slug.split("-") as [SupportedAsset, SupportedWindow, string];
        return { slug, asset, window, marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z", snapshots: buildSnapshots(asset, window) };
      },
    } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["collectorClientService"],
    modelRegistryService: {
      hasTrainedMarket: () => false,
      train: async (pair: { asset: SupportedAsset; window: SupportedWindow }) => {
        concurrentTrainCount += 1;
        maxConcurrentTrainCount = Math.max(maxConcurrentTrainCount, concurrentTrainCount);
        sequenceLog.push(`${pair.asset}-${pair.window}`);
        await wait(10);
        concurrentTrainCount -= 1;
      },
      markMarketAsTrained: async () => {},
      setLatestTrainingError: () => {},
    } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["feature"], rows: [[1]], maxSequenceLength: 60 }) } as unknown as ConstructorParameters<
      typeof TrainingOrchestratorService
    >[0]["marketFeatureProjectorService"],
    now: () => Date.parse("2026-03-12T01:00:00.000Z"),
  });

  await Promise.all([trainingOrchestratorService.runTrainingCycle(), trainingOrchestratorService.runTrainingCycle()]);

  assert.equal(maxConcurrentTrainCount, 1);
  assert.deepEqual(sequenceLog, [...buildExpectedOrder(), ...buildExpectedOrder()]);
});

test("TrainingOrchestratorService only loads the maximum number of trainable markets per cycle", async () => {
  const loadedSlugs: string[] = [];
  const trainingOrchestratorService = new TrainingOrchestratorService({
    collectorClientService: {
      listMarkets: async ({ asset, window }: { asset: SupportedAsset; window: SupportedWindow }) => [
        { slug: `${asset}-${window}-market-a`, asset, window, priceToBeat: 100, marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z" },
        { slug: `${asset}-${window}-market-b`, asset, window, priceToBeat: 100, marketStart: "2026-03-12T00:10:00.000Z", marketEnd: "2026-03-12T00:15:00.000Z" },
      ],
      loadMarketSnapshots: async (slug: string) => {
        loadedSlugs.push(slug);
        const [asset, window] = slug.split("-") as [SupportedAsset, SupportedWindow, string];
        return { slug, asset, window, marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z", snapshots: buildSnapshots(asset, window) };
      },
    } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["collectorClientService"],
    modelRegistryService: { hasTrainedMarket: () => false, train: async () => {}, markMarketAsTrained: async () => {}, setLatestTrainingError: () => {} } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["feature"], rows: [[1]], maxSequenceLength: 60 }) } as unknown as ConstructorParameters<
      typeof TrainingOrchestratorService
    >[0]["marketFeatureProjectorService"],
    now: () => Date.parse("2026-03-12T01:00:00.000Z"),
  });

  await trainingOrchestratorService.runTrainingCycle();

  assert.equal(loadedSlugs.length, SUPPORTED_ASSETS.length * SUPPORTED_WINDOWS.length);
  assert.ok(loadedSlugs.every((slug) => slug.endsWith("market-a")));
});

test("TrainingOrchestratorService trains on a strike-relative log return", async () => {
  let trainedTargetValue = 0;
  let markedTargetValue = 0;
  const trainingOrchestratorService = new TrainingOrchestratorService({
    collectorClientService: {
      listMarkets: async () => [{ slug: "btc-5m-market", asset: "btc", window: "5m", priceToBeat: 100, marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z" }],
      loadMarketSnapshots: async () => ({
        slug: "btc-5m-market",
        asset: "btc",
        window: "5m",
        marketStart: "2026-03-12T00:00:00.000Z",
        marketEnd: "2026-03-12T00:05:00.000Z",
        snapshots: [buildSnapshot("btc", "5m", Date.parse("2026-03-12T00:00:00.000Z"), 101.2)],
      }),
    } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["collectorClientService"],
    modelRegistryService: {
      hasTrainedMarket: () => false,
      train: async (_pair: { asset: SupportedAsset; window: SupportedWindow }, _sequence: number[][], targetValue: number) => {
        trainedTargetValue = targetValue;
      },
      markMarketAsTrained: async (_pair: { asset: SupportedAsset; window: SupportedWindow }, _slug: string, _trainedAt: string, targetValue: number) => {
        markedTargetValue = targetValue;
      },
      setLatestTrainingError: () => {},
    } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["modelRegistryService"],
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["feature"], rows: [[1]], maxSequenceLength: 60 }) } as unknown as ConstructorParameters<
      typeof TrainingOrchestratorService
    >[0]["marketFeatureProjectorService"],
    now: () => Date.parse("2026-03-12T01:00:00.000Z"),
  });

  await trainingOrchestratorService.runTrainingCycle();

  assert.ok(Math.abs(trainedTargetValue - Math.log(101.2 / 100)) < 0.0000001);
  assert.equal(trainedTargetValue, markedTargetValue);
});

function buildExpectedOrder(): string[] {
  const expectedOrder: string[] = [];
  for (const asset of SUPPORTED_ASSETS) {
    for (const window of SUPPORTED_WINDOWS) {
      expectedOrder.push(`${asset}-${window}`);
    }
  }
  return expectedOrder;
}

function buildSnapshots(asset: SupportedAsset, window: SupportedWindow): Snapshot[] {
  const baseTimestamp = Date.parse("2026-03-12T00:00:00.000Z");
  return [
    buildSnapshot(asset, window, baseTimestamp, 100.2),
    buildSnapshot(asset, window, baseTimestamp + 10_000, 100.7),
    buildSnapshot(asset, window, baseTimestamp + 20_000, 101.1),
  ];
}

function buildSnapshot(asset: SupportedAsset, window: SupportedWindow, generatedAt: number, chainlinkPrice: number): Snapshot {
  const providerOrderBook = buildProviderOrderBook(asset, generatedAt, chainlinkPrice);
  const exchangeFields = buildExchangeFields(chainlinkPrice, generatedAt, providerOrderBook);
  return {
    asset,
    window,
    generatedAt,
    marketId: `${asset}-${window}-market-id`,
    marketSlug: `${asset}-${window}-market`,
    marketConditionId: `${asset}-${window}-condition-id`,
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:05:00.000Z",
    priceToBeat: 100,
    upAssetId: "up",
    upPrice: 0.55,
    upOrderBook: { bids: [{ price: 0.54, size: 1 }], asks: [{ price: 0.56, size: 1 }] },
    upEventTs: generatedAt,
    downAssetId: "down",
    downPrice: 0.45,
    downOrderBook: { bids: [{ price: 0.44, size: 1 }], asks: [{ price: 0.46, size: 1 }] },
    downEventTs: generatedAt,
    ...exchangeFields,
  };
}

function buildProviderOrderBook(asset: SupportedAsset, generatedAt: number, price: number): NonNullable<Snapshot["binanceOrderBook"]> {
  return { type: "orderbook", provider: "binance", symbol: asset, ts: generatedAt, bids: [{ price: price - 0.02, size: 1 }], asks: [{ price: price + 0.02, size: 1 }] };
}

function buildExchangeFields(
  chainlinkPrice: number,
  generatedAt: number,
  providerOrderBook: NonNullable<Snapshot["binanceOrderBook"]>,
): Pick<
  Snapshot,
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
    binancePrice: chainlinkPrice,
    binanceOrderBook: { ...providerOrderBook, provider: "binance" },
    binanceEventTs: generatedAt,
    coinbasePrice: chainlinkPrice,
    coinbaseOrderBook: { ...providerOrderBook, provider: "coinbase" },
    coinbaseEventTs: generatedAt,
    krakenPrice: chainlinkPrice,
    krakenOrderBook: { ...providerOrderBook, provider: "kraken" },
    krakenEventTs: generatedAt,
    okxPrice: chainlinkPrice,
    okxOrderBook: { ...providerOrderBook, provider: "okx" },
    okxEventTs: generatedAt,
    chainlinkPrice,
    chainlinkOrderBook: { ...providerOrderBook, provider: "chainlink" },
    chainlinkEventTs: generatedAt,
  };
}
