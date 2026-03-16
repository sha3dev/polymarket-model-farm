/**
 * @section imports:internals
 */

import { SUPPORTED_ASSETS, SUPPORTED_WINDOWS } from "../collector/index.ts";
import config from "../config.ts";

/**
 * @section types
 */

export type AppInfoPayload = {
  ok: true;
  serviceName: string;
  supportedAssets: readonly string[];
  supportedWindows: readonly string[];
};

type AppInfoServiceOptions = { serviceName: string };

export class AppInfoService {
  /**
   * @section private:properties
   */

  private readonly serviceName: string;

  /**
   * @section constructor
   */

  public constructor(options: AppInfoServiceOptions) {
    this.serviceName = options.serviceName;
  }

  /**
   * @section factory
   */

  public static createDefault(): AppInfoService {
    return new AppInfoService({ serviceName: config.SERVICE_NAME });
  }

  /**
   * @section public:methods
   */

  public buildPayload(): AppInfoPayload {
    return { ok: true, serviceName: this.serviceName, supportedAssets: SUPPORTED_ASSETS, supportedWindows: SUPPORTED_WINDOWS };
  }
}
