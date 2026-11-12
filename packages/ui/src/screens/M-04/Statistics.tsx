// M-04 통계: 요약(최근 회차·집계 요약) → 복권 선택 → 기간(최근 10·20·50·100회·전체) → 지표(로또 6종·연금 3종) →
// 차트(SVG 직접, 차트 라이브러리 없음)·표 대체.
// 값은 statistics_cache를 그대로 보인다(앱에서 계산하지 않음, task-015 결정 ①). 결과는 번호·자리·구간 순서로만 —
// 정렬·순위·많이/적게 나온 번호 강조는 하지 않는다(결정 ⑦). 표본 < 50이면 "표본 적음"(결정 ⑦).
// 모든 통계에 기간·표본·기준선(무작위 기대 횟수)·출처·갱신 시각·"미래 예측 아님"을 함께 둔다(AGENTS.md 4장).
import { useCallback, useEffect, useId, useState, type CSSProperties } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { InfoTip } from "../../components/InfoTip";
import { StateView } from "../../components/StateView";
import { Table, type TableColumn } from "../../components/Table";
import { Updated } from "../../components/Updated";
import { ReadBanner } from "../common/ReadBanner";
import {
  GAME_NAME,
  formatDrawDate,
  readView,
  type Async,
  type Game,
  type ReadResult,
  type ScreenCore,
  type StatMetric,
  type StatRow,
  type StatWindow,
} from "../common/data";
import { DrawNumbers, DrawUpdated, type AnyDraw } from "../common/draw";
import { Segment } from "../common/generator";
import { statChart, type BarDatum, type StatChart } from "./chart-data";

/** draws = 회차 목록 주소(현재 복권을 넘긴다) */
export type StatisticsLinks = { home: string; draws: (game: Game) => string };

export type StatisticsProps = {
  core: Pick<ScreenCore, "reader">;
  links: StatisticsLinks;
  /** 처음 보일 복권(기본 로또) */
  initialGame?: Game;
};

/** 표본이 이보다 적으면 "표본 적음"(task-015 결정 ⑦). */
export const SMALL_SAMPLE = 50;

/** label = 문장용, short = 칩 표시용(좁은 폭에서 줄바꿈 없이) */
export const WINDOW_OPTIONS: { value: StatWindow; label: string; short: string }[] = [
  { value: "last10", label: "최근 10회", short: "10회" },
  { value: "last20", label: "최근 20회", short: "20회" },
  { value: "last50", label: "최근 50회", short: "50회" },
  { value: "last100", label: "최근 100회", short: "100회" },
  { value: "all", label: "전체", short: "전체" },
];

export type MetricInfo = { metric: StatMetric; label: string; title: string; axis: string; unit: string };

export const METRICS: Record<Game, MetricInfo[]> = {
  lotto: [
    { metric: "lotto.number_freq", label: "번호 빈도", title: "번호별 출현 횟수", axis: "번호", unit: "회" },
    { metric: "lotto.number_freq_bonus", label: "보너스 포함", title: "번호별 출현 횟수(보너스 포함)", axis: "번호", unit: "회" },
    { metric: "lotto.range_dist", label: "구간", title: "번호 구간별 출현 횟수", axis: "구간", unit: "회" },
    { metric: "lotto.odd_even", label: "홀짝", title: "회차별 홀수 개수 분포", axis: "홀수 개수", unit: "회차" },
    { metric: "lotto.sum_dist", label: "합계", title: "6개 번호 합계 분포", axis: "합계", unit: "회차" },
    { metric: "lotto.gap", label: "미출현", title: "번호별 마지막 출현 후 지난 회차", axis: "번호", unit: "회" },
  ],
  pension: [
    { metric: "pension.digit_freq", label: "자리별 숫자", title: "자리별 숫자 출현 횟수", axis: "자리", unit: "회" },
    { metric: "pension.group_freq", label: "조", title: "조별 출현 횟수", axis: "조", unit: "회" },
    { metric: "pension.bonus_digit_freq", label: "보너스 자리", title: "보너스 번호 자리별 숫자 출현 횟수", axis: "자리", unit: "회" },
  ],
};

