# polymarket-model-farm

## TL;DR

`polymarket-model-farm` is a Node.js service that trains and serves one TensorFlow forecasting model per fixed Polymarket crypto slot:

- `btc/5m`
- `btc/15m`
- `eth/5m`
- `eth/15m`
- `sol/5m`
- `sol/15m`
- `xrp/5m`
- `xrp/15m`

The model is intentionally exchange-only:

- it uses chainlink and exchange snapshots
- it keeps exchanges separated
- it keeps only lightweight exchange order-book summaries
- it does not use Polymarket prices or Polymarket order books

`GET /predictions` returns a raw business prediction for the underlying:

- `predictedFinalPrice`
- `predictedDirection`
- `predictedLogReturn`

This package does not implement confidence scoring, edge calculation, execution logic, dashboards, or Polymarket validation rules.

## Why

This service exists to isolate the TensorFlow layer from the strategy layer.

The modeling problem that belongs here is:

- learn how the underlying crypto asset is likely to finish relative to the strike

The problems that do not belong here are:

- whether Polymarket token prices are cheap or expensive
- how much confidence to assign to a trade
- when to buy, skip, size, or exit
- how to persist predictions and executions for bot logic

Keeping the service exchange-only makes the training target cleaner, the checkpoint contract simpler, and the downstream architecture easier to reason about.

## Main Capabilities

- Continuous training for eight fixed `asset/window` slots.
- Exchange-only feature projection with resampled sequences.
- Persistent TensorFlow checkpoints, metadata, and training ledgers per slot.
- Raw live predictions via `GET /predictions`.
- Optional `asset` and `window` filtering on the prediction endpoint.

## Model Design

The model is intentionally narrow:

- it forecasts the underlying close relative to the strike
- it only uses exchange-side data
- it uses one checkpoint per slot
- it exposes the prediction in business terms instead of strategy terms

The training target is:

```ts
Math.log(finalChainlinkPrice / priceToBeat)
```

That makes the output strike-relative and scale-stable without using bounded-target compression.

The network is:

- `Masking`
- `GRU(primary, returnSequences=true)`
- `GRU(secondary)`
- `Dense(16, relu)`
- `Dense(1, linear)`

`5m` slots use:

- primary GRU: `48`
- secondary GRU: `24`

`15m` slots use:

- primary GRU: `64`
- secondary GRU: `32`

## Feature Set

Each resampled timestep has exactly `32` features.

### Time context

- `timeRemainingNorm`

### Chainlink block

- `chainlinkDeltaToStrike`
- `chainlinkMomentumShort`
- `chainlinkMomentumLong`

### Per-exchange block

For each of `binance`, `coinbase`, `kraken`, and `okx`:

- `exchangeAvailable`
- `exchangeDeltaToStrike`
- `exchangeMomentumShort`
- `exchangeMomentumLong`
- `exchangeObi`
- `exchangeRelativeSpread`
- `exchangeDepthRatio`

The design deliberately excludes:

- exchange consensus features
- exchange medians
- volatility families
- raw bid/ask/mid features
- Polymarket prices
- Polymarket order books

That keeps the model focused on venue-separated price action plus a lightweight order-book summary.

## Installation

```bash
npm install
```

## Running Locally

Start the service:

```bash
npm start
```

Default bind address:

```txt
http://0.0.0.0:3100
```

## Setup

The service requires:

1. a compatible collector reachable at `COLLECTOR_BASE_URL`
2. a writable `MODEL_STORAGE_DIR`
3. Node.js plus the native runtime required by `@tensorflow/tfjs-node`
4. `@sha3/polymarket` so prediction requests can build the current Polymarket crypto-window slug per slot

Minimal `.env`:

```bash
PORT=3100
HTTP_HOST=0.0.0.0
COLLECTOR_BASE_URL=http://localhost:3000
MODEL_STORAGE_DIR=./var/model
```

The collector is expected to provide:

- `/markets` with historical market summaries filtered by `asset` and `window`
- `/markets/:slug/snapshots` with the snapshot sequence for one market

## Usage

Run the service:

```bash
npm start
```

