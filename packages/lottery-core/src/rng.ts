// 난수 원천(주입식). 엔진은 Rng만 받고 전역(crypto·Math.random)에 접근하지 않는다(ADR-0002, task-012 결정 ⑤).
// - createCryptoRng(fill): 셸·app-core가 crypto.getRandomValues 같은 채움 함수를 주입한다.
// - createSeededRng(seed): 결정적 시드. FNV-1a 32비트(UTF-8) → xoshiro128**. 알고리즘을 바꾸면 골든 벡터 테스트가 실패한다.
import { invalidInput } from "./errors.ts";

export interface Rng {
  /** [0, maxExclusive) 균등 정수. maxExclusive는 1 이상 2^32 이하 정수. 거절 샘플링으로 모듈로 편향이 없다. */
  nextInt(maxExclusive: number): number;
}

const UINT32_RANGE = 2 ** 32;

/** 32비트 균등 원천 → 거절 샘플링 Rng. */
function fromUint32(next: () => number): Rng {
  return {
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
        throw invalidInput("rng.maxExclusive");
      }
      // limit 이상 값은 버린다: [0, limit) 길이가 maxExclusive의 배수라 나머지가 균등하다.
      const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
      let x = next();
      while (x >= limit) x = next();
      return x % maxExclusive;
    },
  };
}

/**
 * fill은 **인자로 받은 배열 자체**를 균등 난수로 채워야 한다(예: `(a) => crypto.getRandomValues(a)`).
 * 새 배열을 만들어 돌려주는 함수는 계약 위반 — 채운 뒤 64워드가 전부 0이면 INVALID_INPUT("rng.fill")을 던진다.
 */
export function createCryptoRng(fill: (buffer: Uint32Array) => void): Rng {
  const buffer = new Uint32Array(64);
  let index = buffer.length;
  return fromUint32(() => {
    if (index === buffer.length) {
      buffer.fill(0);
      fill(buffer);
      if (buffer.every((w) => w === 0)) throw invalidInput("rng.fill");
      index = 0;
    }
    return buffer[index++]!;
  });
}

/** 문자열 → UTF-8 바이트(TextEncoder 전역에 기대지 않는다). 짝 없는 서로게이트는 U+FFFD(TextEncoder·Deno와 동일). */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    let cp = ch.codePointAt(0)!;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

/** FNV-1a 32비트. */
export function fnv1a32(bytes: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export type Xoshiro128State = [number, number, number, number];

/** xoshiro128** 32비트 원천. state는 32비트 정수 4개(전부 0이면 0만 낸다). */
export function xoshiro128ss(state: Readonly<Xoshiro128State>): () => number {
  let [s0, s1, s2, s3] = state.map((v) => v >>> 0) as Xoshiro128State;
  return () => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };
}

/** 시드 문자열 → 상태 4워드: i번째 워드 = FNV-1a32(바이트 i 뒤에 UTF-8(seed) — i를 앞에 둬 시드 전체 바이트로 확산). */
export function seedState(seed: string): Xoshiro128State {
  const bytes = utf8Bytes(seed);
  const state = [0, 1, 2, 3].map((i) => fnv1a32([i, ...bytes])) as Xoshiro128State;
  if (state.every((w) => w === 0)) state[0] = 1; // 전부 0 상태 방지
  return state;
}

const SEED_WARMUP = 16;

export function createSeededRng(seed: string): Rng {
  if (typeof seed !== "string") throw invalidInput("rng.seed");
  const next = xoshiro128ss(seedState(seed));
  // 상태 워드끼리 상관이 남는 짧은 시드 대비: 처음 WARMUP개 출력을 버린다(골든 벡터에 포함된 규칙).
  for (let i = 0; i < SEED_WARMUP; i++) next();
  return fromUint32(next);
}