const DEFAULT_WINDOW: StatWindow = "last50";

/**
 * key가 바뀌면 다시 읽는 비동기 읽기(조건 칩을 바꿔도 화면을 다시 만들지 않아 포커스가 유지된다).
 * reload(true)는 같은 key에서만 force. 늦게 온 이전 응답은 버린다.
 */
function useKeyedRead<T>(key: string, load: (force: boolean) => Promise<T>): [Async<T>, (force?: boolean) => void] {
  const [state, setState] = useState<Async<T>>({ status: "loading" });
  const [request, setRequest] = useState({ n: 0, force: false, key });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    load(request.force && request.key === key).then(
      (value) => {
        if (alive) setState({ status: "done", value });
      },
      (error: unknown) => {
        if (alive) setState({ status: "failed", error });
      },
    );
    return () => {
      alive = false;
    };
    // load는 key(복권·기간·지표)로 정해진다 — key·요청이 바뀔 때만 다시 읽는다.
  }, [key, request]);
  const reload = useCallback((force = false) => setRequest((r) => ({ n: r.n + 1, force, key })), [key]);
  return [state, reload];
}

export function Statistics({ core, links, initialGame = "lotto" }: StatisticsProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [statWindow, setStatWindow] = useState<StatWindow>(DEFAULT_WINDOW);
  const [metric, setMetric] = useState<StatMetric>(METRICS[initialGame][0]!.metric);
  const info = METRICS[game].find((m) => m.metric === metric) ?? METRICS[game][0]!;

  const [stat, reloadStat] = useKeyedRead<ReadResult<StatRow>>(`${game}:${statWindow}:${info.metric}`, (force) =>
    core.reader.statistics(game, statWindow, info.metric, { force }),
  );
  const [latest, reloadLatest] = useKeyedRead<ReadResult<AnyDraw>>(game, (force) =>
    game === "lotto" ? core.reader.latestDraw("lotto", { force }) : core.reader.latestDraw("pension", { force }),
  );

  const changeGame = (next: Game) => {
    setGame(next);
    setMetric(METRICS[next][0]!.metric);
  };

  return (
    <div className="ll-stats" data-game={game}>
      <nav className="ll-breadcrumb" aria-label="현재 위치">
        <ol>
          <li>
            <a href={links.home}>홈</a>
          </li>
          <li aria-current="page">통계</li>
        </ol>
      </nav>
      <Header title="통계" subtitle="지난 회차 결과를 기간별로 집계해 무작위 기준선과 함께 보여 줍니다." />
      <p className="ll-stats__notice">
        <strong>미래 예측 아님</strong> · 과거 회차를 센 결과입니다. 어떤 번호도 다음 회차에 더 잘 나오지 않으며, 기준선은 번호가 무작위로
        고르게 나올 때 기대되는 횟수입니다.
      </p>

      <SummaryCard game={game} statWindow={statWindow} info={info} latest={latest} stat={stat} onRetry={() => reloadLatest(true)} />

      <div className="ll-stats__layout">
        <Card title="보기 조건" className="ll-stats__controls">
          <Segment
            legend="복권"
            name="stat-game"
            value={game}
            options={[
              { value: "lotto", label: GAME_NAME.lotto },
              { value: "pension", label: GAME_NAME.pension },
            ]}
            onChange={changeGame}
          />
          <Segment
            legend="기간(최근 회차 수)"
            name="stat-window"
            value={statWindow}
            options={WINDOW_OPTIONS.map((w) => ({ value: w.value, label: w.short }))}
            onChange={setStatWindow}
          />
          <Segment
            legend="지표"
            name="stat-metric"
            value={info.metric}
            options={METRICS[game].map((m) => ({ value: m.metric, label: m.label }))}
            onChange={setMetric}
          />
          <a className="ll-button" data-variant="secondary" data-block="true" href={links.draws(game)}>
            지난 회차 결과 보기
          </a>
        </Card>

        <StatPanel state={stat} game={game} window={statWindow} info={info} onRetry={() => reloadStat(true)} onWindow={setStatWindow} />
      </div>
    </div>
  );
}

