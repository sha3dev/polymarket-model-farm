import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { Snapshot } from "@sha3/polymarket-snapshot";

import { SnapshotFeatureProjectorService } from "../src/snapshot-feature/index.ts";

const PROJECTOR_SERVICE = SnapshotFeatureProjectorService.createDefault();
const BASE_SNAPSHOT: Snapshot = {
  asset: "btc",
  window: "5m",
  generatedAt: Date.parse("2026-03-12T00:00:00.000Z"),
  marketId: "market-id",
  marketSlug: "btc-5m-test",
  marketConditionId: "condition-id",
  marketStart: "2026-03-12T00:00:00.000Z",
  marketEnd: "2026-03-12T00:05:00.000Z",
  priceToBeat: 100,
  upAssetId: "up-asset",
  upPrice: 0.56,
  upOrderBook: { bids: [{ price: 0.55, size: 10 }], asks: [{ price: 0.57, size: 12 }] },
  upEventTs: 1,
  downAssetId: "down-asset",
  downPrice: 0.44,
  downOrderBook: { bids: [{ price: 0.43, size: 8 }], asks: [{ price: 0.45, size: 9 }] },
  downEventTs: 1,
  binancePrice: 101,
  binanceOrderBook: { type: "orderbook", provider: "binance", symbol: "btc", ts: 1, bids: [{ price: 100.9, size: 1 }], asks: [{ price: 101.1, size: 1 }] },
  binanceEventTs: 1,
  coinbasePrice: 100.8,
  coinbaseOrderBook: { type: "orderbook", provider: "coinbase", symbol: "btc", ts: 1, bids: [{ price: 100.7, size: 1 }], asks: [{ price: 100.9, size: 1 }] },
  coinbaseEventTs: 1,
  krakenPrice: 100.7,
  krakenOrderBook: { type: "orderbook", provider: "kraken", symbol: "btc", ts: 1, bids: [{ price: 100.6, size: 1 }], asks: [{ price: 100.8, size: 1 }] },
  krakenEventTs: 1,
  okxPrice: 100.9,
  okxOrderBook: { type: "orderbook", provider: "okx", symbol: "btc", ts: 1, bids: [{ price: 100.8, size: 1 }], asks: [{ price: 101, size: 1 }] },
  okxEventTs: 1,
  chainlinkPrice: 100.95,
  chainlinkOrderBook: { type: "orderbook", provider: "chainlink", symbol: "btc", ts: 1, bids: [{ price: 100.95, size: 1 }], asks: [{ price: 100.95, size: 1 }] },
  chainlinkEventTs: 1,
};

test("SnapshotFeatureProjectorService builds the compact exchange-led feature vector", () => {
  const snapshots = [buildSnapshot({ generatedAt: Date.parse("2026-03-12T00:00:00.000Z") }), buildSnapshot({ generatedAt: Date.parse("2026-03-12T00:00:10.000Z"), chainlinkPrice: null })];
  const projection = PROJECTOR_SERVICE.projectSequence({
    asset: "btc",
    window: "5m",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:05:00.000Z",
    priceToBeat: 100,
    prevPriceToBeat: [99, 101],
    snapshots,
  });
  const labels = PROJECTOR_SERVICE.getFeatureLabels();
  const progressIndex = labels.indexOf("progress");
  const availabilityIndex = labels.indexOf("chainlink-availability");
  const prevBeatMeanDeltaIndex = labels.indexOf("prev-beat-mean-delta");

  assert.equal(projection.rows.length, 2);
  assert.equal(projection.rows[0]?.length, PROJECTOR_SERVICE.getFeatureLabels().length);
  assert.equal(projection.rows[0]?.[progressIndex], 0);
  assert.ok((projection.rows[1]?.[progressIndex] || 0) > 0);
  assert.equal(projection.rows[0]?.[availabilityIndex], 1);
  assert.equal(projection.rows[1]?.[availabilityIndex], 0);
  assert.ok((projection.rows[0]?.[prevBeatMeanDeltaIndex] || 0) > 0);
  assert.equal(labels.includes("binance-momentum10s"), true);
  assert.equal(labels.includes("binance-volatility60s"), true);
  assert.equal(labels.includes("binance-best-bid-vs-price-to-beat"), true);
  assert.equal(labels.includes("up-top-book-imbalance"), true);
});

test("SnapshotFeatureProjectorService keeps finite values when exchange history is short", () => {
  const projection = PROJECTOR_SERVICE.projectSequence({
    asset: "eth",
    window: "15m",
    marketStart: "2026-03-12T00:00:00.000Z",
    marketEnd: "2026-03-12T00:15:00.000Z",
    priceToBeat: 100,
    prevPriceToBeat: [100.5],
    snapshots: [buildSnapshot({ generatedAt: Date.parse("2026-03-12T00:00:00.000Z") })],
  });

  const row = projection.rows[0] || [];
  const labels = PROJECTOR_SERVICE.getFeatureLabels();
  const chainlinkMomentum10sIndex = labels.indexOf("chainlink-momentum10s");
  const chainlinkVolatility10sIndex = labels.indexOf("chainlink-volatility10s");

  assert.equal(row.length, labels.length);
  assert.equal(labels.length, 99);
  assert.ok(row.every((value: number) => Number.isFinite(value)));
  assert.equal(row[chainlinkMomentum10sIndex], 0);
  assert.equal(row[chainlinkVolatility10sIndex], 0);
});

function buildSnapshot(overrides: Partial<Snapshot>): Snapshot {
  return { ...BASE_SNAPSHOT, ...overrides };
}
