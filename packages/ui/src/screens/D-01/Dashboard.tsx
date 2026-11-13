// D-01 Windows 대시보드(ADR-0004·design/reference/d-home.html): M-01 홈 블록을 그대로 쓰고 배치만 넓힌다.
// 히어로 한 줄 전체 → 좌[최신 회차 + 상품 카드 2개 + 지난 회차 결과] | 우[이번 주 통계 요약 + 번호 생성 CTA + 내 기록].
// 지난 회차 결과는 공식 결과와 내 구매 기록(구매 등록한 번호만) 수를 회차별로 보인다. 추천 번호는 구매 기록이 아니다.
import { Ball } from "../../components/Ball";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StateView } from "../../components/StateView";
import { Updated } from "../../components/Updated";
import { Home, type HomeLinks } from "../M-01/Home";
import { formatDrawDate, readView, sourceHost, useAsync, type LottoDraw, type ReadResult, type ReadView, type ScreenCore, type Ticket } from "../common/data";

/** draws = 회차 목록(없으면 링크 숨김 — 셸에 회차 화면이 아직 없을 때) */
export type DashboardLinks = HomeLinks & { draws?: string };

export type DashboardProps = {
  core: ScreenCore;
  links: DashboardLinks;
};

/** 지난 회차 결과에 보이는 회차 수(d-home 시안 3줄). */
export const RECENT_DRAWS = 3;

export function Dashboard({ core, links }: DashboardProps) {
  return <Home core={core} links={links} title="대시보드" leftExtra={<RecentDraws core={core} drawsHref={links.draws} />} />;
}

type Recent = { draws: ReadResult<LottoDraw[]>; tickets: Ticket[] | null };

function RecentDraws({ core, drawsHref }: { core: ScreenCore; drawsHref: string | undefined }) {
  const [state, reload] = useAsync<Recent>(async (force) => {
    const [draws, tickets] = await Promise.all([
      core.reader.listDraws("lotto", { limit: RECENT_DRAWS, force }),
      // 내 기록을 못 읽어도 공식 결과는 보인다.
      core.tickets.list().catch(() => null),
    ]);
    return { draws, tickets };
  });
  const view: ReadView<LottoDraw[]> | null =
    state.status === "failed" ? null : readView<LottoDraw[]>(state.status === "done" ? state.value.draws : undefined);
  const tickets = state.status === "done" ? state.value.tickets : null;
  const retry = <Button onClick={() => reload(true)}>다시 시도</Button>;

  return (
    <Card
      title="지난 회차 결과"
      className="ll-recent"
      busy={view?.kind === "loading"}
      action={
        drawsHref && (
          <a className="ll-link" href={drawsHref}>
            회차 목록
          </a>
        )
      }
    >
      {view?.kind === "loading" && (
        <>
          <p role="status" className="ll-sr-only">
            지난 회차 결과를 불러오는 중입니다
          </p>
          <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
          <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
        </>
      )}
      {(view === null || view.kind === "error") && (
        <StateView kind="error" title="지난 회차 결과를 불러오지 못했습니다" description="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={retry} />
      )}
      {view?.kind === "empty" && <p className="ll-muted">로또 회차 정보가 아직 수집되지 않았습니다(미갱신).</p>}
      {view?.kind === "success" && view.data.length === 0 && <p className="ll-muted">로또 회차 정보가 아직 수집되지 않았습니다(미갱신).</p>}
      {view?.kind === "success" && view.data.length > 0 && (
        <>
          <ol className="ll-recent__items">
            {view.data.map((draw) => (
              <RecentRow key={draw.draw_no} draw={draw} tickets={tickets} />
            ))}
          </ol>
          <Updated source={`${sourceHost(view.data[0]!.source_url)} 공개 결과`} verifiedAt={view.data[0]!.source_verified_at} />
          {tickets === null && (
            <p className="ll-muted" role="status">
              구매 기록을 확인할 수 없어요. 기기 저장소를 읽지 못했습니다.
            </p>
          )}
          <p className="ll-muted">대조는 구매 등록한 번호만 대상입니다. 추천·즐겨찾기 번호는 구매 기록이 아닙니다.</p>
        </>
      )}
    </Card>
  );
}

/** tickets = null(내 기록 읽기 실패)이면 구매 기록 칸을 비운다 — 0건("없음")과 구분한다. */
function RecentRow({ draw, tickets }: { draw: LottoDraw; tickets: Ticket[] | null }) {
  const purchased = tickets && tickets.filter((t) => t.game === "lotto" && t.purchase_status === "purchased" && t.round === draw.draw_no).length;
  return (
    <li className="ll-recent__row">
      <span className="ll-recent__round">
        <strong className="ll-num">제 {draw.draw_no.toLocaleString("ko-KR")}회</strong>
        <span className="ll-muted">{formatDrawDate(draw.draw_date)}</span>
      </span>
      <span className="ll-balls ll-balls--small" role="list" aria-label={`제 ${draw.draw_no}회 당첨 번호`}>
        {draw.nums.map((n) => (
          <span role="listitem" key={n}>
            <Ball number={n} />
          </span>
        ))}
        <span role="listitem">
          <Ball number={draw.bonus} state="bonus" />
        </span>
      </span>
      {purchased === null ? (
        <span />
      ) : purchased > 0 ? (
        <span className="ll-badge" data-status="purchased">
          구매 기록 {purchased}
        </span>
      ) : (
        <span className="ll-muted">구매 기록 없음</span>
      )}
    </li>
  );
}
