# @sha3/polymarket-model-farm

CPU-only Node service that trains and serves 8 TensorFlow GRU models for Polymarket `5m` and `15m` crypto markets across `btc`, `eth`, `sol`, and `xrp`.

## TL;DR

```bash
npm install
npm run check
npm run start
```

```bash
curl http://localhost:3000/trainer-status
```

```bash
curl http://localhost:3000/predictions \
  -H "content-type: application/json" \
  -d '{
    "markets": [
      {
        "asset": "btc",
        "window": "5m",
        "slug": "btc-updown-5m-example",
        "marketStart": "2026-03-12T00:00:00.000Z",
        "marketEnd": "2026-03-12T00:05:00.000Z",
        "priceToBeat": 100000,
        "prevPriceToBeat": [99920, 100080],
        "snapshots": []
      }
    ]
  }'
```

## Why

- Keeps model training, checkpoint persistence, and HTTP inference in one process.
- Trains each `asset/window` model exactly once per closed market by tracking used market slugs on disk.
- Uses full-sequence GRU inference so the model sees the entire live market history supplied by the caller.
- Keeps the prediction surface usable for both live scoring and offline backtesting because `POST /predictions` accepts caller-supplied snapshots.

## Main Capabilities

- Polls `polymarket-snapshot-collector` for historical markets and snapshots.
- Maintains 8 independent model slots:
  - `btc/5m`
  - `btc/15m`
  - `eth/5m`
  - `eth/15m`
  - `sol/5m`
  - `sol/15m`
  - `xrp/5m`
  - `xrp/15m`
- Persists TensorFlow checkpoints plus training ledgers under one storage directory.
- Exposes prediction and trainer-status HTTP endpoints.
- Keeps delta prediction as the model target, then derives directional confidence from expected move strength versus recent historical beat deltas.
- Uses a feature set optimized for one early entry per market, with external exchanges as the primary signal source and Polymarket as secondary context.

## Installation

```bash
npm install
```

## Running Locally

Start the required snapshot collector first:

```bash
COLLECTOR_BASE_URL=http://localhost:3000 npm run start
```

The service binds to `0.0.0.0:3000` by default.

## Usage

Start the default runtime:

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const serviceRuntime = ServiceRuntime.createDefault();
await serviceRuntime.startServer();
```

Stop the runtime cleanly:

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const serviceRuntime = ServiceRuntime.createDefault();
await serviceRuntime.startServer();
await serviceRuntime.stop();
```

## Examples

Build the HTTP server without binding:

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const serviceRuntime = ServiceRuntime.createDefault();
const server = serviceRuntime.buildServer();
```

Read trainer status:

```bash
curl http://localhost:3000/trainer-status
```

Score one market snapshot sequence:

```bash
curl http://localhost:3000/predictions \
  -H "content-type: application/json" \
  -d @prediction-request.json
