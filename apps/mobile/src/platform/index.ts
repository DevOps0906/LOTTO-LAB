// 플랫폼 어댑터(02#2) — app-core 인터페이스를 Capacitor 플러그인으로 구현해 createAppCore에 주입한다.
import type { Adapters } from "@lotto-lab/app-core";
import { clipboard } from "./clipboard.ts";
import { openExternal } from "./open-external.ts";
import { share } from "./share.ts";
import { preferencesStore } from "./store.ts";

export function createAdapters(): Adapters {
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
  };
}
