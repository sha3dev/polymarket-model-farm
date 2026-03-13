import * as assert from "node:assert/strict";
import { test } from "node:test";

import { CollectorClientService } from "../src/collector/index.ts";

test("CollectorClientService does not retain snapshot payloads in memory between calls", async () => {
  let snapshotRequestCount = 0;
  const collectorClientService = new CollectorClientService({
    baseUrl: "http://collector.test",
    fetchFn: async (input: URL | RequestInfo) => {
      const url = String(input);
      snapshotRequestCount += 1;
      return new Response(
        JSON.stringify({
          slug: "btc-test",
          asset: "btc",
          window: "5m",
          marketStart: "2026-03-13T00:00:00.000Z",
          marketEnd: "2026-03-13T00:05:00.000Z",
          snapshots: [{ generatedAt: snapshotRequestCount }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
    now: () => 0,
  });

  const firstPayload = await collectorClientService.loadMarketSnapshots("btc-test");
  const secondPayload = await collectorClientService.loadMarketSnapshots("btc-test");

  assert.equal(snapshotRequestCount, 2);
  assert.equal(firstPayload.snapshots[0]?.generatedAt, 1);
  assert.equal(secondPayload.snapshots[0]?.generatedAt, 2);
});
