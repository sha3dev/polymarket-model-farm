# @sha3/polymarket-model-farm

Train and serve eight TensorFlow GRU models for Polymarket crypto window markets: `btc|eth|sol|xrp` across `5m|15m`.

## TL;DR

```bash
npm install
npm run check
npm run start
```

Then open `http://0.0.0.0:3000/dashboard`.

## Why

This service exists to turn full Polymarket market lifecycles into recurrent TensorFlow training samples and expose one-shot `UP/DOWN` predictions early enough to evaluate a hold-to-expiry strategy.

## Main Capabilities

- trains eight GRU model slots continuously from the collector history
- keeps exchange and Polymarket order book state as sequence features
- emits staged live predictions at the configured `LIVE_PREDICTION_PROGRESS_STEPS`, keeping the first one that clears the confidence threshold
- stores prediction history locally so hits and misses remain visible in the dashboard

## Setup

```bash
npm install
npm run check
npm run start
```

The service expects a running `polymarket-snapshot-collector` at `http://localhost:3000` unless `COLLECTOR_BASE_URL` overrides it.

## Usage

Start the full runtime:

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const runtime = ServiceRuntime.createDefault();
await runtime.startServer();
```

Build the server without binding a port:

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const runtime = ServiceRuntime.createDefault();
const server = runtime.buildServer();
```

Read current live predictions:

```bash
curl "http://127.0.0.1:3000/predictions?asset=btc&window=5m"
```

Open the evaluation dashboard:

```bash
open http://127.0.0.1:3000/dashboard
```

## API

## Installation

```bash
npm install
```

## Running Locally

```bash
npm run start
```

Default bind: `http://0.0.0.0:3000`.

## Examples

Read live BTC `5m` predictions:

```bash
curl "http://127.0.0.1:3000/predictions?asset=btc&window=5m"
```

Build the server without binding:

```ts
import { ServiceRuntime } from "@sha3/polymarket-model-farm";

const runtime = ServiceRuntime.createDefault();
const server = runtime.buildServer();
```

## HTTP API

### `GET /`

Returns runtime metadata:

```json
{
  "ok": true,
  "serviceName": "@sha3/polymarket-model-farm",
  "supportedAssets": ["btc", "eth", "sol", "xrp"],
  "supportedWindows": ["5m", "15m"]
}
```

### `GET /predictions?asset=&window=`

Returns the latest one-shot live predictions already emitted for the currently active markets. `asset` and `window` are optional filters.

```json
{
  "predictions": [
    {
      "slug": "btc-5m-2026-03-13-12-00",
      "asset": "btc",
      "window": "5m",
      "snapshotCount": 450,
      "progress": 0.78,
      "confidence": 0.91,
      "predictedDelta": 0.0062,
      "predictedDirection": "UP",
      "observedPrice": 84321.4,
      "modelVersion": "btc-5m-2026-03-13T11:58:10.000Z",
      "trainedMarketCount": 0,
      "generatedAt": "2026-03-13T11:58:45.000Z"
    }
  ]
}
```

Behavior notes:

