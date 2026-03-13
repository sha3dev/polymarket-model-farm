import * as assert from "node:assert/strict";
import { test } from "node:test";

import { ServiceRuntime } from "../src/index.ts";

test("ServiceRuntime serves the status payload", async () => {
  const serviceRuntime = ServiceRuntime.createDefault();
  const server = serviceRuntime.buildServer();

  await new Promise((resolve) => {
    server.listen(0, () => {
      resolve(undefined);
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind test server");
  }

  const response = await fetch(`http://127.0.0.1:${address.port}`);
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(json, { ok: true, serviceName: "@sha3/polymarket-model-farm", supportedAssets: ["btc", "eth", "sol", "xrp"], supportedWindows: ["5m", "15m"] });

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
});