Run it programmatically:

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const serviceRuntime = ServiceRuntime.createDefault();
await serviceRuntime.startServer();
```

Consume the HTTP API:

```bash
curl http://127.0.0.1:3100/
curl http://127.0.0.1:3100/predictions
curl "http://127.0.0.1:3100/predictions?asset=btc"
curl "http://127.0.0.1:3100/predictions?asset=btc&window=5m"
```

## Examples

Example `GET /predictions?asset=btc&window=5m` response:

```json
{
  "predictions": [
    {
      "slug": "btc-updown-5m-1773425100",
      "asset": "btc",
      "window": "5m",
      "snapshotCount": 60,
      "marketStart": "2026-03-13T18:05:00.000Z",
      "marketEnd": "2026-03-13T18:10:00.000Z",
      "observedPrice": 71038.28,
      "priceToBeat": 71010.5,
      "predictedFinalPrice": 71066.01,
      "predictedDirection": "UP",
      "predictedLogReturn": 0.000781,
      "lastTrainedAt": "2026-03-13T18:07:48.948Z",
      "trainedMarketCount": 587,
      "generatedAt": "2026-03-13T18:08:51.626Z"
    }
  ]
}
```

Example `GET /predictions` response shape:

```json
{
  "predictions": [
    {
      "slug": "btc-updown-5m-1773425100",
      "asset": "btc",
      "window": "5m",
      "snapshotCount": 60,
      "marketStart": "2026-03-13T18:05:00.000Z",
      "marketEnd": "2026-03-13T18:10:00.000Z",
      "observedPrice": 71038.28,
      "priceToBeat": 71010.5,
      "predictedFinalPrice": 71066.01,
      "predictedDirection": "UP",
      "predictedLogReturn": 0.000781,
      "lastTrainedAt": "2026-03-13T18:07:48.948Z",
      "trainedMarketCount": 587,
      "generatedAt": "2026-03-13T18:08:51.626Z"
    },
    {
      "slug": "eth-updown-15m-1773425400",
      "asset": "eth",
      "window": "15m",
      "snapshotCount": 90,
      "marketStart": "2026-03-13T18:00:00.000Z",
      "marketEnd": "2026-03-13T18:15:00.000Z",
      "observedPrice": 3824.12,
      "priceToBeat": 3826.9,
      "predictedFinalPrice": 3817.84,
      "predictedDirection": "DOWN",
      "predictedLogReturn": -0.00238,
      "lastTrainedAt": "2026-03-13T18:05:11.340Z",
      "trainedMarketCount": 603,
      "generatedAt": "2026-03-13T18:08:51.626Z"
    }
  ]
}
```

## Public API

### `ServiceRuntime`

Primary runtime entrypoint for composing or starting the service.

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const serviceRuntime = ServiceRuntime.createDefault();
```

#### `createDefault()`

Builds the standard runtime graph.

Returns:

- a configured `ServiceRuntime`

- does not initialize checkpoints yet
- does not start training yet
- does not bind the HTTP server yet

#### `buildServer()`

Builds the Hono server without starting the runtime.

Returns:

- the Node server instance

- useful for tests and custom bootstrapping
- does not initialize checkpoints
- does not start training

#### `startServer()`

Starts the full runtime.

Returns:

- the bound Node server instance

- loads existing checkpoints before serving traffic
- starts training before the server is considered ready

#### `stop()`

Stops the runtime.

Returns:

- `Promise<void>`
- safe to call when the runtime is already idle

### `AppInfoPayload`

The shape returned by `GET /`.

Fields:

- `ok`: always `true`
- `serviceName`: configured service name
- `supportedAssets`: static list of supported assets
- `supportedWindows`: static list of supported windows

### `PredictionResponsePayload`

The shape returned by `GET /predictions`.

Fields:

- `predictions`: array of `PredictionItem`

## API

Top-level exports from `src/index.ts`:

- `ServiceRuntime`
- `AppInfoPayload`
- `PredictionResponsePayload`

## HTTP API

### `GET /`

Returns a basic status payload.

Example:

```json
{
  "ok": true,
  "serviceName": "@sha3/polymarket-model-farm",
  "supportedAssets": ["btc", "eth", "sol", "xrp"],
  "supportedWindows": ["5m", "15m"]
}
```

