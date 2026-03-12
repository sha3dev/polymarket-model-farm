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
que valores se meten y lo que representan.

Tambien quiero que propongas como vamos a generar el dato de "confianza". Quiero que de la salida del modelo podamos extraer un numero entre -1 y 1,
que me diga la confianza que tiene el modelo en que el mercado acabara down (-1) o up (+1).




