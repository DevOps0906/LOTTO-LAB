// A-07·A-14 티켓 입력, 날짜·시각, 회차 읽기(prizes 관대한 파싱), 생성 조건 범위, 오류 응답.
import { readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, ERROR_HTTP_STATUS } from "@lotto-lab/types";
import {
  DrawLottoSchema,
  DrawPensionSchema,
  ErrorResponseSchema,
  LottoGeneratorConfigSchema,
  PensionGeneratorConfigSchema,
  StatisticsCacheSchema,
  TicketCreateInputSchema,
  TicketPurchaseInputSchema,
  isAllowedTransition,
  isoDate,
  isoDateTime,
} from "../src/index.ts";

const KEY = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const lottoBase = { game: "lotto", round: 1200, ticket_data: { nums: [1, 2, 3, 4, 5, 6] }, idempotency_key: KEY };
const pensionBase = { game: "pension", round: 300, ticket_data: { group_no: 1, digits: "000719" }, idempotency_key: KEY };

describe("A-07 TicketCreateInput", () => {
  it("연금 티켓은 digits 문자열을 그대로 둔다", () => {
    const out = TicketCreateInputSchema.parse({ ...pensionBase, purchase_status: "favorite" });
    expect(out.ticket_data).toStrictEqual({ group_no: 1, digits: "000719" });
  });

  it("game과 ticket_data 형식이 어긋나면 거부한다", () => {
    expect(
      TicketCreateInputSchema.safeParse({ ...lottoBase, ticket_data: pensionBase.ticket_data, purchase_status: "favorite" })
        .success,
    ).toBe(false);
  });

  it("idempotency_key는 필수 uuid, round는 1 이상 정수", () => {
    const noKey: Record<string, unknown> = { ...lottoBase };
    delete noKey.idempotency_key;
    expect(TicketCreateInputSchema.safeParse({ ...noKey, purchase_status: "favorite" }).success).toBe(false);
    expect(TicketCreateInputSchema.safeParse({ ...lottoBase, idempotency_key: "abc", purchase_status: "favorite" }).success).toBe(false);
    expect(TicketCreateInputSchema.safeParse({ ...lottoBase, round: 0, purchase_status: "favorite" }).success).toBe(false);
  });

  it("source_number_id는 선택 uuid", () => {
    expect(TicketCreateInputSchema.safeParse({ ...lottoBase, source_number_id: KEY, purchase_status: "favorite" }).success).toBe(true);
    expect(TicketCreateInputSchema.safeParse({ ...lottoBase, source_number_id: "x", purchase_status: "favorite" }).success).toBe(false);
  });

  it("추가 키를 거부한다", () => {
    expect(TicketCreateInputSchema.safeParse({ ...lottoBase, purchase_status: "favorite", user_id: KEY }).success).toBe(false);
  });
});

describe("A-14 TicketPurchaseInput · 전환 규칙", () => {
  it("purchased + 날짜 필수, 금액 선택(정수 ≥ 0)", () => {
    expect(TicketPurchaseInputSchema.safeParse({ purchase_status: "purchased", purchase_date: "2026-11-07" }).success).toBe(true);
    expect(TicketPurchaseInputSchema.safeParse({ purchase_status: "purchased" }).success).toBe(false);
    expect(TicketPurchaseInputSchema.safeParse({ purchase_status: "favorite" }).success).toBe(false);
    expect(
      TicketPurchaseInputSchema.safeParse({ purchase_status: "purchased", purchase_date: "2026-11-07", amount_won: 1.5 }).success,
    ).toBe(false);
  });

  it("purchased→favorite만 금지(R19)", () => {
    expect(isAllowedTransition("favorite", "purchased")).toBe(true);
    expect(isAllowedTransition("favorite", "favorite")).toBe(true);
    expect(isAllowedTransition("purchased", "purchased")).toBe(true);
    expect(isAllowedTransition("purchased", "favorite")).toBe(false);
  });
});

