module.exports = { apps: [{ name: "@sha3/polymarket-model-farm", script: "node", args: "--import tsx src/main.ts", env: { NODE_ENV: "production" } }] };
