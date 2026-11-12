// M-16 회차 목록: 복권 선택·회차 번호로 찾기 → 최신 회차부터(draw_no 내림차순) 한 페이지씩, "더 보기"로 이전 회차.
// 회차마다 추첨일·번호·검증 상태·출처·검증 시각, 상세(M-11) 링크. 첫 페이지는 마지막 정상본을 유지(stale 배너),
// 다음 페이지는 캐시하지 않아 실패하면 그 자리에서 다시 시도한다. 수집 상태(관리자 정보)는 보이지 않는다.
import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { StateView } from "../../components/StateView";
import { ReadBanner } from "../common/ReadBanner";
import { GAME_NAME, formatDrawDate, readView, useAsync, type Game, type ReadResult, type ScreenCore } from "../common/data";
import { DrawNumbers, DrawUpdated, type AnyDraw } from "../common/draw";
import { Segment } from "../common/generator";

export type DrawListLinks = { home: string; stats: string; detail: (game: Game, round: number) => string };

export type DrawListProps = {
  core: Pick<ScreenCore, "reader">;
  links: DrawListLinks;
  /** 회차 찾기 제출 시 이동(셸이 해시를 바꾼다) */
  navigate: (href: string) => void;
  initialGame?: Game;
  /**
   * "wide" = Windows D-14: 이동 경로 없음(사이드바가 내비), 회차를 넓은 표(회차·추첨일·번호·출처·검증 시각·상태)로 보인다.
   * 기본 "stack"은 회차마다 카드.
   */
  layout?: "stack" | "wide";
  /** 복권을 바꾸면 알린다(셸이 주소에 남겨 상세에서 돌아올 때 같은 복권으로 복원 — 검색 상태 복원) */
  onGameChange?: (game: Game) => void;
};

/** 한 페이지 회차 수(app-core DRAW_PAGE_DEFAULT와 같음). */
export const DRAW_PAGE = 20;

export function DrawList({ core, links, navigate, initialGame = "lotto", layout = "stack", onGameChange }: DrawListProps) {
  const [game, setGameState] = useState<Game>(initialGame);
  const wide = layout === "wide";
  const setGame = (next: Game) => {
    setGameState(next);
    onGameChange?.(next);
  };
  return (
    <div className="ll-draws" data-game={game} data-layout={wide ? "wide" : undefined}>
      {!wide && (
        <nav className="ll-breadcrumb" aria-label="현재 위치">
          <ol>
            <li>
              <a href={links.home}>홈</a>
            </li>
            <li>
              <a href={links.stats}>통계</a>
            </li>
            <li aria-current="page">회차 목록</li>
          </ol>
        </nav>
      )}
      <Header title="회차 목록" subtitle="공개된 추첨 결과를 최신 회차부터 보여 줍니다. 이 앱은 복권 공식 서비스가 아닙니다." />
      <Card className="ll-draws__controls">
        <Segment
          legend="복권"
          name="draw-game"
          value={game}
          options={[
            { value: "lotto", label: GAME_NAME.lotto },
            { value: "pension", label: GAME_NAME.pension },
          ]}
          onChange={setGame}
        />
        <RoundSearch key={game} game={game} onGo={(round) => navigate(links.detail(game, round))} />
      </Card>
      <DrawPages key={game} core={core} game={game} links={links} wide={wide} />
    </div>
  );
}

