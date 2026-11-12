// 로컬 데이터 관리(M-12 설정): 내보내기(JSON)·모두 삭제, 화면 테마 선호.
// 내보내기는 사용자 기록(저장 번호·생성 이력·설정)만 — 공개 읽기 캐시는 파생 데이터라 넣지 않는다.
// 연금 번호는 문자열 그대로 직렬화된다(앞자리 0 보존 — "000719").
import { LocalGeneratedSchema, LocalSettingsSchema, LocalTicketSchema, type LocalGenerated, type LocalSettings, type LocalTicket } from "@lotto-lab/validation";
import type { Clock, KeyValueStore } from "./adapters.ts";
import { AppCoreError } from "./errors.ts";
import { KEY_PREFIX, type LocalStore } from "./storage.ts";

/** 이 앱이 쓰는 모든 키의 공통 접두사(레코드 `ll:v1:`·테마 선호 포함). */
const APP_KEY_PREFIX = "ll:";
/** 테마 선호 키 — 레코드 종류(`ll:v1:<kind>:`)와 겹치지 않는다. */
export const THEME_KEY = `${KEY_PREFIX}pref:theme`;

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** 내보내기 형식 버전(형식을 바꾸면 올린다). */
export const EXPORT_FORMAT_VERSION = 1;

export type LocalExport = {
  format: "lotto-lab-local";
  format_version: number;
  exported_at: string;
  tickets: LocalTicket[];
  generated: LocalGenerated[];
  settings: LocalSettings | null;
};

export type LocalDataSummary = { tickets: number; favorites: number; purchased: number; generated: number };

export class LocalData {
  private readonly store: LocalStore;
  private readonly kv: KeyValueStore;
  private readonly clock: Clock;

  constructor(store: LocalStore, kv: KeyValueStore, clock: Clock) {
    this.store = store;
    this.kv = kv;
    this.clock = clock;
  }

  /** 유효 레코드 개수(격리 레코드 제외). */
  summary(): Promise<LocalDataSummary> {
    return this.store.run(async () => {
      const tickets = (await this.store.scan("ticket", LocalTicketSchema)).map((e) => e.value);
      const generated = await this.store.scan("generated", LocalGeneratedSchema);
      const purchased = tickets.filter((t) => t.purchase_status === "purchased").length;
      return { tickets: tickets.length, favorites: tickets.length - purchased, purchased, generated: generated.length };
    });
  }

  /** 사용자 기록 내보내기(유효 레코드만, 최신순). */
  export(): Promise<LocalExport> {
    return this.store.run(async () => {
      const tickets = (await this.store.scan("ticket", LocalTicketSchema)).map((e) => e.value);
      const generated = (await this.store.scan("generated", LocalGeneratedSchema)).map((e) => e.value);
      tickets.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
      generated.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.line_no - b.line_no);
      return {
        format: "lotto-lab-local",
        format_version: EXPORT_FORMAT_VERSION,
        exported_at: this.clock.now().toISOString(),
        tickets,
        generated,
        settings: await this.store.get("settings", "app", LocalSettingsSchema),
      };
    });
  }

  /** 내보내기 JSON 문자열(들여쓰기 2칸). */
  async exportJson(): Promise<string> {
    return JSON.stringify(await this.export(), null, 2);
  }

  /**
   * 이 앱의 기기 데이터 전부 삭제(저장 번호·생성 이력·설정·19세 확인 기록·캐시·테마, 격리 레코드 포함).
   * 사용자가 명시적으로 확인한 뒤에만 호출한다. 지운 키 개수를 돌려준다. 하나라도 실패하면 STORAGE_FAILED(지운 키는 그대로 지워진 상태).
   */
  clearAll(): Promise<number> {
    return this.store.run(async () => {
      try {
        const keys = await this.kv.keys(APP_KEY_PREFIX);
        for (const key of keys) await this.kv.delete(key);
        await this.kv.flush();
        return keys.length;
      } catch (cause) {
        throw new AppCoreError("STORAGE_FAILED", undefined, { cause });
      }
    });
  }
}

/** 화면 테마 선호(시스템·라이트·다크). 값이 없거나 읽을 수 없으면 system. */
export class ThemeStore {
  private readonly store: LocalStore;
  private readonly kv: KeyValueStore;

  constructor(store: LocalStore, kv: KeyValueStore) {
    this.store = store;
    this.kv = kv;
  }

  get(): Promise<ThemePreference> {
    return this.store.run(async () => {
      const raw = await this.kv.get(THEME_KEY);
      return THEME_PREFERENCES.find((t) => raw === JSON.stringify(t)) ?? "system";
    });
  }

  set(theme: ThemePreference): Promise<ThemePreference> {
    if (!THEME_PREFERENCES.includes(theme)) return Promise.reject(new AppCoreError("INVALID_INPUT", "theme"));
    return this.store.run(async () => {
      try {
        await this.kv.set(THEME_KEY, JSON.stringify(theme));
        await this.kv.flush();
      } catch (cause) {
        throw new AppCoreError("STORAGE_FAILED", undefined, { cause });
      }
      return theme;
    });
  }
}
