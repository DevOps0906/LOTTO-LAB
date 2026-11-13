// 플랫폼 어댑터(02#2) — app-core 인터페이스를 Capacitor 플러그인으로 구현해 createAppCore에 주입한다.
import type { Adapters, AppConfig, AuthClient } from "@lotto-lab/app-core";
import { createAuthClient } from "./auth.ts";
import { clipboard } from "./clipboard.ts";
import { openExternal } from "./open-external.ts";
import { share } from "./share.ts";
import { preferencesStore } from "./store.ts";

/** 로그인(task-043): 설정(URL·공개 키)이 있을 때만 만든다. 없거나 잘못되면 게스트 전용(core는 INVALID_CONFIG로 안내). */
function authOf(config: AppConfig | undefined): AuthClient | undefined {
  if (!config?.supabaseUrl || !config.publishableKey) return undefined;
  try {
    return createAuthClient(config);
  } catch {
    return undefined;
  }
}

export function createAdapters(config?: AppConfig): Adapters {
  return {
    store: preferencesStore,
    clock: { now: () => new Date() },
    random: {
      fill(buffer) {
        // app-core는 일반 ArrayBuffer 배열만 넘긴다(SharedArrayBuffer 아님).
        crypto.getRandomValues(buffer as Uint32Array<ArrayBuffer>);
      },
    },
    fetch: (url, init) => fetch(url, init),
    clipboard,
    share,
    openExternal,
    auth: authOf(config),
  };
}