describe("날짜 YYYY-MM-DD · 시각(오프셋 포함)", () => {
  it("속성: 실제 날짜는 통과하고 문자열 그대로다", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("0001-01-01T00:00:00Z"), max: new Date("9999-12-31T00:00:00Z"), noInvalidDate: true }), (d) => {
        const s = d.toISOString().slice(0, 10);
        expect(isoDate.parse(s)).toBe(s);
      }),
    );
  });

  it("없는 날짜·다른 형식·Date 객체는 거부한다(강제 변환 없음)", () => {
    for (const bad of ["2023-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "0000-01-01", "2026-1-5", "20261107", "2026-11-07T00:00:00Z"]) {
      expect(isoDate.safeParse(bad).success, bad).toBe(false);
    }
    expect(isoDate.safeParse(new Date()).success).toBe(false);
    expect(isoDate.safeParse("2000-02-29").success).toBe(true);
    expect(isoDate.safeParse("1900-02-29").success).toBe(false);
  });

  it("시각은 오프셋이 있어야 한다", () => {
    expect(isoDateTime.safeParse("2026-11-07T21:00:00+09:00").success).toBe(true);
    expect(isoDateTime.safeParse("2026-11-07T12:00:00Z").success).toBe(true);
    expect(isoDateTime.safeParse("2026-11-07T21:00:00").success).toBe(false);
  });
});