function windowLabel(window: StatWindow): string {
  return WINDOW_OPTIONS.find((w) => w.value === window)!.label;
}

function periodText(row: StatRow, window: StatWindow): string {
  return `제 ${row.range_from.toLocaleString("ko-KR")}~${row.range_to.toLocaleString("ko-KR")}회 (${windowLabel(window)})`;
}

/** 상단 요약: 최근 회차(번호·출처·검증 시각)와 지금 보는 통계의 집계 요약(실제 기간·표본·집계 횟수 합계). */
function SummaryCard({
  game,
  statWindow,
  info,
  latest,
  stat,
  onRetry,
}: {
  game: Game;
  statWindow: StatWindow;
  info: MetricInfo;
  latest: Async<ReadResult<AnyDraw>>;
  stat: Async<ReadResult<StatRow>>;
  onRetry: () => void;
}) {
  const lv = readView(latest.status === "done" ? latest.value : undefined);
  const sv = readView(stat.status === "done" ? stat.value : undefined);
  const row = sv.kind === "success" && sv.data.sample_size > 0 ? sv.data : null;
  const chart = row ? statChart(info.metric, row) : null;
  const total = chart ? chartTotal(chart) : null;
  return (
    <Card title={`${GAME_NAME[game]} 요약`} busy={lv.kind === "loading"} className="ll-stats__summary">
      <section className="ll-draw" aria-label="최근 회차">
        <div className="ll-draw__head">
          <strong>최근 회차</strong>
          {lv.kind === "success" && (
            <>
              <span className="ll-num">제 {lv.data.draw_no.toLocaleString("ko-KR")}회</span>
              <span className="ll-draw__date">{formatDrawDate(lv.data.draw_date)}</span>
            </>
          )}
        </div>
        {lv.kind === "loading" && (
          <p role="status" className="ll-muted">
            최근 회차를 불러오는 중입니다
          </p>
        )}
        {lv.kind === "success" && (
          <>
            <DrawNumbers draw={lv.data} small />
            <DrawUpdated draw={lv.data} />
          </>
        )}
        {lv.kind === "empty" && <p className="ll-muted">회차 결과가 아직 수집되지 않았습니다(미갱신).</p>}
        {(lv.kind === "error" || latest.status === "failed") && (
          <p className="ll-muted">
            최근 회차를 불러오지 못했습니다.{" "}
            <button type="button" className="ll-link" onClick={onRetry}>
              다시 시도
            </button>
          </p>
        )}
      </section>
      <dl className="ll-stats__meta" aria-label="집계 요약">
        <div>
          <dt>집계 기간</dt>
          <dd className="ll-num">{row ? periodText(row, statWindow) : `${windowLabel(statWindow)} · 집계 없음`}</dd>
        </div>
        <div>
          <dt>표본</dt>
          <dd className="ll-num">{row ? `${row.sample_size.toLocaleString("ko-KR")}회` : "—"}</dd>
        </div>
        <div>
          <dt>집계 횟수 합계</dt>
          <dd className="ll-num">{total === null ? "—" : `${total.toLocaleString("ko-KR")}${info.unit}`}</dd>
        </div>
      </dl>
    </Card>
  );
}

/** 집계된 횟수의 총합(미출현 간격 지표는 합계가 의미 없어 null). */
function chartTotal(chart: StatChart): number | null {
  if (chart.kind === "heat") return chart.rows.reduce((a, r) => a + r.cells.reduce((b, c) => b + c, 0), 0);
  if (chart.gap) return null;
  return chart.bars.reduce((a, b) => a + b.value, 0);
}

