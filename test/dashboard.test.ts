import * as assert from "node:assert/strict";
import { test } from "node:test";

import { DashboardPageService } from "../src/dashboard/dashboard-page.service.ts";
import { DashboardService } from "../src/dashboard/dashboard.service.ts";

test("DashboardService renders hover hints and collapsible history without slug columns", async () => {
  const dashboardService = new DashboardService({
    collectorClientService: {
      loadState: async () => ({
        generatedAt: "2026-03-13T00:00:00.000Z",
        markets: [
          {
            asset: "btc",
            window: "5m",
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
          },
          { asset: "btc", window: "15m", market: null, snapshotCount: 0, latestSnapshot: null },
          { asset: "eth", window: "5m", market: null, snapshotCount: 0, latestSnapshot: null },
          { asset: "eth", window: "15m", market: null, snapshotCount: 0, latestSnapshot: null },
          { asset: "sol", window: "5m", market: null, snapshotCount: 0, latestSnapshot: null },
          { asset: "sol", window: "15m", market: null, snapshotCount: 0, latestSnapshot: null },
          { asset: "xrp", window: "5m", market: null, snapshotCount: 0, latestSnapshot: null },
          { asset: "xrp", window: "15m", market: null, snapshotCount: 0, latestSnapshot: null },
        ],
      }),
      listMarkets: async () => [],
    } as unknown as ConstructorParameters<typeof DashboardService>[0]["collectorClientService"],
    modelRegistryService: {
      getStatuses: () => [
        {
          asset: "btc",
          window: "5m",
          modelVersion: "model-btc-5m",
          hasCheckpoint: true,
          trainedMarketCount: 12,
          lastTrainedSlug: "btc-prior-market",
          lastTrainedAt: "2026-03-12T23:55:00.000Z",
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/btc-5m",
          ledgerPath: "/tmp/btc-5m.json",
          recentReferenceDelta: 0.01,
        },
        {
          asset: "btc",
          window: "15m",
          modelVersion: "model-btc-15m",
          hasCheckpoint: false,
          trainedMarketCount: 0,
          lastTrainedSlug: null,
          lastTrainedAt: null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/btc-15m",
          ledgerPath: "/tmp/btc-15m.json",
          recentReferenceDelta: 0,
        },
        {
          asset: "eth",
          window: "5m",
          modelVersion: "model-eth-5m",
          hasCheckpoint: false,
          trainedMarketCount: 0,
          lastTrainedSlug: null,
          lastTrainedAt: null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/eth-5m",
          ledgerPath: "/tmp/eth-5m.json",
          recentReferenceDelta: 0,
        },
        {
          asset: "eth",
          window: "15m",
          modelVersion: "model-eth-15m",
          hasCheckpoint: false,
          trainedMarketCount: 0,
          lastTrainedSlug: null,
          lastTrainedAt: null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/eth-15m",
          ledgerPath: "/tmp/eth-15m.json",
          recentReferenceDelta: 0,
        },
        {
          asset: "sol",
          window: "5m",
          modelVersion: "model-sol-5m",
          hasCheckpoint: false,
          trainedMarketCount: 0,
          lastTrainedSlug: null,
          lastTrainedAt: null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/sol-5m",
          ledgerPath: "/tmp/sol-5m.json",
          recentReferenceDelta: 0,
        },
        {
          asset: "sol",
          window: "15m",
          modelVersion: "model-sol-15m",
          hasCheckpoint: false,
          trainedMarketCount: 0,
          lastTrainedSlug: null,
          lastTrainedAt: null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/sol-15m",
          ledgerPath: "/tmp/sol-15m.json",
          recentReferenceDelta: 0,
        },
        {
          asset: "xrp",
          window: "5m",
          modelVersion: "model-xrp-5m",
          hasCheckpoint: false,
          trainedMarketCount: 0,
          lastTrainedSlug: null,
          lastTrainedAt: null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/xrp-5m",
          ledgerPath: "/tmp/xrp-5m.json",
          recentReferenceDelta: 0,
        },
        {
          asset: "xrp",
          window: "15m",
          modelVersion: "model-xrp-15m",
          hasCheckpoint: false,
          trainedMarketCount: 0,
          lastTrainedSlug: null,
          lastTrainedAt: null,
          isTraining: false,
          latestTrainingError: null,
          checkpointPath: "/tmp/xrp-15m",
          ledgerPath: "/tmp/xrp-15m.json",
          recentReferenceDelta: 0,
        },
      ],
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
            actualDelta: 0.01,
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
  assert.match(htmlDocument, /2026-03-13T00:04:00.000Z/);
  assert.match(htmlDocument, /Live/);
  assert.match(htmlDocument, /60\.00%/);
  assert.match(htmlDocument, /title="Latest Chainlink price from the collector snapshot\."/);
  assert.match(htmlDocument, /Chainlink/);
  assert.match(htmlDocument, />101\.25</);
  assert.match(htmlDocument, /title="Current model direction for the live market\."/);
  assert.match(htmlDocument, /Current UP contract price from the latest collector snapshot/);
  assert.match(htmlDocument, /Current DOWN contract price from the latest collector snapshot/);
  assert.match(htmlDocument, /Resolved prediction accuracy for this slot/);
  assert.match(htmlDocument, /Correct predictions vs total resolved predictions/);
  assert.match(htmlDocument, /Polymarket contract price we would have bought following the predicted side/);
  assert.match(htmlDocument, /Model vs actual/);
  assert.match(htmlDocument, /<th>Model<\/th><th>Actual<\/th><th>Conf<\/th><th>Result<\/th>/);
  assert.match(htmlDocument, />100\.0%</);
  assert.match(htmlDocument, />1\/1</);
  assert.match(htmlDocument, />0\.540</);
  assert.match(htmlDocument, />0\.460</);
  assert.match(htmlDocument, /<details class="history-panel" data-history-key="btc-5m">/);
  assert.match(htmlDocument, /Click to expand/);
  assert.match(htmlDocument, /window\.setInterval/);
  assert.match(htmlDocument, /window\.fetch\("\/api\/dashboard"/);
  assert.match(htmlDocument, /data-history-key="btc-5m"/);
  assert.match(htmlDocument, /restoreOpenHistoryKeys/);
  assert.match(htmlDocument, /dashboard-root/);
  assert.match(htmlDocument, /window-row/);
  assert.match(htmlDocument, /1000/);
  assert.doesNotMatch(htmlDocument, /window\.location\.reload/);
  assert.doesNotMatch(htmlDocument, /Coverage/);
  assert.doesNotMatch(htmlDocument, /Hints/);
  assert.doesNotMatch(htmlDocument, /Collector/);
  assert.match(htmlDocument, /Market End/);
  assert.doesNotMatch(htmlDocument, /<th>Slug<\/th>/);
  assert.doesNotMatch(htmlDocument, /btc-up-or-down-march-13/);
});