- predictions are attempted at each configured progress step from `LIVE_PREDICTION_PROGRESS_STEPS`
- the first attempt whose confidence clears `MIN_VALID_PREDICTION_CONFIDENCE` and whose raw model-vs-market disagreement stays within `MAX_MODEL_MARKET_DISAGREEMENT` is the one persisted for that market
- confidence is a blended probability in `[0, 1]` that combines the model view with the live market price when `UP/DOWN` prices exist
- higher confidence means the final blended view is more favorable to the chosen side
- confidence is calculated in six steps:
  1. the model outputs a bounded value in `[-1, 1]`
     `-1` means a very strong negative delta estimate, `+1` means a very strong positive delta estimate, and values near `0` mean the model is close to neutral
     this bounded output exists because the training target is squashed through `tanh`, so the network learns a stable normalized version of the final delta instead of an unbounded raw price move
     during training, the real target delta is:
     `rawTargetDelta = (finalChainlinkPrice - priceToBeat) / priceToBeat`
     and the bounded target given to the model is:
     `boundedTarget = tanh(rawTargetDelta / DELTA_TARGET_SCALE)`
     we use `boundedTarget` because the raw delta is unbounded and can contain tails or rare large moves that would otherwise dominate the loss
     bounding the target keeps training numerically stable, preserves the sign of the move, and still lets the model express stronger vs weaker outcomes inside a controlled range
  2. that value is converted back into an unbounded `predictedDelta` with `atanh(modelOutput) * DELTA_TARGET_SCALE`
  3. a confidence reference delta is chosen from the smallest positive real delta signal available for that slot:
     `min(recentReferenceDelta, prevBeatMeanDelta)`, with a fallback floor of `0.0001`
  4. the raw model probability is `modelPUp = sigmoid(predictedDelta / (confidenceReferenceDelta * CONFIDENCE_DELTA_FACTOR))`
  5. if the latest snapshot has a live `upPrice` or `downPrice`, the market-implied `p(UP)` is read from that price and converted to log-odds
  6. the final blended `p(UP)` is:
     `sigmoid(logit(modelPUp) * CONFIDENCE_MODEL_WEIGHT + logit(marketPUp) * CONFIDENCE_MARKET_WEIGHT)`
- if `predictedDelta >= 0`, the stored confidence is the blended `p(UP)`; otherwise it is the blended `p(DOWN) = 1 - p(UP)`
- if no live `UP/DOWN` price is available, confidence falls back to the raw model probability
- this means confidence measures directional likelihood after blending model conviction with market conviction; it is not expected PnL
- inverse reading examples:
  - `confidence = 0.50` means the final blended log-odds are near `0`; either the model is near-neutral, or the model and market are offsetting each other
  - `confidence = 0.20` on an `UP` call means the model may still point `UP`, but once market pricing is included the final `UP` probability looks weak and likely should not pass the trading threshold
  - `confidence = 0.70` means the combined model+market view materially favors the chosen side
  - `confidence = 0.90` means both the model signal and the market-adjusted blend still strongly support the chosen side

### `GET /api/dashboard`

Returns the full dashboard payload with current market state, model status, latest prediction, and historical prediction rows for every `asset/window` pair.

### `GET /dashboard`

Returns a lightweight HTML dashboard for manual evaluation.

## Feature Engineering

Each snapshot becomes one row with `91` features. The model sees the full ordered sequence from market open to the current snapshot.

### Market context features

- `progress`: normalized market progress from `0` to `1`
- `price-to-beat`: raw `priceToBeat`
- `log-price-to-beat`: `log(priceToBeat)`
- `prev-beat-mean-delta`: mean absolute delta between `priceToBeat` and `prevPriceToBeat[]`

### Exchange-led features

For each provider `chainlink`, `binance`, `coinbase`, `kraken`, and `okx`, the row includes:

- `availability`
- `price-vs-price-to-beat`
- `momentum10s`
- `momentum30s`
- `momentum60s`
- `volatility10s`
- `volatility30s`
- `volatility60s`
- `best-bid-vs-price-to-beat`
- `best-ask-vs-price-to-beat`
- `spread-normalized-by-mid`
- `mid-vs-price-to-beat`
- `top-book-imbalance`

These are intentionally exchange-separated. The service does not average venues together before the model sees them.

### Cross-exchange structure features

- `external-price-range-normalized`
- `external-stddev-normalized`
- `external-source-count-normalized`
- `chainlink-vs-exchange-median`

These summarize disagreement and coverage across external providers.

### Polymarket state features

- `up-price`
- `down-price`
- `up-down-price-gap`
- `up-mid`
- `down-mid`
- `up-mid-minus-down-mid`
- `polymarket-overround`
- `polymarket-mid-overround`

### Polymarket order book features

For both `up` and `down` books:

- `best-bid`
- `best-ask`
- `spread`
- `mid`
- `top-book-imbalance`

## Training Design

