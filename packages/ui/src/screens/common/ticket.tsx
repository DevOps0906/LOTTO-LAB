// 내 번호 화면 공통(M-07 목록·M-08 상세·당첨 확인·M-09 구매 등록): app-core 저장 번호·판정 구조 타입, 번호·상태 배지·판정 표기.
// 상태 분리(AGENTS 4장): 추천(생성 이력)·즐겨찾기·구매 기록·당첨 확인 결과는 각각 다른 배지로 보이고 섞지 않는다.
// 연금 번호는 문자열 그대로(앞자리 0 보존 — "000719"), 금액은 정수 원.
import type { ReactNode } from "react";
import { Ball } from "../../components/Ball";
import { Updated } from "../../components/Updated";
import { formatTime, sourceHost, type Game, type LottoDraw, type PensionDraw, type ReadResult } from "./data";
import { ReadBanner } from "./ReadBanner";

export type LottoTicketData = { nums: number[] };
export type PensionTicketData = { group_no: number; digits: string };
export type TicketNumbersData = { game: "lotto"; ticket_data: LottoTicketData } | { game: "pension"; ticket_data: PensionTicketData };

/** app-core LocalTicket과 같은 형식(저장 번호 — 즐겨찾기·구매 기록). */
export type TicketRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  /** null = 회차 미입력(판정 대상 아님) */
  round: number | null;
  /** 생성 이력에서 저장한 경우 그 생성 레코드 id */
  source_number_id: string | null;
  idempotency_key: string;
} & TicketNumbersData &
  (
    | { purchase_status: "favorite"; purchase_date: null; amount_won: null }
    | { purchase_status: "purchased"; purchase_date: string; amount_won: number | null }
  );

/** app-core LocalGenerated 중 화면이 쓰는 부분(생성 이력 — 추천 번호일 뿐 구매가 아니다). */
export type HistoryRecord = { id: string; created_at: string } & (
  | { game: "lotto"; numbers: { nums: number[] }; group_no: null }
  | { game: "pension"; numbers: { digits: string }; group_no: number }
);

export type JudgeResult = { matched_rank: number | null; bonus_hit: boolean };

/** app-core CheckOutcome과 같은 형식. */
export type TicketOutcome =
  | { ticket: TicketRecord; status: "no_round" }
  | { ticket: TicketRecord; status: "pending"; stale: boolean; error?: ReadResult<unknown>["error"] }
  | {
      ticket: TicketRecord;
      status: "checked";
      draw_no: number;
      result: JudgeResult;
      source_url: string;
      source_verified_at: string;
      fetched_at: string | null;
      stale: boolean;
    };

export type PurchaseFields = { purchase_date: string; amount_won: number | null; round: number | null };
export type SavePurchaseInput = TicketNumbersData & {
  purchase_status: "purchased";
  purchase_date: string;
  amount_won: number | null;
  round: number | null;
  idempotency_key: string;
};

/** 내 번호 화면이 쓰는 app-core(AppCore) 기능 — 셸 typecheck가 AppCore와의 호환을 검사한다. */
export type TicketsCore = {
  tickets: {
    list(): Promise<TicketRecord[]>;
    get(id: string): Promise<TicketRecord | null>;
    save(input: SavePurchaseInput): Promise<TicketRecord>;
    saveFromGenerated(generatedId: string, input: { purchase_status: "favorite"; round: null; idempotency_key: string }): Promise<TicketRecord>;
    changeStatus(id: string, input: { purchase_status: "purchased"; purchase_date: string; amount_won?: number }): Promise<TicketRecord>;
    setRound(id: string, round: number | null): Promise<TicketRecord>;
    purchase(id: string, input: { round: number | null; purchase_date: string; amount_won?: number }): Promise<TicketRecord>;
    remove(id: string): Promise<void>;
    restore(ticket: TicketRecord): Promise<TicketRecord>;
    newIdempotencyKey(): string;
    suggestRound(game: Game): Promise<{ round: number | null; needs_confirmation: boolean }>;
  };
  generator: { history(): Promise<HistoryRecord[]> };
  checker: {
    checkPurchased(game?: Game, options?: { force?: boolean }): Promise<TicketOutcome[]>;
    checkTicket(id: string, options?: { force?: boolean }): Promise<TicketOutcome | null>;
  };
  reader: {
    latestDraw(game: "lotto", options?: { force?: boolean }): Promise<ReadResult<LottoDraw>>;
    latestDraw(game: "pension", options?: { force?: boolean }): Promise<ReadResult<PensionDraw>>;
  };
  adapters: {
    clipboard: { writeText(text: string): Promise<void> };
    share: { share(content: { title?: string; text: string }): Promise<void> };
    openExternal: { open(url: string): Promise<void> };
  };
};

/** 상태 배지 종류: 추천(생성 이력)·즐겨찾기·구매 기록. */
export type StatusKind = "generated" | "favorite" | "purchased";

export const STATUS_LABEL: Record<StatusKind, string> = {
  generated: "추천 번호",
  favorite: "즐겨찾기",
  purchased: "구매 기록",
};

export function StatusBadge({ kind }: { kind: StatusKind }) {
  return (
    <span className="ll-badge" data-status={kind}>
      {STATUS_LABEL[kind]}
    </span>
  );
}

/** 판정 배지(구매 기록에만). tone은 색 보조일 뿐 — 문구로 구분한다. */
export function ResultBadge({ label, tone }: { label: string; tone: ResultTone }) {
  return (
    <span className="ll-badge" data-result={tone}>
      {label}
    </span>
  );
}

