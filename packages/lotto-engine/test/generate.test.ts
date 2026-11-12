// lotto-engine 테스트(task-013): 경계·입력 계약·불가능 판정·속성·균등성(카이제곱)·골든 벡터·성능.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EngineError, createSeededRng } from "@lotto-lab/lottery-core";
import type { LottoGeneratorConfig } from "@lotto-lab/types";
import { LOTTO_ENGINE_VERSION, binomial, generateLotto } from "../src/index.ts";

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const gen = (config: LottoGeneratorConfig, seed = "t") => generateLotto(config, createSeededRng(seed));

function expectEngineError(fn: () => unknown, code: EngineError["code"], hint: string, detail?: Record<string, number>): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe(code);
    expect((e as EngineError).hint).toBe(hint);
    if (detail) expect((e as EngineError).detail).toStrictEqual(detail);
    return;
  }
  throw new Error("EngineError가 던져지지 않았다");
}

describe("binomial — 정확 계산", () => {
  it("기준값", () => {
    expect(binomial(45, 6)).toBe(8_145_060);
    expect(binomial(8, 2)).toBe(28);
    expect(binomial(39, 0)).toBe(1);
    expect(binomial(5, 6)).toBe(0);
    expect(binomial(5, -1)).toBe(0);
  });
});

describe("경계", () => {
  it("고정 6개: 1게임 성공, 2게임은 too_few_combinations(max 1)", () => {
    const fixed = [45, 1, 9, 20, 33, 2];
    expect(gen({ fixed, excluded: [], games: 1 })).toStrictEqual({ games: [[1, 2, 9, 20, 33, 45]], engine_version: "lotto@1" });
    expectEngineError(() => gen({ fixed, excluded: [], games: 2 }), "IMPOSSIBLE_COMBINATION", "lotto.too_few_combinations", {
      max: 1,
      requested: 2,
    });
  });

  it("고정 5·제외 32(후보 8): 8게임 성공(전부 다른 게임), 9게임 실패", () => {
    const config = { fixed: [1, 2, 3, 4, 5], excluded: range(14, 45) };
    const { games } = gen({ ...config, games: 8 });
    expect(games).toHaveLength(8);
    expect(new Set(games.map((g) => g[5])).size).toBe(8);
    expectEngineError(() => gen({ ...config, games: 9 }), "IMPOSSIBLE_COMBINATION", "lotto.too_few_combinations", {
      max: 8,
      requested: 9,
    });
  });

  it("제외 39개(후보 = 필요 수): 1게임 성공", () => {
    expect(gen({ fixed: [], excluded: range(7, 45), games: 1 }).games).toStrictEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("게임 50개·조건 없음", () => {
    expect(gen({ fixed: [], excluded: [], games: 50 }).games).toHaveLength(50);
  });
});

describe("입력 계약 — INVALID_INPUT", () => {
  const base: LottoGeneratorConfig = { fixed: [], excluded: [], games: 1 };
  it.each([
    ["config null", null, "lotto.config"],
    ["fixed 배열 아님", { ...base, fixed: "1" }, "lotto.fixed"],
    ["fixed 0", { ...base, fixed: [0] }, "lotto.fixed"],
    ["fixed 46", { ...base, fixed: [46] }, "lotto.fixed"],
    ["fixed 실수", { ...base, fixed: [1.5] }, "lotto.fixed"],
    ["fixed 문자열", { ...base, fixed: ["1"] }, "lotto.fixed"],
    ["fixed 중복", { ...base, fixed: [3, 3] }, "lotto.fixed"],
    // eslint-disable-next-line no-sparse-arrays
    ["fixed 희소 배열", { ...base, fixed: [, 5] }, "lotto.fixed"],
    ["fixed 7개", { ...base, fixed: range(1, 7) }, "lotto.fixed"],
    ["excluded 중복", { ...base, excluded: [9, 9] }, "lotto.excluded"],
    ["excluded 40개", { ...base, excluded: range(1, 40) }, "lotto.excluded"],
    ["excluded NaN", { ...base, excluded: [Number.NaN] }, "lotto.excluded"],
    ["games 0", { ...base, games: 0 }, "lotto.games"],
    ["games 51", { ...base, games: 51 }, "lotto.games"],
    ["games 실수", { ...base, games: 1.5 }, "lotto.games"],
  ])("%s", (_, config, hint) => {
    expectEngineError(() => gen(config as never), "INVALID_INPUT", hint);
  });
});

describe("불가능 판정 — IMPOSSIBLE_COMBINATION(즉시)", () => {
  it("고정∩제외", () => {
    expectEngineError(
      () => gen({ fixed: [1, 2, 3], excluded: [2, 3, 40], games: 1 }),
      "IMPOSSIBLE_COMBINATION",
      "lotto.fixed_excluded_overlap",
      { overlap: 2 },
    );
  });

  it("조합 부족은 시도 없이 바로 실패한다(제한 시간 안)", () => {
    const t0 = Date.now();
    expectEngineError(
      () => gen({ fixed: [1, 2, 3, 4, 5], excluded: range(16, 45), games: 11 }),
      "IMPOSSIBLE_COMBINATION",
      "lotto.too_few_combinations",
      { max: 10, requested: 11 },
    );
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

// 유효 조건 생성기: 1~45를 섞어 앞 nf개는 고정, 다음 ne개는 제외. games는 가능 조합 수 이하로 맞춘다.
const validConfig = fc
  .record({
    perm: fc.shuffledSubarray(range(1, 45), { minLength: 45, maxLength: 45 }),
    nf: fc.integer({ min: 0, max: 6 }),
    ne: fc.integer({ min: 0, max: 39 }),
    games: fc.integer({ min: 1, max: 50 }),
    seed: fc.string(),
  })
  .map(({ perm, nf, ne, games, seed }) => {
    const fixed = perm.slice(0, nf);
    const excluded = perm.slice(nf, nf + ne);
    const max = binomial(45 - nf - ne, 6 - nf);
    return { config: { fixed, excluded, games: Math.min(games, max) }, seed };
  });

describe("속성", () => {
  it("유효 조건 → 6개·1~45·중복 없음·오름차순·고정 포함·제외 미포함·게임 간 중복 없음", () => {
    fc.assert(
      fc.property(validConfig, ({ config, seed }) => {
        const { games, engine_version } = gen(config, seed);
        expect(engine_version).toBe(LOTTO_ENGINE_VERSION);
        expect(games).toHaveLength(config.games);
        for (const g of games) {
          expect(g).toHaveLength(6);
          for (let i = 0; i < 6; i++) {
            expect(Number.isInteger(g[i])).toBe(true);
            expect(g[i]).toBeGreaterThanOrEqual(1);
            expect(g[i]).toBeLessThanOrEqual(45);
            if (i > 0) expect(g[i]!).toBeGreaterThan(g[i - 1]!); // 오름차순 ⇒ 중복 없음
          }
          for (const f of config.fixed) expect(g).toContain(f);
          for (const x of config.excluded) expect(g).not.toContain(x);
        }
        expect(new Set(games.map((g) => g.join(","))).size).toBe(games.length);
      }),
      { numRuns: 300 },
    );
  });

  it("같은 시드·같은 입력 → 같은 결과", () => {
    fc.assert(
      fc.property(validConfig, ({ config, seed }) => {
        expect(gen(config, seed)).toStrictEqual(gen(config, seed));
      }),
      { numRuns: 100 },
    );
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const fixed = [30, 10];
    const excluded = [5, 1];
    gen({ fixed, excluded, games: 3 });
    expect(fixed).toStrictEqual([30, 10]);
    expect(excluded).toStrictEqual([5, 1]);
  });
});

describe("균등성 — 카이제곱(p=8, k=2, 28조합, 유의수준 0.001)", () => {
  it("열거 경로의 조합 빈도가 균등하다", () => {
    // 고정 4 + 제외 33 → 후보 8(5~12), 필요 2 → C(8,2) = 28
    const config = { fixed: [1, 2, 3, 4], excluded: range(13, 45), games: 1 };
    const rng = createSeededRng("chi-square");
    const N = 28_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const key = generateLotto(config, rng).games[0]!.slice(4).join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(28);
    const expected = N / 28;
    let chi2 = 0;
    for (const c of counts.values()) chi2 += (c - expected) ** 2 / expected;
    expect(chi2).toBeLessThan(55.476); // 자유도 27, 상위 0.001 임계값
  });
});

describe("균등성 — 카이제곱(p=8, k=2, games=3: 배치에 등장한 조합 빈도, 유의수준 0.001)", () => {
  it("한 배치 3게임의 순서 없는 조합(28종) 등장 빈도가 균등하다", () => {
    const config = { fixed: [1, 2, 3, 4], excluded: range(13, 45), games: 3 };
    const rng = createSeededRng("chi-square-games3");
    const batches = 10_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < batches; i++) {
      for (const g of generateLotto(config, rng).games) {
        const key = g.slice(4).join(",");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(28);
    const expected = (batches * 3) / 28; // 비복원 추출이라 각 조합의 등장 확률은 3/28
    let chi2 = 0;
    for (const c of counts.values()) chi2 += (c - expected) ** 2 / expected;
    expect(chi2).toBeLessThan(55.476); // 자유도 27, 상위 0.001 임계값
  });
});

describe("골든 벡터 — 출력이 바뀌면 LOTTO_ENGINE_VERSION을 올린다", () => {
  it("재추첨 경로(C > 10,000), 같은 Rng로 연속 호출", () => {
    const rng = createSeededRng("golden-lotto");
    expect(generateLotto({ fixed: [7, 23], excluded: [1, 2, 3, 44, 45], games: 3 }, rng)).toStrictEqual({
      games: [
        [7, 8, 11, 23, 35, 43],
        [7, 9, 23, 31, 37, 38],
        [6, 7, 8, 10, 23, 37],
      ],
      engine_version: "lotto@1",
    });
    expect(generateLotto({ fixed: [], excluded: [], games: 2 }, rng).games).toStrictEqual([
      [9, 20, 30, 31, 35, 44],
      [1, 10, 17, 24, 28, 31],
    ]);
  });

  it("열거 경로(C ≤ 10,000)", () => {
    const rng = createSeededRng("golden-lotto");
    expect(generateLotto({ fixed: [1, 2, 3, 4], excluded: range(13, 45), games: 4 }, rng).games).toStrictEqual([
      [1, 2, 3, 4, 11, 12],
      [1, 2, 3, 4, 5, 7],
      [1, 2, 3, 4, 7, 11],
      [1, 2, 3, 4, 6, 8],
    ]);
  });
});

describe("성능(느슨한 상한)", () => {
  it("50게임 일반 조건 1회 < 500ms(느슨한 상한 — 회귀 감지용, 정밀 벤치 아님)", () => {
    const rng = createSeededRng("bench");
    generateLotto({ fixed: [], excluded: [], games: 50 }, rng); // 워밍업
    const t0 = performance.now();
    generateLotto({ fixed: [3, 17], excluded: [1, 2, 40], games: 50 }, rng);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