- There are eight independent model slots: one per `asset/window`.
- Architecture: stacked GRU -> GRU -> dense -> dense(`tanh`).
- Input: full market snapshot sequence, up to `600` steps for `5m` and `1800` steps for `15m`.
- Target: `(finalChainlinkPrice - priceToBeat) / priceToBeat`, bounded with `tanh(delta / DELTA_TARGET_SCALE)` during training.
- Training order: oldest closed markets first, one market per pair per cycle, fully sequential across the whole process.
- Invalid markets are skipped when they lack `priceToBeat`, `prevPriceToBeat`, a valid final Chainlink price, or exceed the expected sequence length.
- When no work is available, the trainer sleeps for `TRAINING_IDLE_BACKOFF_MS`.
- If a market fails, the error is logged and the loop advances to the next candidate.

## Public API

### `ServiceRuntime`

Main entrypoint for composing the service.

#### `createDefault()`

Creates the default runtime with collector client, feature projector, model registry, training loop, live prediction loop, dashboard, and Hono HTTP server.

Returns:

- `ServiceRuntime`

#### `buildServer()`

Builds the HTTP server without opening a socket.

Returns:

- Hono Node `ServerType`

Behavior notes:

- useful for integration tests
- does not initialize models or background loops

#### `startServer()`

Initializes storage, starts training and live prediction loops, and binds the server on `HTTP_HOST:DEFAULT_PORT`.

Returns:

- `Promise<ServerType>`

#### `stop()`

Stops background loops and closes the bound server if one is running.

Returns:

- `Promise<void>`

### `AppInfoPayload`

```ts
type AppInfoPayload = {
  ok: true;
  serviceName: string;
  supportedAssets: readonly string[];
  supportedWindows: readonly string[];
};
```

### `PredictionResponsePayload`

```ts
type PredictionResponsePayload = { predictions: PredictionItem[] };
```

Behavior notes:

- `PredictionItem.confidence` is a blended probability-style score in `[0, 1]`
- `PredictionItem.predictedDelta` is the unbounded delta estimate restored from the model output
- `PredictionItem.confidence` is derived from `predictedDelta`, the slot reference delta, the live `UP/DOWN` price when available, and the confidence weight config; it is not a raw neural-network output field

### `DashboardPayload`

```ts
type DashboardPayload = {
  generatedAt: string;
  cards: DashboardModelCard[];
};
```

Behavior notes:

- one `card` exists per `asset/window`
- each card includes current live market state, backlog, model slot status, latest prediction, and prediction history

## Compatibility

- Node.js 20+
- ESM
- TypeScript
- TensorFlow via `@tensorflow/tfjs-node`

## Configuration

All runtime defaults live in `src/config.ts`.

- `config.RESPONSE_CONTENT_TYPE`: JSON content type for API routes.
- `config.HTML_CONTENT_TYPE`: HTML content type for the dashboard page.
- `config.DEFAULT_PORT`: listening port for `startServer()`.
- `config.HTTP_HOST`: bind host for `startServer()`.
- `config.SERVICE_NAME`: service name reported by `GET /`.
- `config.COLLECTOR_BASE_URL`: base URL for `polymarket-snapshot-collector`.
- `config.MODEL_STORAGE_DIR`: directory for TensorFlow checkpoints and training ledgers.
- `config.HISTORY_STORAGE_DIR`: directory for persisted prediction history JSON files.
- `config.MODEL_GRU_UNITS_5M`: GRU width for `5m` models.
- `config.MODEL_GRU_UNITS_15M`: GRU width for `15m` models.
- `config.MODEL_DROPOUT_RATE`: dropout applied to GRU layers.
- `config.MODEL_LEARNING_RATE`: Adam learning rate.
- `config.MODEL_L2_REGULARIZATION`: L2 regularization for GRU and dense weights.
- `config.TRAINING_EPOCHS_PER_MARKET`: epochs applied to each market sequence.
- `config.TRAINING_BATCH_SIZE`: batch size used per market fit call.
- `config.TRAINING_MAX_MARKETS_PER_CYCLE`: maximum closed markets trained per pair per cycle.
- `config.TRAINING_POLL_INTERVAL_MS`: delay after a productive training cycle.
- `config.TRAINING_IDLE_BACKOFF_MS`: delay when no trainable markets are available.
- `config.TRAINING_CLOSE_GRACE_MS`: grace period after market end before training.
- `config.DELTA_TARGET_SCALE`: scale used to squash raw deltas into the `tanh` training target.
- `config.RECENT_TARGET_DELTA_LIMIT`: rolling window size for recent observed target deltas.
- `config.MIN_TRAINED_MARKETS_FOR_PREDICTION`: minimum closed-market count required before a slot can emit live predictions.
- `config.PREDICTION_HISTORY_LIMIT`: maximum stored live predictions per pair.
- `config.CONFIDENCE_DELTA_FACTOR`: factor that maps predicted delta into a probability-style confidence score.
  Lower values make confidence more aggressive; higher values compress it closer to `0.5`.
