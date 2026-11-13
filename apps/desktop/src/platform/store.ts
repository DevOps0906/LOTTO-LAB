// KeyValueStore ← tauri-plugin-store. 스토어 파일은 Rust setup(src-tauri/src/lib.rs)이 앱 데이터 폴더 고정 경로
// (%APPDATA%\kr.lottolab.app\lotto-lab.json, autoSave 끔)로 미리 만든다. 프런트는 load 권한 없이 그 스토어를 가져오기만 한다.
// app-core가 쓰기 뒤 flush()를 부르면 save()로 디스크에 반영한다.
import { getStore, type Store } from "@tauri-apps/plugin-store";
import { AppCoreError, type KeyValueStore } from "@lotto-lab/app-core";

/** Rust의 STORE_FILE과 같아야 한다. */
export const STORE_FILE = "lotto-lab.json";

async function openExisting(): Promise<Store> {
  const store = await getStore(STORE_FILE);
  if (!store) throw new AppCoreError("STORAGE_FAILED", "store not initialized");
  return store;
}

export function createTauriStore(open: () => Promise<Store> = openExisting): KeyValueStore {
  let cached: Promise<Store> | null = null;
  // 첫 로드가 실패하면 실패한 Promise를 버려 다음 호출에서 다시 시도한다.
  const ready = () =>
    (cached ??= open().catch((error: unknown) => {
      cached = null;
      throw error;
    }));
  return {
    async get(key) {
      const value = await (await ready()).get<string>(key);
      return typeof value === "string" ? value : null;
    },
    async set(key, value) {
      await (await ready()).set(key, value);
    },
    async delete(key) {
      await (await ready()).delete(key);
    },
    async keys(prefix) {
      return (await (await ready()).keys()).filter((key) => key.startsWith(prefix));
    },
    async flush() {
      await (await ready()).save();
    },
  };
}
