// Rng 테스트(task-012 결정 ⑤): 거절 샘플링, 주입식 crypto Rng, 결정적 시드 골든 벡터.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EngineError, createCryptoRng, createSeededRng } from "../src/index.ts";
import { fnv1a32, utf8Bytes, xoshiro128ss } from "../src/rng.ts";

const take = (seed: string, n: number, max: number): number[] => {
  const rng = createSeededRng(seed);
  return Array.from({ length: n }, () => rng.nextInt(max));
};

function expectInvalid(fn: () => unknown, hint: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe("INVALID_INPUT");
    expect((e as EngineError).hint).toBe(hint);
    return;
  }
  throw new Error("EngineError가 던져지지 않았다");
}

describe("구성 요소 기준 벡터", () => {
  it("FNV-1a 32 공개 벡터", () => {
    expect(fnv1a32(utf8Bytes(""))).toBe(0x811c9dc5);
    expect(fnv1a32(utf8Bytes("a"))).toBe(0xe40c292c);
    expect(fnv1a32(utf8Bytes("foobar"))).toBe(0xbf9cf968);
  });

  it("UTF-8 인코딩(1~4바이트)", () => {
    expect(utf8Bytes("aé로😀")).toStrictEqual([0x61, 0xc3, 0xa9, 0xeb, 0xa1, 0x9c, 0xf0, 0x9f, 0x98, 0x80]);
  });

  it("짝 없는 서로게이트는 U+FFFD(EF BF BD) — TextEncoder·Deno와 같다", () => {
    const lone = "a" + String.fromCharCode(0xd800) + "b" + String.fromCharCode(0xdc00);
    expect(utf8Bytes(lone)).toStrictEqual([0x61, 0xef, 0xbf, 0xbd, 0x62, 0xef, 0xbf, 0xbd]);
  });

  it("xoshiro128** 참조 구현 출력(state 1,2,3,4)", () => {
    const next = xoshiro128ss([1, 2, 3, 4]);
    expect(Array.from({ length: 5 }, next)).toStrictEqual([11520, 0, 5927040, 70819200, 2031721883]);
  });
});

describe("createSeededRng — 골든 벡터(알고리즘이 바뀌면 실패해야 한다)", () => {
  it("nextInt(45) 10회", () => {
    expect(take("lotto-lab", 10, 45)).toStrictEqual([42, 42, 21, 26, 1, 7, 4, 36, 2, 20]);
    expect(take("로또", 10, 45)).toStrictEqual([39, 32, 25, 28, 12, 17, 9, 12, 25, 30]);
    expect(take("", 10, 45)).toStrictEqual([15, 2, 9, 33, 25, 23, 10, 32, 31, 20]);
  });

  it("nextInt(2^32)은 원시 32비트 출력", () => {
    expect(take("lotto-lab", 3, 2 ** 32)).toStrictEqual([2164745787, 2730474087, 2989802406]);
  });

  it("속성: 같은 시드 → 같은 수열, 값은 [0, max) 정수", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 2 ** 32 }), (seed, max) => {
        const a = take(seed, 8, max);
        expect(take(seed, 8, max)).toStrictEqual(a);
        for (const x of a) {
          expect(Number.isInteger(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(max);
        }
      }),
    );
  });

  it("시드 문자열이 아니면 INVALID_INPUT", () => {
    expectInvalid(() => createSeededRng(1 as never), "rng.seed");
  });
});

describe("createCryptoRng — 주입식 원천과 거절 샘플링", () => {
  /** 주어진 값을 순서대로 내놓는 가짜 fill. */
  function scripted(values: number[]): (buf: Uint32Array) => void {
    let i = 0;
    return (buf) => {
      for (let k = 0; k < buf.length; k++) buf[k] = values[i++ % values.length]!;
    };
  }

  it("limit 이상 값은 버린다(모듈로 편향 없음)", () => {
    // max=3: limit = 2^32 - (2^32 % 3) = 4294967295 → 0xFFFFFFFF는 거절, 다음 값 7 → 7 % 3 = 1
    const rng = createCryptoRng(scripted([0xffffffff, 7]));
    expect(rng.nextInt(3)).toBe(1);
  });

  it("버퍼(64개)를 다 쓰면 fill을 다시 부른다", () => {
    let calls = 0;
    const rng = createCryptoRng((buf) => {
      calls++;
      buf.fill(calls);
    });
    for (let i = 0; i < 64; i++) expect(rng.nextInt(10)).toBe(1);
    expect(calls).toBe(1);
    expect(rng.nextInt(10)).toBe(2);
    expect(calls).toBe(2);
  });

  it("받은 버퍼를 채우지 않는 fill(새 배열을 채움)은 INVALID_INPUT(rng.fill)", () => {
    const rng = createCryptoRng((buf) => {
      new Uint32Array(buf.length).fill(7);
    });
    expectInvalid(() => rng.nextInt(10), "rng.fill");
  });

  it("maxExclusive 범위 밖·정수 아님은 INVALID_INPUT", () => {
    const rng = createCryptoRng(scripted([1]));
    for (const bad of [0, -1, 1.5, 2 ** 32 + 1, Number.NaN]) expectInvalid(() => rng.nextInt(bad), "rng.maxExclusive");
    expect(rng.nextInt(1)).toBe(0);
  });
});
