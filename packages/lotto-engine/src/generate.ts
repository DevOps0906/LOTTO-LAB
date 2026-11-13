// 로또 6/45 번호 생성(task-013, 01#9 1·2·3, ADR-0002). P0 조건은 고정·제외·게임 수(결정 ①), 홀짝(odd, task-047)은 선택.
// 순서: 입력 검증(INVALID_INPUT) → 불가능 판정(IMPOSSIBLE_COMBINATION, C(p,k) 정확 계산) → 생성.
// 같은 Rng 시드·같은 입력의 출력이 바뀌는 변경은 LOTTO_ENGINE_VERSION을 올린다(골든 벡터 테스트가 강제, 결정 ②).
import {
  EngineError,
  invalidInput,
  type Rng,
} from "@lotto-lab/lottery-core";
import {
  GAMES_PER_REQUEST_MAX,
  GAMES_PER_REQUEST_MIN,
  LOTTO_EXCLUDED_MAX,
  LOTTO_FIXED_MAX,
  LOTTO_NUMBER_MAX,
  LOTTO_NUMBER_MIN,
  LOTTO_PICK_COUNT,
  type LottoGeneratorConfig,
} from "@lotto-lab/types";

export const LOTTO_ENGINE_VERSION = "lotto@1";
/** 가능 조합 수가 이 값 이하면 전체 조합을 열거해 비복원 추출한다(결정 ③). */
export const LOTTO_ENUMERATE_LIMIT = 10_000;
/** 재추첨 경로의 게임당 시도 상한(무한 대기 금지). C > 10,000·게임 ≤ 50이라 실제로 닿지 않는다. */
const MAX_ATTEMPTS_PER_GAME = 1_000;

/** 엔진 입력 = 공통 생성 조건 + 홀짝(odd = 게임당 홀수 개수 0~6, 없으면 무관). 저장 형식(LottoGeneratorConfig)에는 odd가 없다. */
export type LottoGenerateConfig = LottoGeneratorConfig & { odd?: number };

export type LottoGenerateResult = { games: number[][]; engine_version: typeof LOTTO_ENGINE_VERSION };

/** 정확한 이항계수 C(n, k). 로또 범위에서는 최대 C(45,6) = 8,145,060이라 정수 연산이 정확하다. */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

function isLottoNumber(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= LOTTO_NUMBER_MIN && (v as number) <= LOTTO_NUMBER_MAX;
}

function validNumberList(v: unknown, max: number): v is number[] {
  if (!Array.isArray(v) || v.length > max) return false;
  // every는 희소 배열의 빈 칸을 건너뛰므로 인덱스로 검사한다(빈 칸 = undefined → 실패).
  for (let i = 0; i < v.length; i++) if (!isLottoNumber(v[i])) return false;
  return new Set(v).size === v.length;
}

function validate(config: LottoGenerateConfig): void {
  if (typeof config !== "object" || config === null) throw invalidInput("lotto.config");
  if (!validNumberList(config.fixed, LOTTO_FIXED_MAX)) throw invalidInput("lotto.fixed");
  if (!validNumberList(config.excluded, LOTTO_EXCLUDED_MAX)) throw invalidInput("lotto.excluded");
  const g = config.games;
  if (!Number.isInteger(g) || g < GAMES_PER_REQUEST_MIN || g > GAMES_PER_REQUEST_MAX) throw invalidInput("lotto.games");
  const odd = config.odd;
  if (odd !== undefined && (!Number.isInteger(odd) || odd < 0 || odd > LOTTO_PICK_COUNT)) throw invalidInput("lotto.odd");
}

function impossible(hint: string, detail: Record<string, number>): EngineError {
  return new EngineError("IMPOSSIBLE_COMBINATION", hint, undefined, detail);
}

/** pool에서 k개를 부분 Fisher-Yates로 뽑는다(pool은 복사해서 쓴다). */
function pickK(pool: readonly number[], k: number, rng: Rng): number[] {
  const a = pool.slice();
  for (let i = 0; i < k; i++) {
    const j = i + rng.nextInt(a.length - i);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a.slice(0, k);
}

/** pool(오름차순)의 k-조합을 사전순으로 전부 만든다. */
function allCombinations(pool: readonly number[], k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const walk = (start: number): void => {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= pool.length - (k - cur.length); i++) {
      cur.push(pool[i]!);
      walk(i + 1);
      cur.pop();
    }
  };
  walk(0);
  return out;
}

const ascending = (a: number, b: number): number => a - b;
const isOdd = (n: number): boolean => n % 2 === 1;

