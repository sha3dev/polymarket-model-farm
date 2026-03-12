import * as assert from "node:assert/strict";
import { test } from "node:test";

import type { PredictionRequestPayload } from "../src/prediction/index.ts";
import { PredictionService } from "../src/prediction/index.ts";

test("PredictionService validates request payload shape", () => {
  const service = new PredictionService({ modelRegistryService: buildRegistryStub(), snapshotFeatureProjectorService: buildProjectorStub(), now: () => "2026-03-12T00:00:00.000Z" });

  assert.throws(() => service.validateRequestPayload({ markets: [] }), /market count is invalid/);
});

test("PredictionService requires historical priceToBeat values for confidence", async () => {
  const service = new PredictionService({ modelRegistryService: buildRegistryStub(), snapshotFeatureProjectorService: buildProjectorStub(), now: () => "2026-03-12T00:00:00.000Z" });
  const payload: PredictionRequestPayload = {
    markets: [
      {
        asset: "btc",
        window: "5m",
        slug: "btc-5m-test",
        marketStart: "2026-03-12T00:00:00.000Z",
        marketEnd: "2026-03-12T00:05:00.000Z",
        priceToBeat: 100,
        snapshots: buildSnapshots(),
      },
    ],
  };

  await assert.rejects(async () => service.buildPredictionPayload(payload), /prevPriceToBeat must contain at least one valid historical value/);
});

test("PredictionService derives confidence from predicted delta and mean historical delta", async () => {
  const service = new PredictionService({ modelRegistryService: buildRegistryStub(), snapshotFeatureProjectorService: buildProjectorStub(), now: () => "2026-03-12T00:00:00.000Z" });
  const payload: PredictionRequestPayload = {
    markets: [
      {
        asset: "btc",
        window: "5m",
        slug: "btc-5m-test",
        marketStart: "2026-03-12T00:00:00.000Z",
        marketEnd: "2026-03-12T00:05:00.000Z",
        priceToBeat: 100,
        prevPriceToBeat: [99, 101],
        snapshots: buildSnapshots(),
      },
    ],
  };

  const response = await service.buildPredictionPayload(payload);

  assert.equal(response.predictions[0]?.predictedDirection, "UP");
  assert.ok((response.predictions[0]?.predictedDelta || 0) > 0);
  assert.ok((response.predictions[0]?.confidence || 0) > 0);
  assert.ok((response.predictions[0]?.confidence || 0) <= 1);
});

function buildRegistryStub(): ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"] {
  return { predict: async () => 0.5, getPredictionContext: () => ({ metadata: null, trainedMarketCount: 7, modelVersion: "stub-version", hasCheckpoint: true }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["modelRegistryService"];
}

function buildProjectorStub(): ConstructorParameters<typeof PredictionService>[0]["snapshotFeatureProjectorService"] {
  return { projectSequence: () => ({ labels: ["a"], rows: [[1]], maxSequenceLength: 600 }) } as unknown as ConstructorParameters<typeof PredictionService>[0]["snapshotFeatureProjectorService"];
}

function buildSnapshots(): PredictionRequestPayload["markets"][number]["snapshots"] {
  return [
    { generatedAt: Date.parse("2026-03-12T00:00:00.000Z"), chainlinkPrice: 99.8, binancePrice: 99.8, coinbasePrice: 99.8, krakenPrice: 99.8, okxPrice: 99.8 } as PredictionRequestPayload["markets"][number]["snapshots"][number],
    { generatedAt: Date.parse("2026-03-12T00:02:30.000Z"), chainlinkPrice: 100.4, binancePrice: 100.4, coinbasePrice: 100.4, krakenPrice: 100.4, okxPrice: 100.4 } as PredictionRequestPayload["markets"][number]["snapshots"][number],
    { generatedAt: Date.parse("2026-03-12T00:05:00.000Z"), chainlinkPrice: 100.8, binancePrice: 100.8, coinbasePrice: 100.8, krakenPrice: 100.8, okxPrice: 100.8 } as PredictionRequestPayload["markets"][number]["snapshots"][number],
  ];
}
