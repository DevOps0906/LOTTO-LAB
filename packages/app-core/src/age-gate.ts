// 첫 실행 만 19세 확인(DF-6): 확인 시각을 로컬 설정 레코드에 남긴다. 미확인이면 셸·UI가 진입을 막는다.
import { LocalSettingsSchema, type LocalSettings } from "@lotto-lab/validation";
import type { Clock } from "./adapters.ts";
import type { LocalStore } from "./storage.ts";

const SETTINGS_ID = "app";

export class AgeGate {
  private readonly store: LocalStore;
  private readonly clock: Clock;
  /** 기존 설정 레코드가 격리 대상(미래 버전 등)이라 덮어쓸 수 없을 때 이번 실행 동안만 쓰는 확인 시각. */
  private sessionConfirmedAt: string | null = null;

  constructor(store: LocalStore, clock: Clock) {
    this.store = store;
    this.clock = clock;
  }

  /** 확인 기록이 없거나 읽을 수 없으면(격리) false — 다시 확인받는다. */
  isConfirmed(): Promise<boolean> {
    return this.store.run(
      async () =>
        this.sessionConfirmedAt !== null ||
        (await this.store.get("settings", SETTINGS_ID, LocalSettingsSchema))?.age_confirmed_at != null,
    );
  }

  /** 확인 시각(ISO). 미확인이거나 읽을 수 없으면 null. */
  confirmedAt(): Promise<string | null> {
    return this.store.run(
      async () => this.sessionConfirmedAt ?? (await this.store.get("settings", SETTINGS_ID, LocalSettingsSchema))?.age_confirmed_at ?? null,
    );
  }

  /** 사용자가 만 19세 이상임을 확인한 시각을 기록한다. 이미 기록돼 있으면 처음 시각을 유지한다. */
  confirm(): Promise<string> {
    return this.store.run(async () => {
      const current = await this.store.get("settings", SETTINGS_ID, LocalSettingsSchema);
      if (current?.age_confirmed_at) return current.age_confirmed_at;
      const at = this.clock.now().toISOString();
      if (current === null && (await this.store.exists("settings", SETTINGS_ID))) {
        // 격리 레코드는 덮어쓰지 않는다(결정 ③) — 이번 실행 동안만 확인 상태를 유지한다.
        this.sessionConfirmedAt ??= at;
        return this.sessionConfirmedAt;
      }
      const next: LocalSettings = LocalSettingsSchema.parse({ ...current, v: 1, age_confirmed_at: at });
      await this.store.put("settings", SETTINGS_ID, next);
      return at;
    });
  }
}
