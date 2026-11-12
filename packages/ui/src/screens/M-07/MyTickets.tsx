// M-07 내 번호: 탭(즐겨찾기·구매 기록·생성 이력)으로 상태를 나눠 보여 준다. 줄마다 상태 배지(즐겨찾기·구매 기록·추천 번호)가 다르고,
// 판정 상태는 구매 기록에만 보인다(즐겨찾기·추천 번호는 대조 대상이 아님 — DF-5). 검색(번호·회차)·복권 필터·정렬·더 보기.
// 즐겨찾기 → "구매로 등록"(M-09), 구매 기록 → 즐겨찾기로 되돌리는 메뉴는 없다(R19). 제거는 스낵바 실행 취소(DESIGN 4.7),
// 생성 이력은 "즐겨찾기로 저장"만(구매로 바로 올리지 않는다). QR 등록은 P1이라 보이지 않는다.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ActionMenu, type ActionMenuItem } from "../../components/ActionMenu";
import { AlertDialog } from "../../components/AlertDialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { useNotice } from "../../components/Notice";
import { StateView } from "../../components/StateView";
import { ExportBar, TicketTable, csvRows, rowId, type TicketListRow } from "../D-05/TicketTable";
import type { CsvExporter } from "../common/csv";
import { GAME_NAME, useAsync, type Game } from "../common/data";
import { Segment } from "../common/generator";
import {
  OutcomeBanner,
  OutcomeSource,
  PURCHASE_DELETE_DIALOG,
  ResultBadges,
  SHARE_TITLE,
  StatusBadge,
  TicketNumbers,
  errorCode,
  historyData,
  removedMessage,
  resultView,
  roundText,
  ticketText,
  type HistoryRecord,
  type TicketNumbersData,
  type TicketOutcome,
  type TicketRecord,
  type TicketsCore,
} from "../common/ticket";

export type MyTicketsTab = "favorite" | "purchased" | "generated";

export type MyTicketsLinks = {
  generate: string;
  settings: string;
  /** M-09 새 구매 등록 */
  register: string;
  /** M-09 즐겨찾기 → 구매 등록 */
  registerFrom: (ticketId: string) => string;
  /** M-08 구매 기록 당첨 확인 */
  check: string;
  /** M-08 저장 번호 상세 */
  detail: (ticketId: string) => string;
};

export type MyTicketsProps = {
  core: Pick<TicketsCore, "tickets" | "generator" | "checker" | "reader" | "adapters">;
  links: MyTicketsLinks;
  /** "구매로 등록" 메뉴 선택 시 이동(셸이 해시를 바꾼다) */
  navigate: (href: string) => void;
  initialTab?: MyTicketsTab;
  /**
   * "wide" = Windows D-05: 줄을 넓은 표(선택·회차·복권·조·번호·구매일·금액·상태·판정·검증 시각)로 보이고,
   * 정렬에 구매일·금액, 구매 기록 탭에 판정 필터, CSV 내보내기를 더한다. 기본 "stack"은 줄마다 카드.
   */
  layout?: "stack" | "wide";
  /** CSV 내보내기(셸이 파일 저장을 맡는다). wide에서만 쓰고, 없으면 내보내기 막대를 숨긴다 */
  csv?: CsvExporter;
  /** false면 줄 메뉴의 "공유"를 숨긴다(Windows 공유 = 클립보드 복사라 "복사"와 중복) */
  canShare?: boolean;
};

/** 한 번에 보이는 줄 수("더 보기"로 늘린다). */
export const TICKET_PAGE = 20;

const TABS: { id: MyTicketsTab; label: string }[] = [
  { id: "favorite", label: "즐겨찾기" },
  { id: "purchased", label: "구매 기록" },
  { id: "generated", label: "생성 이력" },
];

type GameFilter = Game | "all";
/** date·amount는 wide(D-05) 구매 기록 탭에서만 — 사용자 기록 정렬이다(통계 순위 정렬 아님) */
type Sort = "created" | "round" | "date" | "amount";
/** 판정 필터(wide 구매 기록 탭): 당첨·낙첨·확인 대기(결과 대기·추첨 전·회차 미입력·확인 전·불러오지 못함) */
type JudgeFilter = "all" | "win" | "lose" | "wait";
type Loaded = { tickets: TicketRecord[]; history: HistoryRecord[] };

