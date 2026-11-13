// M-08 당첨 확인: 구매 기록(purchased)만 공개 회차 결과와 기기에서 대조한다(DF-5) — 즐겨찾기·추천 번호는 대상이 아니다.
// 회차별로 묶어 등위·낙첨·추첨 전·결과 대기를 보이고, 연금 보너스는 등위와 따로 표기한다. 회차 미입력은 "회차를 입력하세요"와 입력 칸.
// 회차마다 출처·검증 시각·동기화 시각, 마지막 정상본이면 stale 배너. 결과는 저장하지 않고 볼 때마다 계산한다(결정 ⑨).
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { useNotice } from "../../components/Notice";
import { StateView } from "../../components/StateView";
import { GAME_NAME, useAsync, type Game } from "../common/data";
import {
  OutcomeBanner,
  OutcomeSource,
  ResultBadges,
  TicketNumbers,
  resultView,
  roundText,
  ticketText,
  type TicketOutcome,
  type TicketsCore,
} from "../common/ticket";

export type TicketCheckLinks = {
  tickets: string;
  register: string;
  detail: (ticketId: string) => string;
};

export type TicketCheckProps = {
  core: Pick<TicketsCore, "tickets" | "checker" | "reader" | "adapters">;
  links: TicketCheckLinks;
};

type Loaded = { outcomes: TicketOutcome[]; latest: Partial<Record<Game, number>> };

/** 공식 결과 재확인 안내(과대 표현 없이). */
export const RECHECK_NOTE = "기기에서 공개된 회차 결과와 대조한 참고 결과입니다. 실제 당첨 여부와 지급 기준은 공식 결과로 다시 확인하세요.";

export async function loadLatest(core: Pick<TicketsCore, "reader">, force: boolean): Promise<Partial<Record<Game, number>>> {
  const [l, p] = await Promise.all([core.reader.latestDraw("lotto", { force }), core.reader.latestDraw("pension", { force })]);
  return { lotto: l.data?.draw_no, pension: p.data?.draw_no };
}

export function TicketCheck({ core, links }: TicketCheckProps) {
  const [state, reload] = useAsync<Loaded>(async (force) => {
    const [outcomes, latest] = await Promise.all([core.checker.checkPurchased(undefined, { force }), loadLatest(core, force)]);
    return { outcomes, latest };
  });
  const retry = (
    <Button variant="secondary" onClick={() => reload(true)}>
      다시 확인
    </Button>
  );

  return (
    <div className="ll-tickets">
      <nav className="ll-breadcrumb" aria-label="현재 위치">
        <ol>
          <li>
            <a href={links.tickets}>내 번호</a>
          </li>
          <li aria-current="page">당첨 확인</li>
        </ol>
      </nav>
      <Header title="당첨 확인" subtitle="구매 기록만 확인합니다. 즐겨찾기·추천 번호는 구매하지 않은 번호라 대조하지 않습니다." />
      <p className="ll-stats__notice">
        <strong>공식 결과로 다시 확인</strong> · {RECHECK_NOTE}
      </p>
      {state.status === "loading" ? (
        <Card busy>
          <p role="status" className="ll-sr-only">
            당첨 결과를 확인하는 중입니다
          </p>
          <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
          <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
        </Card>
      ) : state.status === "failed" ? (
        <StateView kind="error" title="당첨 결과를 확인하지 못했습니다" description="기기 저장소나 네트워크 연결을 확인한 뒤 다시 시도하세요." action={retry} />
      ) : state.value.outcomes.length === 0 ? (
        <StateView
          kind="empty"
          title="확인할 구매 기록이 없습니다"
          description="실제로 구매한 번호를 등록하면 회차 결과와 대조해 볼 수 있어요."
          action={
            <a className="ll-button" data-variant="primary" href={links.register}>
              구매 등록
            </a>
          }
        />
      ) : (
        <Groups core={core} links={links} loaded={state.value} retry={retry} onChanged={() => reload()} />
      )}
    </div>
  );
}

type Group = { key: string; game: Game; round: number | null; outcomes: TicketOutcome[] };

