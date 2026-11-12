// 로컬 레코드 저장(task-016 결정 ①②③).
// - 레코드마다 키 1개 `ll:v1:<kind>:<id>`. 목록은 접두사 keys로 구성 — 목록 통째 덮어쓰기 없음.
// - 쓰기(와 읽기-수정-쓰기 작업 전체)는 단일 비동기 큐로 직렬화. 한 작업이 실패해도 큐는 계속된다.
// - 격리: JSON 파싱·검증 실패, 미래 버전, 마이그레이션 불가 레코드는 읽기에서 건너뛰고 다시 쓰거나 지우지 않는다.
// - 마이그레이션: 레코드 `v` 기준 단위 지연 변환. 변환 결과가 검증을 통과한 뒤에만 원본 키를 덮어쓴다.
import { LOCAL_RECORD_VERSION } from "@lotto-lab/validation";
import type { KeyValueStore, RandomBytes } from "./adapters.ts";
import { AppCoreError } from "./errors.ts";

export const KEY_PREFIX = "ll:v1:";
export type RecordKind = "ticket" | "generated" | "settings" | "cache";

/** Zod 스키마와 구조 호환되는 최소 파서. */
export interface Parser<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

/** kind별 `from 버전 → from+1 버전` 변환. 현재 LOCAL_RECORD_VERSION = 1이라 기본값은 비어 있다. */
export type Migrations = Partial<Record<RecordKind, Record<number, (record: Record<string, unknown>) => unknown>>>;

/** 공개 읽기 캐시 봉투 버전(파생 데이터 — 사용자 레코드 버전과 따로 올린다). */
export const CACHE_VERSION = 1;
/** kind별 현재 버전: 티켓·이력·설정은 LOCAL_RECORD_VERSION 공유, 캐시는 CACHE_VERSION. */
const versionOf = (kind: RecordKind): number => (kind === "cache" ? CACHE_VERSION : LOCAL_RECORD_VERSION);

export const recordKey = (kind: RecordKind, id: string): string => `${KEY_PREFIX}${kind}:${id}`;

export type Entry<T> = { key: string; id: string; value: T };

export class LocalStore {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly kv: KeyValueStore;
  private readonly migrations: Migrations;

  constructor(kv: KeyValueStore, migrations: Migrations = {}) {
    this.kv = kv;
    this.migrations = migrations;
  }

  /** op를 큐 끝에 넣고 결과를 돌려준다. 앞 작업의 실패와 무관하게 실행된다. op 안에서 run을 await하면 교착 — 하지 않는다. */
  run<T>(op: () => Promise<T>): Promise<T> {
    const result = this.tail.then(op, op);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** (큐 안에서) kind의 유효 레코드 전부. 격리 대상은 건너뛴다. */
  async scan<T>(kind: RecordKind, parser: Parser<T>): Promise<Entry<T>[]> {
    const prefix = recordKey(kind, "");
    const keys = await this.kv.keys(prefix);
    const out: Entry<T>[] = [];
    for (const key of keys) {
      const value = await this.readKey(kind, key, parser);
      if (value !== null) out.push({ key, id: key.slice(prefix.length), value });
    }
    return out;
  }

  /** (큐 안에서) 레코드 1개. 없거나 격리 대상이면 null. */
  get<T>(kind: RecordKind, id: string, parser: Parser<T>): Promise<T | null> {
    return this.readKey(kind, recordKey(kind, id), parser);
  }

  /** (큐 안에서) kind의 키 개수(격리 레코드 포함 — 값을 읽지 않는다). */
  async count(kind: RecordKind): Promise<number> {
    return (await this.kv.keys(recordKey(kind, ""))).length;
  }

  /** (큐 안에서) 키가 존재하는지(격리 레코드 포함). */
  async exists(kind: RecordKind, id: string): Promise<boolean> {
    return (await this.kv.get(recordKey(kind, id))) !== null;
  }

  /** (큐 안에서) 원시 문자열 — 격리 레코드의 참조 확인 등 읽기 전용 용도. */
  async rawValues(kind: RecordKind): Promise<string[]> {
    const keys = await this.kv.keys(recordKey(kind, ""));
    const out: string[] = [];
    for (const key of keys) {
      const raw = await this.kv.get(key);
      if (raw !== null) out.push(raw);
    }
    return out;
  }

  /** (큐 안에서) 쓰기 + 즉시 반영. 실패하면 STORAGE_FAILED. */
  async put(kind: RecordKind, id: string, value: unknown): Promise<void> {
    try {
      await this.kv.set(recordKey(kind, id), JSON.stringify(value));
      await this.kv.flush();
    } catch (cause) {
      throw new AppCoreError("STORAGE_FAILED", undefined, { cause });
    }
  }

  /** (큐 안에서) 유효 레코드 삭제. 격리 레코드에는 호출하지 않는다(호출자가 scan 결과만 넘긴다). */
  async remove(kind: RecordKind, id: string): Promise<void> {
    try {
      await this.kv.delete(recordKey(kind, id));
      await this.kv.flush();
    } catch (cause) {
      throw new AppCoreError("STORAGE_FAILED", undefined, { cause });
    }
  }

  private async readKey<T>(kind: RecordKind, key: string, parser: Parser<T>): Promise<T | null> {
    const raw = await this.kv.get(key);
    if (raw === null) return null;
    let record: unknown;
    try {
      record = JSON.parse(raw);
    } catch {
      return null;
    }
    const version = versionOf(kind);
    let migrated = false;
    while (isObject(record) && typeof record.v === "number" && record.v < version) {
      const from = record.v;
      const step = this.migrations[kind]?.[from];
      if (!step) return null;
      try {
        record = step(record);
      } catch {
        return null;
      }
      // 단계가 버전을 올리지 않으면 중단(무한 루프 방지) — 레코드는 건너뛰고 보존.
      if (!isObject(record) || typeof record.v !== "number" || record.v <= from) return null;
      migrated = true;
    }
    if (!isObject(record) || record.v !== version) return null; // 미래 버전·버전 없음
    const parsed = parser.safeParse(record);
    if (!parsed.success) return null;
    if (migrated) {
      try {
        await this.kv.set(key, JSON.stringify(parsed.data));
        await this.kv.flush();
      } catch {
        // 원본은 그대로 남는다 — 다음 읽기에서 다시 변환한다.
      }
    }
    return parsed.data;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** RFC 4122 v4 uuid(주입 난수). */
export function uuidV4(random: RandomBytes): string {
  const words = new Uint32Array(4);
  random.fill(words);
  const bytes: number[] = [];
  for (const w of words) bytes.push(w >>> 24, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
