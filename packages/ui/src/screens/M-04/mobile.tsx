// M-04 ~767 전용 카드(task-047 S1~S6, 시안 design/reference/m-stats.png). 768~에서는 .ll-only-narrow로 숨는다.
// 값은 statistics_cache·회차 목록을 그대로 쓰고, 결과는 번호·끝자리 순서로만 보인다(정렬·순위 없음, task-015 결정 ⑦).
// 카드 머리에 기간·표본·기준선·"미래 예측 아님" 한 줄 캡션.
import type { CSSProperties } from "react";
import { Card } from "../../components/Card";
import { Icon } from "../../components/icons";
import { readView, type Async, type Game, type ReadResult, type StatRow } from "../common/data";
import { DrawNumbers, DrawUpdated, type AnyDraw } from "../common/draw";
import type { BarDatum } from "./chart-data";

/** 카드 머리 한 줄 캡션(S5): 기간 · 표본 · 기준선 · 미래 예측 아님 */
export function StatCaption({ row, baseline }: { row: StatRow; baseline: string }) {
  return (
    <p className="ll-stats__caption ll-num">
      제 {row.range_from.toLocaleString("ko-KR")}~{row.range_to.toLocaleString("ko-KR")}회 · 표본 {row.sample_size.toLocaleString("ko-KR")}회 · 기준선 {baseline} · 미래 예측 아님
    </p>
  );
}

function CardTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      {title} <span className="ll-stats__title-sub">({sub})</span>
    </>
  );
}

/** 막대 한 칸 = --spacing × SLOT_UNITS (1 viewBox 단위 = CSS 1px) */
const SLOT_UNITS = 8;
const VB_H = 150;
const Y_AXIS_W = 24;
const TOP_PAD = 22;
const BOTTOM_PAD = 22;

/** y축 정수 눈금: 0부터 같은 간격(1·2·5×10ⁿ)으로 최대값을 덮는 4칸 이하. 마지막 눈금이 차트 위 끝. */
export function yTicks(maxValue: number): number[] {
  const top = Math.max(1, Math.ceil(maxValue));
  let step = 1;
  for (let mag = 1; ; mag *= 10) {
    const found = [1, 2, 5].map((m) => m * mag).find((c) => Math.ceil(top / c) <= 4);
    if (found !== undefined) {
      step = found;
      break;
    }
  }
  return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step);
}

