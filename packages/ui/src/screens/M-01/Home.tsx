// M-01 홈(대시보드): 히어로 → 최신 회차(출처·검증 시각) → 로또·연금 진입 → 이번 주 통계 요약(최근 10회, 미래 예측 아님)
// → 번호 생성 CTA·1게임 빠른 생성 → 내 기록 요약(저장·구매등록·확인대기). 알림·설정·로그인은 P1이라 비활성.
// 읽기 실패는 마지막 정상본·출처·검증 시각을 유지하고 배너·다시 시도로 알린다(R6). 광고 슬롯(P1)은 두지 않는다.
import { useState, type ReactNode } from "react";
import { Ball } from "../../components/Ball";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { Stat } from "../../components/Stat";
import { StateView } from "../../components/StateView";
import { Updated } from "../../components/Updated";
import { ReadBanner } from "../common/ReadBanner";
import {
  GAME_NAME,
  formatDrawDate,
  formatFraction,
  readView,
  sourceHost,
  topIndexes,
  useAsync,
  type Async,
  type Game,
  type Generated,
  type LottoDraw,
  type PensionDraw,
  type ReadResult,
  type ReadView,
  type ScreenCore,
  type StatRow,
  type Ticket,
} from "../common/data";

/**
 * lottoLast·pensionLast = 지난 설정을 복원해 여는 생성기 주소. register(선택) = 구매 등록 — 있으면 기록 없음 안내에 함께 보인다.
 * stats·tickets가 없으면(셸에 그 화면이 아직 없으면) 해당 링크를 숨긴다.
 */
export type HomeLinks = {
  generate: string;
  lotto: string;
  pension: string;
  lottoLast: string;
  pensionLast: string;
  stats?: string;
  tickets?: string;
  settings: string;
  register?: string;
  /** 회차 목록(선택) — 있으면 ~767 최신 회차 줄 끝에 › 링크 */
  draws?: string;
};

export type HomeProps = {
  core: ScreenCore;
  /** 셸 라우트 주소(해시 등) */
  links: HomeLinks;
  /** 화면 제목(기본 "홈", Windows D-01은 "대시보드") */
  title?: string;
  /** 좌측 열 아래에 덧붙일 블록(Windows D-01: 지난 회차 결과) */
  leftExtra?: ReactNode;
};

type Draws = { lotto: ReadResult<LottoDraw>; pension: ReadResult<PensionDraw> };
type Stats = { lotto: ReadResult<StatRow>; pension: ReadResult<StatRow> };
type Records = { tickets: Ticket[]; last: Generated | undefined };

