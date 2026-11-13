// pension-engine 테스트(task-014): 경계·세트 확장·입력 계약·불가능 판정·속성·균등성(카이제곱)·골든 벡터.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EngineError, createSeededRng, type Rng } from "@lotto-lab/lottery-core";
import type { PensionGeneratorConfig } from "@lotto-lab/types";
import { PENSION_ENGINE_VERSION, generatePension } from "../src/index.ts";

const AUTO6 = [null, null, null, null, null, null];
const gen = (config: PensionGeneratorConfig, seed = "t") => generatePension(config, createSeededRng(seed));

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

describe("경계·고정 자리", () => {
  it("여섯 자리 모두 고정 \"000719\": 1장은 그대로, games 2는 too_few_combinations(max 1)", () => {
    const positions = ["0", "0", "0", "7", "1", "9"];
    expect(gen({ groups: [1], positions, games: 1 })).toStrictEqual({
      tickets: [{ group_no: 1, digits: "000719" }],
      engine_version: "pension@1",
    });
    expectEngineError(() => gen({ groups: [1], positions, games: 2 }), "IMPOSSIBLE_COMBINATION", "pension.too_few_combinations", {
      max: 1,
      requested: 2,
    });
  });

  it("자동 1자리(10개): 10개 성공(전부 다름), 11개 실패", () => {
    const positions = ["1", "2", "3", "4", "5", null];
    const { tickets } = gen({ groups: [2], positions, games: 10 });
    expect(new Set(tickets.map((t) => t.digits)).size).toBe(10);
    expectEngineError(() => gen({ groups: [2], positions, games: 11 }), "IMPOSSIBLE_COMBINATION", "pension.too_few_combinations", {
      max: 10,
      requested: 11,
    });
  });

  it("끝자리 고정(positions[5])은 일의 자리에 반영된다", () => {
    for (const t of gen({ groups: [4], positions: [null, null, null, null, null, "3"], games: 20 }).tickets) {
      expect(t.digits.endsWith("3")).toBe(true);
    }
  });
});

describe("조 확장", () => {
  it("5조 세트: 베이스 1개 → 5장, 같은 digits·조 1~5 오름차순", () => {
    const { tickets } = gen({ groups: [4, 2, 5, 1, 3], positions: AUTO6, games: 1 });
    expect(tickets).toHaveLength(5);
    expect(tickets.map((t) => t.group_no)).toStrictEqual([1, 2, 3, 4, 5]);
    expect(new Set(tickets.map((t) => t.digits)).size).toBe(1);
  });

  it("총 장수 = games × 조 수(최대 50 × 5 = 250), 베이스 순 → 조 오름차순", () => {
    const { tickets } = gen({ groups: [5, 1, 2, 3, 4], positions: AUTO6, games: 50 });
    expect(tickets).toHaveLength(250);
    for (let b = 0; b < 50; b++) {
      const chunk = tickets.slice(b * 5, b * 5 + 5);
      expect(chunk.map((t) => t.group_no)).toStrictEqual([1, 2, 3, 4, 5]);
      expect(new Set(chunk.map((t) => t.digits)).size).toBe(1);
    }
    expect(gen({ groups: [3, 1], positions: AUTO6, games: 7 }).tickets).toHaveLength(14);
  });
});

