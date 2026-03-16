# Prompt Base Para `polymarket-crypto-bot`

## Objetivo

Quiero que diseñes e implementes un servicio llamado `polymarket-crypto-bot`.

Este servicio debe consumir dos dependencias externas:

- `polymarket-snapshot-collector`
- `polymarket-model-farm`

El objetivo del bot es ejecutar toda la lógica operativa que ya no vive en `polymarket-model-farm`.

`polymarket-model-farm` solo hace dos cosas:

- entrenamiento continuo de modelos
- endpoint `GET /predictions` con predicción raw del modelo

El bot debe asumir explícitamente que:

- `model-farm` no mezcla la predicción con el mercado
- `model-farm` no decide compras
- `model-farm` no persiste history operativo
- `model-farm` no mantiene dashboard

## Contrato esperado con `polymarket-model-farm`

El bot debe consumir `GET /predictions`.

Ese endpoint usa los mercados live actuales del collector y acepta filtros opcionales:

- `asset`
- `window`

La respuesta incluye como mínimo:

- `slug`
- `asset`
- `window`
- `snapshotCount`
- `progress`
- `predictedDelta`
- `predictedDirection`
- `observedPrice`
- `modelVersion`
- `trainedMarketCount`
- `generatedAt`

`predictedDelta` debe tratarse como la señal raw del modelo. No es una decisión de compra y no incorpora precio de mercado.

## Responsabilidades del bot

El bot debe implementar una réplica fiel de la lógica operativa que antes vivía en el servicio antiguo.

### 1. Estrategia y decisión de compra

El bot debe:

- leer periódicamente `GET /predictions`
- leer el estado de mercado necesario desde el collector
- combinar la señal raw del modelo con el precio actual del mercado
- decidir si una predicción termina en compra real o en shadow prediction

Debe soportar como mínimo:

- cálculo propio de confidence operativa a partir de `predictedDelta`
- filtro por rango válido de `entry price`
- filtro por desacuerdo máximo entre modelo y mercado
- uso explícito de `edge`
- cálculo de `opportunity score`
- una sola compra por mercado

### 2. Predicciones shadow vs ejecutadas

El bot debe diferenciar claramente:

- predicciones emitidas pero no ejecutadas
- predicciones ejecutadas como compra

Cada predicción debe registrar al menos:

- si fue `executed`
- si fue `shadow`
- `skipReason` cuando no se ejecuta

Ejemplos de `skipReason`:

- `low_confidence`
- `bad_entry_price`
- `high_disagreement`
- `low_hit_rate`
- `low_edge`
- `low_opportunity_score`

### 3. Hit rate y gating por calidad

El bot debe mantener hit rate propio por slot.

Debe soportar:

- rolling hit rate sobre una ventana móvil
- tamaño mínimo de muestra antes de usar el gating
- umbral mínimo de hit rate para permitir compras

Importante:

- el hit rate usado para desbloquear compras no debe depender solo de trades ejecutados
- las shadow predictions resueltas deben seguir actualizando la métrica del modelo
- esto evita condenar un modelo para siempre por haber sido bloqueado demasiado pronto

### 4. Resolución de predicciones

El bot debe resolver cada predicción cuando el mercado cierre.

Debe ser capaz de:

- localizar el cierre del mercado
- decidir el resultado final usando el estado final del mercado
- calcular si la predicción fue correcta o no
- actualizar el registro histórico

### 5. PnL y resultado

El bot debe calcular resultado económico acumulado.

Debe soportar:

- cálculo de beneficio/pérdida por predicción ejecutada
- acumulado por slot
- acumulado total
- acumulado separado por ventanas `5m` y `15m`

Si usas reglas de compra mínima, deben vivir aquí y no en `model-farm`.

### 6. Persistencia

El bot debe tener almacenamiento propio para:

- predicciones emitidas
- shadow predictions
- trades ejecutados
- resultados resueltos
- métricas por slot
- PnL acumulado

No dependas de que `model-farm` persista nada operativo.

La persistencia debe diseñarse de forma explícita. No quiero una colección opaca de blobs sin semántica.

Como base, el bot debe guardar al menos estas entidades.

#### `prediction_history`

Una fila por predicción emitida, tanto si acaba en trade ejecutado como si no.

Campos mínimos:

- `slug`
- `asset`
- `window`
- `marketStart`
- `marketEnd`
- `predictionMadeAt`
- `progressWhenPredicted`
- `observedPrice`
- `entryPrice`
- `upPrice`
- `downPrice`
- `predictedDelta`
- `rawModelConfidence`
- `predictedDirection`
- `modelVersion`
- `wasExecuted`
- `skipReason`
- `actualDelta`
- `actualDirection`
- `isCorrect`

Uso:

- auditar qué dijo el modelo en cada mercado
- separar shadow predictions de trades ejecutados
- recalcular métricas si cambia la lógica del dashboard
- construir histórico detallado por slot
- resolver mercados cerrados sin perder el contexto de entrada

#### `execution_log`

Una fila por operación que sí terminó en compra.

Campos mínimos:

