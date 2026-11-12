// M-08 내 번호 상세: 복권·조·번호·등록 출처·구매일·금액(정수 원), 구매 상태 배지, 대조 결과(구매 기록만), 기록 시각.
// 즐겨찾기는 대조하지 않고 "구매로 등록"(M-09)을 안내한다. 구매 기록 → 즐겨찾기 되돌리기는 없다(R19).
// 제거는 스낵바 실행 취소(목록으로 이동). 회차가 있으면 공식 회차 상세(M-11) 링크.
import { useState } from "react";
import { AlertDialog } from "../../components/AlertDialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { useNotice } from "../../components/Notice";
import { StateView } from "../../components/StateView";
import { GAME_NAME, formatTime, formatWon, useAsync, type Game } from "../common/data";
import {
  OutcomeBanner,
  OutcomeSource,
  PURCHASE_DELETE_DIALOG,
  ResultBadges,
  SHARE_TITLE,
  StatusBadge,
  TicketNumbers,
  removedMessage,
  resultView,
  roundText,
  ticketText,
  type TicketOutcome,
  type TicketRecord,
  type TicketsCore,
} from "../common/ticket";
import { RECHECK_NOTE, RoundForm, loadLatest } from "./TicketCheck";

export type TicketDetailLinks = {
  tickets: string;
  registerFrom: (ticketId: string) => string;
  drawDetail: (game: Game, round: number) => string;
};

export type TicketDetailProps = {
  core: Pick<TicketsCore, "tickets" | "checker" | "reader" | "adapters">;
  ticketId: string;
  links: TicketDetailLinks;
  /** 제거 후 목록으로 이동(셸이 해시를 바꾼다) */
  navigate: (href: string) => void;
};

type Loaded = { ticket: TicketRecord | null; outcome: TicketOutcome | null; latest: Partial<Record<Game, number>> };