### `GET /predictions`

Returns live predictions for the currently available markets that:

- match the optional filters
- have a current Polymarket slug that the collector has already stored
- have at least one snapshot available
- already have a persisted checkpoint for that slot

Optional query parameters:

- `asset`: one of `btc`, `eth`, `sol`, `xrp`
- `window`: one of `5m`, `15m`

Invalid filter values return `400`.

#### Response field reference

Each `PredictionItem` contains:

- `slug`
  - live market slug from the collector
- `asset`
  - slot asset
- `window`
  - slot window
- `snapshotCount`
  - number of resampled rows actually passed into the model for this prediction request
- `marketStart`
  - ISO start timestamp of the live market
- `marketEnd`
  - ISO end timestamp of the live market
- `observedPrice`
  - latest available underlying price seen in the current snapshot sequence, using chainlink first and exchange fallbacks after that
- `priceToBeat`
  - strike price for the live market
- `predictedFinalPrice`
  - model-implied final underlying price in USD terms
- `predictedDirection`
  - `UP` if `predictedFinalPrice >= priceToBeat`, otherwise `DOWN`
- `predictedLogReturn`
  - raw model output interpreted as `log(finalChainlinkPrice / priceToBeat)`
- `lastTrainedAt`
  - ISO timestamp of the most recently trained market for that slot, or `null` if the slot has never been trained
- `trainedMarketCount`
  - number of closed markets already absorbed into the checkpoint
- `generatedAt`
  - ISO timestamp emitted by this service when the response item was built

#### What the endpoint does internally

Prediction flow:

1. parse optional `asset` and `window`
2. build the current Polymarket slug for each requested slot via `@sha3/polymarket`
3. skip slots without checkpoints
4. load snapshots for the built slug from the collector
5. skip slots whose built slug is not yet available in collector storage
6. skip slots whose snapshot payload is empty
7. derive `priceToBeat` from the latest valid snapshot
8. resample the sequence into fixed-size buckets
9. project the exchange-only feature matrix
10. run TensorFlow inference
11. interpret the scalar output as `predictedLogReturn`
12. reconstruct `predictedFinalPrice`
13. return the response payload

## Compatibility

This service keeps compatibility only within the current `v2-exchange-light-book` regime.

Compatibility means:

- the checkpoint was trained with the same 32-feature exchange-only schema
- the checkpoint expects the same resampling regime
- the checkpoint expects the same target semantics
- the checkpoint expects the same two-layer GRU topology

Old checkpoints from the previous bounded-target regime are not reusable because all of these changed:

- feature set
- feature count
- target definition
- sequence length
- checkpoint metadata contract

## Configuration

All top-level keys from `src/config.ts` are documented here.

### HTTP and service identity

- `config.RESPONSE_CONTENT_TYPE`
  - Content type used by HTTP JSON responses.
  - Default: `application/json`

- `config.DEFAULT_PORT`
  - HTTP port used by `startServer()`.
  - Default: `3100`

- `config.HTTP_HOST`
  - HTTP bind host used by `startServer()`.
  - Default: `0.0.0.0`

- `config.SERVICE_NAME`
  - Name returned by the status endpoint.
  - Default: `@sha3/polymarket-model-farm`

### Collector integration

- `config.COLLECTOR_BASE_URL`
  - Base URL for collector HTTP requests.
  - Default: `http://localhost:3000`

- `config.COLLECTOR_MARKET_CACHE_TTL_MS`
  - In-memory TTL for `/markets?asset=...&window=...`.
  - Default: `15000`

- `config.COLLECTOR_SNAPSHOT_CACHE_TTL_MS`
  - In-memory TTL for `/markets/:slug/snapshots`.
  - Default: `0`

### Model storage

- `config.MODEL_STORAGE_DIR`
  - Base directory where slot checkpoints are stored.
  - Default: `./var/model`

### Model architecture

- `config.MODEL_GRU_UNITS_5M_PRIMARY`
  - Width of the first GRU layer for `5m` slots.
  - Default: `48`

- `config.MODEL_GRU_UNITS_5M_SECONDARY`
  - Width of the second GRU layer for `5m` slots.
  - Default: `24`