function RoundSearch({ game, onGo }: { game: Game; onGo: (round: number) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const round = /^[0-9]{1,6}$/.test(value.trim()) ? Number(value.trim()) : 0;
    if (round < 1) {
      setError(true);
      return;
    }
    onGo(round);
  };
  return (
    <form className="ll-draws__search" role="search" aria-label={`${GAME_NAME[game]} 회차 찾기`} onSubmit={submit}>
      <label className="ll-field__legend" htmlFor={`round-${game}`}>
        회차 번호로 찾기
      </label>
      <div className="ll-draws__search-row">
        <input
          id={`round-${game}`}
          className="ll-input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="예: 1"
          value={value}
          aria-invalid={error || undefined}
          aria-describedby={error ? `round-${game}-error` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
        />
        <Button type="submit" variant={game === "pension" ? "pension" : "primary"}>
          이동
        </Button>
      </div>
      {error && (
        <p id={`round-${game}-error`} className="ll-gen__error" role="alert">
          1 이상의 회차 번호(숫자)를 입력하세요.
        </p>
      )}
    </form>
  );
}

type Page = ReadResult<AnyDraw[]>;
type More = { kind: "idle" } | { kind: "loading" } | { kind: "error" } | { kind: "end" };

function loadPage(core: Pick<ScreenCore, "reader">, game: Game, options: { before?: number; force?: boolean }): Promise<Page> {
  const request = { ...options, limit: DRAW_PAGE };
  return game === "lotto" ? core.reader.listDraws("lotto", request) : core.reader.listDraws("pension", request);
}

function DrawPages({ core, game, links, wide }: { core: Pick<ScreenCore, "reader">; game: Game; links: DrawListLinks; wide: boolean }) {
  const [first, reload] = useAsync<Page>((force) => loadPage(core, game, { force }));
  const [extra, setExtra] = useState<AnyDraw[]>([]);
  const [more, setMore] = useState<More>({ kind: "idle" });
  const result = first.status === "done" ? first.value : undefined;
  const view = readView(result);
  const retryFirst = () => {
    setExtra([]);
    setMore({ kind: "idle" });
    reload(true);
  };

  if (first.status === "failed" || view.kind === "error") {
    return (
      <StateView
        kind="error"
        title="회차 목록을 불러오지 못했습니다"
        description="네트워크 연결을 확인한 뒤 다시 시도해 주세요. 받은 적 없는 회차 결과는 보여 드릴 수 없습니다."
        action={<Button onClick={retryFirst}>다시 시도</Button>}
      />
    );
  }
  if (view.kind === "loading") {
    return (
      <Card busy>
        <p role="status" className="ll-sr-only">
          회차 목록을 불러오는 중입니다
        </p>
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
        ))}
      </Card>
    );
  }
  const rows = view.kind === "success" ? [...view.data, ...extra] : [];
  if (rows.length === 0) {
    return (
      <StateView
        kind="empty"
        title={`${GAME_NAME[game]} 회차 결과가 아직 없습니다`}
        description="회차 결과가 아직 수집되지 않았습니다(미갱신). 갱신 후 다시 확인해 주세요."
        action={
          <Button variant="secondary" onClick={retryFirst}>
            새로고침
          </Button>
        }
      />
    );
  }
  const firstLen = view.kind === "success" ? view.data.length : 0;
  const ended = more.kind === "end" || (extra.length === 0 && firstLen < DRAW_PAGE);

  async function loadMore() {
    const last = rows[rows.length - 1]!;
    setMore({ kind: "loading" });
    const page = await loadPage(core, game, { before: last.draw_no }).catch((): Page => ({ data: null, fetched_at: null, stale: true }));
    if (page.data === null) {
      setMore({ kind: "error" });
      return;
    }
    setExtra((prev) => [...prev, ...page.data!]);
    setMore(page.data.length < DRAW_PAGE ? { kind: "end" } : { kind: "idle" });
  }

  return (
    <section className="ll-draws__list" aria-label={`${GAME_NAME[game]} 회차 목록`}>
      <ReadBanner
        results={[result]}
        action={
          <Button variant="secondary" onClick={retryFirst}>
            다시 시도
          </Button>
        }
      />
      <p className="ll-muted">최신 회차부터 · {rows.length.toLocaleString("ko-KR")}개 회차 표시 중</p>
      {wide ? (
        <DrawTable game={game} rows={rows} links={links} />
      ) : (
      <ul className="ll-draws__items">
        {rows.map((draw) => (
          <li key={draw.draw_no} className="ll-draws__item">
            <div className="ll-draw__head">
              <a className="ll-link ll-draws__title" href={links.detail(game, draw.draw_no)}>
                <span className="ll-num">제 {draw.draw_no.toLocaleString("ko-KR")}회</span>
                <span className="ll-sr-only"> 상세 보기</span>
              </a>
              <span className="ll-draw__date">{formatDrawDate(draw.draw_date)}</span>
              <span className="ll-draws__verified">
                <Icon name="check" />
                검증 완료
              </span>
            </div>
            <DrawNumbers draw={draw} small />
            <DrawUpdated draw={draw} />
          </li>
        ))}
      </ul>
      )}
      <div className="ll-draws__more">
        {ended ? (
          <p className="ll-muted">수집된 가장 이전 회차까지 모두 표시했습니다.</p>
        ) : (
          <Button variant="secondary" block onClick={() => void loadMore()} disabled={more.kind === "loading"}>
            {more.kind === "loading" ? "불러오는 중" : "이전 회차 더 보기"}
          </Button>
        )}
        {more.kind === "error" && (
          <p className="ll-muted" role="alert">
            이전 회차를 불러오지 못했습니다. 연결을 확인한 뒤 다시 눌러 주세요.
          </p>
        )}
      </div>
    </section>
  );
}

/** Windows D-14 넓은 표. 행 상세는 회차 링크(키보드·스크린리더는 링크 이름 "제 N회 상세 보기"). 상태는 수집된 검증 완료 결과만 보인다. */
function DrawTable({ game, rows, links }: { game: Game; rows: AnyDraw[]; links: DrawListLinks }) {
  return (
    <div className="ll-wtable" tabIndex={0} role="region" aria-label={`${GAME_NAME[game]} 회차 표 영역(가로 스크롤)`}>
      <table>
        <caption>{GAME_NAME[game]} 회차 결과(최신 회차부터)</caption>
        <thead>
          <tr>
            <th scope="col">회차</th>
            <th scope="col">추첨일</th>
            <th scope="col">당첨 번호</th>
            <th scope="col">출처 · 검증 시각</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((draw) => (
            <tr key={draw.draw_no}>
              <th scope="row">
                <a className="ll-link ll-num" href={links.detail(game, draw.draw_no)}>
                  제 {draw.draw_no.toLocaleString("ko-KR")}회 <span className="ll-sr-only">상세 보기</span>
                </a>
              </th>
              <td className="ll-num">{formatDrawDate(draw.draw_date)}</td>
              <td>
                <DrawNumbers draw={draw} small />
              </td>
              <td>
                <DrawUpdated draw={draw} />
              </td>
              <td>
                <span className="ll-draws__verified">
                  <Icon name="check" />
                  검증 완료
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
