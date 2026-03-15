import * as assert from "node:assert/strict";
import { test } from "node:test";

import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../src/collector/index.ts";
import { DashboardPageService } from "../src/dashboard/dashboard-page.service.ts";
import { DashboardService } from "../src/dashboard/dashboard.service.ts";

test("DashboardService renders the live dashboard with polling and compact history access", async () => {
  const expectedLastUpdate = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date("2026-03-13T00:04:00.000Z"));
  const dashboardService = new DashboardService({
    collectorClientService: {
      loadState: async () => ({
        generatedAt: "2026-03-13T00:00:00.000Z",
        markets: SUPPORTED_ASSETS.flatMap((asset) =>
          SUPPORTED_WINDOWS.map((window) =>
            asset === "btc" && window === "5m"
              ? {
                  asset,
                  window,
                  market: {
                    slug: "btc-up-or-down-march-13",
                    asset: "btc",
                    window: "5m",
                    priceToBeat: 101,
                    marketStart: "2026-03-13T00:00:00.000Z",
                    marketEnd: "2026-03-13T00:05:00.000Z",
                  },
                  snapshotCount: 42,
                  latestSnapshot: {
                    asset: "btc",
                    window: "5m",
                    generatedAt: Date.parse("2026-03-13T00:03:00.000Z"),
                    marketId: "1",
                    marketSlug: "btc-up-or-down-march-13",
                    marketConditionId: "condition-1",
                    marketStart: "2026-03-13T00:00:00.000Z",
                    marketEnd: "2026-03-13T00:05:00.000Z",
                    priceToBeat: 101,
                    upAssetId: "up-1",
                    upPrice: 0.54,
                    upOrderBook: null,
                    upEventTs: null,
                    downAssetId: "down-1",
                    downPrice: 0.46,
                    downOrderBook: null,
                    downEventTs: null,
                    binancePrice: 102,
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
                    chainlinkPrice: 101.25,
                    chainlinkOrderBook: null,
                    chainlinkEventTs: null,
                  },
                }
              : { asset, window, market: null, snapshotCount: 0, latestSnapshot: null },
          ),
        ),
      }),
      listMarkets: async () => [],
    } as unknown as ConstructorParameters<typeof DashboardService>[0]["collectorClientService"],
    modelRegistryService: {
      getStatuses: () =>
        SUPPORTED_ASSETS.flatMap((asset) =>
          SUPPORTED_WINDOWS.map((window) => ({
            asset,
            window,
            modelVersion: `model-${asset}-${window}`,
            hasCheckpoint: asset === "btc" && window === "5m",
            trainedMarketCount: asset === "btc" && window === "5m" ? 12 : 0,
            lastTrainedSlug: null,
            lastTrainedAt: null,
            isTraining: false,
            latestTrainingError: null,
            checkpointPath: `/tmp/${asset}-${window}`,
            ledgerPath: `/tmp/${asset}-${window}.json`,
            recentReferenceDelta: asset === "btc" && window === "5m" ? 0.01 : 0,
          })),
        ),
      hasTrainedMarket: () => false,
    } as unknown as ConstructorParameters<typeof DashboardService>[0]["modelRegistryService"],
    predictionHistoryService: {
      getLatestPrediction: async () => ({
        slug: "btc-up-or-down-march-13",
        asset: "btc",
        window: "5m",
        marketStart: "2026-03-13T00:00:00.000Z",
        marketEnd: "2026-03-13T00:05:00.000Z",
        predictionMadeAt: "2026-03-13T00:03:00.000Z",
        progressWhenPredicted: 0.6,
        observedPrice: 102,
        upPrice: 0.54,
        downPrice: 0.46,
        predictedDelta: 0.02,
        confidence: 0.91,
        predictedDirection: "UP",
        modelVersion: "model-btc-5m",
        isExecuted: true,
        skipReason: null,
        actualDelta: null,
        actualDirection: null,
        isCorrect: null,
      }),
      loadHistory: async () => ({
        entries: [
          {
            slug: "btc-up-or-down-march-13",
            asset: "btc",
            window: "5m",
            marketStart: "2026-03-13T00:00:00.000Z",
            marketEnd: "2026-03-13T00:05:00.000Z",
            predictionMadeAt: "2026-03-13T00:03:00.000Z",
            progressWhenPredicted: 0.6,
            observedPrice: 102,
            upPrice: 0.54,
            downPrice: 0.46,
            predictedDelta: 0.02,
            confidence: 0.91,
            predictedDirection: "UP",
            modelVersion: "model-btc-5m",
            isExecuted: true,
            skipReason: null,
            actualDelta: 0.01,
            actualDirection: "UP",
            isCorrect: true,
          },
          {
            slug: "btc-up-or-down-march-13b",
            asset: "btc",
            window: "5m",
            marketStart: "2026-03-13T00:05:00.000Z",
            marketEnd: "2026-03-13T00:10:00.000Z",
            predictionMadeAt: "2026-03-13T00:08:00.000Z",
            progressWhenPredicted: 0.6,
            observedPrice: 100,
            upPrice: 0.9,
            downPrice: 0.12,
            predictedDelta: 0.01,
            confidence: 0.7,
            predictedDirection: "UP",
            modelVersion: "model-btc-5m",
            isExecuted: true,
            skipReason: null,
            actualDelta: -0.2,
            actualDirection: "DOWN",
            isCorrect: false,
          },
          {
            slug: "btc-up-or-down-march-13c",
            asset: "btc",
            window: "5m",
            marketStart: "2026-03-13T00:10:00.000Z",
            marketEnd: "2026-03-13T00:15:00.000Z",
            predictionMadeAt: "2026-03-13T00:13:00.000Z",
            progressWhenPredicted: 0.6,
            observedPrice: 99,
            upPrice: 0.55,
            downPrice: 0.45,
            predictedDelta: 0.002,
            confidence: 0.55,
            predictedDirection: "UP",
            modelVersion: "model-btc-5m",
            isExecuted: false,
            skipReason: "low_confidence",
            actualDelta: 0.03,
            actualDirection: "UP",
            isCorrect: true,
          },
        ],
      }),
    } as unknown as ConstructorParameters<typeof DashboardService>[0]["predictionHistoryService"],
    livePredictionService: { refreshOnce: async () => undefined } as unknown as ConstructorParameters<typeof DashboardService>[0]["livePredictionService"],
    dashboardPageService: new DashboardPageService(),
    now: () => "2026-03-13T00:04:00.000Z",
  });

  const htmlDocument = await dashboardService.buildHtmlDocument();

  assert.match(htmlDocument, /Last update/);
  assert.match(htmlDocument, /5m result/);
  assert.match(htmlDocument, /15m result/);
  assert.match(htmlDocument, new RegExp(expectedLastUpdate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(htmlDocument, />\+\$2\.30<\/strong>/);
  assert.match(htmlDocument, /BTC 5m/);
  assert.match(htmlDocument, /class="latest-call up"/);
  assert.match(htmlDocument, />101\.25</);
  assert.match(htmlDocument, />0\.540</);
  assert.match(htmlDocument, />\+\$2\.30<\/strong>/);
  assert.match(htmlDocument, />100%<\/strong>/);
  assert.match(htmlDocument, />Executed<\/strong>/);
  assert.match(htmlDocument, />--<\/strong>/);
  assert.match(htmlDocument, /data-history-button="btc-5m"/);
  assert.match(htmlDocument, /id="history-modal"/);
  assert.match(htmlDocument, /<th>Entry price<\/th>/);
  assert.match(htmlDocument, /thead th \{ text-transform: uppercase;/);
  assert.match(htmlDocument, /window\.fetch\("\/api\/dashboard"/);
  assert.doesNotMatch(htmlDocument, /window\.location\.reload/);
  assert.doesNotMatch(htmlDocument, /<th>Slug<\/th>/);
  assert.doesNotMatch(htmlDocument, />Updated<\/span>/);
  assert.doesNotMatch(htmlDocument, />UP price<\/span>/);
  assert.doesNotMatch(htmlDocument, />DOWN price<\/span>/);
  assert.doesNotMatch(htmlDocument, />Snapshots<\/span>/);
});