export function Home({ core, links, title = "홈", leftExtra }: HomeProps) {
  const [draws, reloadDraws] = useAsync<Draws>(async (force) => {
    const [lotto, pension] = await Promise.all([
      core.reader.latestDraw("lotto", { force }),
      core.reader.latestDraw("pension", { force }),
    ]);
    return { lotto, pension };
  });
  const [stats, reloadStats] = useAsync<Stats>(async (force) => {
    const [lotto, pension] = await Promise.all([
      core.reader.statistics("lotto", "last10", "lotto.number_freq", { force }),
      core.reader.statistics("pension", "last10", "pension.group_freq", { force }),
    ]);
    return { lotto, pension };
  });
  const [records, reloadRecords] = useAsync<Records>(async () => {
    const [tickets, history] = await Promise.all([core.tickets.list(), core.generator.history()]);
    return { tickets, last: history[0] };
  });

  const drawResults = draws.status === "done" ? draws.value : undefined;
  const statResults = stats.status === "done" ? stats.value : undefined;
  const retryAll = () => {
    reloadDraws(true);
    reloadStats(true);
  };
  const lottoView = readView(drawResults?.lotto);
  const latestNo: Partial<Record<Game, number>> = {};
  if (drawResults?.lotto.data) latestNo.lotto = drawResults.lotto.data.draw_no;
  if (drawResults?.pension.data) latestNo.pension = drawResults.pension.data.draw_no;

  return (
    <div className="ll-home">
      <Header
        title={
          <>
            {/* ~767 머리글 워드마크(task-047 H1, 자체 워드마크 — 공식 로고 모방 금지). 768~에서는 숨고 제목이 보인다 */}
            <span className="ll-home__brand" aria-hidden="true">
              <Icon name="bars" />
              <span className="ll-home__brand-ko">로또랩</span>
              <span className="ll-home__brand-en">LOTTO LAB</span>
            </span>
            <span className="ll-home__title">{title}</span>
          </>
        }
        actions={
          <>
            <button type="button" className="ll-icon-button" disabled aria-label="알림 (준비 중)" title="알림은 준비 중입니다">
              <Icon name="bell" />
            </button>
            <a className="ll-icon-button ll-home__settings" href={links.settings} aria-label="설정">
              <Icon name="gear" />
              <span className="ll-home__avatar">
                <Icon name="user" />
              </span>
            </a>
          </>
        }
      />

      <section className="ll-hero" aria-labelledby="ll-hero-title">
        <div>
          <span className="ll-hero__tag">
            데이터로 살펴보는 번호
            {lottoView.kind === "success" && ` · 제 ${lottoView.data.draw_no.toLocaleString("ko-KR")}회 기준`}
          </span>
          <h2 id="ll-hero-title" className="ll-hero__title">
            오늘도 나만의 번호를
            <br />
            찾아보세요!
          </h2>
          <p className="ll-hero__desc">지난 회차 데이터를 살펴보고, 원하는 조건으로 로또와 연금복권 번호 조합을 만들어 보세요.</p>
        </div>
        <div className="ll-hero__art" aria-hidden="true">
          <span className="ll-deco" data-game="pension">45</span>
          <span className="ll-deco">6</span>
          <span className="ll-hero__crown">
            <Icon name="crown" />
          </span>
        </div>
      </section>

      <ReadBanner
        results={[drawResults?.lotto, drawResults?.pension, statResults?.lotto, statResults?.pension]}
        action={
          <Button variant="secondary" onClick={retryAll}>
            다시 시도
          </Button>
        }
      />

      <div className="ll-home__grid">
        <div className="ll-home__col">
          <LatestDrawCard
            lotto={drawResults?.lotto}
            pension={drawResults?.pension}
            drawsHref={links.draws}
            onRetry={() => reloadDraws(true)}
            onOpenSource={(url) => void core.adapters.openExternal.open(url)}
          />
          <nav className="ll-products" aria-label="복권 선택">
            <a className="ll-product" href={links.lotto}>
              <span className="ll-product__title">로또 6/45</span>
              <span className="ll-product__desc">번호 생성 · 조건 설정</span>
              <Icon name="arrow" />
              <span className="ll-product__art" aria-hidden="true">
                <span className="ll-deco">6</span>
                <span className="ll-deco" data-size="small">45</span>
              </span>
            </a>
            <a className="ll-product" data-game="pension" href={links.pension}>
              <span className="ll-product__title">연금복권 720+</span>
              <span className="ll-product__desc">조 · 여섯 자리 번호 생성</span>
              <Icon name="arrow" />
              <span className="ll-product__art" aria-hidden="true">
                <span className="ll-coins">
                  <i />
                  <i />
                  <i />
                </span>
                <Icon name="calendar" />
              </span>
            </a>
          </nav>
          {leftExtra}
        </div>

        <div className="ll-home__col">
          <SummaryCard lotto={statResults?.lotto} pension={statResults?.pension} statsHref={links.stats} onRetry={() => reloadStats(true)} />
          <a className="ll-cta" href={links.generate}>
            <Icon name="spark" />
            번호 생성하기
          </a>
          <QuickGenerate core={core} onGenerated={() => reloadRecords()} />
          <RecordsCard state={records} latest={latestNo} links={links} onRetry={() => reloadRecords()} />
        </div>
      </div>
    </div>
  );
}

function SkeletonBalls({ count }: { count: number }) {
  return (
    <span className="ll-balls" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="ll-skeleton ll-skeleton--ball" />
      ))}
    </span>
  );
}

