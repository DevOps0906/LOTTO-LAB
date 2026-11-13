// 연금복권720+ 번호 생성(task-014, 01#9 4·5, ADR-0002). 조·자리 고정·베이스 수만(팀장 결정 ①⑤).
// groups는 확장 의미: 베이스 digits 1개를 groups의 각 조로 발급한다(낱장 = 조 1개, 5조 세트 = [1,2,3,4,5], 결정 ②).
// 순서: 입력 검증(INVALID_INPUT) → 불가능 판정(IMPOSSIBLE_COMBINATION, 10^k) → 생성.
// digits는 처음부터 문자열로만 조립한다(숫자 변환 금지 — 앞자리 0 보존, 결정 ⑧).
// 같은 Rng 시드·같은 입력의 출력이 바뀌는 변경은 PENSION_ENGINE_VERSION을 올린다(골든 벡터 테스트가 강제).
import {
  EngineError,
  invalidInput,
  type Rng,
} from "@lotto-lab/lottery-core";
import {
  GAMES_PER_REQUEST_MAX,
  GAMES_PER_REQUEST_MIN,
  PENSION_DIGITS_LENGTH,
  PENSION_GROUP_MAX,
  PENSION_GROUP_MIN,
  type PensionGeneratorConfig,
  type PensionTicket,
} from "@lotto-lab/types";

export const PENSION_ENGINE_VERSION = "pension@1";
/** 가능 베이스 수(10^k)가 이 값 이하면 전체를 열거해 비복원 추출한다(결정 ⑥). */
export const PENSION_ENUMERATE_LIMIT = 10_000;
/** 재추첨 경로의 베이스당 시도 상한(무한 대기 금지). 10^k ≥ 100,000·베이스 ≤ 50이라 정상 Rng로는 닿지 않는다. */
const MAX_ATTEMPTS_PER_BASE = 1_000;

const DIGIT_CHARS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const DIGIT_PATTERN = /^[0-9]$/;

export type PensionGenerateResult = { tickets: PensionTicket[]; engine_version: typeof PENSION_ENGINE_VERSION };

// 배열 검사는 인덱스 루프로 한다: every·for…of는 희소 배열의 빈 칸을 건너뛰거나 undefined로 흘려보낸다.
function validGroups(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > PENSION_GROUP_MAX - PENSION_GROUP_MIN + 1) return false;
  const seen = new Set<number>();
  for (let i = 0; i < v.length; i++) {
    const g: unknown = v[i];
    if (!Number.isInteger(g) || (g as number) < PENSION_GROUP_MIN || (g as number) > PENSION_GROUP_MAX) return false;
    if (seen.has(g as number)) return false;
    seen.add(g as number);
  }
  return true;
}

function validPositions(v: unknown): v is (string | null)[] {
  if (!Array.isArray(v) || v.length !== PENSION_DIGITS_LENGTH) return false;
  for (let i = 0; i < PENSION_DIGITS_LENGTH; i++) {
    const p: unknown = v[i];
    if (p !== null && !(typeof p === "string" && DIGIT_PATTERN.test(p))) return false;
  }
  return true;
}

function validate(config: PensionGeneratorConfig): void {
  if (typeof config !== "object" || config === null) throw invalidInput("pension.config");
  if (!validGroups(config.groups)) throw invalidInput("pension.groups");
  if (!validPositions(config.positions)) throw invalidInput("pension.positions");
  const g = config.games;
  if (!Number.isInteger(g) || g < GAMES_PER_REQUEST_MIN || g > GAMES_PER_REQUEST_MAX) throw invalidInput("pension.games");
}

function impossible(hint: string, detail: Record<string, number>): EngineError {
  return new EngineError("IMPOSSIBLE_COMBINATION", hint, undefined, detail);
}

/** pool에서 k개를 부분 Fisher-Yates로 뽑는다(pool은 복사해서 쓴다). */
function pickK<T>(pool: readonly T[], k: number, rng: Rng): T[] {
  const a = pool.slice();
  for (let i = 0; i < k; i++) {
    const j = i + rng.nextInt(a.length - i);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a.slice(0, k);
}

/** 자동 자리(null)를 0~9로 채운 모든 digits를 사전순으로 만든다(문자열 연결만). */
function allDigits(positions: readonly (string | null)[]): string[] {
  let out = [""];
  for (const p of positions) {
    const choices = p === null ? DIGIT_CHARS : [p];
    const next: string[] = [];
    for (const prefix of out) for (const c of choices) next.push(prefix + c);
    out = next;
  }
  return out;
}

/** 왼쪽 자리부터 자동 자리만 nextInt(10)으로 채운다(Rng 소비 순서 고정, 결정 ⑥). */
function drawDigits(positions: readonly (string | null)[], rng: Rng): string {
  let s = "";
  for (const p of positions) s += p ?? DIGIT_CHARS[rng.nextInt(DIGIT_CHARS.length)]!;
  return s;
}

/**
 * 조·자리 조건으로 연금복권 번호를 만든다. 베이스 digits는 games개·서로 다르고, 각 베이스를 groups의 조마다 1장씩 발급한다.
 * 출력 순서: 베이스 순 → 조 오름차순. 총 장수 = games × groups 수.
 * - INVALID_INPUT: hint `pension.config|groups|positions|games`
 * - IMPOSSIBLE_COMBINATION: `pension.too_few_combinations`(detail.max = 10^k, requested)
 *   · `pension.rng_exhausted`(재추첨 시도 상한 초과 — 정상 Rng로는 닿지 않음, detail 같음)
 */
export function generatePension(config: PensionGeneratorConfig, rng: Rng): PensionGenerateResult {
  validate(config);
  const groups: number[] = [];
  for (let i = 0; i < config.groups.length; i++) groups.push(config.groups[i]!);
  groups.sort((a, b) => a - b);
  // 검증을 통과한 칸만 인덱스로 복사해 k(자동 자리 수)와 생성이 같은 배열을 본다.
  const positions: (string | null)[] = [];
  let autoCount = 0;
  for (let i = 0; i < PENSION_DIGITS_LENGTH; i++) {
    const p = config.positions[i]!;
    if (p === null) autoCount++;
    positions.push(p);
  }
  const max = 10 ** autoCount;
  const requested = config.games;
  if (requested > max) throw impossible("pension.too_few_combinations", { max, requested });

  let bases: string[];
  if (max === 1) {
    // 자동 자리 0개(요청 1개만 가능): Rng를 소비하지 않고 고정 digits 그대로.
    bases = [positions.join("")];
  } else if (max <= PENSION_ENUMERATE_LIMIT) {
    // 전체 열거 → 비복원 추출(중복 판정 오탐 0).
    bases = pickK(allDigits(positions), requested, rng);
  } else {
    // 베이스 단위 전체 재추첨: 이미 나온 digits면 통째로 다시 뽑는다.
    bases = [];
    const seen = new Set<string>();
    let attempts = 0;
    while (bases.length < requested) {
      if (++attempts > requested * MAX_ATTEMPTS_PER_BASE) throw impossible("pension.rng_exhausted", { max, requested });
      const digits = drawDigits(positions, rng);
      if (seen.has(digits)) continue;
      seen.add(digits);
      bases.push(digits);
    }
  }

  const tickets: PensionTicket[] = [];
  for (const digits of bases) for (const group_no of groups) tickets.push({ group_no, digits });
  return { tickets, engine_version: PENSION_ENGINE_VERSION };
}
