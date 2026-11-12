// KeyValueStore ← @capacitor/preferences(기기 저장소). 비민감 값만 저장한다(세션 토큰 금지, .claude/rules/mobile.md).
import { Preferences } from "@capacitor/preferences";
import type { KeyValueStore } from "@lotto-lab/app-core";

export const preferencesStore: KeyValueStore = {
  async get(key) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  },
  async set(key, value) {
    await Preferences.set({ key, value });
  },
  async delete(key) {
    await Preferences.remove({ key });
  },
  async keys(prefix) {
    const { keys } = await Preferences.keys();
    return keys.filter((key) => key.startsWith(prefix));
  },
  // Preferences는 쓰기마다 바로 반영된다.
  async flush() {},
};