export function TicketDetail({ core, ticketId, links, navigate }: TicketDetailProps) {
  const notice = useNotice();
  const [confirming, setConfirming] = useState(false);
  const [state, reload] = useAsync<Loaded>(async (force) => {
    const ticket = await core.tickets.get(ticketId);
    if (!ticket || ticket.purchase_status !== "purchased") return { ticket, outcome: null, latest: {} };
    const [outcome, latest] = await Promise.all([core.checker.checkTicket(ticketId, { force }), loadLatest(core, force)]);
    return { ticket, outcome, latest };
  });
  const breadcrumb = (
    <nav className="ll-breadcrumb" aria-label="현재 위치">
      <ol>
        <li>
          <a href={links.tickets}>내 번호</a>
        </li>
        <li aria-current="page">상세</li>
      </ol>
    </nav>
  );

  if (state.status === "loading") {
    return (
      <div className="ll-tickets">
        {breadcrumb}
        <Header title="내 번호 상세" />
        <Card busy>
          <p role="status" className="ll-sr-only">
            번호를 불러오는 중입니다
          </p>
          <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
        </Card>
      </div>
    );
  }
  if (state.status === "failed" || state.value.ticket === null) {
    const missing = state.status === "done";
    return (
      <div className="ll-tickets">
        {breadcrumb}
        <Header title="내 번호 상세" />
        <StateView
          kind={missing ? "empty" : "error"}
          title={missing ? "번호를 찾을 수 없습니다" : "번호를 불러오지 못했습니다"}
          description={missing ? "제거됐거나 이 기기에 없는 번호입니다." : "네트워크나 기기 저장소를 확인한 뒤 다시 시도하세요."}
          action={
            missing ? (
              <a className="ll-button" data-variant="secondary" href={links.tickets}>
                내 번호로
              </a>
            ) : (
              <Button onClick={() => reload(true)}>다시 시도</Button>
            )
          }
        />
      </div>
    );
  }

  const { ticket, outcome, latest } = state.value;
  const text = ticketText(ticket);

  function copy() {
    core.adapters.clipboard.writeText(text).then(
      () => notice.toast("복사했어요"),
      () => notice.toast("복사하지 못했어요. 다시 시도하세요."),
    );
  }

  function share() {
    const note = ticket.purchase_status === "purchased" ? "(구매 기록)" : "(즐겨찾기 · 구매 아님)";
    core.adapters.share.share({ title: SHARE_TITLE, text: `${text}\n${note}` }).catch(() => {});
  }

  async function remove(target: TicketRecord) {
    try {
      await core.tickets.remove(target.id);
    } catch {
      notice.snackbar({ message: "제거하지 못했어요. 다시 시도하세요.", tone: "error" });
      return;
    }
    notice.snackbar({
      message: removedMessage(target),
      action: {
        label: "실행 취소",
        onAction: () =>
          void core.tickets.restore(target).then(
            () => notice.toast("되돌렸어요"),
            () => notice.toast("되돌리지 못했어요. 같은 번호를 다시 등록하세요."),
          ),
      },
    });
    navigate(links.tickets);
  }

  return (
    <div className="ll-tickets" data-game={ticket.game}>
      {breadcrumb}
      <Header
        title={`${GAME_NAME[ticket.game]} ${roundText(ticket.round)}`}
        subtitle={ticket.purchase_status === "purchased" ? "실제로 구매했다고 등록한 번호입니다." : "즐겨찾기로 저장한 번호입니다(구매 기록 아님)."}
        actions={<StatusBadge kind={ticket.purchase_status} />}
      />
      <Card title="번호">
        <TicketNumbers data={ticket} />
        <dl className="ll-tickets__info">
          <div>
            <dt>복권</dt>
            <dd>{GAME_NAME[ticket.game]}</dd>
          </div>
          {ticket.game === "pension" && (
            <div>
              <dt>조</dt>
              <dd>{ticket.ticket_data.group_no}조</dd>
            </div>
          )}
          <div>
            <dt>번호</dt>
            <dd className={ticket.game === "pension" ? "ll-mono" : "ll-num"}>{ticket.game === "pension" ? ticket.ticket_data.digits : text}</dd>
          </div>
          <div>
            <dt>등록 출처</dt>
            <dd>{ticket.source_number_id ? "추천 번호에서 저장" : "직접 입력"}</dd>
          </div>
          <div>
            <dt>회차</dt>
            <dd>{roundText(ticket.round)}</dd>
          </div>
          {ticket.purchase_status === "purchased" && (
            <>
              <div>
                <dt>구매일</dt>
                <dd className="ll-num">{ticket.purchase_date}</dd>
              </div>
              <div>
                <dt>입력 금액</dt>
                <dd className="ll-num">{ticket.amount_won === null ? "입력 안 함" : formatWon(ticket.amount_won)}</dd>
              </div>
            </>
          )}
        </dl>
        <div className="ll-gen__actions">
          <Button variant="secondary" onClick={copy}>
            복사
          </Button>
          <Button variant="secondary" onClick={share}>
            공유
          </Button>
          <Button variant="danger" onClick={() => (ticket.purchase_status === "purchased" ? setConfirming(true) : void remove(ticket))}>
            {ticket.purchase_status === "purchased" ? "삭제" : "제거"}
          </Button>
        </div>
      </Card>
      <Card title="당첨 확인">
        {ticket.purchase_status === "favorite" ? (
          <>
            <p className="ll-muted">구매하지 않은 번호는 당첨 확인 대상이 아닙니다. 실제로 구매했다면 구매로 등록하세요.</p>
            <a className="ll-button" data-variant="primary" href={links.registerFrom(ticket.id)}>
              구매로 등록
            </a>
          </>
        ) : outcome === null ? (
          <p className="ll-muted">확인 결과가 없습니다.</p>
        ) : (
          <OutcomeBody core={core} outcome={outcome} latestNo={latest[ticket.game]} onChanged={() => reload()} retry={() => reload(true)} />
        )}
      </Card>
      <Card title="기록">
        <ul className="ll-tickets__activity">
          <li>
            저장 <time dateTime={ticket.created_at}>{formatTime(ticket.created_at)}</time>
          </li>
          {ticket.updated_at !== ticket.created_at && (
            <li>
              최근 변경(구매 등록·회차 입력) <time dateTime={ticket.updated_at}>{formatTime(ticket.updated_at)}</time>
            </li>
          )}
          {outcome?.status === "checked" && outcome.fetched_at && (
            <li>
              결과 조회 <time dateTime={outcome.fetched_at}>{formatTime(outcome.fetched_at)}</time>
            </li>
          )}
        </ul>
      </Card>
      <AlertDialog
        open={confirming}
        title={PURCHASE_DELETE_DIALOG.title}
        description={PURCHASE_DELETE_DIALOG.description}
        confirmLabel={PURCHASE_DELETE_DIALOG.confirmLabel}
        onConfirm={() => {
          setConfirming(false);
          void remove(ticket);
        }}
        onCancel={() => setConfirming(false)}
      />
      {ticket.round !== null && (
        <a className="ll-button" data-variant="secondary" data-block="true" href={links.drawDetail(ticket.game, ticket.round)}>
          공식 회차 상세 보기
        </a>
      )}
    </div>
  );
}

function OutcomeBody({
  core,
  outcome,
  latestNo,
  onChanged,
  retry,
}: {
  core: TicketDetailProps["core"];
  outcome: TicketOutcome;
  latestNo: number | undefined;
  onChanged: () => void;
  retry: () => void;
}) {
  const view = resultView(outcome, latestNo);
  return (
    <div className="ll-tickets__outcome">
      {outcome.status === "checked" && (
        <OutcomeBanner
          outcomes={[outcome]}
          action={
            <Button variant="secondary" onClick={retry}>
              다시 확인
            </Button>
          }
        />
      )}
      <p className="ll-tickets__judge">
        <ResultBadges view={view} />
      </p>
      {outcome.status === "no_round" && <RoundForm core={core} ticketId={outcome.ticket.id} game={outcome.ticket.game} onSaved={onChanged} />}
      {outcome.status === "pending" && (
        <>
          <p className="ll-muted">
            {view.tone === "error"
              ? "회차 결과를 불러오지 못했어요. 연결을 확인한 뒤 다시 확인하세요."
              : "이 회차 결과가 아직 없습니다. 추첨 후 결과가 갱신되면 확인할 수 있어요."}
          </p>
          <Button variant="secondary" onClick={retry}>
            다시 확인
          </Button>
        </>
      )}
      {outcome.status === "checked" && (
        <div className="ll-draw__source">
          <OutcomeSource outcome={outcome} />
          <button type="button" className="ll-link" onClick={() => void core.adapters.openExternal.open(outcome.source_url)}>
            공식 결과 보기
          </button>
        </div>
      )}
      <p className="ll-muted">{RECHECK_NOTE}</p>
    </div>
  );
}