export function MyTickets({ core, links, navigate, initialTab = "favorite", layout = "stack", csv, canShare = true }: MyTicketsProps) {
  const [tab, setTab] = useState<MyTicketsTab>(initialTab);
  const [state, reload] = useAsync<Loaded>(async () => {
    const [tickets, history] = await Promise.all([core.tickets.list(), core.generator.history()]);
    return { tickets, history };
  });
  // 저장 번호는 탭을 오가도 유지한다(생성 이력에서 저장 → 즐겨찾기 탭에 바로 보임).
  const [tickets, setTickets] = useState<TicketRecord[] | null>(null);
  useEffect(() => {
    if (state.status === "done") setTickets(state.value.tickets);
  }, [state]);

  return (
    <div className="ll-tickets" data-layout={layout === "wide" ? "wide" : undefined}>
      <Header
        title="내 번호"
        subtitle="즐겨찾기·구매 기록·생성 이력을 나눠 보관합니다. 추천 번호는 구매 기록이 아니며, 당첨 확인은 구매 기록만 합니다."
        actions={
          <a className="ll-icon-button" href={links.settings} aria-label="설정">
            <Icon name="gear" />
          </a>
        }
      />
      <div className="ll-tickets__top">
        <a className="ll-button" data-variant="primary" href={links.register}>
          구매 등록
        </a>
        <a className="ll-button" data-variant="secondary" href={links.check}>
          당첨 확인
        </a>
      </div>
      <Tabs tab={tab} onChange={setTab} />
      <div role="tabpanel" id={`tickets-panel-${tab}`} aria-labelledby={`tickets-tab-${tab}`} className="ll-tickets__panel">
        {state.status === "loading" || (state.status === "done" && tickets === null) ? (
          <Card busy>
            <p role="status" className="ll-sr-only">
              내 번호를 불러오는 중입니다
            </p>
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
            ))}
          </Card>
        ) : state.status === "failed" ? (
          <StateView
            kind="error"
            title="내 번호를 불러오지 못했습니다"
            description="기기 저장소를 읽지 못했어요. 앱을 다시 연 뒤 다시 시도하세요."
            action={<Button onClick={() => reload()}>다시 시도</Button>}
          />
        ) : (
          <TabBody
            key={tab}
            tab={tab}
            core={core}
            links={links}
            navigate={navigate}
            history={state.value.history}
            tickets={tickets ?? []}
            updateTickets={(fn) => setTickets((list) => fn(list ?? []))}
            wide={layout === "wide"}
            csv={csv}
            canShare={canShare}
          />
        )}
      </div>
    </div>
  );
}

