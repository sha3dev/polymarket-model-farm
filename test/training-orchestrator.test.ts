import * as assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";

import type { Snapshot } from "@sha3/polymarket-snapshot";

import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../src/model/index.ts";
import type { SupportedAsset, SupportedWindow } from "../src/model/index.ts";
import { TrainingOrchestratorService } from "../src/training/index.ts";

const BASE_TIMESTAMP = Date.parse("2026-03-12T00:00:00.000Z");

test("TrainingOrchestratorService serializes concurrent training cycles", async () => {
  const sequenceLog: string[] = [];
  let concurrentTrainCount = 0;
  let maxConcurrentTrainCount = 0;

  const collectorClientService = {
    listMarkets: async ({ asset, window }: { asset: SupportedAsset; window: SupportedWindow }) => [
      {
        slug: `${asset}-${window}-market`,
        asset,
        window,
        priceToBeat: 100,
        prevPriceToBeat: [99],
        marketStart: "2026-03-12T00:00:00.000Z",
        marketEnd: "2026-03-12T00:05:00.000Z",
      },
    ],
    loadMarketSnapshots: async (slug: string) => {
      const [asset, window] = slug.split("-") as [SupportedAsset, SupportedWindow, string];
      const snapshots = buildSnapshots(asset, window);
      const payload = { slug, asset, window, marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z", snapshots };
      return payload;
    },
  } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["collectorClientService"];

  const modelRegistryService = {
    hasTrainedMarket: (_pair: { asset: SupportedAsset; window: SupportedWindow }, _slug: string) => false,
    train: async (pair: { asset: SupportedAsset; window: SupportedWindow }, _sequence: number[][], _boundedTarget: number) => {
      concurrentTrainCount += 1;
      maxConcurrentTrainCount = Math.max(maxConcurrentTrainCount, concurrentTrainCount);
      sequenceLog.push(`${pair.asset}-${pair.window}`);
      await wait(20);
      concurrentTrainCount -= 1;
    },
    markMarketAsTrained: async (_pair: { asset: SupportedAsset; window: SupportedWindow }, _slug: string, _trainedAt: string) => {},
    setLatestTrainingError: () => {},
  } as unknown as ConstructorParameters<typeof TrainingOrchestratorService>[0]["modelRegistryService"];

  const snapshotFeatureProjectorService = { projectSequence: () => ({ rows: [[0.1, 0.2, 0.3]] }) } as unknown as ConstructorParameters<
    typeof TrainingOrchestratorService
  >[0]["snapshotFeatureProjectorService"];
  const orchestratorNow = () => Date.parse("2026-03-12T01:00:00.000Z");
  const service = new TrainingOrchestratorService({ collectorClientService, modelRegistryService, snapshotFeatureProjectorService, now: orchestratorNow });

  await Promise.all([service.runTrainingCycle(), service.runTrainingCycle()]);

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
  return [
    buildSnapshot(asset, window, BASE_TIMESTAMP, 100.2),
    buildSnapshot(asset, window, BASE_TIMESTAMP + 10_000, 100.6),
    buildSnapshot(asset, window, BASE_TIMESTAMP + 20_000, 101.2),
  ];
}

function buildSnapshot(asset: SupportedAsset, window: SupportedWindow, generatedAt: number, chainlinkPrice: number): Snapshot {
  const baseSnapshot = buildBaseSnapshot(asset, window, generatedAt);
  const chainlinkOrderBook = buildExchangeOrderBook("chainlink", asset, generatedAt, chainlinkPrice);
  return { ...baseSnapshot, chainlinkPrice, chainlinkOrderBook, chainlinkEventTs: generatedAt };
}

function buildBaseSnapshot(
  asset: SupportedAsset,
  window: SupportedWindow,
  generatedAt: number,
): Omit<Snapshot, "chainlinkPrice" | "chainlinkOrderBook" | "chainlinkEventTs"> {
  const marketFields = buildMarketFields(asset, window, generatedAt);
  const directionalFields = buildDirectionalFields(asset, window, generatedAt);
  const exchangeFields = buildExchangeFields(asset, generatedAt);
  return { ...marketFields, ...directionalFields, ...exchangeFields };
}

function buildMarketFields(
  asset: SupportedAsset,
  window: SupportedWindow,
  generatedAt: number,
): Pick<Snapshot, "asset" | "window" | "generatedAt" | "marketId" | "marketSlug" | "marketConditionId" | "marketStart" | "marketEnd" | "priceToBeat"> {
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
  };
}

function buildDirectionalFields(
  asset: SupportedAsset,
  window: SupportedWindow,
  generatedAt: number,
): Pick<Snapshot, "upAssetId" | "upPrice" | "upOrderBook" | "upEventTs" | "downAssetId" | "downPrice" | "downOrderBook" | "downEventTs"> {
  return {
    upAssetId: `${asset}-${window}-up`,
    upPrice: 0.55,
    upOrderBook: { bids: [{ price: 0.54, size: 10 }], asks: [{ price: 0.56, size: 12 }] },
    upEventTs: generatedAt,
    downAssetId: `${asset}-${window}-down`,
    downPrice: 0.45,
    downOrderBook: { bids: [{ price: 0.44, size: 9 }], asks: [{ price: 0.46, size: 10 }] },
    downEventTs: generatedAt,
  };
}

function buildExchangeFields(
  asset: SupportedAsset,
  generatedAt: number,
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
> {
  return {
    binancePrice: 100.1,
    binanceOrderBook: buildExchangeOrderBook("binance", asset, generatedAt, 100.1),
    binanceEventTs: generatedAt,
    coinbasePrice: 100.1,
    coinbaseOrderBook: buildExchangeOrderBook("coinbase", asset, generatedAt, 100.1),
    coinbaseEventTs: generatedAt,
    krakenPrice: 100.1,
    krakenOrderBook: buildExchangeOrderBook("kraken", asset, generatedAt, 100.1),
    krakenEventTs: generatedAt,
    okxPrice: 100.1,
    okxOrderBook: buildExchangeOrderBook("okx", asset, generatedAt, 100.1),
    okxEventTs: generatedAt,
  };
}

function buildExchangeOrderBook(
  provider: "binance" | "coinbase" | "kraken" | "okx" | "chainlink",
  asset: SupportedAsset,
  generatedAt: number,
  price: number,
): Snapshot["binanceOrderBook"] {
  return { type: "orderbook", provider, symbol: asset, ts: generatedAt, bids: [{ price, size: 1 }], asks: [{ price, size: 1 }] };
}
