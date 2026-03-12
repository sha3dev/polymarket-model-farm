import * as assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { ModelDefinitionService, ModelRegistryService, ModelStoreService } from "../src/model/index.ts";

test("ModelRegistryService saves and reloads a trained checkpoint", async () => {
  const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "model-farm-"));
  const modelStoreService = new ModelStoreService({ storageDirectoryPath: tempDirectoryPath });
  const modelRegistryService = new ModelRegistryService({ modelDefinitionService: ModelDefinitionService.createDefault(), modelStoreService, featureCount: 3 });

  await modelRegistryService.initialize();
  await modelRegistryService.train({ asset: "btc", window: "5m" }, [[0.1, 0.2, 0.3], [0.2, 0.3, 0.4]], 0.7);
  await modelRegistryService.markMarketAsTrained({ asset: "btc", window: "5m" }, "btc-5m-test", "2026-03-12T00:00:00.000Z");

  const metadataPath = path.join(tempDirectoryPath, "btc-5m", "metadata.json");
  const modelPath = path.join(tempDirectoryPath, "btc-5m", "model", "model.json");
  const ledgerPath = path.join(tempDirectoryPath, "btc-5m", "ledger.json");

  assert.equal(await pathExists(metadataPath), true);
  assert.equal(await pathExists(modelPath), true);
  assert.equal(await pathExists(ledgerPath), true);

  const reloadedRegistryService = new ModelRegistryService({ modelDefinitionService: ModelDefinitionService.createDefault(), modelStoreService, featureCount: 3 });

  await reloadedRegistryService.initialize();

  assert.equal(reloadedRegistryService.getPredictionContext({ asset: "btc", window: "5m" }).hasCheckpoint, true);
  assert.equal(reloadedRegistryService.hasTrainedMarket({ asset: "btc", window: "5m" }, "btc-5m-test"), true);
});

async function pathExists(filePath: string): Promise<boolean> {
  return existsSync(filePath);
}