/** S6 막대 차트: 1~45 번호 순서, 막대 위 "n회", 기준선(점선). 카드 안에서 가로 스크롤. */
export function NumberBarsCard({
  row,
  bars,
  baseline,
  periodLabel,
  onMore,
}: {
  row: StatRow;
  bars: BarDatum[];
  baseline: number;
  periodLabel: string;
  onMore: () => void;
}) {
  const slot = SLOT_UNITS * 4;
  const width = bars.length * slot;
  const ticks = yTicks(Math.max(baseline, ...bars.map((b) => b.value)));
  const max = ticks[ticks.length - 1]!;
  const plot = VB_H - TOP_PAD - BOTTOM_PAD;
  const y = (v: number) => TOP_PAD + plot * (1 - v / max);
  const label = `번호별 출현 횟수 막대 그래프(1~${bars.length}번 순서), ${periodLabel}. 점선은 기준선 ${baseline.toFixed(1)}회입니다.`;
  return (
    <Card
      title={<CardTitle title="번호별 출현 빈도" sub={periodLabel} />}
      className="ll-only-narrow ll-stats__m-card"
      action={
        <button type="button" className="ll-icon-button" aria-label="기간별로 보기" onClick={onMore}>
          <Icon name="chevron" />
        </button>
      }
    >
      <StatCaption row={row} baseline={`${baseline.toFixed(1)}회`} />
      <div className="ll-stats__plot">
      {/* y축 눈금(가로 스크롤해도 고정). 값은 막대 위 "n회"로 이미 읽히므로 보조 장식 */}
      <svg className="ll-stats__yaxis" viewBox={`0 0 ${Y_AXIS_W} ${VB_H}`} aria-hidden="true" focusable="false">
        {ticks.map((t) => (
          <text key={t} className="ll-stats__tick" x={Y_AXIS_W - 4} y={y(t)} textAnchor="end" dominantBaseline="middle">
            {t}
          </text>
        ))}
      </svg>
      <div className="ll-chart" tabIndex={0} role="region" aria-label="번호별 출현 횟수 그래프 영역(가로 스크롤)">
        <svg
          className="ll-stats__numbars"
          viewBox={`0 0 ${width} ${VB_H}`}
          style={{ "--chart-slots": bars.length, "--chart-slot": SLOT_UNITS } as CSSProperties}
          role="img"
          aria-label={label}
        >
          {ticks.slice(1).map((t) => (
            <line key={t} className="ll-stats__grid" x1={0} x2={width} y1={y(t)} y2={y(t)} />
          ))}
          <line className="ll-chart__axis" x1={0} x2={width} y1={y(0)} y2={y(0)} />
          {/* 기준선은 막대 뒤·"n회" 글자 아래에 깐다(글자가 선에 가리지 않게) */}
          <line className="ll-chart__baseline" x1={0} x2={width} y1={y(baseline)} y2={y(baseline)} />
          {bars.map((b, i) => {
            const x = i * slot;
            const t = y(b.value);
            return (
              <g key={b.key} data-key={b.key}>
                <rect className="ll-stats__numbar" x={x + slot * 0.2} y={t} width={slot * 0.6} height={Math.max(0, y(0) - t)} rx={3} />
                <text className="ll-chart__value" x={x + slot / 2} y={t - 5} textAnchor="middle">
                  {`${b.value}회`}
                </text>
                <text className="ll-chart__label" x={x + slot / 2} y={VB_H - 5} textAnchor="middle">
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      </div>
      {/* 그림(role=img) 안 "n회"는 보조기기에 읽히지 않으므로 같은 값을 화면에 보이지 않는 표로 둔다(번호 순서) */}
      <table className="ll-sr-only">
        <caption>{`번호별 출현 횟수 표(1~${bars.length}번 순서, ${periodLabel}, 기준선 ${baseline.toFixed(1)}회)`}</caption>
        <thead>
          <tr>
            <th scope="col">번호</th>
            <th scope="col">출현</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{b.full}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** 끝자리 d(0~9)를 가진 1~45 번호 개수: 0 → 4개(10·20·30·40), 1~5 → 5개, 6~9 → 4개 */
export function endDigitSize(d: number): number {
  return Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => n % 10 === d).length;
}

/** 번호별 출현 횟수(인덱스 = 번호−1) → 끝자리 0~9 출현 횟수 합(표시용 묶음). 기준선 = 번호당 기준선 × 해당 끝자리 번호 개수. */
export function endDigitCounts(values: readonly number[]): number[] {
  const out = new Array<number>(10).fill(0);
  values.forEach((v, i) => {
    out[(i + 1) % 10]! += v;
  });
  return out;
}

/** S3 끝자리(0~9) 출현 히트맵: 출현 횟수·기준선 숫자 병기 + 기준선 대비 강도 색(5단계). */
export function EndDigitCard({ row, bars, baseline, periodLabel }: { row: StatRow; bars: BarDatum[]; baseline: number; periodLabel: string }) {
  const counts = endDigitCounts(bars.map((b) => b.value));
  const bases = counts.map((_, d) => baseline * endDigitSize(d));
  const ratios = counts.map((c, d) => (bases[d]! > 0 ? c / bases[d]! : 0));
  const maxRatio = Math.max(1e-9, ...ratios);
  const level = (r: number) => Math.min(5, Math.max(1, Math.ceil((r / maxRatio) * 5)));
  const digits = Array.from({ length: 10 }, (_, d) => d);
  return (
    <Card title={<CardTitle title="끝자리(0~9) 출현 히트맵" sub={periodLabel} />} className="ll-only-narrow ll-stats__m-card">
      <StatCaption row={row} baseline={`끝자리 0·6~9 ${bases[0]!.toFixed(1)}회, 1~5 ${bases[1]!.toFixed(1)}회`} />
      <table className="ll-stats__digits">
        <caption className="ll-sr-only">끝자리 0~9별 출현 횟수(기준선은 위 캡션), 강도는 기준선 대비 색 단계</caption>
        <thead>
          <tr>
            <th scope="col">끝자리</th>
            {digits.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">출현</th>
            {counts.map((c, d) => (
              <td key={d}>{c}</td>
            ))}
          </tr>
          <tr aria-hidden="true">
            <th scope="row">강도</th>
            {ratios.map((r, d) => (
              <td key={d}>
                <span className="ll-heat__cell ll-stats__digit-heat" data-level={level(r)} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

/** S4 최근 10회 추첨 결과 표(회차 · 추첨일 · 당첨번호 + 보너스), 출처·검증 시각 한 줄. */
export function RecentDrawsCard({
  state,
  game,
  href,
}: {
  state: Async<ReadResult<AnyDraw[]>>;
  game: Game;
  href: string;
}) {
  // 요청 실패(failed)는 readView가 loading으로 보므로 상태를 먼저 가른다
  const view = state.status === "failed" ? ({ kind: "error" } as const) : readView(state.status === "done" ? state.value : undefined);
  const draws = view.kind === "success" ? view.data : [];
  return (
    <Card
      title={<CardTitle title="최근 추첨 결과" sub="최근 10회차" />}
      busy={view.kind === "loading"}
      className="ll-only-narrow ll-stats__m-card"
      action={
        <a className="ll-icon-button" href={href} aria-label="회차 결과 전체 보기">
          <Icon name="chevron" />
        </a>
      }
    >
      {view.kind === "loading" && <p className="ll-muted">최근 추첨 결과를 불러오는 중입니다</p>}
      {view.kind === "error" && <p className="ll-muted">최근 추첨 결과를 불러오지 못했습니다.</p>}
      {(view.kind === "empty" || (view.kind === "success" && draws.length === 0)) && (
        <p className="ll-muted">회차 결과가 아직 수집되지 않았습니다(미갱신).</p>
      )}
      {draws.length > 0 && (
        <>
          <div className="ll-stats__recent-scroll">
            <table className="ll-stats__recent" data-game={game}>
              <caption className="ll-sr-only">최근 {draws.length}회 추첨 결과(회차 내림차순)</caption>
              <thead>
                <tr>
                  <th scope="col">회차</th>
                  <th scope="col">추첨일</th>
                  <th scope="col">당첨번호 (+ 보너스)</th>
                </tr>
              </thead>
              <tbody>
                {draws.map((d) => (
                  <tr key={d.draw_no}>
                    <th scope="row" className="ll-num">
                      {d.draw_no.toLocaleString("ko-KR")}회
                    </th>
                    <td className="ll-num">{d.draw_date.replaceAll("-", ".")}</td>
                    <td>
                      <DrawNumbers draw={d} small />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DrawUpdated draw={draws[0]!} />
        </>
      )}
    </Card>
  );
}
