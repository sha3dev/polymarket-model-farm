import * as assert from "node:assert/strict";
import { test } from "node:test";

import { CollectorClientService } from "../src/collector-client/index.ts";

test("CollectorClientService sorts markets oldest first", async () => {
  const service = new CollectorClientService({
    baseUrl: "http://collector.local",
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          markets: [
            { slug: "late", asset: "btc", window: "5m", priceToBeat: 100, marketStart: "2026-03-12T00:10:00.000Z", marketEnd: "2026-03-12T00:15:00.000Z" },
            { slug: "early", asset: "btc", window: "5m", priceToBeat: 100, marketStart: "2026-03-12T00:00:00.000Z", marketEnd: "2026-03-12T00:05:00.000Z" },
          ],
        }),
        { status: 200 },
      ),
  });

  const markets = await service.listMarkets({ asset: "btc", window: "5m" });

  assert.deepEqual(
    markets.map((market) => market.slug),
    ["early", "late"],
  );
});
