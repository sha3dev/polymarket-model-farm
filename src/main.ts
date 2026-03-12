import { ServiceRuntime } from "./index.ts";

const SERVICE_RUNTIME = ServiceRuntime.createDefault();

void SERVICE_RUNTIME.startServer();