- `slug`
- `asset`
- `window`
- `executedAt`
- `side`
- `entryPrice`
- `sharesBought`
- `notionalUsd`
- `rawModelConfidence`
- `marketProbabilityAtEntry`
- `edgeAtEntry`
- `opportunityScore`
- `modelVersion`
- `settledPnlUsd`
- `settledAt`

Uso:

- medir la operativa real y no solo la calidad del modelo
- calcular PnL acumulado
- separar claramente evaluación de modelo y ejecución
- soportar reporting financiero y debugging operativo

#### `slot_metrics`

Una fila o documento por slot `asset/window`.

Campos mínimos:

- `asset`
- `window`
- `rollingHitRate`
- `rollingResolvedCount`
- `executedHitRate`
- `executedResolvedCount`
- `cumulativePnlUsd`
- `cumulativeExecutedTrades`
- `cumulativeShadowPredictions`
- `lastPredictionAt`
- `lastExecutionAt`
- `lastSettledAt`

Uso:

- gating por hit rate
- pintar widgets del dashboard sin recalcular todo el histórico en cada request
- comparar slots dentro de una misma ventana
- saber si un slot está activo, frío o degradado

#### `open_predictions`

Conjunto de predicciones todavía no resueltas.

Campos mínimos:

- `slug`
- `asset`
- `window`
- `wasExecuted`
- `predictionMadeAt`
- `marketEnd`
- `entryPrice`
- `predictedDirection`

Uso:

- resolver rápidamente cierres sin releer todo el histórico
- minimizar llamadas al collector
- mantener un backlog operativo pequeño y explícito

#### `dashboard_cache` o proyección equivalente

No tiene por qué ser una tabla separada si no hace falta, pero el bot debe mantener una proyección eficiente para servir dashboard.

Datos mínimos proyectados:

- latest call por slot
- trade status
- skip reason
- live prices `UP/DOWN`
- entry price
- confidence operativa del bot
- result acumulado
- hit rate
- total `5m`
- total `15m`
- total global

Uso:

- servir dashboard rápido
- evitar recomputar todo desde `prediction_history` en cada refresh

### Estrategia de persistencia actual que quiero conservar conceptualmente

Quiero que el bot mantenga la misma idea operativa que teníamos:

- toda predicción emitida se guarda
- una predicción puede ser `shadow` o `executed`
- solo las ejecutadas impactan PnL real
- tanto `shadow` como `executed` actualizan la calidad del modelo una vez resueltas
- el dashboard debe poder distinguir claramente ambas
- el histórico debe conservar datos de entrada y de resolución

### Para qué usamos cada capa de datos

- `prediction_history`: verdad operativa completa, debugging y analytics
- `execution_log`: verdad económica de compras reales
- `slot_metrics`: gating rápido y widgets de resumen
- `open_predictions`: resolución eficiente de mercados cerrados
- `dashboard projection`: serving rápido del dashboard

### Requisitos de diseño de persistencia

- la persistencia debe permitir reconstruir el estado completo del bot tras reinicio
- la persistencia debe soportar polling continuo sin crecer en complejidad accidental
- las escrituras deben ser idempotentes por `slug` cuando aplique
- debe ser fácil distinguir:
  - predicción emitida
  - predicción ejecutada
  - predicción resuelta
  - trade con PnL final
- no quiero que el dashboard dependa de scans completos del histórico en cada request

### 7. Dashboard

El bot debe mantener un dashboard propio.

Ese dashboard debe incluir como mínimo:

- estado live por slot
- latest call
- trade status (`Executed` o `Shadow`)
- skip reason
- precios `UP` y `DOWN`
- `entry price`
- `confidence` calculada por el bot a partir de `predictedDelta` y mercado
- `result` acumulado
- `hit rate`
- totales agregados
- separación por `5m` y `15m`
- modal o vista de histórico reciente

## Reglas de diseño

- Mantén `polymarket-model-farm` como proveedor raw de inferencia.
- No reintroduzcas lógica de bot dentro de `model-farm`.
- El bot debe ser el único dueño del dashboard y de la history operativa.
- La persistencia del bot debe ser explícita y trazable.
- La UI debe mostrar con claridad cuándo una señal fue comprada y cuándo no.

## Exclusiones claras

No quiero que `polymarket-crypto-bot`:

- modifique el entrenamiento dentro de `model-farm`
- altere checkpoints de `model-farm`
- dependa de un dashboard dentro de `model-farm`
- suponga que `predictedDelta` ya incorpora precio de mercado

## Criterios de aceptación

Considera la implementación correcta solo si:

- el bot consume `GET /predictions` de `model-farm`
- la lógica de compra vive por completo en el bot
- el bot mantiene shadow y executed predictions por separado
- el hit rate se usa sin impedir que los modelos sigan acumulando evidencia
- el dashboard del bot reemplaza por completo al dashboard eliminado de `model-farm`
- el bot puede calcular PnL, hit rate y resultado por slot y agregado
- el sistema deja clara la frontera:
  - `model-farm` = training + raw inference
  - `polymarket-crypto-bot` = strategy + persistence + dashboard + execution logic
