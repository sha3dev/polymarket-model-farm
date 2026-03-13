import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { Snapshot } from "../src/collector/index.ts";
import { MarketFeatureProjectorService } from "../src/feature/index.ts";

const PROJECTOR_SERVICE = MarketFeatureProjectorService.createDefault();

test("MarketFeatureProjectorService builds the intended 89-feature row", () => {
  const projection = PROJECTOR_SERVICE.projectSequence({
    asset: "btc",
    window: "5m",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:05:00.000Z",
    priceToBeat: 100,
    prevPriceToBeat: [99.5, 100.2],
    snapshots: [buildSnapshot(0, 100.1), buildSnapshot(10_000, 100.8)],
  });

  const labels = PROJECTOR_SERVICE.getFeatureLabels();

  assert.equal(labels.length, 89);
  assert.equal(projection.rows.length, 2);
  assert.equal(projection.rows[0]?.length, 89);
  assert.equal(labels.includes("chainlink-momentum10s"), true);
  assert.equal(labels.includes("binance-volatility60s"), true);
  assert.equal(labels.includes("up-top-book-imbalance"), true);
  assert.equal(labels.includes("polymarket-gap-vs-external"), true);
  assert.ok((projection.rows[1]?.[0] || 0) > 0);
  assert.ok(projection.rows.flat().every((value) => Number.isFinite(value)));
});

function buildSnapshot(offsetMs: number, chainlinkPrice: number): Snapshot {
  const generatedAt = Date.parse("2026-03-12T00:00:00.000Z") + offsetMs;
  const exchangeFields = buildExchangeFields(generatedAt, chainlinkPrice);
  return {
    asset: "btc",
    window: "5m",
    generatedAt,
    marketId: "market-id",
    marketSlug: "btc-5m-test",
    marketConditionId: "condition-id",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:05:00.000Z",
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
  return { type: "orderbook", provider, symbol: "btc", ts: generatedAt, bids: [{ price, size: 1 }], asks: [{ price, size: 1 }] };
}

function buildExchangeFields(generatedAt: number, chainlinkPrice: number): Pick<
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
