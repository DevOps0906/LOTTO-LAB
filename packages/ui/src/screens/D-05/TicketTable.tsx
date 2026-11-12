// D-05 Windows 내 번호 넓은 표 + CSV 내보내기. 목록 로직(탭·검색·필터·정렬·제거·저장)은 M-07 MyTickets가 그대로 맡고,
// 이 파일은 줄을 표로 그리는 부분과 내보내기 막대만 둔다(ADR-0004 — 같은 블록, 배치만 다름).
// - 판정·검증 시각은 구매 기록에만 보인다(즐겨찾기·추천 번호는 "대상 아님"). 연금 번호는 문자열 그대로("000719").
// - CSV: 선택한 행 또는 지금 필터 결과 전체 — 내보내기 전에 범위와 건수를 보인다. 0건이면 버튼을 막는다(빈 CSV 방지).
import { useState, type ReactNode } from "react";
import { ActionMenu, type ActionMenuItem } from "../../components/ActionMenu";
import { Button } from "../../components/Button";
import { useNotice } from "../../components/Notice";
import { GAME_NAME, formatTime, formatWon } from "../common/data";
import type { CsvExporter, TicketCsvRow } from "../common/csv";
import { Segment } from "../common/generator";
import {
  ResultBadges,
  STATUS_LABEL,
  StatusBadge,
  historyData,
  resultView,
  roundText,
  ticketText,
  type HistoryRecord,
  type TicketNumbersData,
  type TicketOutcome,
  type TicketRecord,
} from "../common/ticket";

/** 내 번호 목록 한 줄: 저장 번호(즐겨찾기·구매 기록) 또는 생성 이력(추천 번호). */
export type TicketListRow =
  | { kind: "ticket"; ticket: TicketRecord }
  | { kind: "history"; history: HistoryRecord; savedTicket: TicketRecord | undefined };

export function rowId(row: TicketListRow): string {
  return row.kind === "ticket" ? row.ticket.id : row.history.id;
}

function rowData(row: TicketListRow): TicketNumbersData {
  return row.kind === "ticket" ? row.ticket : historyData(row.history);
}

/** 표·CSV 공통 번호 문자열: 로또 "3 9 14 25 33 42", 연금 여섯 자리(조는 따로). */
function numbersText(data: TicketNumbersData): string {
  return data.game === "lotto" ? data.ticket_data.nums.join(" ") : data.ticket_data.digits;
}

/** 판정 문구(표·CSV 같은 말). 구매 기록이 아니면 대조 대상이 아니다. */
function judgeText(row: TicketListRow, outcome: TicketOutcome | undefined, latestNo: number | undefined): string {
  if (row.kind !== "ticket" || row.ticket.purchase_status !== "purchased") return "대상 아님";
  if (!outcome) return "확인 전";
  const view = resultView(outcome, latestNo);
  return view.bonus ? `${view.label} · 보너스 일치` : view.label;
}

export type TicketTableProps = {
  caption: string;
  rows: TicketListRow[];
  outcomes: Map<string, TicketOutcome> | null;
  checking: boolean;
  latestNo: Partial<Record<"lotto" | "pension", number>>;
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], on: boolean) => void;
  detail: (ticketId: string) => string;
  /** 줄 메뉴 항목(목록 화면의 기존 동작을 그대로 쓴다) */
  menu: (row: TicketListRow) => ActionMenuItem[];
};