```

## HTTP API

### `GET /`

Returns:

```json
{
  "ok": true,
  "serviceName": "@sha3/polymarket-model-farm"
}
```

### `POST /predictions`

Scores one or more caller-supplied market sequences.

Request:

```ts
type PredictionRequestPayload = {
  markets: Array<{
    asset: "btc" | "eth" | "sol" | "xrp";
    window: "5m" | "15m";
    slug: string | null;
    marketStart: string;
    marketEnd: string;
    priceToBeat: number;
    prevPriceToBeat?: number[];
    snapshots: Snapshot[];
  }>;
};
```

Response:

```ts
type PredictionResponsePayload = {
  predictions: Array<{
    slug: string | null;
    asset: "btc" | "eth" | "sol" | "xrp";
    window: "5m" | "15m";
    snapshotCount: number;
    confidence: number;
    predictedDelta: number;
    predictedDirection: "UP" | "DOWN";
    modelVersion: string;
    trainedMarketCount: number;
    generatedAt: string;
  }>;
};
```

Behavior notes:

- `confidence` is always clamped to `[-1, 1]`.
- `confidence >= 0` maps to `UP`; `confidence < 0` maps to `DOWN`.
- the endpoint requires at least one valid historical `prevPriceToBeat` entry.
- the endpoint rejects invalid bodies, unsupported pairs, empty snapshots, invalid dates, invalid `priceToBeat`, and markets whose historical beat array cannot produce a non-zero reference delta.
- if a pair has never produced a checkpoint, the endpoint responds with `503`.

### `GET /trainer-status`

Returns:

```ts
type TrainerStatusPayload = {
  generatedAt: string;
  models: Array<{
    asset: "btc" | "eth" | "sol" | "xrp";
    window: "5m" | "15m";
    modelVersion: string;
    hasCheckpoint: boolean;
    trainedMarketCount: number;
    lastTrainedSlug: string | null;
    lastTrainedAt: string | null;
    lastSeenClosedMarketEnd: string | null;
    pendingClosedMarketCount: number;
    isTraining: boolean;
    latestTrainingError: string | null;
    checkpointPath: string;
    ledgerPath: string;
  }>;
};
```

Behavior notes:

- reports one stable entry for each of the 8 model slots
- combines local checkpoint state with collector-side market discovery
- uses `pendingClosedMarketCount = -1` when collector status calculation fails for a pair

## Feature Vector

Each snapshot becomes one flattened row with fixed feature order. The same projector is used for training and inference.

### Block 1: Minimal Market Context

Order:

1. `progress`
2. `priceToBeat`
3. `log(priceToBeat)`
4. `prevBeatMeanDelta`

Notes:

- `progress` is the only time-position feature kept
- `prevBeatMeanDelta` is the mean of the absolute historical beat deltas from `prevPriceToBeat`

### Block 2: External Exchanges

Fixed exchange order:

1. `chainlink`
2. `binance`
3. `coinbase`
4. `kraken`
5. `okx`

For each exchange, feature order is:

1. availability flag
2. normalized price versus `priceToBeat`
3. momentum `10s`
4. momentum `60s`
5. volatility `10s`
6. volatility `60s`
7. best bid versus `priceToBeat`
8. best ask versus `priceToBeat`
9. normalized spread by mid
10. mid versus `priceToBeat`
11. top-of-book imbalance
12. bid depth top `1`
13. ask depth top `1`
14. bid depth top `3`
15. ask depth top `3`

### Block 3: External Cross-Exchange Structure

Order:

1. normalized price range
2. normalized cross-exchange standard deviation
3. normalized available-source count

### Block 4: Polymarket State

Order:

1. `upPrice`
2. `downPrice`
3. `upPrice - downPrice`
4. `upMid`
5. `downMid`
6. `upMid - downMid`
7. `polymarketDirectionGapVsExternal`

### Block 5: Polymarket Orderbook

Applied separately to `up` and `down`:

1. best bid
2. best ask
3. spread
4. mid
5. top-of-book imbalance

## Target And Confidence

Training target:

```ts
rawDelta = (finalChainlinkPrice - priceToBeat) / priceToBeat;
boundedTarget = Math.tanh(rawDelta / config.DELTA_TARGET_SCALE);
```

Inference keeps the trained model as a delta forecaster. The raw model output is first converted back into a market-relative delta:

```ts
predictedDelta = Math.atanh(clamp(modelOutput, -0.999999, 0.999999)) * config.DELTA_TARGET_SCALE;
```

`predictedDelta` means:

```ts
predictedDelta = (predictedFinalPrice - priceToBeat) / priceToBeat;
```

### Historical Reference Delta

Prediction confidence does not use `DELTA_TARGET_SCALE` directly. It uses the current market's own historical beat context.

The prediction API and collector integration use `prevPriceToBeat`.

For each previous beat value:

```ts
referenceDelta_i = abs((priceToBeat - previousPriceToBeat) / previousPriceToBeat);
```

If the market provides more than one previous beat, the service uses the mean:

```ts
referenceDelta = mean(referenceDelta_i);
```

If the request contains no valid previous beat values, or if every computed reference delta is zero, the market is rejected and cannot be scored.

### Final Confidence

The final prediction confidence is a signed strength score derived from the model delta versus the mean historical delta:

```ts
confidenceMagnitude = clamp((abs(predictedDelta) / referenceDelta) * config.CONFIDENCE_SCALING_FACTOR, 0, 1);
confidence = sign(predictedDelta) * confidenceMagnitude;
```

Interpretation:

- `confidence = -1` means strongest `DOWN`
- `confidence = 0` means neutral
- `confidence = 1` means strongest `UP`

Operationally:

- `predictedDelta` tells you the expected distance from `priceToBeat`
- `confidence` tells you how large that expected move is relative to the mean historical beat delta for the same market stream
- `predictedDirection` is derived from the sign of `predictedDelta`

## Persistence Layout

```text
.model-farm/
  btc-5m/
    model/
      model.json
      weights.bin
    ledger.json
    metadata.json