function LatestDrawCard({
  lotto,
  pension,
  drawsHref,
  onRetry,
  onOpenSource,
}: {
  lotto: ReadResult<LottoDraw> | undefined;
  pension: ReadResult<PensionDraw> | undefined;
  drawsHref: string | undefined;
  onRetry: () => void;
  onOpenSource: (url: string) => void;
}) {
  const lv = readView(lotto);
  const pv = readView(pension);
  const loading = lv.kind === "loading";
  return (
    <Card title="최신 회차" busy={loading} className="ll-latest">
      {loading && <p role="status" className="ll-sr-only">회차 정보를 불러오는 중입니다</p>}
      {lv.kind === "error" && pv.kind === "error" ? (
        <StateView
          kind="error"
          title="회차 정보를 불러오지 못했습니다"
          description="네트워크 연결을 확인한 뒤 다시 시도해 주세요."
          action={<Button onClick={onRetry}>다시 시도</Button>}
        />
      ) : (
        <>
          <section className="ll-draw" aria-label="로또 6/45 최신 회차">
            <div className="ll-draw__head">
              <strong>로또 6/45</strong>
              {lv.kind === "success" && (
                <>
                  <span className="ll-num">제 {lv.data.draw_no.toLocaleString("ko-KR")}회</span>
                  <span className="ll-draw__date">{formatDrawDate(lv.data.draw_date)}</span>
                </>
              )}
            </div>
            {lv.kind === "loading" && <SkeletonBalls count={7} />}
            {lv.kind === "success" && (
              <>
                {/* ll-draw__line: 768~ display:contents(배치 그대로), ~767 공 한 줄 + › */}
                <div className="ll-draw__line">
                  <span className="ll-balls" role="list" aria-label="당첨 번호">
                    {lv.data.nums.map((n) => (
                      <span role="listitem" key={n}>
                        <Ball number={n} />
                      </span>
                    ))}
                    <span role="listitem">
                      <Ball number={lv.data.bonus} state="bonus" />
                    </span>
                  </span>
                  {drawsHref && (
                    <a className="ll-icon-button ll-draw__more" href={drawsHref} aria-label="로또 회차 결과 더 보기">
                      <Icon name="chevron" />
                    </a>
                  )}
                </div>
                <DrawSource url={lv.data.source_url} verifiedAt={lv.data.source_verified_at} onOpen={onOpenSource} />
              </>
            )}
            {lv.kind === "empty" && <p className="ll-muted">로또 회차 정보가 아직 수집되지 않았습니다(미갱신).</p>}
            {lv.kind === "error" && <p className="ll-muted">로또 회차 정보를 불러오지 못했습니다.</p>}
          </section>

          <section className="ll-draw ll-draw--pension" aria-label="연금복권 720+ 최신 회차">
            <div className="ll-draw__head">
              <strong>연금복권 720+</strong>
              {pv.kind === "success" && (
                <>
                  <span className="ll-num">제 {pv.data.draw_no.toLocaleString("ko-KR")}회</span>
                  <span className="ll-draw__date">{formatDrawDate(pv.data.draw_date)}</span>
                </>
              )}
            </div>
            {pv.kind === "loading" && <span className="ll-skeleton ll-skeleton--line" aria-hidden="true" />}
            {pv.kind === "success" && (
              <>
                <p className="ll-pension-line">
                  <span className="ll-chip" data-game="pension">
                    {pv.data.group_no}조
                  </span>
                  <span className="ll-mono">{pv.data.digits}</span>
                  <span className="ll-muted">보너스</span>
                  <span className="ll-mono">{pv.data.bonus_digits}</span>
                </p>
                <DrawSource url={pv.data.source_url} verifiedAt={pv.data.source_verified_at} onOpen={onOpenSource} />
              </>
            )}
            {pv.kind === "empty" && <p className="ll-muted">연금복권 회차 정보가 아직 수집되지 않았습니다(미갱신).</p>}
            {pv.kind === "error" && <p className="ll-muted">연금복권 회차 정보를 불러오지 못했습니다.</p>}
          </section>
          <MergedSource
            draws={[lv.kind === "success" ? lv.data : null, pv.kind === "success" ? pv.data : null]}
            onOpen={onOpenSource}
          />
          {(lv.kind === "error" || pv.kind === "error") && (
            <Button variant="secondary" onClick={onRetry}>
              다시 시도
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * ~767 전용(task-047 H3): 로또·연금 출처·검증 시각을 카드 맨 아래 한 줄로 합친다(768~에서는 숨고 회차별 DrawSource가 보인다).
 * 출처 호스트는 중복 없이, 검증 시각은 둘 중 오래된 쪽(보수적으로), 공식 결과 링크는 로또 우선.
 */
function MergedSource({
  draws,
  onOpen,
}: {
  draws: (Pick<LottoDraw, "source_url" | "source_verified_at"> | null)[];
  onOpen: (url: string) => void;
}) {
  const list = draws.filter((d): d is NonNullable<typeof d> => d !== null);
  const first = list[0];
  if (!first) return null;
  const hosts = [...new Set(list.map((d) => sourceHost(d.source_url)))].join(" · ");
  const oldest = list.map((d) => new Date(d.source_verified_at)).reduce((a, b) => (b < a ? b : a));
  return (
    <p className="ll-latest__source">
      <span>
        출처 {hosts} 공개 결과 · 검증 <time dateTime={oldest.toISOString()}>{KST.format(oldest)}</time>
      </span>
      <button type="button" className="ll-link" onClick={() => onOpen(first.source_url)}>
        공식 결과 보기
      </button>
    </p>
  );
}

function DrawSource({ url, verifiedAt, onOpen }: { url: string; verifiedAt: string; onOpen: (url: string) => void }) {
  return (
    <div className="ll-draw__source">
      <Updated source={`${sourceHost(url)} 공개 결과`} verifiedAt={verifiedAt} />
      <button type="button" className="ll-link" onClick={() => onOpen(url)}>
        공식 결과 보기
      </button>
    </div>
  );
}

function SummaryCard({
  lotto,
  pension,
  statsHref,
  onRetry,
}: {
  lotto: ReadResult<StatRow> | undefined;
  pension: ReadResult<StatRow> | undefined;
  statsHref: string | undefined;
  onRetry: () => void;
}) {
  const lv = readView(lotto);
  const pv = readView(pension);
  const range = lv.kind === "success" ? lv.data : pv.kind === "success" ? pv.data : null;
  return (
    <Card
      title="이번 주 통계 요약"
      busy={lv.kind === "loading" || pv.kind === "loading"}
      action={
        <span className="ll-muted ll-num">
          {range ? `요약 기간 제 ${range.range_from}~${range.range_to}회 (최근 10회)` : "요약 기간 최근 10회"}
        </span>
      }
    >
      <div className="ll-summary">
        <SummaryBlock game="lotto" view={lv} onRetry={onRetry} />
        <SummaryBlock game="pension" view={pv} onRetry={onRetry} />
        <p className="ll-summary__note">
          <strong>미래 예측 아님</strong> · 지난 회차 출현 횟수 요약입니다. 기준선은 모든 번호가 고르게 나올 때의 기대 횟수입니다. 동률은 작은
          번호부터 표시합니다.
        </p>
        {/* ~767 전용 한 줄 고지(긴 note는 ~767에서 숨김, 768~에서는 이 줄이 숨는다) */}
        <p className="ll-summary__caption">미래 예측 아님 · 기준선 = 고르게 나올 때 기대 횟수</p>
        {statsHref && (
          <a className="ll-link" href={statsHref}>
            통계 자세히 보기
          </a>
        )}
      </div>
    </Card>
  );
}

const SUMMARY_TEXT = {
  lotto: { title: "로또 번호별 출현 횟수", short: "로또", top: 5, unit: "번호 5개", icon: "stats" },
  pension: { title: "연금복권 조별 출현 횟수", short: "연금", top: 2, unit: "조", icon: "layers" },
} as const;

/** 복권별 요약 블록: 로딩·오류(재시도)·미갱신·기준선 확인 불가·성공을 블록 안에서 각각 보인다. */
function SummaryBlock({ game, view, onRetry }: { game: Game; view: ReadView<StatRow>; onRetry: () => void }) {
  const t = SUMMARY_TEXT[game];
  const head = (
    <span className="ll-summary__tile" data-game={game === "pension" ? "pension" : undefined} aria-hidden="true">
      <Icon name={t.icon} />
    </span>
  );
  if (view.kind === "loading") {
    return (
      <div className="ll-summary__row" aria-busy="true">
        {head}
        <span>
          <strong>{t.title}</strong>
          <span role="status" className="ll-muted">
            {t.short} 통계를 불러오는 중입니다
          </span>
        </span>
        <span className="ll-skeleton ll-skeleton--line" aria-hidden="true" />
      </div>
    );
  }
  if (view.kind !== "success") {
    return (
      <div className="ll-summary__row">
        {head}
        <span>
          <strong>{t.title}</strong>
          <span className="ll-muted" role={view.kind === "error" ? "alert" : undefined}>
            {view.kind === "error" ? `${t.short} 통계를 불러오지 못했습니다.` : `${t.short} 통계가 아직 집계되지 않았습니다(미갱신).`}
          </span>
        </span>
        {view.kind === "error" ? (
          <Button variant="secondary" onClick={onRetry}>
            다시 시도
          </Button>
        ) : (
          <span />
        )}
      </div>
    );
  }
  const row = view.data;
  const baseline = baselineOf(row);
  if (!baseline) {
    // 기준선 없는 수치는 노출하지 않는다(AGENTS 4장 — 통계는 기준선과 함께).
    return (
      <div className="ll-summary__row">
        {head}
        <span>
          <strong>{t.title}</strong>
          <span className="ll-muted">기준선을 확인할 수 없어 표시하지 않아요.</span>
        </span>
        <span />
      </div>
    );
  }
  const top = topIndexes(numberValues(row), t.top);
  return (
    <div className="ll-summary__block">
      <div className="ll-summary__row">
        {head}
        <span>
          <strong>{t.title}</strong>
          <span className="ll-muted">
            최근 {row.sample_size}회 중 출현 횟수가 많은 {t.unit} · 기준선 {formatFraction(baseline)}회
          </span>
        </span>
        {game === "lotto" ? (
          <span className="ll-balls ll-balls--small" role="list" aria-label="출현 횟수가 많은 번호">
            {top.map((n) => (
              <span role="listitem" key={n}>
                <Ball number={n} />
              </span>
            ))}
          </span>
        ) : (
          <span className="ll-chips" role="list" aria-label="출현 횟수가 많은 조">
            {top.map((g) => (
              <span role="listitem" key={g} className="ll-chip" data-game="pension">
                {g}조
              </span>
            ))}
          </span>
        )}
      </div>
      <Updated
        source={row.source}
        verifiedAt={row.updated_at}
        basis={`${t.short} 제 ${row.range_from}~${row.range_to}회 · 표본 ${row.sample_size}회`}
        notPrediction={game === "lotto"}
      />
    </div>
  );
}

/** number_freq·group_freq는 values = 1차원 횟수 배열, baseline = 분수 1개(task-015 정본). */
function numberValues(row: StatRow): number[] {
  return row.payload.values.filter((v): v is number => typeof v === "number");
}
type Fraction = { num: number; den: number };
/** 기준선(정수 분수 1개, den > 0). 형식이 다르면 null — 요약을 숨긴다. */
function baselineOf(row: StatRow): Fraction | null {
  const b = row.payload.baseline as Partial<Fraction> | null;
  if (typeof b !== "object" || b === null || Array.isArray(b)) return null;
  const { num, den } = b;
  return Number.isInteger(num) && Number.isInteger(den) && (den as number) > 0 && (num as number) >= 0 ? { num: num!, den: den! } : null;
}

function QuickGenerate({ core, onGenerated }: { core: ScreenCore; onGenerated: () => void }) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "done"; nums: number[]; saved: boolean } | { kind: "failed" }
  >({ kind: "idle" });

  async function run() {
    setState({ kind: "busy" });
    try {
      const result = await core.generator.generate({ game: "lotto", config: { fixed: [], excluded: [], games: 1 } });
      const first = result.records[0];
      setState(first && first.game === "lotto" ? { kind: "done", nums: first.numbers.nums, saved: result.saved } : { kind: "failed" });
      if (result.saved) onGenerated();
    } catch {
      setState({ kind: "failed" });
    }
  }

  return (
    <div className="ll-quick">
      <Button variant="secondary" block onClick={run} disabled={state.kind === "busy"}>
        {state.kind === "busy" ? "생성하는 중" : "로또 1게임 빠른 생성"}
      </Button>
      {state.kind === "done" && (
        <div className="ll-quick__result" role="status">
          <span className="ll-balls" role="list" aria-label="생성한 번호">
            {state.nums.map((n) => (
              <span role="listitem" key={n}>
                <Ball number={n} />
              </span>
            ))}
          </span>
          <p className="ll-muted">
            조건 없이 기기에서 만든 조합이며 당첨을 보장하지 않습니다. 추천 번호는 저장 번호·구매 기록이 아닙니다.
            {state.saved ? " 생성 이력에 남겼습니다." : " 생성 이력 저장에 실패했습니다."}
          </p>
        </div>
      )}
      {state.kind === "failed" && (
        <p className="ll-muted" role="alert">
          번호를 만들지 못했습니다. 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}

/**
 * 추첨 대기 = 구매 등록했지만 아직 결과를 대조할 수 없는 번호(회차 미입력, 또는 추첨 전 회차).
 * 최신 회차를 모르면(미수집·오류) 회차가 있어도 대기로 센다.
 */
function pendingCount(tickets: Ticket[], latest: Partial<Record<Game, number>>): number {
  return tickets.filter((t) => {
    if (t.purchase_status !== "purchased") return false;
    const drawn = latest[t.game];
    return t.round === null || drawn === undefined || t.round > drawn;
  }).length;
}

function RecordsCard({
  state,
  latest,
  links,
  onRetry,
}: {
  state: Async<Records>;
  latest: Partial<Record<Game, number>>;
  links: HomeLinks;
  onRetry: () => void;
}) {
  return (
    <Card title="내 기록" headingLevel={2} busy={state.status === "loading"} action={links.tickets && <a className="ll-link" href={links.tickets}>내 번호 보기</a>}>
      {state.status === "loading" && <p role="status" className="ll-muted">내 기록을 불러오는 중입니다</p>}
      {state.status === "failed" && (
        <StateView kind="error" title="내 기록을 읽지 못했습니다" description="기기 저장소를 읽지 못했습니다." action={<Button onClick={onRetry}>다시 시도</Button>} />
      )}
      {state.status === "done" && <RecordsBody records={state.value} latest={latest} links={links} />}
    </Card>
  );
}

function RecordsBody({ records, latest, links }: { records: Records; latest: Partial<Record<Game, number>>; links: HomeLinks }) {
  const { tickets, last } = records;
  const reuse = last ? (last.game === "lotto" ? links.lottoLast : links.pensionLast) : null;
  const generateLink = (
    <a className="ll-button" data-variant="primary" href={links.generate}>
      번호 생성하기
    </a>
  );
  return (
    <>
      {tickets.length === 0 ? (
        <StateView
          kind="empty"
          title="아직 저장한 번호가 없습니다"
          description="번호를 생성한 뒤 마음에 드는 조합을 저장해 보세요."
          action={
            links.register ? (
              <div className="ll-gen__actions">
                {generateLink}
                <a className="ll-button" data-variant="secondary" href={links.register}>
                  구매 등록하기
                </a>
              </div>
            ) : (
              generateLink
            )
          }
        />
      ) : (
        <RecordStats tickets={tickets} latest={latest} />
      )}
      {reuse ? (
        <a className="ll-button" data-variant="secondary" data-block="true" href={reuse}>
          지난 설정으로 다시 만들기 ({GAME_NAME[last!.game]})
        </a>
      ) : (
        <p className="ll-muted">생성 기록이 생기면 지난 설정으로 바로 다시 만들 수 있습니다.</p>
      )}
    </>
  );
}

function RecordStats({ tickets, latest }: { tickets: Ticket[]; latest: Partial<Record<Game, number>> }) {
  const purchased = tickets.filter((t) => t.purchase_status === "purchased").length;
  return (
    <div className="ll-records">
      <Stat label="저장한 번호" value={tickets.length} />
      <Stat label="구매 등록" value={purchased} />
      <Stat label="추첨 대기" value={pendingCount(tickets, latest)} hint="구매 등록 중 회차 미입력·추첨 전" />
    </div>
  );
}
