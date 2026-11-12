// M-11 회차 상세: 추첨일·번호(로또 보너스 / 연금 조·6자리 문자열·보너스 분리)·등위별 일치 기준·당첨금 표,
// 공식 출처 링크(OpenExternal)·검증 시각, 이전/다음 회차. 0행이면 미갱신 안내, 캐시도 없는 실패면 결과를 보이지 않는다.
// 금액은 정수 원(천 단위 쉼표). 연금 연금식(annuity)은 월 지급액 × 개월로 보인다.
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { StateView } from "../../components/StateView";
import { Table, type TableColumn } from "../../components/Table";
import { ReadBanner } from "../common/ReadBanner";
import { GAME_NAME, formatDrawDate, formatWon, readView, useAsync, type Game, type Prize, type ReadResult, type ScreenCore } from "../common/data";
import { DrawNumbers, DrawUpdated, type AnyDraw } from "../common/draw";

export type DrawDetailLinks = {
  home: string;
  tickets: string;
  list: (game: Game) => string;
  detail: (game: Game, round: number) => string;
};

export type DrawDetailProps = {
  core: Pick<ScreenCore, "reader" | "adapters">;
  game: Game;
  /** 주소의 회차 번호. 정수 ≥1이 아니면 null(잘못된 주소). */
  round: number | null;
  links: DrawDetailLinks;
  /**
   * "wide" = Windows D-08: 이동 경로는 회차 목록 › 상세(홈 생략 — 사이드바가 내비), 당첨 번호(좌)·등위별 당첨금(우) 2열.
   * 기본 "stack"은 1열.
   */
  layout?: "stack" | "wide";
};

type Loaded = { draw: ReadResult<AnyDraw>; latest: ReadResult<AnyDraw> };

async function load(core: Pick<ScreenCore, "reader">, game: Game, round: number, force: boolean): Promise<Loaded> {
  const [draw, latest] =
    game === "lotto"
      ? await Promise.all([core.reader.drawByRound("lotto", round, { force }), core.reader.latestDraw("lotto", { force })])
      : await Promise.all([core.reader.drawByRound("pension", round, { force }), core.reader.latestDraw("pension", { force })]);
  return { draw, latest };
}

export function DrawDetail({ core, game, round, links, layout = "stack" }: DrawDetailProps) {
  const wide = layout === "wide";
  const title = round === null ? `${GAME_NAME[game]} 회차 상세` : `${GAME_NAME[game]} 제 ${round.toLocaleString("ko-KR")}회`;
  return (
    <div className="ll-draws" data-game={game} data-layout={wide ? "wide" : undefined}>
      <nav className="ll-breadcrumb" aria-label="현재 위치">
        <ol>
          {!wide && (
            <li>
              <a href={links.home}>홈</a>
            </li>
          )}
          <li>
            <a href={links.list(game)}>회차 목록</a>
          </li>
          <li aria-current="page">회차 상세</li>
        </ol>
      </nav>
      <Header title={title} subtitle="공개된 추첨 결과입니다. 이 앱은 복권 공식 서비스가 아니며, 정확한 결과는 공식 결과에서 확인하세요." />
      {round === null ? (
        <StateView
          kind="error"
          title="회차 번호가 올바르지 않습니다"
          description="1 이상의 회차 번호로 다시 찾아 주세요."
          action={
            <a className="ll-button" data-variant="secondary" href={links.list(game)}>
              회차 목록으로
            </a>
          }
        />
      ) : (
        <DetailBody key={`${game}:${round}`} core={core} game={game} round={round} links={links} wide={wide} />
      )}
    </div>
  );
}

