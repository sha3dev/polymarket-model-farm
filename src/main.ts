import { ServiceRuntime } from "./index.ts";
import LOGGER from "./logger.ts";

const SERVICE_RUNTIME = ServiceRuntime.createDefault();

try {
  await SERVICE_RUNTIME.startServer();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  LOGGER.error(`service failed to start: ${message}`);
  process.exitCode = 1;
}
