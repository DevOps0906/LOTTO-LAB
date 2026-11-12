// CSV 내보내기(task-027): 연금 여섯 자리 문자열 보존, 수식 주입 이스케이프, RFC 4180 따옴표, BOM, 빈 CSV 방지, 크기 한도.
import { describe, expect, it } from "vitest";
import {
  AppCoreError,
  CSV_BOM,
  CSV_MAX_BYTES,
  csvField,
  csvFileName,
  summaryCsv,
  ticketsCsv,
  toCsv,
  type TicketCsvRow,
} from "../src/index.ts";

const pension: TicketCsvRow = {
  round: 291,
  game: "pension",
  group_no: 1,
  numbers: "000719",
  purchase_date: "2026-11-12",
  amount_won: 1000,
  status: "구매 기록",
  result: "결과 대기",
  verified_at: null,
};
const lotto: TicketCsvRow = {
  round: 1197,
  game: "lotto",
  group_no: null,
  numbers: "3 9 14 25 33 42",
  purchase_date: "2026-11-10",
  amount_won: 5000,
  status: "구매 기록",
  result: "낙첨",
  verified_at: "2026-11-08T12:00:00.000Z",
};

function lines(csv: string): string[] {
  return csv.slice(CSV_BOM.length).split("\r\n");
}

describe("export — 텍스트 보존", () => {
  it("연금 000719는 그대로(탭 접두 + 따옴표)로 남아 숫자 719로 바뀌지 않는다", () => {
    const csv = ticketsCsv([pension]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const row = lines(csv)[1]!;
    expect(row).toBe('291,연금복권 720+,1조,"\t000719",2026-11-12,1000,구매 기록,결과 대기,');
    expect(row).toContain("000719");
    expect(row).not.toMatch(/,719,/);
  });

  it("숫자가 아닌 { text } 값은 일반 문자열처럼 이스케이프한다", () => {
    expect(csvField({ text: "=1+1" })).toBe("'=1+1");
    expect(csvField({ text: "00 7" })).toBe("00 7");
  });

  it("연금 번호가 여섯 자리 숫자가 아니면 만들지 않는다", () => {
    expect(() => ticketsCsv([{ ...pension, numbers: "719" }])).toThrow(AppCoreError);
  });
});

describe("export — 수식 주입 방지", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\t=1", "'\t=1"],
    ["\r=1", "\"'\r=1\""],
  ])("%j → %j", (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });

  it("행 안의 =1+1 셀은 ' 접두로 이스케이프된다", () => {
    const csv = ticketsCsv([{ ...lotto, status: "=1+1", result: '=HYPERLINK("x")' }]);
    expect(lines(csv)[1]).toContain(",'=1+1,");
    expect(lines(csv)[1]).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("숫자 셀은 그대로, 음수가 아닌 정수만 쓴다", () => {
    expect(csvField(1000)).toBe("1000");
    expect(csvField(null)).toBe("");
    expect(() => csvField(Number.NaN)).toThrow(AppCoreError);
  });
});

describe("export — RFC 4180", () => {
  it("쉼표·따옴표·줄바꿈 셀은 따옴표로 감싸고 따옴표는 두 번 쓴다", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField("plain")).toBe("plain");
  });

  it("머리글 + CRLF, 마지막 줄도 CRLF로 끝난다", () => {
    const csv = ticketsCsv([lotto, pension]);
    const all = lines(csv);
    expect(all[0]).toBe("회차,복권,조,번호,구매일,금액(원),구매 상태,판정,검증 시각");
    expect(all[1]).toBe("1197,로또 6/45,,3 9 14 25 33 42,2026-11-10,5000,구매 기록,낙첨,2026-11-08T12:00:00.000Z");
    expect(all).toHaveLength(4);
    expect(all[3]).toBe("");
  });
});

describe("export — 빈 CSV·크기", () => {
  it("데이터 행이 없으면 만들지 않는다(빈 CSV 방지)", () => {
    expect(() => ticketsCsv([])).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() => summaryCsv([], "2026-11-12T00:00:00.000Z")).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("열 수가 다르면 INVALID_INPUT", () => {
    expect(() => toCsv(["a", "b"], [["1"]])).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("5MB를 넘으면 LIMIT_EXCEEDED", () => {
    expect(() => toCsv(["a"], [["x".repeat(CSV_MAX_BYTES)]])).toThrow(expect.objectContaining({ code: "LIMIT_EXCEEDED" }));
  });
});

describe("export — 요약·파일 이름", () => {
  it("요약 CSV: 항목·값·기준 시각", () => {
    const csv = summaryCsv(
      [
        { label: "저장한 번호", value: 3 },
        { label: "구매 등록", value: 1 },
      ],
      "2026-11-12T03:00:00.000Z",
    );
    expect(lines(csv).slice(0, 3)).toEqual(["항목,값,기준 시각", "저장한 번호,3,2026-11-12T03:00:00.000Z", "구매 등록,1,2026-11-12T03:00:00.000Z"]);
  });

  it("파일 이름은 KST 날짜, Rust 이름 규칙 안", () => {
    const name = csvFileName("tickets", new Date("2026-11-12T16:00:00.000Z"));
    expect(name).toBe("lotto-lab-tickets-20261113.csv");
    expect(name).toMatch(/^[\w.-]{1,64}\.csv$/);
    expect(csvFileName("summary", new Date("2026-11-12T03:00:00.000Z"))).toBe("lotto-lab-summary-20261112.csv");
  });
});