function DetailBody({
  core,
  game,
  round,
  links,
  wide,
}: {
  core: DrawDetailProps["core"];
  game: Game;
  round: number;
  links: DrawDetailLinks;
  wide: boolean;
}) {
  const [state, reload] = useAsync<Loaded>((force) => load(core, game, round, force));
  const loaded = state.status === "done" ? state.value : undefined;
  const view = readView(loaded?.draw);
  const latestNo = loaded?.latest.data?.draw_no;
  const retry = (
    <Button variant="secondary" onClick={() => reload(true)}>
      다시 시도
    </Button>
  );
  const nav = (
    <nav className="ll-draws__pager" aria-label="회차 이동">
      {round > 1 ? (
        <a className="ll-button" data-variant="secondary" href={links.detail(game, round - 1)}>
          이전 회차
        </a>
      ) : (
        <span />
      )}
      {latestNo === undefined || round < latestNo ? (
        <a className="ll-button" data-variant="secondary" href={links.detail(game, round + 1)}>
          다음 회차
        </a>
      ) : (
        <span className="ll-muted">수집된 최신 회차입니다</span>
      )}
    </nav>
  );

  if (state.status === "failed" || view.kind === "error") {
    return (
      <>
        <StateView
          kind="error"
          title="회차 결과를 불러오지 못했습니다"
          description="네트워크 연결을 확인한 뒤 다시 시도해 주세요. 받은 적 없는 회차 결과는 보여 드릴 수 없습니다."
          action={retry}
        />
        {nav}
      </>
    );
  }
  if (view.kind === "loading") {
    return (
      <Card busy>
        <p role="status" className="ll-sr-only">
          회차 결과를 불러오는 중입니다
        </p>
        <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
        <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
      </Card>
    );
  }
  if (view.kind === "empty") {
    return (
      <>
        <StateView
          kind="empty"
          title={`제 ${round.toLocaleString("ko-KR")}회 결과가 아직 없습니다`}
          description="이 회차 결과가 아직 수집되지 않았습니다(미갱신). 추첨 전이거나 갱신 전일 수 있습니다."
          action={
            <a className="ll-button" data-variant="secondary" href={links.list(game)}>
              회차 목록으로
            </a>
          }
        />
        {nav}
      </>
    );
  }

  const draw = view.data;
  const cards = (
    <>
      <Card
        title="당첨 번호"
        action={
          <span className="ll-draws__verified">
            <Icon name="check" />
            검증 완료
          </span>
        }
      >
        <p className="ll-draw__date">추첨일 {formatDrawDate(draw.draw_date)}</p>
        <DrawNumbers draw={draw} />
        <div className="ll-draw__source">
          <DrawUpdated draw={draw} />
          <button type="button" className="ll-link" onClick={() => void core.adapters.openExternal.open(draw.source_url)}>
            공식 결과 보기
          </button>
        </div>
      </Card>
      <Card title="등위별 당첨금">
        <PrizeTable game={game} prizes={draw.prizes} />
        <p className="ll-muted">당첨금은 공개된 결과를 옮긴 금액(원)입니다. 정확한 금액은 공식 결과에서 확인하세요.</p>
      </Card>
    </>
  );
  return (
    <div className="ll-draws__detail">
      <ReadBanner results={[loaded?.draw]} action={retry} />
      {wide ? <div className="ll-draws__cols">{cards}</div> : cards}
      <a className="ll-button" data-variant="secondary" data-block={wide ? undefined : "true"} href={links.tickets}>
        내 번호에서 확인하기
      </a>
      {nav}
    </div>
  );
}

const LOTTO_RULES: Record<number, string> = {
  1: "6개 번호 일치",
  2: "5개 번호 + 보너스 번호 일치",
  3: "5개 번호 일치",
  4: "4개 번호 일치",
  5: "3개 번호 일치",
};
const PENSION_RULES: Record<number, string> = {
  1: "조 + 6자리 모두 일치",
  2: "6자리 일치(조 다름)",
  3: "끝 5자리 일치",
  4: "끝 4자리 일치",
  5: "끝 3자리 일치",
  6: "끝 2자리 일치",
  7: "끝 1자리 일치",
};

function rankLabel(p: Prize): string {
  return p.rank === null ? "보너스" : `${p.rank}등`;
}

function ruleOf(game: Game, p: Prize): string {
  if (p.rank === null) return "보너스 6자리 일치(조 무관)";
  return (game === "lotto" ? LOTTO_RULES : PENSION_RULES)[p.rank] ?? "";
}

/** 1인 당첨금: 일시금은 금액, 연금식은 "월 금액 × N개월". */
export function prizeAmount(p: Prize): string {
  return p.payout === "annuity" ? `월 ${formatWon(p.amount_won)} × ${p.months.toLocaleString("ko-KR")}개월` : formatWon(p.amount_won);
}

function PrizeTable({ game, prizes }: { game: Game; prizes: Prize[] }) {
  if (prizes.length === 0) {
    return <p className="ll-muted">공개된 당첨금 정보가 아직 없습니다(미갱신).</p>;
  }
  // 등위 순(보너스는 마지막) — 표시 순서일 뿐 번호의 순위가 아니다.
  const rows = [...prizes].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const columns: TableColumn<Prize>[] = [
    { key: "rank", header: "등위", render: rankLabel },
    { key: "rule", header: "일치 기준", render: (p) => ruleOf(game, p) },
    { key: "amount", header: "1인 당첨금", numeric: true, render: prizeAmount },
    { key: "winners", header: "당첨자 수", numeric: true, render: (p) => `${p.winners.toLocaleString("ko-KR")}명` },
  ];
  return <Table caption="등위·일치 기준·1인 당첨금·당첨자 수" columns={columns} rows={rows} rowKey={rankLabel} />;
}