function groupOf(outcomes: TicketOutcome[]): Group[] {
  const map = new Map<string, Group>();
  for (const o of outcomes) {
    const key = `${o.ticket.game}:${o.ticket.round ?? "none"}`;
    const g = map.get(key) ?? { key, game: o.ticket.game, round: o.ticket.round, outcomes: [] };
    g.outcomes.push(o);
    map.set(key, g);
  }
  // 회차 미입력 먼저(할 일), 그다음 복권별 최신 회차 순.
  return [...map.values()].sort((a, b) => {
    if ((a.round === null) !== (b.round === null)) return a.round === null ? -1 : 1;
    if (a.game !== b.game) return a.game === "lotto" ? -1 : 1;
    return (b.round ?? 0) - (a.round ?? 0);
  });
}

function Groups({
  core,
  links,
  loaded,
  retry,
  onChanged,
}: {
  core: TicketCheckProps["core"];
  links: TicketCheckLinks;
  loaded: Loaded;
  retry: ReactNode;
  onChanged: () => void;
}) {
  const pendingError = loaded.outcomes.some((o) => o.status === "pending" && o.error && o.error !== "EMPTY");
  return (
    <div className="ll-draws__list">
      <OutcomeBanner outcomes={loaded.outcomes} action={retry} />
      {pendingError && (
        <div className="ll-banner" role="alert">
          <div className="ll-banner__text">
            <p>일부 회차 결과를 불러오지 못했어요. 연결을 확인한 뒤 다시 확인하세요.</p>
          </div>
          {retry}
        </div>
      )}
      {groupOf(loaded.outcomes).map((group) => (
        <GroupCard key={group.key} core={core} links={links} group={group} latestNo={loaded.latest[group.game]} onChanged={onChanged} />
      ))}
    </div>
  );
}

function GroupCard({
  core,
  links,
  group,
  latestNo,
  onChanged,
}: {
  core: TicketCheckProps["core"];
  links: TicketCheckLinks;
  group: Group;
  latestNo: number | undefined;
  onChanged: () => void;
}) {
  const first = group.outcomes[0]!;
  const title = `${GAME_NAME[group.game]} ${group.round === null ? "· 회차 미입력" : roundText(group.round)}`;
  return (
    <Card title={title} className="ll-tickets__group">
      {first.status === "checked" && (
        <div className="ll-draw__source">
          <OutcomeSource outcome={first} />
          <button type="button" className="ll-link" onClick={() => void core.adapters.openExternal.open(first.source_url)}>
            공식 결과 보기
          </button>
        </div>
      )}
      <ul className="ll-tickets__items">
        {group.outcomes.map((o) => (
          <li key={o.ticket.id} className="ll-tickets__item" data-status="purchased">
            <div className="ll-tickets__head">
              <a className="ll-link ll-tickets__title" href={links.detail(o.ticket.id)}>
                <span className="ll-num">구매일 {o.ticket.purchase_date}</span>
                <span className="ll-sr-only"> {ticketText(o.ticket)} 상세 보기</span>
              </a>
              <ResultBadges view={resultView(o, latestNo)} />
            </div>
            <TicketNumbers data={o.ticket} />
            {o.status === "no_round" && <RoundForm core={core} ticketId={o.ticket.id} game={o.ticket.game} onSaved={onChanged} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 회차 미입력 구매 기록에 회차를 넣는다(1 이상 정수). 저장되면 onSaved로 다시 대조한다. */
export function RoundForm({
  core,
  ticketId,
  game,
  onSaved,
}: {
  core: Pick<TicketsCore, "tickets">;
  ticketId: string;
  game: Game;
  onSaved: () => void;
}) {
  const notice = useNotice();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = `round-${ticketId}`;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const round = /^[0-9]{1,7}$/.test(value.trim()) ? Number(value.trim()) : 0;
    if (round < 1) {
      setError("1 이상의 회차 번호(숫자)를 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      await core.tickets.setRound(ticketId, round);
      notice.toast("회차를 저장했어요");
      onSaved();
    } catch {
      setError("회차를 저장하지 못했어요. 다시 시도하세요.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="ll-draws__search" onSubmit={(e) => void submit(e)} aria-label={`${GAME_NAME[game]} 회차 입력`}>
      <label className="ll-field__legend" htmlFor={inputId}>
        구매한 회차를 입력하세요
      </label>
      <div className="ll-draws__search-row">
        <input
          id={inputId}
          className="ll-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="예: 1133"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" variant={game === "pension" ? "pension" : "primary"} disabled={saving}>
          회차 저장
        </Button>
      </div>
      {error && (
        <p id={`${inputId}-error`} className="ll-gen__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
