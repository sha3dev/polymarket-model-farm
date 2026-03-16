import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { Snapshot } from "../src/collector/index.ts";
import { MarketFeatureProjectorService } from "../src/feature/index.ts";

const PROJECTOR_SERVICE = MarketFeatureProjectorService.createDefault();

test("MarketFeatureProjectorService builds the intended 32-feature row", () => {
  const projection = PROJECTOR_SERVICE.projectSequence({
    asset: "btc",
    window: "5m",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:05:00.000Z",
    priceToBeat: 100,
    snapshots: [buildSnapshot(0, 100.1), buildSnapshot(10_000, 100.8)],
  });
  const labels = PROJECTOR_SERVICE.getFeatureLabels();

  assert.equal(labels.length, 32);
  assert.equal(projection.rows.length, 60);
  assert.equal(projection.rows[0]?.length, 32);
  assert.equal(labels.includes("binance-obi"), true);
  assert.equal(labels.includes("coinbase-relative-spread"), true);
  assert.equal(labels.includes("kraken-depth-ratio"), true);
  assert.equal(labels.includes("time-remaining-norm"), true);
  assert.equal(labels.includes("price-to-beat"), false);
  assert.equal(labels.includes("chainlink-vs-exchange-median"), false);
  assert.equal(labels.includes("up-price"), false);
  assert.ok(projection.rows.flat().every((value) => Number.isFinite(value)));
});

test("MarketFeatureProjectorService bounds resampled sequence length by market window", () => {
  const fiveMinuteProjection = PROJECTOR_SERVICE.projectSequence({
    asset: "btc",
    window: "5m",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:05:00.000Z",
    priceToBeat: 100,
    snapshots: buildSnapshots("5m", 100),
  });
  const fifteenMinuteProjection = PROJECTOR_SERVICE.projectSequence({
    asset: "btc",
    window: "15m",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:15:00.000Z",
    priceToBeat: 100,
    snapshots: buildSnapshots("15m", 220),
  });

  assert.equal(fiveMinuteProjection.maxSequenceLength, 60);
  assert.equal(fiveMinuteProjection.rows.length, 60);
  assert.equal(fifteenMinuteProjection.maxSequenceLength, 90);
  assert.equal(fifteenMinuteProjection.rows.length, 90);
});

function buildSnapshots(window: "5m" | "15m", count: number): Snapshot[] {
  const snapshots: Snapshot[] = [];
  for (let index = 0; index < count; index += 1) {
    snapshots.push(buildSnapshot(index * 5_000, 100 + index * 0.05, window));
  }
  return snapshots;
}

function buildSnapshot(offsetMs: number, chainlinkPrice: number, window: "5m" | "15m" = "5m"): Snapshot {
  const generatedAt = Date.parse("2026-03-12T00:00:00.000Z") + offsetMs;
  const exchangeFields = buildExchangeFields(generatedAt, chainlinkPrice);
  return {
    asset: "btc",
    window,
    generatedAt,
    marketId: "market-id",
    marketSlug: "btc-test",
    marketConditionId: "condition-id",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: window === "5m" ? "2026-03-12T00:05:00.000Z" : "2026-03-12T00:15:00.000Z",
    priceToBeat: 100,
    upAssetId: "up-asset",
    upPrice: 0.55,
    upOrderBook: { bids: [{ price: 0.54, size: 10 }], asks: [{ price: 0.56, size: 12 }] },
    upEventTs: generatedAt,
    downAssetId: "down-asset",
    downPrice: 0.45,
    downOrderBook: { bids: [{ price: 0.44, size: 8 }], asks: [{ price: 0.46, size: 9 }] },
    downEventTs: generatedAt,
    ...exchangeFields,
  };
}

function buildProviderOrderBook(provider: string, generatedAt: number, price: number): NonNullable<Snapshot["binanceOrderBook"]> {
  return { type: "orderbook", provider, symbol: "btc", ts: generatedAt, bids: [{ price: price - 0.03, size: 5 }], asks: [{ price: price + 0.03, size: 6 }] };
}

function buildExchangeFields(
  generatedAt: number,
  chainlinkPrice: number,
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
    binancePrice: chainlinkPrice + 0.1,
    binanceOrderBook: buildProviderOrderBook("binance", generatedAt, chainlinkPrice + 0.1),
    binanceEventTs: generatedAt,
    coinbasePrice: chainlinkPrice + 0.05,
    coinbaseOrderBook: buildProviderOrderBook("coinbase", generatedAt, chainlinkPrice + 0.05),
    coinbaseEventTs: generatedAt,
    krakenPrice: chainlinkPrice + 0.08,
    krakenOrderBook: buildProviderOrderBook("kraken", generatedAt, chainlinkPrice + 0.08),
    krakenEventTs: generatedAt,
    okxPrice: chainlinkPrice + 0.04,
    okxOrderBook: buildProviderOrderBook("okx", generatedAt, chainlinkPrice + 0.04),
    okxEventTs: generatedAt,
    chainlinkPrice,
    chainlinkOrderBook: buildProviderOrderBook("chainlink", generatedAt, chainlinkPrice),
    chainlinkEventTs: generatedAt,
  };
}