export type ResultTone = "win" | "lose" | "wait" | "action" | "error";
export type ResultView = { label: string; tone: ResultTone; bonus?: boolean };

/**
 * 판정 표기. latestNo = 그 복권의 수집된 최신 회차(모르면 undefined).
 * 연금 보너스는 등위와 따로 표기한다(동시 일치 시 둘 다 보인다 — 지급 기준은 공식 결과 확인).
 */
export function resultView(outcome: TicketOutcome, latestNo?: number): ResultView {
  if (outcome.status === "no_round") return { label: "회차를 입력하세요", tone: "action" };
  if (outcome.status === "pending") {
    if (outcome.error && outcome.error !== "EMPTY") return { label: "결과를 불러오지 못함", tone: "error" };
    const round = outcome.ticket.round ?? 0;
    return latestNo !== undefined && round > latestNo ? { label: "추첨 전", tone: "wait" } : { label: "결과 대기", tone: "wait" };
  }
  const { matched_rank, bonus_hit } = outcome.result;
  if (matched_rank !== null) return { label: `${matched_rank}등`, tone: "win", bonus: bonus_hit };
  if (bonus_hit) return { label: "등위 없음", tone: "lose", bonus: true };
  return { label: "낙첨", tone: "lose" };
}

export function ResultBadges({ view }: { view: ResultView }) {
  return (
    <span className="ll-tickets__results">
      <ResultBadge label={view.label} tone={view.tone} />
      {view.bonus && <ResultBadge label="보너스 일치" tone="win" />}
    </span>
  );
}

type CheckedOutcome = Extract<TicketOutcome, { status: "checked" }>;

/** 판정이 보이는 곳 공통: 대조한 회차 결과의 출처(공개 결과 호스트)·검증 시각·조회 시각. 판정 완료(checked)일 때만. */
export function OutcomeSource({ outcome }: { outcome: TicketOutcome | undefined }) {
  if (outcome?.status !== "checked") return null;
  return (
    <div className="ll-tickets__provenance">
      <Updated source={`${sourceHost(outcome.source_url)} 공개 결과`} verifiedAt={outcome.source_verified_at} />
      {outcome.fetched_at && (
        <p className="ll-muted">
          조회 <time dateTime={outcome.fetched_at}>{formatTime(outcome.fetched_at)}</time>
        </p>
      )}
    </div>
  );
}

/** 판정에 쓴 회차 결과가 마지막 정상본(stale)이면 안내 배너. */
export function OutcomeBanner({ outcomes, action }: { outcomes: readonly TicketOutcome[]; action?: ReactNode }) {
  const checked = outcomes.filter((o): o is CheckedOutcome => o.status === "checked");
  return <ReadBanner results={checked.map((o) => ({ data: o, fetched_at: o.fetched_at, stale: o.stale }))} action={action} />;
}

export function TicketNumbers({ data }: { data: TicketNumbersData }) {
  if (data.game === "lotto") {
    return (
      <span className="ll-balls ll-balls--small" role="list" aria-label="번호">
        {data.ticket_data.nums.map((n) => (
          <span role="listitem" key={n}>
            <Ball number={n} />
          </span>
        ))}
      </span>
    );
  }
  const { group_no, digits } = data.ticket_data;
  return (
    <span className="ll-pension-line" role="group" aria-label={`번호 ${group_no}조 ${digits}`}>
      <span className="ll-chip" data-game="pension">
        {group_no}조
      </span>
      <span className="ll-mono">{digits}</span>
    </span>
  );
}

/** 복사·공유 문구: 로또 "3 9 14 25 33 42", 연금 "1조 000719"(문자열 그대로). */
export function ticketText(data: TicketNumbersData): string {
  return data.game === "lotto" ? data.ticket_data.nums.join(" ") : `${data.ticket_data.group_no}조 ${data.ticket_data.digits}`;
}

export function historyData(h: HistoryRecord): TicketNumbersData {
  return h.game === "lotto"
    ? { game: "lotto", ticket_data: { nums: h.numbers.nums } }
    : { game: "pension", ticket_data: { group_no: h.group_no, digits: h.numbers.digits } };
}

export function roundText(round: number | null): string {
  return round === null ? "회차 미입력" : `제 ${round.toLocaleString("ko-KR")}회`;
}

/** KST 오늘 "YYYY-MM-DD". */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 오류 code(app-core AppCoreError). */
export function errorCode(error: unknown): string | undefined {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

export const SHARE_TITLE = "LOTTO LAB 내 번호";

/**
 * 삭제 정책(DESIGN 4.7 — 실행 취소는 편의): 즐겨찾기 제거는 다시 저장으로 복구할 수 있어 스낵바 실행 취소만,
 * 구매 기록 삭제는 다른 복구 경로가 없어 AlertDialog로 먼저 확인한 뒤 삭제(스낵바 실행 취소는 유지).
 */
export const PURCHASE_DELETE_DIALOG = {
  title: "구매 기록을 삭제할까요?",
  description: "구매 기록을 삭제하면 되돌릴 수 없어요. 같은 번호는 구매 등록으로 다시 입력해야 합니다.",
  confirmLabel: "삭제",
} as const;

/** 삭제·제거 뒤 스낵바 문구(복구 경로 안내 포함). */
export function removedMessage(ticket: TicketRecord): string {
  if (ticket.purchase_status === "purchased") return "구매 기록을 삭제했어요";
  return ticket.source_number_id ? "즐겨찾기에서 제거했어요 · 생성 이력에서 다시 저장할 수 있어요" : "내 번호에서 제거했어요";
}
