// CSV 내보내기 연결(D-05 내 번호 표·D-01 요약): 화면은 표에 보이는 값(문자열·정수)만 넘기고,
// CSV 문자열 만들기(app-core export/csv)와 파일 저장(Windows Rust save_csv — 사용자가 고른 경로)은 셸이 맡는다.
// 구조 타입은 app-core TicketCsvRow·SummaryCsvItem과 같다(셸 typecheck가 호환을 검사한다).

export type TicketCsvRow = {
  round: number | null;
  game: "lotto" | "pension";
  group_no: number | null;
  /** 로또 "3 9 14 25 33 42", 연금 여섯 자리 문자열 "000719"(숫자로 바꾸지 않는다) */
  numbers: string;
  purchase_date: string | null;
  amount_won: number | null;
  status: string;
  result: string;
  verified_at: string | null;
};

export type SummaryCsvItem = { label: string; value: number };

/** saved = 파일 저장 완료, cancelled = 사용자가 저장 대화상자를 닫음. 실패는 reject(화면이 다시 시도를 안내). */
export type CsvSaveResult = "saved" | "cancelled";

export type CsvExporter = {
  tickets(rows: TicketCsvRow[]): Promise<CsvSaveResult>;
  summary(items: SummaryCsvItem[]): Promise<CsvSaveResult>;
};
