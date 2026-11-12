// 지난 설정(task-018·019): 복권별로 마지막으로 생성에 성공한 조건을 설정 레코드(`ll:v1:settings:app`)의 last_config에 둔다.
// 19세 확인 시각(age_confirmed_at)은 그대로 유지한다. 설정 레코드가 격리 대상이면 덮어쓰지 않는다(결정 ③).
import type { LottoGeneratorConfig, PensionGeneratorConfig } from "@lotto-lab/types";
import { LottoGeneratorConfigSchema, LocalSettingsSchema, PensionGeneratorConfigSchema, type LocalSettings } from "@lotto-lab/validation";
import type { GenerateRequest } from "./generate-service.ts";
import { AppCoreError } from "./errors.ts";
import type { LocalStore } from "./storage.ts";

const SETTINGS_ID = "app";

export class LastConfigStore {
  private readonly store: LocalStore;

  constructor(store: LocalStore) {
    this.store = store;
  }

  /** 지난 설정. 없거나 설정 레코드를 읽을 수 없으면(격리) null. */
  get(game: "lotto"): Promise<LottoGeneratorConfig | null>;
  get(game: "pension"): Promise<PensionGeneratorConfig | null>;
  get(game: "lotto" | "pension"): Promise<LottoGeneratorConfig | PensionGeneratorConfig | null> {
    return this.store.run(async () => (await this.store.get("settings", SETTINGS_ID, LocalSettingsSchema))?.last_config?.[game] ?? null);
  }

  /**
   * 생성에 성공한 조건을 지난 설정으로 남긴다. 조건이 형식에 맞지 않으면 INVALID_INPUT, 쓰기 실패는 STORAGE_FAILED.
   * 설정 레코드가 격리 대상이면 덮어쓰지 않고 false를 돌려준다.
   */
  save(request: GenerateRequest): Promise<boolean> {
    const parsed =
      request.game === "lotto" ? LottoGeneratorConfigSchema.safeParse(request.config) : PensionGeneratorConfigSchema.safeParse(request.config);
    if (!parsed.success) return Promise.reject(new AppCoreError("INVALID_INPUT", "last_config"));
    return this.store.run(async () => {
      const current = await this.store.get("settings", SETTINGS_ID, LocalSettingsSchema);
      if (current === null && (await this.store.exists("settings", SETTINGS_ID))) return false;
      const next: LocalSettings = LocalSettingsSchema.parse({
        v: 1,
        age_confirmed_at: null,
        ...current,
        last_config: { ...current?.last_config, [request.game]: parsed.data },
      });
      await this.store.put("settings", SETTINGS_ID, next);
      return true;
    });
  }
}
