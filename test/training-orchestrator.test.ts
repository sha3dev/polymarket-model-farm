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
      listMarkets: async ({ asset, window }: { asset: SupportedAsset; window: SupportedWindow }) => [
        { slug: `${asset}-${window}-market`, asset, window, priceToBeat: 100, prevPriceToBeat: [99], marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z" },
      ],
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
    marketFeatureProjectorService: { projectSequence: () => ({ labels: ["feature"], rows: [[1]], maxSequenceLength: 600 }) } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["marketFeatureProjectorService"],
    predictionHistoryService: { resolvePrediction: async () => {} } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["predictionHistoryService"],
    now: () => Date.parse("2026-03-12T01:00:00.000Z"),
  });

  await Promise.all([trainingOrchestratorService.runTrainingCycle(), trainingOrchestratorService.runTrainingCycle()]);

  assert.equal(maxConcurrentTrainCount, 1);
  assert.deepEqual(sequenceLog, [...buildExpectedOrder(), ...buildExpectedOrder()]);
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
  return [buildSnapshot(asset, window, baseTimestamp, 100.2), buildSnapshot(asset, window, baseTimestamp + 10_000, 100.7), buildSnapshot(asset, window, baseTimestamp + 20_000, 101.1)];
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
  return { type: "orderbook", provider: "binance", symbol: asset, ts: generatedAt, bids: [{ price, size: 1 }], asks: [{ price, size: 1 }] };
}

function buildExchangeFields(chainlinkPrice: number, generatedAt: number, providerOrderBook: NonNullable<Snapshot["binanceOrderBook"]>): Pick<
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
