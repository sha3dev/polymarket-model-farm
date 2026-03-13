Read these files before making any implementation changes:

- `AGENTS.md`
- `ai/contract.json`
- `ai/rules.md`
- `prompts/init-contract.md`
- the assistant-specific adapter in `ai/`

Your job is to implement the requested behavior in the scaffold under `src/` and `test/` following the rules in `ai/rules.md` and `prompts/init-contract.md`.

## Package Specification

- Goal:
- Public API:
- Runtime constraints:
- Required dependencies:
- Feature requirements:

## Non-Negotiables

- You MUST execute `npm run check` yourself before finishing.
- If `npm run check` fails, you MUST fix the issues and rerun it until it passes.
- You MUST implement the task without editing managed files unless this is a standards update.

## Implementation Request

Complete this section before sending the prompt to your LLM.
Describe the behavior you want to implement, the expected public API, any runtime constraints, and any non-goals.

Task:

Este servicio va a tener como misión el crear y entrenar 8 modelos de TensforFlow para predecir los mercados de 5m/15m para
BTC, ETH, SOL, y XRP de Polymarket.

Utilizará un servicio externo (polymarket-snapshot-collector) para obtener los datos de los mercados. Ese servicio expoone varios endpoints, 
que estan documentados en el archivo README.md del servicio (https://github.com/sha3dev/polymarket-snapshot-collector).

El servicio estará por defecto en http://localhost:3000 (definible por configuración, por ejemplo ahora lo tenemos accesible en 
http://192.168.1.2:3000).

El nuevo servicio polymarket-model-farm hará lo siguiente:

    * Obtener datos de entrenamiento de los endpoints de polymarket-snapshot-collector
    * entrenar los 8 modelos constantemente con los nuevos mercados que vayan llegando
    * exponer una API que recibirá como parámetro (opcionales window=5m|15m y asset=btc|eth|sol|xrp) y devolver un array de "predicciones".
      Estas predicciones nos indicará la confianza de que el mercado termine en "Yes" o "No".

Para implementar esto, lo primero que tenemos que hacer es definir como vamos a parametrizaer los nuevos modelos. Mi idea es usar modelos GRU con memoria,
ya que entrenaremos a los modelos con snapshots de mercados completos (es decir, cada batch de entreno contendrá todos los snapshots de un mismo mercado, 
desde el inicio hasta el cierre, lo que pueden ser unos 600 snapshots para mercados de 5m y 1800 para mercados de 15m). Y las predicciones las haremos
pasando todos los snapshots de un mercado en curso, desde el inicio hasta el momento actual. Hay que diseñar el modelo de TensorFlow teniendo en cuenta que
es MUY importante y muy util que el modelo sea capaz de recordar, al menos lo que ha pasado en ese mercado en curso.

Una vez definidos los 8 modelos (quizas lo mas razonable es que sean casi iguales, quizas introiduciendo algun ajuste diferente entre modelos 5m/15m),
tenemos que diseñar el plan de "entreno". Mi idea es que el servicio vaya pidiendo mercados a polymarket-snapshot-collector y los use para entrenar los modelos.
Comenzando por los mas "viejos" y avanzando. Al comenzar tendremos muchos mercados disponibles, pero igual llega el momento en el que ya hemos usado todos los 
datos de entreno y tenemos que esperar a que se generen mas.

Como features de entreno quiero usar todos los datos utiles que nos proporcionan los mercados/snapshots (precios, midprice, etc) de cada asset en cada exchange, precios
y info derivada de los orderbooks de los tokens up and down, etc. MUY importante añadir tambien como feature el progreso de la ventana (numero de 0 a 1) y
features que usen el "priceToBeat" del mercado actual. Como target quiero que el modelo sea capaz de predecir el delta del precio del asset respecto al priceToBeat.
La decisión de que features usar, que datos derivar, que ventanas internas de tiempo usar (por ejemplo, si usamos como feature la volatilidad reciente a 10s, 30s, 60s..)
es la CLAVE del exito de este proyecto. Quiero que uses todos tus conocmimentos de mercados, quant trading, micro estructuras para diseñar el mejor juego de features posible.
Como target propongo usar (precio final al cierre del mercado - prriceTobbeat)/priceToBeat. como precio de cierre de mercado podemos usar el ultimo valor del precio
de chainlink (si este realmente es muy proximo al cierre del mercado). Quiero que en el README quede PERFECTAMENTE documentado como se construye el array de features, 
que valores se meten y lo que representan. Quiero que diseñes las features con esto MUY presente: el ÚNICO objetivo del modelo es predecir UP/DOWN una UNICA vez,
loa antes posible. Usaremos el modelo de forma "one shoot", es decir, cuando el modelo nos diga que tiene confianza >= a un umbral, compraremos UP/DOWN y lo agunataremos
hasta el final. Es decir, solo me interesa una predicción, la primera.

El número de features debería ser contenido, no mas de 80-10, con pocas features derivadas. Solo quiero las features que realmente aporten valor, y que el modelo no pueda
derivar por el mismo. Vamos a entrernar al modelo con miles de ventanas, así que debemos confiar en que el mismo encontrará las derivaciones necesarias.

OJO con sobre-utilizar features de polymarket, ya que esas features ya llevan información del mercado que el modelo debería poder derivar por sí mismo. No caigamos en el error
de diseñar un modelo que predice UP o DOWN a partir ÚNICAMENTE del precio actual del mercado. Nuestra fuente de información principal deberñia ser:

  1) order books de los exchanges (mantenemos exchanges separados, no hacemos medias ni nada por el estilo)
  2) precio de exchanges (mantenemos exchanges separados, no hacemos medias ni nada por el estilo)
  3) order books de polymarket
  4) precio de polymarket