export function TicketTable({ caption, rows, outcomes, checking, latestNo, selected, onSelect, detail, menu }: TicketTableProps) {
  const ids = rows.map(rowId);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <div className="ll-wtable ll-tickets__table" tabIndex={0} role="region" aria-label={`${caption} 영역(가로 스크롤)`}>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="ll-wtable__check">
              <input type="checkbox" aria-label="보이는 행 모두 선택" checked={all} onChange={(e) => onSelect(ids, e.target.checked)} />
            </th>
            <th scope="col">회차</th>
            <th scope="col">복권</th>
            <th scope="col">조</th>
            <th scope="col">번호</th>
            <th scope="col">구매일</th>
            <th scope="col" data-numeric="true">
              금액(원)
            </th>
            <th scope="col">구매 상태</th>
            <th scope="col">판정</th>
            <th scope="col">검증 시각</th>
            <th scope="col">
              <span className="ll-sr-only">메뉴</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Line
              key={rowId(row)}
              row={row}
              outcome={row.kind === "ticket" ? (outcomes?.get(row.ticket.id) ?? undefined) : undefined}
              checking={checking}
              latestNo={latestNo[rowData(row).game]}
              selected={selected.has(rowId(row))}
              onSelect={(on) => onSelect([rowId(row)], on)}
              detail={detail}
              menu={menu(row)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Line({
  row,
  outcome,
  checking,
  latestNo,
  selected,
  onSelect,
  detail,
  menu,
}: {
  row: TicketListRow;
  outcome: TicketOutcome | undefined;
  checking: boolean;
  latestNo: number | undefined;
  selected: boolean;
  onSelect: (on: boolean) => void;
  detail: (ticketId: string) => string;
  menu: ActionMenuItem[];
}) {
  const data = rowData(row);
  const name = `${GAME_NAME[data.game]} ${ticketText(data)}`;
  const ticket = row.kind === "ticket" ? row.ticket : null;
  const purchased = ticket?.purchase_status === "purchased" ? ticket : null;
  let round: ReactNode;
  if (ticket) {
    round = (
      <a className="ll-link ll-num" href={detail(ticket.id)}>
        {roundText(ticket.round)}
        {" "}
        <span className="ll-sr-only">{`${ticketText(ticket)} 상세 보기`}</span>
      </a>
    );
  } else if (row.kind === "history" && row.savedTicket) {
    round = (
      <a className="ll-link" href={detail(row.savedTicket.id)}>
        저장됨 <span className="ll-sr-only">{`${ticketText(data)} 상세 보기`}</span>
      </a>
    );
  } else {
    round = <span className="ll-muted">—</span>;
  }
  let judge: ReactNode;
  if (!purchased) judge = <span className="ll-muted">대상 아님</span>;
  else if (outcome) judge = <ResultBadges view={resultView(outcome, latestNo)} />;
  else judge = <span className="ll-muted">{checking ? "확인 중" : "—"}</span>;
  return (
    <tr data-selected={selected || undefined} data-status={ticket ? ticket.purchase_status : "generated"}>
      <td className="ll-wtable__check">
        <input type="checkbox" aria-label={`${name} 선택`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
      </td>
      <th scope="row">{round}</th>
      <td>{GAME_NAME[data.game]}</td>
      <td>{data.game === "pension" ? `${data.ticket_data.group_no}조` : <span className="ll-muted">—</span>}</td>
      <td className={data.game === "pension" ? "ll-mono" : "ll-num"}>{numbersText(data)}</td>
      <td className="ll-num">{purchased ? purchased.purchase_date : <span className="ll-muted">—</span>}</td>
      <td className="ll-num" data-numeric="true">
        {purchased && purchased.amount_won !== null ? formatWon(purchased.amount_won) : <span className="ll-muted">—</span>}
      </td>
      <td>
        <StatusBadge kind={ticket ? ticket.purchase_status : "generated"} />
      </td>
      <td>{judge}</td>
      <td className="ll-num">
        {outcome?.status === "checked" ? (
          <time dateTime={outcome.source_verified_at}>{formatTime(outcome.source_verified_at)}</time>
        ) : (
          <span className="ll-muted">—</span>
        )}
      </td>
      <td>
        <ActionMenu label={`${name} 메뉴`} items={menu} />
      </td>
    </tr>
  );
}

/** 표 줄 → CSV 줄(app-core ticketsCsv 입력). 화면에 보이는 문구를 그대로 쓴다. */
export function csvRows(
  rows: readonly TicketListRow[],
  outcomes: Map<string, TicketOutcome> | null,
  latestNo: Partial<Record<"lotto" | "pension", number>>,
): TicketCsvRow[] {
  return rows.map((row) => {
    const data = rowData(row);
    const ticket = row.kind === "ticket" ? row.ticket : null;
    const outcome = ticket ? outcomes?.get(ticket.id) : undefined;
    return {
      round: ticket?.round ?? null,
      game: data.game,
      group_no: data.game === "pension" ? data.ticket_data.group_no : null,
      numbers: numbersText(data),
      purchase_date: ticket?.purchase_status === "purchased" ? ticket.purchase_date : null,
      amount_won: ticket?.purchase_status === "purchased" ? ticket.amount_won : null,
      status: STATUS_LABEL[ticket ? ticket.purchase_status : "generated"],
      result: judgeText(row, outcome, latestNo[data.game]),
      verified_at: outcome?.status === "checked" ? outcome.source_verified_at : null,
    };
  });
}

type Scope = "selected" | "filtered";

export type ExportBarProps = {
  /** 탭 이름(범위 미리보기 문구) */
  tabLabel: string;
  /** 선택한 행 중 지금 필터에 보이는 행 */
  selectedRows: TicketListRow[];
  /** 지금 필터 결과 전체("더 보기"로 아직 펼치지 않은 행 포함) */
  filteredRows: TicketListRow[];
  toCsv: (rows: TicketListRow[]) => TicketCsvRow[];
  exporter: CsvExporter;
};

/** 내보내기 막대: 범위(선택/필터 전체)·건수 미리보기·여섯 자리 보존 안내 → 저장. 실패하면 표는 그대로 두고 다시 시도. */
export function ExportBar({ tabLabel, selectedRows, filteredRows, toCsv, exporter }: ExportBarProps) {
  const notice = useNotice();
  const [scope, setScope] = useState<Scope>("filtered");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const target = scope === "selected" ? selectedRows : filteredRows;
  const count = target.length;

  async function run() {
    if (count === 0 || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await exporter.tickets(toCsv(target));
      if (result === "saved") notice.toast(`CSV로 ${count.toLocaleString("ko-KR")}건을 저장했어요`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const range =
    scope === "selected" ? `${tabLabel} 중 선택한 행 ${count.toLocaleString("ko-KR")}건` : `${tabLabel} 현재 검색·필터 결과 전체 ${count.toLocaleString("ko-KR")}건`;
  return (
    <section className="ll-tickets__export" aria-label="CSV 내보내기">
      <Segment
        legend="내보낼 범위"
        name="tickets-export-scope"
        value={scope}
        options={[
          { value: "filtered", label: `필터 전체 ${filteredRows.length.toLocaleString("ko-KR")}건` },
          { value: "selected", label: `선택 ${selectedRows.length.toLocaleString("ko-KR")}건` },
        ]}
        onChange={(s) => {
          setScope(s);
          setFailed(false);
        }}
      />
      <div className="ll-tickets__export-body">
        <p className="ll-muted" role="status">
          {count === 0 ? (scope === "selected" ? "선택한 행이 없어 내보낼 수 없습니다. 표에서 행을 선택하세요." : "내보낼 행이 없습니다.") : `내보낼 범위: ${range}`}
        </p>
        <p className="ll-muted">
          연금 여섯 자리 번호는 앞자리 0이 지워지지 않게 텍스트로 저장합니다. =·+·-·@로 시작하는 값은 앞에 '를 붙여 수식으로 실행되지 않게 합니다.
        </p>
        {failed && (
          <p className="ll-gen__error" role="alert">
            CSV를 저장하지 못했어요. 저장 위치를 확인한 뒤 다시 시도하세요.
          </p>
        )}
      </div>
      <Button variant="secondary" onClick={() => void run()} disabled={count === 0 || busy}>
        {busy ? "내보내는 중" : failed ? "다시 시도" : `CSV 내보내기 (${count.toLocaleString("ko-KR")}건)`}
      </Button>
    </section>
  );
}
