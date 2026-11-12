// 무작위 기준선(task-015 결정 ③). 모든 값은 정수 분수 {num, den}(기약분수) — 부동소수 없음(결정 ④).
import { LOTTO_NUMBER_MAX, LOTTO_PICK_COUNT, type StatFraction } from "@lotto-lab/types";

export type Fraction = StatFraction;

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** 기약분수. num ≥ 0, den > 0 전제. */
export function fraction(num: number, den: number): Fraction {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/** 이항계수 C(n, k) — 정수 정확값(45 이하 범위에서 2^53 미만). */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

export const LOTTO_COMBINATIONS = binomial(LOTTO_NUMBER_MAX, LOTTO_PICK_COUNT); // 8,145,060
export const LOTTO_ODD_COUNT = 23; // 1~45 중 홀수
export const LOTTO_EVEN_COUNT = 22;

/** 로또 구간(번호 1~45): 1~10·11~20·21~30·31~40·41~45. */
export const LOTTO_RANGES: readonly (readonly [number, number])[] = [
  [1, 10],
  [11, 20],
  [21, 30],
  [31, 40],
  [41, 45],
];

export const LOTTO_SUM_MIN = 21; // 1+2+…+6
export const LOTTO_SUM_MAX = 255; // 40+41+…+45

/** 1~45에서 6개를 고른 조합의 합계별 개수(인덱스 = 합계 − 21). 합 = C(45,6), 평균 138. */
export const LOTTO_SUM_COUNTS: readonly number[] = (() => {
  // ways[k][s] = 지금까지 본 번호에서 k개를 골라 합이 s인 조합 수
  const ways = Array.from({ length: LOTTO_PICK_COUNT + 1 }, () => new Array<number>(LOTTO_SUM_MAX + 1).fill(0));
  ways[0]![0] = 1;
  for (let n = 1; n <= LOTTO_NUMBER_MAX; n++) {
    for (let k = LOTTO_PICK_COUNT; k >= 1; k--) {
      for (let s = LOTTO_SUM_MAX; s >= n; s--) ways[k]![s]! += ways[k - 1]![s - n]!;
    }
  }
  return ways[LOTTO_PICK_COUNT]!.slice(LOTTO_SUM_MIN);
})();