function StatPanel({
  state,
  game,
  window,
  info,
  onRetry,
  onWindow,
}: {
  state: Async<ReadResult<StatRow>>;
  game: Game;
  window: StatWindow;
  info: MetricInfo;
  onRetry: () => void;
  onWindow: (w: StatWindow) => void;
}) {
  const result = state.status === "done" ? state.value : undefined;
  const view = readView(result);
  const title = `${GAME_NAME[game]} ${info.title}`;
  const retry = (
    <Button variant="secondary" onClick={onRetry}>
      다시 시도
    </Button>
  );

  return (
    <Card title={title} busy={view.kind === "loading"} className="ll-stats__panel">
      <ReadBanner results={[result]} action={retry} />
      {state.status === "failed" && (
        <StateView kind="error" title="통계를 불러오지 못했습니다" description="잠시 후 다시 시도해 주세요." action={retry} />
      )}
      {state.status !== "failed" && view.kind === "loading" && <StateView kind="loading" title="통계를 불러오는 중입니다" />}
      {view.kind === "error" && (
        <StateView kind="error" title="통계를 불러오지 못했습니다" description="네트워크 연결을 확인한 뒤 다시 시도해 주세요." action={retry} />
      )}
      {(view.kind === "empty" || (view.kind === "success" && view.data.sample_size === 0)) && (
        <StateView
          kind="empty"
          title={`${windowLabel(window)} 통계가 아직 없습니다`}
          description="이 기간에 집계된 회차(표본)가 없습니다(미갱신). 기간을 바꿔 보세요."
          action={
            window === "all" ? undefined : (
              <Button variant="secondary" onClick={() => onWindow("all")}>
                전체 기간으로 보기
              </Button>
            )
          }
        />
      )}
      {view.kind === "success" && view.data.sample_size > 0 && (
        <StatBody key={info.metric} row={view.data} game={game} window={window} info={info} title={title} />
      )}
    </Card>
  );
}