describe("입력 계약 — INVALID_INPUT", () => {
  const base: PensionGeneratorConfig = { groups: [1], positions: AUTO6, games: 1 };
  it.each([
    ["config null", null, "pension.config"],
    ["groups 배열 아님", { ...base, groups: 1 }, "pension.groups"],
    ["groups 빈 배열", { ...base, groups: [] }, "pension.groups"],
    ["groups 0", { ...base, groups: [0] }, "pension.groups"],
    ["groups 6", { ...base, groups: [6] }, "pension.groups"],
    ["groups 실수", { ...base, groups: [1.5] }, "pension.groups"],
    ["groups 문자열", { ...base, groups: ["1"] }, "pension.groups"],
    ["groups 중복", { ...base, groups: [2, 2] }, "pension.groups"],
    // eslint-disable-next-line no-sparse-arrays
    ["groups 희소 배열", { ...base, groups: [, 1] }, "pension.groups"],
    ["positions 배열 아님", { ...base, positions: "000719" }, "pension.positions"],
    ["positions 길이 5", { ...base, positions: AUTO6.slice(1) }, "pension.positions"],
    ["positions 길이 7", { ...base, positions: [...AUTO6, null] }, "pension.positions"],
    ["positions 숫자형", { ...base, positions: [0, null, null, null, null, null] }, "pension.positions"],
    ["positions 두 글자", { ...base, positions: ["10", null, null, null, null, null] }, "pension.positions"],
    ["positions 빈 문자열", { ...base, positions: ["", null, null, null, null, null] }, "pension.positions"],
    ["positions 문자", { ...base, positions: ["a", null, null, null, null, null] }, "pension.positions"],
    ["positions undefined", { ...base, positions: [undefined, null, null, null, null, null] }, "pension.positions"],
    // eslint-disable-next-line no-sparse-arrays
    ["positions 희소 배열", { ...base, positions: [, "1", "2", "3", "4", "5"] }, "pension.positions"],
    ["games 0", { ...base, games: 0 }, "pension.games"],
    ["games 51", { ...base, games: 51 }, "pension.games"],
    ["games 실수", { ...base, games: 1.5 }, "pension.games"],
  ])("%s", (_, config, hint) => {
    expectEngineError(() => gen(config as never), "INVALID_INPUT", hint);
  });
});

describe("불가능 판정·시도 상한", () => {
  it("자동 2자리(100개)에 games 50은 성공, 고정 4 + 자동 1에 games 11은 즉시 실패", () => {
    expect(gen({ groups: [1], positions: ["0", "0", "0", "0", null, null], games: 50 }).tickets).toHaveLength(50);
    expectEngineError(
      () => gen({ groups: [1, 2], positions: ["9", "9", "9", "9", "9", null], games: 11 }),
      "IMPOSSIBLE_COMBINATION",
      "pension.too_few_combinations",
      { max: 10, requested: 11 },
    );
  });

  it("재추첨 경로는 시도 상한에서 멈춘다(항상 0을 내는 Rng)", () => {
    const zero: Rng = { nextInt: () => 0 };
    expectEngineError(
      () => generatePension({ groups: [1], positions: ["1", null, null, null, null, null], games: 2 }, zero),
      "IMPOSSIBLE_COMBINATION",
      "pension.rng_exhausted",
      { max: 100_000, requested: 2 },
    );
  });
});

// 유효 조건 생성기: 조 부분집합(1개 이상), 자리마다 고정 문자 또는 자동, games는 10^k 이하로 맞춘다.
const digitChar = fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");
const validConfig = fc
  .record({
    groups: fc.shuffledSubarray([1, 2, 3, 4, 5], { minLength: 1, maxLength: 5 }),
    positions: fc.array(fc.option(digitChar, { nil: null }), { minLength: 6, maxLength: 6 }),
    games: fc.integer({ min: 1, max: 50 }),
    seed: fc.string(),
  })
  .map(({ groups, positions, games, seed }) => {
    const max = 10 ** positions.filter((p) => p === null).length;
    return { config: { groups, positions, games: Math.min(games, max) }, seed };
  });