function Tabs({ tab, onChange }: { tab: MyTicketsTab; onChange: (tab: MyTicketsTab) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : step ? TABS[(i + step + TABS.length) % TABS.length] : undefined;
    if (!target) return;
    event.preventDefault();
    onChange(target.id);
    refs.current[target.id]?.focus();
  };
  return (
    <div className="ll-tabs" role="tablist" aria-label="내 번호 종류" onKeyDown={onKeyDown}>
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`tickets-tab-${t.id}`}
          aria-selected={t.id === tab}
          aria-controls={`tickets-panel-${t.id}`}
          tabIndex={t.id === tab ? 0 : -1}
          className="ll-tabs__tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 검색어: 숫자만 모아 회차 또는 번호로 찾는다. 로또는 입력한 번호가 모두 들어 있는 줄, 연금은 6자리에 포함된 줄. */
function matches(data: TicketNumbersData, round: number | null, query: string): boolean {
  const q = query.trim();
  if (q === "") return true;
  const tokens = q.split(/[^0-9]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length === 1 && round !== null && String(round) === tokens[0]) return true;
  if (data.game === "lotto") return tokens.every((t) => data.ticket_data.nums.includes(Number(t)));
  return tokens.every((t) => data.ticket_data.digits.includes(t));
}

type Row = TicketListRow;

function TabBody({
  tab,
  core,
  links,
  navigate,
  history,
  tickets,
  updateTickets: setTickets,
  wide,
  csv,
  canShare,
}: {
  tab: MyTicketsTab;
  core: MyTicketsProps["core"];
  links: MyTicketsLinks;
  navigate: (href: string) => void;
  history: HistoryRecord[];
  tickets: TicketRecord[];
  updateTickets: (fn: (list: TicketRecord[]) => TicketRecord[]) => void;
  wide: boolean;
  csv: CsvExporter | undefined;
  canShare: boolean;
}) {
  const notice = useNotice();
  const [game, setGame] = useState<GameFilter>("all");
  const [judge, setJudge] = useState<JudgeFilter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("created");
  const [shown, setShown] = useState(TICKET_PAGE);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const keys = useRef<Record<string, string>>({});
  const [confirming, setConfirming] = useState<TicketRecord | null>(null);
  const [checks, reloadChecks] = useAsync<Map<string, TicketOutcome> | null>(async (force) => {
    if (tab !== "purchased") return null;
    const outcomes = await core.checker.checkPurchased(undefined, { force });
    return new Map(outcomes.map((o) => [o.ticket.id, o]));
  });
  const [latest] = useAsync<Partial<Record<Game, number>>>(async () => {
    if (tab !== "purchased") return {};
    const [l, p] = await Promise.all([core.reader.latestDraw("lotto"), core.reader.latestDraw("pension")]);
    return { lotto: l.data?.draw_no, pension: p.data?.draw_no };
  });

  const checkMap = checks.status === "done" ? checks.value : null;
  const latestNo = latest.status === "done" ? latest.value : {};
  const judgeOf = (r: Row): JudgeFilter => {
    const outcome = r.kind === "ticket" ? checkMap?.get(r.ticket.id) : undefined;
    if (!outcome) return "wait";
    const tone = resultView(outcome, latestNo[outcome.ticket.game]).tone;
    return tone === "win" ? "win" : tone === "lose" ? "lose" : "wait";
  };
  const bySource = new Map(tickets.filter((t) => t.source_number_id).map((t) => [t.source_number_id!, t]));
  const all: Row[] =
    tab === "generated"
      ? history.map((h) => ({ kind: "history", history: h, savedTicket: bySource.get(h.id) }))
      : tickets.filter((t) => t.purchase_status === tab).map((t) => ({ kind: "ticket", ticket: t }));
  const filtered = all
    .filter((r) => {
      const data = r.kind === "ticket" ? r.ticket : historyData(r.history);
      const round = r.kind === "ticket" ? r.ticket.round : null;
      return (game === "all" || data.game === game) && matches(data, round, query) && (judge === "all" || judgeOf(r) === judge);
    })
    .sort((a, b) => {
      const ca = a.kind === "ticket" ? a.ticket.created_at : a.history.created_at;
      const cb = b.kind === "ticket" ? b.ticket.created_at : b.history.created_at;
      if (sort === "round") {
        const ra = a.kind === "ticket" ? (a.ticket.round ?? 0) : 0;
        const rb = b.kind === "ticket" ? (b.ticket.round ?? 0) : 0;
        if (ra !== rb) return rb - ra;
      }
      if (sort === "date") {
        const da = a.kind === "ticket" ? (a.ticket.purchase_date ?? "") : "";
        const db = b.kind === "ticket" ? (b.ticket.purchase_date ?? "") : "";
        if (da !== db) return db.localeCompare(da);
      }
      if (sort === "amount") {
        const wa = a.kind === "ticket" ? (a.ticket.amount_won ?? -1) : -1;
        const wb = b.kind === "ticket" ? (b.ticket.amount_won ?? -1) : -1;
        if (wa !== wb) return wb - wa;
      }
      return cb.localeCompare(ca);
    });
  const rows = filtered.slice(0, shown);

  const mark = (id: string, on: boolean) =>
    setBusy((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  function copy(text: string) {
    core.adapters.clipboard.writeText(text).then(
      () => notice.toast("복사했어요"),
      () => notice.toast("복사하지 못했어요. 다시 시도하세요."),
    );
  }

  function share(text: string, kind: TicketRecord["purchase_status"] | "generated") {
    const note = kind === "purchased" ? "(구매 기록)" : kind === "favorite" ? "(즐겨찾기 · 구매 아님)" : "(추천 번호 · 당첨과 무관)";
    core.adapters.share.share({ title: SHARE_TITLE, text: `${text}\n${note}` }).catch(() => {});
  }

  async function remove(ticket: TicketRecord) {
    mark(ticket.id, true);
    try {
      await core.tickets.remove(ticket.id);
    } catch {
      mark(ticket.id, false);
      notice.snackbar({ message: "제거하지 못했어요. 다시 시도하세요.", tone: "error", action: { label: "다시 시도", onAction: () => void remove(ticket) } });
      return;
    }
    mark(ticket.id, false);
    setTickets((list) => list.filter((t) => t.id !== ticket.id));
    notice.snackbar({ message: removedMessage(ticket), action: { label: "실행 취소", onAction: () => void restore(ticket) } });
  }

  /** 구매 기록은 AlertDialog로 먼저 확인, 즐겨찾기는 바로 제거(스낵바 실행 취소). */
  function requestRemove(ticket: TicketRecord) {
    if (ticket.purchase_status === "purchased") setConfirming(ticket);
    else void remove(ticket);
  }

  async function restore(ticket: TicketRecord) {
    try {
      const back = await core.tickets.restore(ticket);
      setTickets((list) => (list.some((t) => t.id === back.id) ? list : [...list, back]));
      notice.toast("되돌렸어요");
    } catch {
      notice.toast("되돌리지 못했어요. 같은 번호를 다시 저장하거나 등록하세요.");
    }
  }

  async function undoSave(ticket: TicketRecord) {
    try {
      await core.tickets.remove(ticket.id);
      setTickets((list) => list.filter((t) => t.id !== ticket.id));
      notice.toast("저장을 취소했어요");
    } catch {
      notice.toast("실행 취소하지 못했어요. 즐겨찾기 탭에서 제거할 수 있어요.");
    }
  }

  async function saveFavorite(h: HistoryRecord) {
    keys.current[h.id] ??= core.tickets.newIdempotencyKey();
    mark(h.id, true);
    try {
      const ticket = await core.tickets.saveFromGenerated(h.id, { purchase_status: "favorite", round: null, idempotency_key: keys.current[h.id]! });
      setTickets((list) => (list.some((t) => t.id === ticket.id) ? list : [...list, ticket]));
      notice.snackbar({ message: "즐겨찾기로 저장했어요", action: { label: "실행 취소", onAction: () => void undoSave(ticket) } });
    } catch (error) {
      const code = errorCode(error);
      notice.snackbar({
        message:
          code === "LIMIT_EXCEEDED"
            ? "저장 번호가 가득 찼어요(최대 1,000개). 정리한 뒤 다시 저장하세요."
            : code === "NOT_FOUND"
              ? "생성 이력이 기기에 남지 않아 저장할 수 없어요."
              : "저장하지 못했어요. 다시 시도하세요.",
        tone: "error",
      });
    } finally {
      mark(h.id, false);
    }
  }

  const tabLabel = TABS.find((t) => t.id === tab)!.label;
  const ticketMenu = (ticket: TicketRecord) =>
    ticketMenuItems(ticket, busy.has(ticket.id), canShare, {
      register: () => navigate(links.registerFrom(ticket.id)),
      copy: () => copy(ticketText(ticket)),
      share: () => share(ticketText(ticket), ticket.purchase_status),
      remove: () => requestRemove(ticket),
    });
  const historyMenu = (h: HistoryRecord, saved: TicketRecord | undefined): ActionMenuItem[] => [
    { id: "save", label: saved ? "저장됨" : "즐겨찾기로 저장", disabled: Boolean(saved) || busy.has(h.id), onSelect: () => void saveFavorite(h) },
    { id: "copy", label: "복사", onSelect: () => copy(ticketText(historyData(h))) },
  ];
  // 내보내기 "선택" 범위 = 선택한 행 중 지금 필터에 보이는 행(제거된 줄·필터 밖 줄은 빠진다).
  const selectedRows = filtered.filter((r) => selected.has(rowId(r)));
  const select = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <>
      <Card className="ll-tickets__controls">
        <form className="ll-draws__search" role="search" aria-label="번호·회차 찾기" onSubmit={(e) => e.preventDefault()}>
          <label className="ll-field__legend" htmlFor="tickets-search">
            번호·회차로 찾기
          </label>
          <input
            id="tickets-search"
            className="ll-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="예: 7 12 또는 1132"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(TICKET_PAGE);
            }}
          />
        </form>
        <div className="ll-tickets__filters">
          <Segment
            legend="복권"
            name={`tickets-game-${tab}`}
            value={game}
            options={[
              { value: "all", label: "전체" },
              { value: "lotto", label: "로또" },
              { value: "pension", label: "연금" },
            ]}
            onChange={(v) => {
              setGame(v);
              setShown(TICKET_PAGE);
            }}
          />
          {tab !== "generated" && (
            <Segment
              legend="정렬"
              name={`tickets-sort-${tab}`}
              value={sort}
              options={[
                { value: "created", label: "등록일순" },
                { value: "round", label: "회차순" },
                ...(wide && tab === "purchased"
                  ? [
                      { value: "date" as const, label: "구매일순" },
                      { value: "amount" as const, label: "금액순" },
                    ]
                  : []),
              ]}
              onChange={setSort}
            />
          )}
          {wide && tab === "purchased" && (
            <Segment
              legend="판정"
              name="tickets-judge"
              value={judge}
              options={[
                { value: "all", label: "전체" },
                { value: "win", label: "당첨" },
                { value: "lose", label: "낙첨" },
                { value: "wait", label: "확인 대기" },
              ]}
              onChange={(v) => {
                setJudge(v);
                setShown(TICKET_PAGE);
              }}
            />
          )}
        </div>
        {wide && csv && filtered.length > 0 && (
          <ExportBar
            tabLabel={tabLabel}
            selectedRows={selectedRows}
            filteredRows={filtered}
            toCsv={(target) => csvRows(target, checkMap, latestNo)}
            exporter={csv}
          />
        )}
      </Card>
      {tab === "purchased" && checks.status === "failed" && (
        <p className="ll-gen__error" role="alert">
          당첨 확인 결과를 불러오지 못했어요. 당첨 확인 화면에서 다시 시도하세요.
        </p>
      )}
      {checkMap && (
        <OutcomeBanner
          outcomes={[...checkMap.values()]}
          action={
            <Button variant="secondary" onClick={() => reloadChecks(true)}>
              다시 확인
            </Button>
          }
        />
      )}
      {all.length === 0 ? (
        <EmptyTab tab={tab} links={links} />
      ) : filtered.length === 0 ? (
        <StateView
          kind="empty"
          title="조건에 맞는 번호가 없습니다"
          description="검색어나 복권 선택을 바꿔 보세요."
          action={
            wide ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setGame("all");
                  setJudge("all");
                }}
              >
                필터 초기화
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section aria-label={`${tabLabel} 목록`}>
          <p className="ll-muted">
            {filtered.length.toLocaleString("ko-KR")}개 중 {rows.length.toLocaleString("ko-KR")}개 표시
          </p>
          {wide ? (
            <TicketTable
              caption={`${tabLabel} 표`}
              rows={rows}
              outcomes={checkMap}
              checking={tab === "purchased" && checks.status === "loading"}
              latestNo={latestNo}
              selected={selected}
              onSelect={select}
              detail={links.detail}
              menu={(row) => (row.kind === "ticket" ? ticketMenu(row.ticket) : historyMenu(row.history, row.savedTicket))}
            />
          ) : (
          <ul className="ll-tickets__items">
            {rows.map((row) =>
              row.kind === "ticket" ? (
                <TicketRow
                  key={row.ticket.id}
                  ticket={row.ticket}
                  outcome={checkMap?.get(row.ticket.id)}
                  checking={tab === "purchased" && checks.status === "loading"}
                  latestNo={latestNo[row.ticket.game]}
                  busy={busy.has(row.ticket.id)}
                  links={links}
                  items={ticketMenu(row.ticket)}
                />
              ) : (
                <HistoryRow
                  key={row.history.id}
                  history={row.history}
                  savedTicket={row.savedTicket}
                  links={links}
                  items={historyMenu(row.history, row.savedTicket)}
                />
              ),
            )}
          </ul>
          )}
          {filtered.length > rows.length && (
            <div className="ll-draws__more">
              <Button variant="secondary" block onClick={() => setShown((n) => n + TICKET_PAGE)}>
                더 보기
              </Button>
            </div>
          )}
        </section>
      )}
      <AlertDialog
        open={confirming !== null}
        title={PURCHASE_DELETE_DIALOG.title}
        description={PURCHASE_DELETE_DIALOG.description}
        confirmLabel={PURCHASE_DELETE_DIALOG.confirmLabel}
        onConfirm={() => {
          const target = confirming;
          setConfirming(null);
          if (target) void remove(target);
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

function EmptyTab({ tab, links }: { tab: MyTicketsTab; links: MyTicketsLinks }) {
  if (tab === "purchased") {
    return (
      <StateView
        kind="empty"
        title="구매 기록이 없습니다"
        description="실제로 구매한 번호를 등록하면 회차 결과와 대조해 볼 수 있어요."
        action={
          <a className="ll-button" data-variant="primary" href={links.register}>
            구매 등록
          </a>
        }
      />
    );
  }
  return (
    <StateView
      kind="empty"
      title={tab === "favorite" ? "즐겨찾기한 번호가 없습니다" : "생성 이력이 없습니다"}
      description={tab === "favorite" ? "추천 번호를 즐겨찾기로 저장하면 여기에 모입니다." : "번호를 생성하면 최근 200개까지 여기에 남습니다."}
      action={
        <a className="ll-button" data-variant="secondary" href={links.generate}>
          번호 생성하기
        </a>
      }
    />
  );
}

function TicketRow({
  ticket,
  outcome,
  checking,
  latestNo,
  busy,
  links,
  items,
}: {
  ticket: TicketRecord;
  outcome: TicketOutcome | undefined;
  checking: boolean;
  latestNo: number | undefined;
  busy: boolean;
  links: MyTicketsLinks;
  items: ActionMenuItem[];
}) {
  const name = `${GAME_NAME[ticket.game]} ${ticketText(ticket)}`;
  return (
    <li className="ll-tickets__item" data-status={ticket.purchase_status} aria-busy={busy || undefined}>
      <div className="ll-tickets__head">
        <span className="ll-chip" data-game={ticket.game === "pension" ? "pension" : undefined}>
          {GAME_NAME[ticket.game]}
        </span>
        <a className="ll-link ll-tickets__title" href={links.detail(ticket.id)}>
          <span className="ll-num">{roundText(ticket.round)}</span>
          <span className="ll-sr-only"> {ticketText(ticket)} 상세 보기</span>
        </a>
        <StatusBadge kind={ticket.purchase_status} />
      </div>
      <TicketNumbers data={ticket} />
      <div className="ll-tickets__foot">
        {ticket.purchase_status === "purchased" ? (
          <span className="ll-tickets__judge">
            <span className="ll-muted">당첨 확인</span>
            {outcome ? (
              <ResultBadges view={resultView(outcome, latestNo)} />
            ) : (
              <span className="ll-muted">{checking ? "확인 중" : "—"}</span>
            )}
          </span>
        ) : (
          <span className="ll-muted">구매 전 번호 · 당첨 확인 대상 아님</span>
        )}
        <ActionMenu label={`${name} 메뉴`} items={items} />
      </div>
      <OutcomeSource outcome={outcome} />
    </li>
  );
}

function HistoryRow({
  history,
  savedTicket,
  links,
  items,
}: {
  history: HistoryRecord;
  savedTicket: TicketRecord | undefined;
  links: MyTicketsLinks;
  items: ActionMenuItem[];
}) {
  const data = historyData(history);
  const name = `${GAME_NAME[history.game]} ${ticketText(data)}`;
  return (
    <li className="ll-tickets__item" data-status="generated">
      <div className="ll-tickets__head">
        <span className="ll-chip" data-game={history.game === "pension" ? "pension" : undefined}>
          {GAME_NAME[history.game]}
        </span>
        <span className="ll-muted">
          생성 <time dateTime={history.created_at}>{formatDay(history.created_at)}</time>
        </span>
        <StatusBadge kind="generated" />
      </div>
      <TicketNumbers data={data} />
      <div className="ll-tickets__foot">
        {savedTicket ? (
          <a className="ll-link" href={links.detail(savedTicket.id)}>
            저장됨 · {savedTicket.purchase_status === "purchased" ? "구매 기록" : "즐겨찾기"}에서 보기
          </a>
        ) : (
          <span className="ll-muted">추천 번호 · 구매 기록 아님</span>
        )}
        <ActionMenu label={`${name} 메뉴`} items={items} />
      </div>
    </li>
  );
}

/** 저장 번호 줄 메뉴. 구매 기록 → 즐겨찾기로 되돌리는 항목은 두지 않는다(R19). */
function ticketMenuItems(
  ticket: TicketRecord,
  busy: boolean,
  canShare: boolean,
  on: { register: () => void; copy: () => void; share: () => void; remove: () => void },
): ActionMenuItem[] {
  return [
    ...(ticket.purchase_status === "favorite" ? [{ id: "register", label: "구매로 등록", onSelect: on.register }] : []),
    { id: "copy", label: "복사", onSelect: on.copy },
    ...(canShare ? [{ id: "share", label: "공유", onSelect: on.share }] : []),
    { id: "remove", label: ticket.purchase_status === "purchased" ? "삭제" : "제거", tone: "danger" as const, disabled: busy, onSelect: on.remove },
  ];
}

const dayFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

function formatDay(iso: string): string {
  return dayFormatter.format(new Date(iso));
}