- `config.MODEL_GRU_UNITS_15M_PRIMARY`
  - Width of the first GRU layer for `15m` slots.
  - Default: `64`

- `config.MODEL_GRU_UNITS_15M_SECONDARY`
  - Width of the second GRU layer for `15m` slots.
  - Default: `32`

- `config.MODEL_DROPOUT_RATE`
  - Dropout applied to GRU layers.
  - Default: `0.1`

- `config.MODEL_LEARNING_RATE`
  - Adam learning rate.
  - Default: `0.0005`

- `config.MODEL_L2_REGULARIZATION`
  - L2 regularization strength.
  - Default: `0`

### Training loop

- `config.TRAINING_EPOCHS_PER_MARKET`
  - Number of epochs used each time one closed market is absorbed.
  - Default: `3`

- `config.TRAINING_BATCH_SIZE`
  - Batch size used by `model.fit`.
  - Default: `1`

- `config.TRAINING_MAX_MARKETS_PER_CYCLE`
  - Maximum number of closed, not-yet-trained markets loaded per slot in one training cycle.
  - Default: `1`

- `config.TRAINING_POLL_INTERVAL_MS`
  - Wait time between cycles when any work was found.
  - Default: `5000`

- `config.TRAINING_IDLE_BACKOFF_MS`
  - Wait time between cycles when no trainable markets were found.
  - Default: `60000`

- `config.TRAINING_CLOSE_GRACE_MS`
  - Grace period after market close before it becomes trainable.
  - Default: `20000`

### Feature projection

- `config.FEATURE_RESAMPLE_SECONDS_5M`
  - Resample bucket size for `5m` slots.
  - Default: `5`

- `config.FEATURE_RESAMPLE_SECONDS_15M`
  - Resample bucket size for `15m` slots.
  - Default: `10`

- `config.RECENT_TARGET_VALUE_LIMIT`
  - Number of recent target values kept in each training ledger.
  - Default: `32`

### Persisted model state

Each slot directory under `MODEL_STORAGE_DIR` contains:

- `model/`
- `metadata.json`
- `ledger.json`

Example layout:

```txt
var/model/
  btc-5m/
    model/
      model.json
      weights.bin
    metadata.json
    ledger.json
```

#### `model/`

TensorFlow artifact directory written by `tfjs-node`.

This directory stores the trained network weights and layer graph. The runtime loads it on startup and reuses it for both `predict()` and future `fit()` calls.

This directory is internal TensorFlow state, not business metadata.

#### `metadata.json`

Example:

```json
{
  "modelVersion": "btc-5m-2026-03-13T18:07:48.948Z",
  "featureSchemaVersion": "v2-exchange-light-book",
  "targetKind": "log-return",
  "featureCount": 32,
  "maxSequenceLength": 60,
  "gruUnitsPrimary": 48,
  "gruUnitsSecondary": 24,
  "dropoutRate": 0.1,
  "learningRate": 0.0005,
  "l2Regularization": 0,
  "resampleSeconds": 5,
  "checkpointedAt": "2026-03-13T18:07:48.948Z"
}
```

Field meanings:

- `modelVersion`
  - unique identifier derived from slot plus checkpoint timestamp
- `featureSchemaVersion`
  - schema tag for the current feature regime
- `targetKind`
  - semantic description of the training label
- `featureCount`
  - number of features per timestep expected by the checkpoint
- `maxSequenceLength`
  - maximum number of resampled timesteps accepted by the model
- `gruUnitsPrimary`
  - width of the first recurrent layer
- `gruUnitsSecondary`
  - width of the second recurrent layer
- `dropoutRate`
  - recurrent dropout setting used when the checkpoint was written
- `learningRate`
  - optimizer learning rate used by the checkpoint
- `l2Regularization`
  - L2 setting used when the checkpoint was built
- `resampleSeconds`
  - bucket size used during feature projection
- `checkpointedAt`
  - ISO timestamp when the checkpoint was last persisted

`metadata.json` explains what the checkpoint expects: feature count, sequence length, GRU widths, target semantics, and the resampling regime that produced it.

#### `ledger.json`

Example:

```json
{
  "asset": "btc",
  "window": "5m",
  "trainedMarketSlugs": [
    "btc-updown-5m-1773424800",
    "btc-updown-5m-1773425100"
  ],
  "trainedMarketCount": 587,
  "lastTrainedSlug": "btc-updown-5m-1773425100",
  "lastTrainedAt": "2026-03-13T18:07:48.948Z",
  "modelVersion": "btc-5m-2026-03-13T18:07:48.948Z",
  "recentTargetValues": [0.0012, -0.0008, 0.0031]
}
```

Field meanings:

- `asset`
  - slot asset
- `window`
  - slot window
- `trainedMarketSlugs`
  - full list of market slugs already absorbed into this checkpoint
- `trainedMarketCount`
  - count of absorbed markets
- `lastTrainedSlug`
  - slug of the most recent market trained into the checkpoint
- `lastTrainedAt`
  - ISO timestamp of the most recent training update
- `modelVersion`
  - model version active when the ledger was last updated
- `recentTargetValues`
  - compact rolling history of the latest target values, stored as `log(finalChainlinkPrice / priceToBeat)`

`ledger.json` is the runtime memory for the slot. It prevents replaying already-trained markets, exposes training maturity, and keeps a compact rolling record of the latest target values.

## Scripts

Useful scripts:

- `npm start`
  - start the service
- `npm test`
  - run the test suite
- `npm run standards:check`
  - run project contract verification
- `npx tsc --noEmit --pretty false`
  - run TypeScript checks
- `npm run check`
  - run the full project gate

## Structure

Repository layout:

```txt
src/
  app/
  app-info/
  collector/
  feature/
  http/
  model/
  prediction/
  training/
```

Folder roles:

- `app/`
  - runtime composition
- `app-info/`
  - status payload builder
- `collector/`
  - HTTP integration with the snapshot collector
- `feature/`
  - resampling and exchange feature projection
- `http/`
  - Hono server and route parsing
- `model/`
  - TensorFlow definition, persistence, and registry state
- `prediction/`
  - raw prediction assembly and query endpoint orchestration
- `training/`
  - continuous training loop

## Troubleshooting

### Why does `/predictions` return an empty array?

Common reasons:

- there is no live market for the requested slot
- the live market has no usable `priceToBeat`
- the live market has no snapshots yet
- the slot has never produced a checkpoint

### Why does `/predictions` return `400`?

The most common cause is an invalid query filter, for example:

- unsupported `asset`
- unsupported `window`

The endpoint can also return `400` if the prediction request fails globally for another reason, such as an unexpected collector or model error.

### Why is there no confidence score?

This service intentionally exposes the raw model output and the derived USD final price only.

Confidence, calibration, trade filtering, and execution logic belong to downstream strategy services.

### Why does the endpoint return `predictedFinalPrice` and `predictedLogReturn`?

The model is trained on:

```ts
Math.log(finalChainlinkPrice / priceToBeat)
```

That scalar is the cleanest raw output for the model contract.

The service also reconstructs:

```ts
predictedFinalPrice = priceToBeat * Math.exp(predictedLogReturn)
```

because downstream consumers often want the result in business terms, not only as a log return.

### Why is `prevPriceToBeat` no longer required?

The current feature regime no longer uses previous strike history in the model input.

The collector may still expose `prevPriceToBeat` for other consumers, but this service ignores it.

### Why is `DELTA_TARGET_SCALE` gone?

The old regime compressed the target into a bounded space and reconstructed it later.

The current regime uses a log-return target directly:

```ts
target = Math.log(finalChainlinkPrice / priceToBeat)
```

That removes the need for:

- `DELTA_TARGET_SCALE`
- `tanh` target compression
- `atanh` prediction reconstruction

### Why are old checkpoints not reusable?

The service changed all of these at once:

- feature set
- feature count
- resampling regime
- target semantics
- architecture metadata

That means old checkpoints no longer describe the same modeling contract and must not be reused.

## AI Workflow

Recommended workflow:

1. use this service for continuous training and raw exchange-only prediction
2. consume `GET /predictions` from a downstream strategy service
3. implement Polymarket validation, pricing filters, persistence, dashboards, monitoring, and execution outside this repo

This package is intentionally the TensorFlow layer only.