function StatBody({ row, game, window, info, title }: { row: StatRow; game: Game; window: StatWindow; info: MetricInfo; title: string }) {
  const chart = statChart(info.metric, row);
  const period = periodText(row, window);
  return (
    <div className="ll-stats__body">
      <dl className="ll-stats__meta">
        <div>
          <dt>
            기간
            <InfoTip label="기간">집계에 쓴 회차 범위입니다. 수집된 회차 중 최신 회차부터 거슬러 셉니다.</InfoTip>
          </dt>
          <dd className="ll-num">{period}</dd>
        </div>
        <div>
          <dt>
            표본
            <InfoTip label="표본">집계에 쓴 회차 수입니다. 표본이 적으면 우연한 차이가 크게 보일 수 있습니다.</InfoTip>
          </dt>
          <dd className="ll-num">
            {row.sample_size.toLocaleString("ko-KR")}회
            {row.sample_size < SMALL_SAMPLE && (
              <span className="ll-chip ll-stats__small" data-game={game === "pension" ? "pension" : undefined}>
                표본 적음
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            기준선
            <InfoTip label="기준선">
              {info.metric === "lotto.gap"
                ? "번호가 무작위로 나올 때 기대되는 평균 간격(45÷6 = 7.5회)입니다."
                : "번호가 무작위로 고르게 나올 때 이 표본에서 기대되는 횟수입니다. 기준선과의 차이는 우연으로도 생깁니다."}
            </InfoTip>
          </dt>
          <dd className="ll-num">{chart ? baselineText(chart, info) : "확인할 수 없음"}</dd>
        </div>
      </dl>
      {row.sample_size < SMALL_SAMPLE && (
        <p className="ll-muted">표본이 {SMALL_SAMPLE}회보다 적어 우연한 차이가 크게 보일 수 있습니다.</p>
      )}

      {chart ? (
        <ChartWithTable chart={chart} info={info} title={title} period={period} game={game} />
      ) : (
        // 기준선·형식을 확인할 수 없는 수치는 노출하지 않는다(AGENTS 4장 — 통계는 기준선과 함께).
        <p className="ll-muted" role="status">
          통계 형식을 확인할 수 없어 표시하지 않습니다.
        </p>
      )}

      <Updated source={row.source} verifiedAt={row.updated_at} basis={`${period} · 표본 ${row.sample_size.toLocaleString("ko-KR")}회`} notPrediction />
    </div>
  );
}

function baselineText(chart: StatChart, info: MetricInfo): string {
  if (chart.kind === "heat") return `칸마다 ${chart.baseline.toFixed(1)}${info.unit} (무작위 기대 횟수)`;
  if (chart.single !== null) {
    return info.metric === "lotto.gap" ? `기대 간격 ${chart.single.toFixed(1)}회` : `${chart.single.toFixed(1)}${info.unit} (무작위 기대 횟수)`;
  }
  return "막대마다 표시 (무작위 기대 횟수)";
}

function ChartWithTable({ chart, info, title, period, game }: { chart: StatChart; info: MetricInfo; title: string; period: string; game: Game }) {
  const [table, setTable] = useState(false);
  const regionId = useId();
  return (
    <div className="ll-stats__chart">
      <div className="ll-stats__chart-head">
        <p className="ll-muted">
          {chart.kind === "bars" ? `가로: ${info.axis} 순서 · 세로: ${info.unit} · 점선: 기준선` : "행: 자리 · 열: 숫자 0~9 · 칸 숫자: 출현 횟수"}
        </p>
        <button type="button" className="ll-link" aria-pressed={table} aria-controls={regionId} onClick={() => setTable((v) => !v)}>
          표로 보기
        </button>
      </div>
      <div id={regionId}>
        {table ? (
          <ChartTable chart={chart} info={info} title={title} />
        ) : chart.kind === "bars" ? (
          <BarChart bars={chart.bars} single={chart.single} info={info} title={title} period={period} game={game} />
        ) : (
          <HeatMap rows={chart.rows} baseline={chart.baseline} title={title} />
        )}
      </div>
    </div>
  );
}

const SVG_HEIGHT = 192;
const PAD_TOP = 20;
/** 미출현(censored) 막대는 "N회 이상"을 막대 위에 세로로 쓴다 — 그만큼 위 여백을 둔다. */
const PAD_TOP_CENSORED = 76;
const PAD_BOTTOM = 24;

/** 막대 차트(SVG). 1 viewBox 단위 = CSS 1px(폭·높이를 --spacing으로 맞춤). 막대가 많으면 카드 안에서 가로 스크롤. */
function BarChart({
  bars,
  single,
  info,
  title,
  period,
  game,
}: {
  bars: BarDatum[];
  single: number | null;
  info: MetricInfo;
  title: string;
  period: string;
  game: Game;
}) {
  const slotUnits = bars.length > 12 ? 7 : 11; // --spacing 배수
  const slot = slotUnits * 4;
  const width = bars.length * slot;
  const censored = bars.some((b) => b.censored);
  const padTop = censored ? PAD_TOP_CENSORED : PAD_TOP;
  const plot = SVG_HEIGHT - padTop - PAD_BOTTOM;
  const max = Math.max(1, ...bars.map((b) => Math.max(b.value, b.baseline))) * 1.1;
  const y = (v: number) => padTop + plot * (1 - v / max);
  const label = `${title} 막대 차트, ${period}. ${info.axis} 순서로 표시하며 점선은 기준선입니다. 정확한 값은 표로 보기에서 확인할 수 있습니다.`;
  return (
    <div className="ll-chart" tabIndex={0} role="region" aria-label={`${title} 차트 영역(가로 스크롤)`}>
      <svg
        className="ll-chart__svg"
        data-game={game}
        viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
        style={{ "--chart-slots": bars.length, "--chart-slot": slotUnits } as CSSProperties}
        role="img"
        aria-label={label}
      >
        <title>{`${title} · ${period}`}</title>
        <line className="ll-chart__axis" x1={0} x2={width} y1={y(0)} y2={y(0)} />
        {bars.map((b, i) => {
          const x = i * slot;
          const top = y(b.value);
          const cx = x + slot / 2;
          return (
            <g key={b.key} data-key={b.key}>
              <rect
                className={b.censored ? "ll-chart__bar ll-chart__bar--censored" : "ll-chart__bar"}
                x={x + slot * 0.18}
                y={top}
                width={slot * 0.64}
                height={Math.max(0, y(0) - top)}
              />
              {b.censored ? (
                <text className="ll-chart__value" x={cx} y={top - 4} transform={`rotate(-90 ${cx} ${top - 4})`} dominantBaseline="middle">
                  {b.short}
                </text>
              ) : (
                <text className="ll-chart__value" x={cx} y={top - 4} textAnchor="middle">
                  {b.short}
                </text>
              )}
              <text className="ll-chart__label" x={cx} y={SVG_HEIGHT - 6} textAnchor="middle">
                {b.label}
              </text>
              {single === null && (
                <line className="ll-chart__baseline" x1={x + slot * 0.08} x2={x + slot * 0.92} y1={y(b.baseline)} y2={y(b.baseline)} />
              )}
            </g>
          );
        })}
        {single !== null && <line className="ll-chart__baseline" x1={0} x2={width} y1={y(single)} y2={y(single)} />}
      </svg>
    </div>
  );
}

/**
 * 자리별 숫자 히트맵: 5단계 색(--color-heat-1~5) + 칸 안 숫자 병기(DESIGN.md 4.6). 색 단계는 이 표 안 최댓값 기준.
 * 단계별 글자색은 screens.css(.ll-heat__cell[data-level])에 고정하고 라이트·다크 대비 4.5:1 이상을 heat-contrast 테스트가 확인한다.
 */
function HeatMap({ rows, baseline, title }: { rows: { key: string; label: string; cells: number[] }[]; baseline: number; title: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  const level = (v: number) => Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
  return (
    <div className="ll-chart" tabIndex={0} role="region" aria-label={`${title} 히트맵 영역(가로 스크롤)`}>
      <div
        className="ll-heat"
        role="img"
        aria-label={`${title} 히트맵. 자리 순서·숫자 0~9 순서로 표시하며 칸마다 기준선은 ${baseline.toFixed(1)}회입니다. 정확한 값은 표로 보기에서 확인할 수 있습니다.`}
      >
        <span className="ll-heat__corner" />
        {Array.from({ length: 10 }, (_, d) => (
          <span key={d} className="ll-heat__head">
            {d}
          </span>
        ))}
        {rows.map((r) => (
          <HeatRow key={r.key} label={r.label} cells={r.cells} level={level} />
        ))}
      </div>
    </div>
  );
}

function HeatRow({ label, cells, level }: { label: string; cells: number[]; level: (v: number) => number }) {
  return (
    <>
      <span className="ll-heat__head">{label}</span>
      {cells.map((v, d) => (
        <span key={d} className="ll-heat__cell" data-level={level(v)}>
          {v}
        </span>
      ))}
    </>
  );
}

type TableRow = { key: string; cells: Record<string, string> };

function ChartTable({ chart, info, title }: { chart: StatChart; info: MetricInfo; title: string }) {
  if (chart.kind === "bars") {
    const columns: TableColumn<BarDatum>[] = [
      { key: "label", header: info.axis },
      { key: "value", header: info.metric === "lotto.gap" ? "지난 회차" : `출현 (${info.unit})`, numeric: true, render: (b) => b.full },
      { key: "baseline", header: "기준선", numeric: true, render: (b) => b.baseline.toFixed(1) },
    ];
    return <Table caption={`${title} 표(${info.axis} 순서)`} columns={columns} rows={chart.bars} rowKey={(b) => b.key} />;
  }
  const columns: TableColumn<TableRow>[] = [
    { key: "pos", header: "자리" },
    ...Array.from({ length: 10 }, (_, d) => ({ key: `d${d}`, header: `숫자 ${d}`, numeric: true })),
  ].map((c) => ({ ...c, render: (r: TableRow) => r.cells[c.key] ?? "" }));
  const rows: TableRow[] = chart.rows.map((r) => ({
    key: r.key,
    cells: Object.fromEntries([["pos", r.label], ...r.cells.map((v, d) => [`d${d}`, String(v)])]),
  }));
  return (
    <Table caption={`${title} 표(자리·숫자 순서, 칸마다 기준선 ${chart.baseline.toFixed(1)}회)`} columns={columns} rows={rows} rowKey={(r) => r.key} />
  );
}