describe("회차 읽기 A-01·A-02", () => {
  const prizes = [
    { rank: 1, bonus: false, amount_won: 2_000_000_000, winners: 10, payout: "lump" },
    { rank: 1, bonus: false, amount_won: 7_000_000, winners: 1, payout: "annuity", months: 240 },
    { rank: 9, bonus: false, amount_won: 1, winners: 1, payout: "lump" },
    { rank: 2, bonus: false, amount_won: -5, winners: 1, payout: "lump" },
    { rank: null, bonus: true, amount_won: 1_000_000, winners: 2, payout: "annuity" },
    "garbage",
  ];
  const lotto = {
    draw_no: 1200,
    draw_date: "2026-11-07",
    nums: [1, 2, 3, 4, 5, 6],
    bonus: 7,
    prizes,
    source_url: "https://synthetic.invalid/1200",
    source_verified_at: "2026-11-07T21:00:00+09:00",
    ingestion_run_id: KEY,
  };

  it("prizes는 잘못된 요소만 빼고 나머지를 유지한다(전체 실패 금지)", () => {
    const out = DrawLottoSchema.parse(lotto);
    expect(out.prizes).toStrictEqual([prizes[0], prizes[1]]);
    expect("ingestion_run_id" in out).toBe(false);
  });

  it("rank·bonus 조합: 연금은 1~7등(bonus false) 또는 보너스(rank null·bonus true), 로또는 1~5등·bonus false만", () => {
    const p = (rank: number | null, bonus: boolean) => ({ rank, bonus, amount_won: 1000, winners: 1, payout: "lump" });
    const mixed = [p(1, false), p(7, false), p(null, true), p(1, true), p(null, false), p(6, false), p(5, false)];
    const pension = { ...lotto, group_no: 3, digits: "000719", bonus_digits: "012345", prizes: mixed };
    expect(DrawPensionSchema.parse(pension).prizes).toStrictEqual([p(1, false), p(7, false), p(null, true), p(6, false), p(5, false)]);
    expect(DrawLottoSchema.parse({ ...lotto, prizes: mixed }).prizes).toStrictEqual([p(1, false), p(5, false)]);
  });

  it("draw_no는 int4 범위(1~2147483647)", () => {
    expect(DrawLottoSchema.safeParse({ ...lotto, draw_no: 2147483647 }).success).toBe(true);
    expect(DrawLottoSchema.safeParse({ ...lotto, draw_no: 2147483648 }).success).toBe(false);
    expect(DrawLottoSchema.safeParse({ ...lotto, draw_no: 0 }).success).toBe(false);
  });

  it("보너스가 당첨 번호와 겹치면 거부한다", () => {
    expect(DrawLottoSchema.safeParse({ ...lotto, bonus: 6 }).success).toBe(false);
  });

  it("연금 회차는 digits·bonus_digits 문자열을 보존하고 number를 거부한다", () => {
    const pension = { ...lotto, group_no: 3, digits: "000719", bonus_digits: "012345" };
    const out = DrawPensionSchema.parse(pension);
    expect([out.digits, out.bonus_digits]).toStrictEqual(["000719", "012345"]);
    expect(DrawPensionSchema.safeParse({ ...pension, digits: 719 }).success).toBe(false);
  });

  it("출처 URL은 http(s)만", () => {
    expect(DrawLottoSchema.safeParse({ ...lotto, source_url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("통계 캐시: range_from ≤ range_to, sample_size ≥ 0", () => {
    const row = { game: "lotto", window_key: "all", metric: "freq", payload: {}, range_from: 1, range_to: 1200, sample_size: 1200, source: "x", updated_at: "2026-11-07T12:00:00Z" };
    expect(StatisticsCacheSchema.safeParse(row).success).toBe(true);
    expect(StatisticsCacheSchema.safeParse({ ...row, range_from: 1300 }).success).toBe(false);
    expect(StatisticsCacheSchema.safeParse({ ...row, sample_size: -1 }).success).toBe(false);
    expect(StatisticsCacheSchema.safeParse({ ...row, range_to: 2147483647, sample_size: 2147483647 }).success).toBe(true);
    expect(StatisticsCacheSchema.safeParse({ ...row, range_to: 2147483648 }).success).toBe(false);
    expect(StatisticsCacheSchema.safeParse({ ...row, sample_size: 2147483648 }).success).toBe(false);
    expect(StatisticsCacheSchema.safeParse({ ...row, range_from: -2147483649 }).success).toBe(false);
  });
});

describe("생성 조건(범위만)", () => {
  it("로또: 고정 0~6·제외 0~39·게임 1~50, 목록 안 중복 금지", () => {
    expect(LottoGeneratorConfigSchema.safeParse({ fixed: [], excluded: [], games: 5 }).success).toBe(true);
    expect(LottoGeneratorConfigSchema.safeParse({ fixed: [1, 2, 3, 4, 5, 6, 7], excluded: [], games: 5 }).success).toBe(false);
    expect(LottoGeneratorConfigSchema.safeParse({ fixed: [1, 1], excluded: [], games: 5 }).success).toBe(false);
    expect(LottoGeneratorConfigSchema.safeParse({ fixed: [], excluded: Array.from({ length: 40 }, (_, i) => i + 1), games: 5 }).success).toBe(false);
    expect(LottoGeneratorConfigSchema.safeParse({ fixed: [], excluded: [], games: 51 }).success).toBe(false);
    expect(LottoGeneratorConfigSchema.safeParse({ fixed: [], excluded: [], games: 0 }).success).toBe(false);
  });

  it("로또: 고정·제외 겹침은 스키마가 아니라 엔진이 판정한다", () => {
    expect(LottoGeneratorConfigSchema.safeParse({ fixed: [7], excluded: [7], games: 1 }).success).toBe(true);
  });

  it("연금: 조 1~5개(1~5, 중복 없음), 여섯 자리 숫자 문자 또는 null", () => {
    const ok = { groups: [1, 5], positions: ["0", null, null, null, null, "9"], games: 1 };
    expect(PensionGeneratorConfigSchema.safeParse(ok).success).toBe(true);
    expect(PensionGeneratorConfigSchema.safeParse({ ...ok, groups: [] }).success).toBe(false);
    expect(PensionGeneratorConfigSchema.safeParse({ ...ok, groups: [6] }).success).toBe(false);
    expect(PensionGeneratorConfigSchema.safeParse({ ...ok, positions: [0, null, null, null, null, null] }).success).toBe(false);
    expect(PensionGeneratorConfigSchema.safeParse({ ...ok, positions: [null, null, null, null, null] }).success).toBe(false);
  });
});

describe("오류 응답 — 04#2 표와 1:1", () => {
  const doc = readFileSync(path.join(import.meta.dirname, "..", "..", "..", "docs", "04_API.md"), "utf8");
  const section = /## 2\. 공통 에러 코드([\s\S]*?)\n## /.exec(doc)?.[1] ?? "";
  const rows = [...section.matchAll(/^\| (\d{3}) \| `([A-Z_]+)` \|/gm)].map((m) => [m[2], Number(m[1])] as const);

  it("코드 목록과 HTTP 상태가 문서 표와 같다", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect([...ERROR_CODES].sort()).toStrictEqual(rows.map(([code]) => code).sort());
    expect(Object.fromEntries(rows)).toStrictEqual(ERROR_HTTP_STATUS);
  });

  it("{error:{code,message}} 형식만 통과한다", () => {
    expect(ErrorResponseSchema.safeParse({ error: { code: "INVALID_TRANSITION", message: "구매 상태를 되돌릴 수 없습니다." } }).success).toBe(true);
    expect(ErrorResponseSchema.safeParse({ error: { code: "IMPOSSIBLE_COMBINATION", message: "x" } }).success).toBe(false);
    expect(ErrorResponseSchema.safeParse({ code: "INTERNAL", message: "x" }).success).toBe(false);
  });
});