```

`ledger.json` stores:

- trained slugs
- trained market count
- last trained slug
- last trained timestamp
- current model version

`metadata.json` stores:

- feature count
- max sequence length per window
- target scale
- GRU hyperparameters
- checkpoint timestamp

## Public API

### `ServiceRuntime`

Main runtime entrypoint.

#### `createDefault()`

Builds the default collector client, feature projector, model registry, trainer, and HTTP server wiring.

Returns:

- `ServiceRuntime`

#### `buildServer()`

Builds the Hono-backed Node HTTP server without binding a port.

Returns:

- `ServerType`

#### `startServer()`

Initializes model slots, starts the background trainer loop, and binds the HTTP server.

Returns:

- `Promise<ServerType>`

#### `stop()`

Stops the background trainer loop and closes the bound HTTP server when one exists.

Returns:

- `Promise<void>`

### `AppInfoPayload`

```ts
type AppInfoPayload = { ok: true; serviceName: string };
```

### `PredictionRequestPayload`

Request payload for `POST /predictions`.

### `PredictionResponsePayload`

Response payload for `POST /predictions`.

### `TrainerStatusPayload`

Response payload for `GET /trainer-status`.

## Compatibility

- Node.js 20+
- ESM
- TensorFlow.js Node backend
- reachable `polymarket-snapshot-collector` instance

## Configuration

Configuration lives in `src/config.ts`.

- `config.RESPONSE_CONTENT_TYPE`: HTTP response `content-type`.
- `config.HTTP_HOST`: bind host for `startServer()`.
- `config.DEFAULT_PORT`: bind port for `startServer()`.
- `config.SERVICE_NAME`: value exposed by `GET /`.
- `config.COLLECTOR_BASE_URL`: base URL for `polymarket-snapshot-collector`.
- `config.MODEL_STORAGE_DIR`: root directory for checkpoints, metadata, and ledgers.
- `config.TRAINING_POLL_INTERVAL_MS`: delay after a cycle that found work.
- `config.TRAINING_IDLE_BACKOFF_MS`: delay after a cycle that found no work.
- `config.TRAINING_EPOCHS_PER_MARKET`: TensorFlow epochs run per closed market.
- `config.TRAINING_BATCH_SIZE`: TensorFlow batch size for one market sequence.
- `config.TRAINING_CLOSE_GRACE_MS`: close delay before a market becomes trainable.
- `config.TRAINING_MAX_MARKETS_PER_CYCLE`: per-pair training cap in one cycle.
- `config.DELTA_TARGET_SCALE`: training-time scale used to bound the delta target before `tanh()` and to decode the model output back into `predictedDelta`.
- `config.CONFIDENCE_SCALING_FACTOR`: multiplier applied before clamping confidence magnitude into `[0, 1]`.
- `config.MODEL_GRU_UNITS_5M`: GRU width for `5m` models.
- `config.MODEL_GRU_UNITS_15M`: GRU width for `15m` models.
- `config.MODEL_DROPOUT_RATE`: dropout rate used in both GRU layers.
- `config.MODEL_LEARNING_RATE`: Adam learning rate.
- `config.MODEL_L2_REGULARIZATION`: L2 regularization factor for GRU and dense kernels.
- `config.MODEL_SEED`: reserved deterministic seed value for model-related defaults.
- `config.PREDICTION_MAX_MARKETS_PER_REQUEST`: maximum number of markets accepted by `POST /predictions`.

## Scripts

- `npm run standards:check`
- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm run test`
- `npm run check`
- `npm run start`
- `npm run build`

## Structure

- `src/app`: runtime composition
- `src/app-info`: health payload builder
- `src/http`: Hono HTTP server
- `src/collector-client`: collector API client
- `src/model`: TensorFlow definition, store, and registry
- `src/snapshot-feature`: deterministic feature projection
- `src/training`: ledger and background trainer
- `src/prediction`: prediction request validation and scoring
- `src/trainer-status`: trainer status aggregation
- `test`: unit and integration coverage

## Troubleshooting

### `POST /predictions` returns `503`

That pair does not have a persisted checkpoint yet. Wait for at least one closed market to train successfully, then retry.

### Trainer status shows `pendingClosedMarketCount = -1`

The service could not compute collector-backed status for that pair. Verify `COLLECTOR_BASE_URL` and the collector endpoints.

### Training never advances

Check that the collector returns closed markets with non-null `priceToBeat`, non-empty snapshot arrays, a final snapshot containing `chainlinkPrice`, and at least one previous beat value in `prevPriceToBeat` for prediction requests that need confidence.

### Startup is slower than a simple HTTP service

This service initializes TensorFlow model slots and then starts a background polling loop. That is expected.

## AI Workflow

- Read `AGENTS.md`, `ai/contract.json`, `ai/rules.md`, and `ai/codex.md` before changing code.
- Do not edit managed files unless the task is an explicit standards update.
- Keep feature logic under the existing standards-compliant feature folders.
- Run `npm run standards:check` and `npm run check` before finalizing changes.