- `config.CONFIDENCE_MODEL_WEIGHT`: weight of the model log-odds inside the blended confidence calculation.
- `config.CONFIDENCE_MARKET_WEIGHT`: weight of the market-implied log-odds inside the blended confidence calculation.
- `config.MAX_MODEL_MARKET_DISAGREEMENT`: maximum allowed absolute gap between raw model confidence and market-implied probability for the chosen side before a live prediction is rejected.
- `config.MIN_VALID_PREDICTION_CONFIDENCE`: minimum confidence required for a live prediction to be persisted and for a resolved prediction to count toward dashboard result and hit rate.
- `config.SHOULD_RECALCULATE_HISTORY_CONFIDENCE_ON_STARTUP`: when `true`, rewrites persisted history confidence values during startup using the current confidence formula.
- `config.LIVE_PREDICTION_PROGRESS_STEPS`: ordered list of staged live-prediction thresholds between `0` and `1`.
- `config.LIVE_PREDICTION_POLL_INTERVAL_MS`: polling cadence for current live markets.
- `config.COLLECTOR_STATE_CACHE_TTL_MS`: in-memory TTL for `/state`, `1000ms` by default so the dashboard can show live movement.
- `config.COLLECTOR_MARKET_CACHE_TTL_MS`: in-memory TTL for `/markets`.
- `config.COLLECTOR_SNAPSHOT_CACHE_TTL_MS`: in-memory TTL for `/markets/:slug/snapshots`.

## Scripts

- `npm run standards:check`: verify structure, README coverage, and contract rules
- `npm run typecheck`: run `tsc --noEmit`
- `npm run test`: run the `node:test` suite
- `npm run check`: run standards, lint, format, typecheck, and tests
- `npm run start`: start the service from `src/main.ts`

## Structure

- `src/app/service-runtime.service.ts`: runtime composition and lifecycle
- `src/collector/*`: collector API client and source-market types
- `src/feature/*`: feature labels, stats, and sequence projection
- `src/model/*`: TensorFlow model definition, registry, and persistence
- `src/training/*`: sequential trainer loop
- `src/prediction/*`: delta-to-confidence prediction logic and live prediction tracking
- `src/dashboard/*`: dashboard JSON payload and HTML rendering
- `test/*.test.ts`: behavior tests

## Troubleshooting

### No models are predicting yet

The prediction route only returns markets that already crossed the first configured staged threshold in `LIVE_PREDICTION_PROGRESS_STEPS` and for which a model checkpoint exists.

### The trainer appears idle

This is expected when the collector has no new closed markets. The service backs off for `TRAINING_IDLE_BACKOFF_MS` and retries.

### `npm run standards:check` reports managed file issues

Those warnings mean a managed project file changed. In this repository, `AGENTS.md`, `ai/contract.json`, and `biome.json` are contract-owned files and should only change during an explicit standards update.

## AI Workflow

- Read `AGENTS.md`, `ai/contract.json`, `ai/rules.md`, and the assistant adapter before implementation work.
- Keep managed contract files read-only during normal feature work.
- Preserve the class-first feature layout under `src/`.
- Run `npm run standards:check` and `npm run check` before finalizing.
