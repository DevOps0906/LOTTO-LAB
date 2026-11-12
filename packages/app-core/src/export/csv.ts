// CSV 내보내기(D-05 내 번호 표·D-01 요약) — 문자열만 만든다. 파일 저장은 셸(Windows: Rust save_csv)이 맡는다.
// - UTF-8 BOM + CRLF 줄바꿈, RFC 4180 따옴표 처리(쉼표·따옴표·줄바꿈이 있는 셀은 "…", 따옴표는 "" 로).
// - 수식 주입 방지: =, +, -, @, 탭, CR로 시작하는 문자열 셀은 앞에 ' 를 붙인다(OWASP CSV Injection).
// - 숫자처럼 보이는 문자열(연금 여섯 자리 "000719")은 스프레드시트가 숫자로 바꿔 앞자리 0을 지우지 않게
//   **탭 접두 + 따옴표** `"\t000719"` 로 쓴다(결정: 수식 `="000719"`은 쓰지 않는다 — 수식 셀 자체를 만들지 않기 위해).
//   탭 접두는 이 함수가 붙인 것이라 수식 주입 이스케이프 대상이 아니며, 숫자만 있는 값에만 붙인다.
// - 빈 CSV(데이터 행 0)·5MB 초과는 만들지 않는다(셸 save_csv도 같은 한도로 다시 검사).
import { AppCoreError } from "../errors.ts";

export const CSV_BOM = "﻿";
/** CSV 최대 크기(UTF-8 바이트, BOM 포함). Rust save_csv의 CSV_MAX_BYTES와 같다. */
export const CSV_MAX_BYTES = 5 * 1024 * 1024;

/** 셀: 문자열·정수·빈칸(null) 또는 숫자로 바뀌면 안 되는 숫자 문자열({ text }). */
export type CsvCell = string | number | null | { text: string };

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTE = /[",\r\n]/;
const DIGITS = /^[0-9]+$/;

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** 셀 하나를 CSV 필드로. */
export function csvField(cell: CsvCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) throw new AppCoreError("INVALID_INPUT", "csv number");
    return String(cell);
  }
  if (typeof cell === "object") {
    // 숫자만 있는 값은 탭 접두로 텍스트 보존. 그 밖의 값은 일반 문자열처럼 이스케이프한다.
    if (DIGITS.test(cell.text)) return quote(`\t${cell.text}`);
    return csvField(cell.text);
  }
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return NEEDS_QUOTE.test(safe) ? quote(safe) : safe;
}

/** 머리글 + 데이터 행 → CSV 문자열(BOM 포함). 데이터 행이 없거나 열 수가 다르면 INVALID_INPUT, 5MB 초과면 LIMIT_EXCEEDED. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  if (rows.length === 0) throw new AppCoreError("INVALID_INPUT", "empty csv");
  if (rows.some((row) => row.length !== header.length)) throw new AppCoreError("INVALID_INPUT", "csv column count");
  const lines = [header, ...rows].map((row) => row.map(csvField).join(","));
  const text = `${CSV_BOM}${lines.join("\r\n")}\r\n`;
  if (new TextEncoder().encode(text).length > CSV_MAX_BYTES) throw new AppCoreError("LIMIT_EXCEEDED", "csv too large");
  return text;
}

/** 내 번호 표 한 줄(D-05). 판정·상태 문구는 화면이 정한 그대로 받는다. */
export type TicketCsvRow = {
  round: number | null;
  game: "lotto" | "pension";
  /** 연금 조(로또는 null) */
  group_no: number | null;
  /** 로또 "3 9 14 25 33 42", 연금 여섯 자리 "000719" */
  numbers: string;
  purchase_date: string | null;
  amount_won: number | null;
  /** 구매 상태(추천 번호·즐겨찾기·구매 기록) */
  status: string;
  /** 판정(구매 기록만, 그 밖은 "대상 아님" 등) */
  result: string;
  /** 판정에 쓴 공식 결과의 검증 시각(ISO), 없으면 null */
  verified_at: string | null;
};

export const TICKET_CSV_HEADER = ["회차", "복권", "조", "번호", "구매일", "금액(원)", "구매 상태", "판정", "검증 시각"] as const;
const GAME_LABEL = { lotto: "로또 6/45", pension: "연금복권 720+" } as const;

export function ticketsCsv(rows: readonly TicketCsvRow[]): string {
  return toCsv(
    TICKET_CSV_HEADER,
    rows.map((r) => {
      if (r.game === "pension" && !/^[0-9]{6}$/.test(r.numbers)) throw new AppCoreError("INVALID_INPUT", "pension digits");
      return [
        r.round,
        GAME_LABEL[r.game],
        r.group_no === null ? null : `${r.group_no}조`,
        r.game === "pension" ? { text: r.numbers } : r.numbers,
        r.purchase_date,
        r.amount_won,
        r.status,
        r.result,
        r.verified_at,
      ];
    }),
  );
}

/** 대시보드 요약 한 항목(D-01 내 기록 — 개수). */
export type SummaryCsvItem = { label: string; value: number };

export const SUMMARY_CSV_HEADER = ["항목", "값", "기준 시각"] as const;

/** at = 요약을 만든 시각(ISO). */
export function summaryCsv(items: readonly SummaryCsvItem[], at: string): string {
  return toCsv(
    SUMMARY_CSV_HEADER,
    items.map((i) => [i.label, i.value, at]),
  );
}

/** 기본 파일 이름: lotto-lab-{kind}-YYYYMMDD.csv (KST 날짜, Rust 이름 규칙 [\w.-]{1,64}\.csv 안). */
export function csvFileName(kind: "tickets" | "summary", now: Date): string {
  const day = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "");
  return `lotto-lab-${kind}-${day}.csv`;
}