describe("속성", () => {
  it("유효 조건 → digits ^[0-9]{6}$·고정 자리 보존·베이스 간 중복 없음·조 확장(같은 digits, 조 오름차순)", () => {
    fc.assert(
      fc.property(validConfig, ({ config, seed }) => {
        const { tickets, engine_version } = gen(config, seed);
        expect(engine_version).toBe(PENSION_ENGINE_VERSION);
        const groups = [...config.groups].sort((a, b) => a - b);
        expect(tickets).toHaveLength(config.games * groups.length);
        const bases: string[] = [];
        for (let b = 0; b < config.games; b++) {
          const chunk = tickets.slice(b * groups.length, (b + 1) * groups.length);
          expect(chunk.map((t) => t.group_no)).toStrictEqual(groups);
          const digits = chunk[0]!.digits;
          expect(typeof digits).toBe("string");
          expect(digits).toMatch(/^[0-9]{6}$/);
          for (const t of chunk) expect(t.digits).toBe(digits);
          config.positions.forEach((p, i) => {
            if (p !== null) expect(digits[i]).toBe(p);
          });
          bases.push(digits);
        }
        expect(new Set(bases).size).toBe(bases.length);
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
    const groups = [3, 1];
    const positions = [null, "0", null, null, null, null];
    gen({ groups, positions, games: 3 });
    expect(groups).toStrictEqual([3, 1]);
    expect(positions).toStrictEqual([null, "0", null, null, null, null]);
  });
});

describe("균등성 — 카이제곱(자동 2자리, 100가지, 유의수준 0.001)", () => {
  it("열거 경로의 digits 빈도가 균등하다", () => {
    const config = { groups: [1], positions: ["0", "7", null, "1", null, "9"], games: 1 };
    const rng = createSeededRng("chi-square");
    const N = 20_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const key = generatePension(config, rng).tickets[0]!.digits;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(100);
    const expected = N / 100;
    let chi2 = 0;
    for (const c of counts.values()) chi2 += (c - expected) ** 2 / expected;
    expect(chi2).toBeLessThan(148.23); // 자유도 99, 상위 0.001 임계값
  });
});

describe("골든 벡터 — 출력이 바뀌면 PENSION_ENGINE_VERSION을 올린다", () => {
  it("재추첨 경로(10^k > 10,000), 같은 Rng로 연속 호출", () => {
    const rng = createSeededRng("golden-pension");
    expect(generatePension({ groups: [3, 1], positions: [null, null, null, null, null, "7"], games: 3 }, rng)).toStrictEqual({
      tickets: [
        { group_no: 1, digits: "225287" },
        { group_no: 3, digits: "225287" },
        { group_no: 1, digits: "848287" },
        { group_no: 3, digits: "848287" },
        { group_no: 1, digits: "187417" },
        { group_no: 3, digits: "187417" },
      ],
      engine_version: "pension@1",
    });
    expect(generatePension({ groups: [5], positions: AUTO6, games: 4 }, rng).tickets.map((t) => t.digits)).toStrictEqual([
      "144627",
      "979864",
      "516580",
      "126275",
    ]);
  });

  it("재추첨 경로 — 0으로 시작하는 출력(5조 세트)", () => {
    const rng = createSeededRng("golden-pension-zero");
    const { tickets } = generatePension({ groups: [1, 2, 3, 4, 5], positions: ["0", null, null, null, null, null], games: 2 }, rng);
    expect(tickets.map((t) => t.digits)).toStrictEqual(["065354", "065354", "065354", "065354", "065354", "085765", "085765", "085765", "085765", "085765"]);
  });

  it("자동 자리 0개(k=0)는 Rng를 소비하지 않는다", () => {
    const config = { groups: [1], positions: AUTO6, games: 3 };
    const fresh = generatePension(config, createSeededRng("golden-pension-k0"));
    const rng = createSeededRng("golden-pension-k0");
    expect(generatePension({ groups: [5], positions: ["0", "0", "0", "7", "1", "9"], games: 1 }, rng).tickets).toStrictEqual([
      { group_no: 5, digits: "000719" },
    ]);
    expect(generatePension(config, rng)).toStrictEqual(fresh);
  });

  it("열거 경로(10^k ≤ 10,000) — 0으로 시작하는 출력", () => {
    const rng = createSeededRng("golden-pension");
    expect(generatePension({ groups: [2], positions: ["0", "0", null, null, "1", null], games: 5 }, rng).tickets.map((t) => t.digits)).toStrictEqual([
      "006812",
      "003819",
      "009713",
      "008412",
      "007312",
    ]);
  });
});