/** 후보 묶음 하나에서 k개를 뽑는다. 게임 = 고정수 + 묶음마다 뽑은 번호(홀짝 없으면 묶음 1개). */
type Part = { pool: number[]; k: number };

/** 묶음별 조합의 곱(묶음 1개면 allCombinations와 같은 순서). */
function partCombinations(parts: readonly Part[]): number[][] {
  let out: number[][] = [[]];
  for (const p of parts) {
    const combos = allCombinations(p.pool, p.k);
    out = out.flatMap((head) => combos.map((c) => [...head, ...c]));
  }
  return out;
}

/**
 * 고정·제외·게임 수 조건으로 로또 번호를 만든다. 각 게임은 6개·1~45·중복 없음·오름차순이고, 한 배치 안 게임은 서로 다르다.
 * odd가 있으면 모든 게임의 홀수 개수가 odd다(고정수 포함).
 * - INVALID_INPUT: 범위 밖·정수 아님·목록 안 중복(hint `lotto.config|fixed|excluded|games|odd`)
 * - IMPOSSIBLE_COMBINATION: `lotto.fixed_excluded_overlap`(detail.overlap) · `lotto.not_enough_pool`(pool·need)
 *   · `lotto.parity`(odd·fixed_odd·fixed_even·pool_odd·pool_even) · `lotto.too_few_combinations`(max·requested)
 */
export function generateLotto(config: LottoGenerateConfig, rng: Rng): LottoGenerateResult {
  validate(config);
  const fixed = [...config.fixed].sort(ascending);
  const excludedSet = new Set(config.excluded);

  const overlap = fixed.filter((n) => excludedSet.has(n)).length;
  if (overlap > 0) throw impossible("lotto.fixed_excluded_overlap", { overlap });

  const fixedSet = new Set(fixed);
  const pool: number[] = [];
  for (let n = LOTTO_NUMBER_MIN; n <= LOTTO_NUMBER_MAX; n++) {
    if (!fixedSet.has(n) && !excludedSet.has(n)) pool.push(n);
  }
  const need = LOTTO_PICK_COUNT - fixed.length;
  // 현재 상한(고정 ≤ 6·제외 ≤ 39)에서는 pool ≥ need가 항상 성립한다. 상한이 바뀔 때를 위한 판정.
  if (pool.length < need) throw impossible("lotto.not_enough_pool", { pool: pool.length, need });

  let parts: Part[] = [{ pool, k: need }];
  if (config.odd !== undefined) {
    const odd = config.odd;
    const fixedOdd = fixed.filter(isOdd).length;
    const fixedEven = fixed.length - fixedOdd;
    const oddPool = pool.filter(isOdd);
    const evenPool = pool.filter((n) => !isOdd(n));
    const needOdd = odd - fixedOdd;
    const needEven = LOTTO_PICK_COUNT - odd - fixedEven;
    if (needOdd < 0 || needEven < 0 || needOdd > oddPool.length || needEven > evenPool.length) {
      throw impossible("lotto.parity", { odd, fixed_odd: fixedOdd, fixed_even: fixedEven, pool_odd: oddPool.length, pool_even: evenPool.length });
    }
    parts = [
      { pool: oddPool, k: needOdd },
      { pool: evenPool, k: needEven },
    ];
  }

  const max = parts.reduce((m, p) => m * binomial(p.pool.length, p.k), 1);
  const requested = config.games;
  if (requested > max) throw impossible("lotto.too_few_combinations", { max, requested });

  const toGame = (picked: readonly number[]): number[] => [...fixed, ...picked].sort(ascending);
  let games: number[][];
  if (max <= LOTTO_ENUMERATE_LIMIT) {
    // 전체 조합 열거 → 인덱스 비복원 추출(중복 판정 오탐 0).
    const combos = partCombinations(parts);
    const indexes = Array.from({ length: combos.length }, (_, i) => i);
    games = pickK(indexes, requested, rng).map((i) => toGame(combos[i]!));
  } else {
    // 게임 단위 전체 재추첨: 이미 나온 게임이면 그 게임을 통째로 다시 뽑는다(일부 번호만 바꾸지 않음).
    games = [];
    const seen = new Set<string>();
    let attempts = 0;
    while (games.length < requested) {
      if (++attempts > requested * MAX_ATTEMPTS_PER_GAME) throw impossible("lotto.too_few_combinations", { max, requested });
      const game = toGame(parts.flatMap((p) => pickK(p.pool, p.k, rng)));
      const key = game.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      games.push(game);
    }
  }
  return { games, engine_version: LOTTO_ENGINE_VERSION };
}
