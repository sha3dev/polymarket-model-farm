import * as assert from "node:assert/strict";
import { test } from "node:test";

import { ModelDefinitionService } from "../src/model/index.ts";

test("ModelDefinitionService builds the two-layer GRU architecture for 5m slots", () => {
  const modelDefinitionService = ModelDefinitionService.createDefault();
  const model = modelDefinitionService.createModel({ asset: "btc", window: "5m" }, 32);
  const metadata = modelDefinitionService.buildMetadata({ asset: "btc", window: "5m" }, 32, "2026-03-13T00:00:00.000Z");
  const gruLayers = model.layers.filter((layer) => layer.getClassName() === "GRU");
  const denseLayers = model.layers.filter((layer) => layer.getClassName() === "Dense");

  assert.equal(gruLayers.length, 2);
  assert.equal(gruLayers[0]?.getConfig().units, 48);
  assert.equal(gruLayers[1]?.getConfig().units, 24);
  assert.equal(denseLayers[denseLayers.length - 1]?.getConfig().activation, "linear");
  assert.equal(metadata.maxSequenceLength, 60);
  assert.equal(metadata.featureSchemaVersion, "v2-exchange-light-book");
  assert.equal(metadata.targetKind, "log-return");
});

test("ModelDefinitionService builds the two-layer GRU architecture for 15m slots", () => {
  const modelDefinitionService = ModelDefinitionService.createDefault();
  const model = modelDefinitionService.createModel({ asset: "btc", window: "15m" }, 32);
  const metadata = modelDefinitionService.buildMetadata({ asset: "btc", window: "15m" }, 32, "2026-03-13T00:00:00.000Z");
  const gruLayers = model.layers.filter((layer) => layer.getClassName() === "GRU");

  assert.equal(gruLayers.length, 2);
  assert.equal(gruLayers[0]?.getConfig().units, 64);
  assert.equal(gruLayers[1]?.getConfig().units, 32);
  assert.equal(metadata.maxSequenceLength, 90);
  assert.equal(metadata.resampleSeconds, 10);
});