A la hora de entrenar, debes tener en cuenta las siguientes cosas:

  - Puede no haber mercados disponibles para entrenar, en ese momento nos esperamos un minuto y volvemos a intentar
  - Puede que un mercado no sea valido para entrenar, por ejemplo un caso claro es el primer mercado, del cual no tendremos "prevPriceToBeat", con lo que posiblemente no podamos construir las features que hacen falta.
  - Nuestro modelo debe tener como target el delta del precio del asset (que % acabara por debajo/arriba BTC, ETH, SOL, XRP respecto al price to beat)
  - Nuestro servicio nunca puede entrenar mas de un modelo a la vez, por un tema de recursos de máquina. El entreno debe ser secuencial, y balanceado entre pares window/asset.
  - El flujo de entreno debe ser resiliente, si se produce un error en el entreno de un mercado, escribimos log y pasamos al siguiente
  - Me gustaria ver info por el log cuando se van acabando entrenos.

Nuestro endpoint de predicciones decidirá si predice UP/DOWN para un par asset/window teniendo en cuenta el resultado del modelo (delta) y los ultimos deltas registrados. De forma que si el delta predecido es 
muy superior a la media de los ultimos deltas registrados la confianza sera 1, si es muy inferior -1 (el resultado debe ser entre -1 y 1). Este comportamiento me gustaría controlarlo con algun tipo de factor.
Del estilo... si el delta actual * N (N=0.75 por ejemplo) la confianza es 1

Por ultimo, necesito un dashboard web (posiblemente temporal) donde poder ver el estado de los modelos entrenados y como de buenas van siendo sus predicciones. 
El objetivo es poder evaluar los modelos. Me gustaría ver:

  * El estado actual de los 8 mercados. Un widget por mercado, y separando claramente los mercados de 5m/15m. Quiero ver claramente si el mercado está UP o DOWN en cada momento. Esta info
    la podemos sacar del endpoint state de polymarket-snapshot-collector

  * En cada widget, quiero ver cual ha sido la ultima predicción para ese mercado. Para hacer predicciones sobre el mercado actual, puedes utilizar la libreria @sha3/polymarket-snapshot, que
    nos proporcionará snapshots en tiempo real. Para no consumir muchos recursos, solo haremos 1 predicción por ventana al 75% del progreso de la ventana.
    En cada mercado "vivo" quiero ver el valor de prediccion hecha (si ya se ha hecho): la confianza que calculamos y el precio del asset en el momento que se hizo la predicción.

  * Para cada modelo quiero ver tambien el historico de predicciones que ha hecho, y si han resultado o no acertadas. Puedes guardarla en local, en un JSON o como sea mas sencillo.

  * Intenta hacer todo de la forma mas eficiente posible. Reduciendo llaamdas, etc. Si podemos usar caches "cortas" en memoria mejor.

Toda esta info debe ser visible facilmente en el mismo dahboard.
