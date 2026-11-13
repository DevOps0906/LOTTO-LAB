// app-core 연결: 어댑터·설정을 주입해 앱에서 한 번만 만든다(저장 큐는 인스턴스당 하나).
// 설정이 없거나 잘못되면(INVALID_CONFIG) 앱은 뜨되 core 없이 안내만 보인다.
import { createAppCore, isAppCoreError, type Adapters, type AppConfig, type AppCore } from "@lotto-lab/app-core";
import { createContext, useContext } from "react";
import { AUTH_RETURN_PATHS } from "./routes.ts";

export type CoreState = { core: AppCore; configError: false } | { core: null; configError: true };

export function bootstrap(adapters: Adapters, config: AppConfig): CoreState {
  try {
    return { core: createAppCore(adapters, config, { authReturnPaths: AUTH_RETURN_PATHS }), configError: false };
  } catch (error) {
    if (isAppCoreError(error) && error.code === "INVALID_CONFIG") return { core: null, configError: true };
    throw error;
  }
}

export const CoreContext = createContext<CoreState>({ core: null, configError: true });

export function useCore(): CoreState {
  return useContext(CoreContext);
}
