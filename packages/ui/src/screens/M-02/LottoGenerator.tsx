// M-02 로또 생성: 생성 방식(무작위·조건 지정), 1~45 격자에서 고정수/제외수 분리 선택(재탭 해제), 게임 수 1~50, 기기 생성(오프라인).
// 엔진 조건 오류는 대기 없이 원인·해결 방안(게임 수 줄이기·조건 해제)을 보인다. 결과는 추천 번호 — 저장하면 즐겨찾기(구매 아님).
// "통계 조건 반영" 모드·합계·연속 조건은 P1(task-013 결정 ①⑦) — 보이지 않는다.
// ~767(task-047, 시안 m-lotto.png): 앱바 · 보기 탭(번호 선택·추천 결과·분석 정보) · 9열 번호판(고른 번호 = 포함 번호) ·
// 추가 옵션(고정번호·제외번호·홀짝) · 게임 수 1/5/10/20 · 결과 표. 768~ 배치(태블릿·Windows D-02)는 그대로다.
import { LOTTO_MAX } from "@lotto-lab/design-tokens";
import { useId, useState, useSyncExternalStore } from "react";
import { AppBar } from "../../components/AppBar";
import { Ball } from "../../components/Ball";
import { BallGrid } from "../../components/BallGrid";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { StateView } from "../../components/StateView";
import {
  CountField,
  GeneratedResults,
  ProblemBox,
  RestoreNote,
  Segment,
  countOf,
  countValue,
  useGeneration,
  useRestore,
  type CountValue,
  type EngineProblem,
  type GeneratedRecord,
  type GeneratorCore,
  type LottoConfig,
  type ProblemView,
  type ResultRow,
} from "../common/generator";

export const LOTTO_FIXED_LIMIT = 6;
export const LOTTO_EXCLUDED_LIMIT = 39;
const GAME_PRESETS = [1, 5, 10, 20] as const;

/** stats가 없으면(셸에 통계 화면이 아직 없으면) 통계 링크를 숨긴다 */
export type LottoGeneratorLinks = { home: string; generate: string; stats?: string };

export type LottoGeneratorProps = {
  core: GeneratorCore;
  links: LottoGeneratorLinks;
  /** true면 지난 설정을 불러와 조건을 채운다("지난 설정으로 다시 만들기") */
  restoreLast?: boolean;
  /** "split" = Windows(D-02·D-03): 768~에서도 조건(좌)·결과(우). 기본 "stack"은 ~1199 상하·1200~ 좌우 */
  layout?: "stack" | "split";
  /** false면 공유 버튼을 숨긴다(Windows는 공유가 클립보드 복사라 "복사"와 겹친다) */
  canShare?: boolean;
};

type Mode = "random" | "condition";
type Pick = "fixed" | "excluded";
type Tab = "pick" | "result" | "info";
/** 엔진에 넘기는 조건 — odd(게임당 홀수 개수 0~6)는 ~767 홀짝 옵션에서만 붙는다(지난 설정에는 남지 않는다). */
type LottoRequestConfig = LottoConfig & { odd?: number };

const PICK_COUNT = 6;
const ODD_OPTIONS = [6, 5, 4, 3, 2, 1, 0] as const;

/** ~767 판정(구간 경계 48em). matchMedia가 없는 환경(jsdom 등)은 768~ 배치. */
const NARROW_QUERY = "(max-width: 47.99em)";
function subscribeNarrow(onChange: () => void) {
  const query = typeof window.matchMedia === "function" ? window.matchMedia(NARROW_QUERY) : null;
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}
function isNarrow() {
  return typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
}

const oddLabel = (odd: number) => `홀 ${odd} : 짝 ${PICK_COUNT - odd}`;

const INFO_CONTENT = (
  <div className="ll-gen__info">
    <p>번호는 이 기기에서 만들어집니다. 오프라인에서도 생성할 수 있습니다.</p>
    <p>번호판에서 고른 번호(고정번호)는 모든 게임에 들어가고, 제외번호는 어느 게임에도 나오지 않습니다. 한 번 더 누르면 해제됩니다.</p>
    <p>홀짝을 정하면 모든 게임의 홀수·짝수 개수가 그 비율로 맞춰집니다(고정번호 포함).</p>
    <p>
      <strong>미래 예측 아님</strong> · 추천 번호는 기기에서 만든 무작위 조합이며 당첨과 무관합니다. 저장은 즐겨찾기로만 기록되고 구매
      기록이 아닙니다.
    </p>
  </div>
);

export function LottoGenerator({ core, links, restoreLast = false, layout = "stack", canShare = true }: LottoGeneratorProps) {
  const [mode, setMode] = useState<Mode>("random");
  const [pick, setPick] = useState<Pick>("fixed");
  const [fixed, setFixed] = useState<number[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [count, setCount] = useState<CountValue>({ preset: 5 });
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const [odd, setOdd] = useState<number | null>(null);
  const [parityOpen, setParityOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("pick");
  const parityId = useId();
  const gen = useGeneration(core);
  // ~767 전용 구조는 stack 배치에서만(Windows split은 창 너비와 무관하게 그대로).
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false) && layout !== "split";

  const restore = useRestore<LottoConfig>(
    restoreLast,
    () => core.lastConfig.get("lotto"),
    (c) => {
      setMode(c.fixed.length > 0 || c.excluded.length > 0 ? "condition" : "random");
      setFixed([...c.fixed].sort((a, b) => a - b));
      setExcluded([...c.excluded].sort((a, b) => a - b));
      setCount(countValue(c.games, GAME_PRESETS));
    },
  );

  const games = countOf(count);
  // ~767은 생성 방식 선택 없이 번호판이 늘 보인다(고른 번호 = 포함 번호, 안 고르면 무작위와 같다).
  const config: LottoRequestConfig | null =
    games === null
      ? null
      : narrow
        ? { fixed, excluded, games, ...(odd === null ? {} : { odd }) }
        : mode === "random"
          ? { fixed: [], excluded: [], games }
          : { fixed, excluded, games };
  const canGenerate = config !== null && !gen.busy && restore !== "loading";

  function toggle(n: number) {
    setLimitNote(null);
    gen.clearProblem();
    const [list, setList, limit, name] =
      pick === "fixed" ? [fixed, setFixed, LOTTO_FIXED_LIMIT, "고정수"] : [excluded, setExcluded, LOTTO_EXCLUDED_LIMIT, "제외수"];
    if (list.includes(n)) {
      setList(list.filter((x) => x !== n));
      return;
    }
    if (list.length >= limit) {
      setLimitNote(`${name}는 최대 ${limit}개까지 고를 수 있어요. 다른 번호를 해제한 뒤 고르세요.`);
      return;
    }
    setList([...list, n].sort((a, b) => a - b));
  }

  function generate() {
    if (config) void gen.run({ game: "lotto", config });
  }

  function choosePick(p: Pick) {
    setPick(p);
    setLimitNote(null);
  }

  function chooseOdd(v: number | "any") {
    setOdd(v === "any" ? null : v);
    gen.clearProblem();
  }

  const problem = gen.problem
    ? lottoProblem(gen.problem, { fixed, excluded, setFixed, setExcluded, setCount, odd: narrow ? odd : null, setOdd, clear: gen.clearProblem })
    : null;
  const batch = gen.batch;
  const fixedInResult = new Set(batch?.request.game === "lotto" ? batch.request.config.fixed : []);

  return (
    <div className="ll-gen" data-game="lotto" data-layout={layout === "split" ? "split" : undefined} data-narrow={narrow || undefined}>
      {layout !== "split" && (
        <AppBar title="로또 번호 생성" backHref={links.generate} info={{ title: "로또 번호 생성", content: INFO_CONTENT }} />
      )}
      {layout !== "split" && (
        <nav className="ll-breadcrumb ll-only-wide" aria-label="현재 위치">
          <ol>
            <li>
              <a href={links.home}>홈</a>
            </li>
            <li>
              <a href={links.generate}>추천</a>
            </li>
            <li aria-current="page">로또 6/45</li>
          </ol>
        </nav>
      )}
      {layout === "split" ? (
        <Header title="로또 번호 생성" subtitle="번호는 이 기기에서 만들어집니다. 오프라인에서도 생성할 수 있습니다." />
      ) : (
        <div className="ll-only-wide ll-gen__wide-head">
          <Header title="로또 번호 생성" subtitle="번호는 이 기기에서 만들어집니다. 오프라인에서도 생성할 수 있습니다." />
        </div>
      )}

      {narrow && (
        <div className="ll-seg ll-gen__tabs" role="group" aria-label="보기">
          {(
            [
              ["pick", "번호 선택"],
              ["result", "추천 결과"],
              ["info", "분석 정보"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className="ll-seg__button" aria-pressed={tab === value} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="ll-gen__layout">
        {narrow ? (
          tab === "pick" && (
            <Card className="ll-gen__cond ll-gen__pick">
              <RestoreNote state={restore} />
              <div className="ll-gen__pick-head">
                <div>
                  <h2 className="ll-card__title">{pick === "fixed" ? "번호 선택" : "제외번호 선택"}</h2>
                  <p className="ll-muted">
                    {pick === "fixed" ? "(선택한 번호를 포함해 6개 번호를 추천합니다)" : "(고른 번호는 어느 게임에도 나오지 않습니다)"}
                  </p>
                </div>
                <span className="ll-gen__badge ll-num" aria-live="polite">
                  {pick === "fixed" ? `선택 ${fixed.length} / ${LOTTO_FIXED_LIMIT}` : `제외 ${excluded.length} / ${LOTTO_EXCLUDED_LIMIT}`}
                </span>
              </div>
              <BallGrid
                label={pick === "fixed" ? `포함할 번호 고르기(1~${LOTTO_MAX})` : `제외할 번호 고르기(1~${LOTTO_MAX})`}
                selected={[]}
                fixed={fixed}
                excluded={excluded}
                disabled={pick === "fixed" ? excluded : fixed}
                pressedWhen={pick}
                onToggle={toggle}
              />
              {limitNote && (
                <p className="ll-gen__error" role="status">
                  {limitNote}
                </p>
              )}
              {(pick === "fixed" ? fixed : excluded).length > 0 && (
                <div className="ll-gen__clear">
                  <button type="button" className="ll-link" onClick={() => (pick === "fixed" ? setFixed([]) : setExcluded([]))}>
                    {pick === "fixed" ? "고정번호 모두 해제" : "제외번호 모두 해제"}
                  </button>
                </div>
              )}

              <fieldset className="ll-field">
                <legend className="ll-field__legend">
                  추가 옵션 <span className="ll-muted">(선택)</span>
                </legend>
                <div className="ll-gen__options">
                  <button type="button" className="ll-gen__option" aria-pressed={pick === "fixed"} onClick={() => choosePick("fixed")}>
                    <Icon name="pin" />
                    고정번호 ({fixed.length})
                  </button>
                  <button type="button" className="ll-gen__option" aria-pressed={pick === "excluded"} onClick={() => choosePick("excluded")}>
                    <Icon name="ban" />
                    제외번호 ({excluded.length})
                  </button>
                  <button
                    type="button"
                    className="ll-gen__option"
                    aria-expanded={parityOpen}
                    aria-controls={parityId}
                    data-active={odd !== null || undefined}
                    onClick={() => setParityOpen((o) => !o)}
                  >
                    <SwapIcon />
                    {odd === null ? "홀짝" : `홀짝 ${odd}:${PICK_COUNT - odd}`}
                  </button>
                </div>
                {parityOpen && (
                  <div id={parityId}>
                    <Segment<number | "any">
                      legend="홀짝 비율(게임마다)"
                      name="lotto-odd"
                      value={odd ?? "any"}
                      onChange={chooseOdd}
                      options={[{ value: "any", label: "무관" }, ...ODD_OPTIONS.map((o) => ({ value: o, label: oddLabel(o) }))]}
                    />
                  </div>
                )}
              </fieldset>

              <div className="ll-gen__games">
                <CountField
                  legend="생성 게임 수"
                  name="lotto-games"
                  unit="게임"
                  presets={GAME_PRESETS}
                  value={count}
                  onChange={(v) => {
                    setCount(v);
                    gen.clearProblem();
                  }}
                />
              </div>

              {problem && <ProblemBox view={problem} />}

              <div className="ll-gen__submit">
                <Button block disabled={!canGenerate} onClick={generate}>
                  <Icon name="spark" />
                  {gen.busy ? "생성하는 중" : "추천 번호 생성"}
                </Button>
                {gen.busy && (
                  <Button variant="secondary" onClick={gen.cancel}>
                    취소
                  </Button>
                )}
              </div>
            </Card>
          )
        ) : (
          <Card title="생성 조건" className="ll-gen__cond">
            <RestoreNote state={restore} />
            <Segment<Mode>
              legend="생성 방식"
              name="lotto-mode"
              value={mode}
              onChange={(m) => {
                setMode(m);
                gen.clearProblem();
              }}
              options={[
                { value: "random", label: "무작위" },
                { value: "condition", label: "조건 지정" },
              ]}
            />

            {mode === "condition" && (
              <div className="ll-field">
                <Segment<Pick>
                  legend="번호를 누르면"
                  name="lotto-pick"
                  value={pick}
                  onChange={(p) => {
                    setPick(p);
                    setLimitNote(null);
                  }}
                  options={[
                    { value: "fixed", label: <><Icon name="pin" />고정수로 고르기</> },
                    { value: "excluded", label: <><Icon name="ban" />제외수로 고르기</> },
                  ]}
                  hint="한 번 더 누르면 해제됩니다. 고정수는 모든 게임에 들어가고, 제외수는 어느 게임에도 나오지 않습니다."
                />
                <p className="ll-gen__counts" aria-live="polite">
                  <span>
                    고정수 <strong className="ll-num">{fixed.length}</strong> / {LOTTO_FIXED_LIMIT}
                  </span>
                  <span>
                    제외수 <strong className="ll-num">{excluded.length}</strong> / {LOTTO_EXCLUDED_LIMIT}
                  </span>
                  <span className="ll-muted">
                    남은 후보 <span className="ll-num">{LOTTO_MAX - fixed.length - excluded.length}</span>개
                  </span>
                </p>
                <BallGrid
                  label={pick === "fixed" ? `고정수 고르기(1~${LOTTO_MAX})` : `제외수 고르기(1~${LOTTO_MAX})`}
                  selected={[]}
                  fixed={fixed}
                  excluded={excluded}
                  disabled={pick === "fixed" ? excluded : fixed}
                  pressedWhen={pick}
                  onToggle={toggle}
                />
                {limitNote && (
                  <p className="ll-gen__error" role="status">
                    {limitNote}
                  </p>
                )}
                <div className="ll-gen__clear">
                  <button type="button" className="ll-link" disabled={fixed.length === 0} onClick={() => setFixed([])}>
                    고정수 모두 해제
                  </button>
                  <button type="button" className="ll-link" disabled={excluded.length === 0} onClick={() => setExcluded([])}>
                    제외수 모두 해제
                  </button>
                </div>
              </div>
            )}

            <CountField
              legend="게임 수"
              name="lotto-games"
              unit="게임"
              presets={GAME_PRESETS}
              value={count}
              onChange={(v) => {
                setCount(v);
                gen.clearProblem();
              }}
            />
            <p className="ll-muted">홀짝·합계·연속 번호 같은 고급 조건은 다음 업데이트에서 제공합니다.</p>

            {problem && <ProblemBox view={problem} />}

            <div className="ll-gen__submit">
              <Button block disabled={!canGenerate} onClick={generate}>
                <Icon name="spark" />
                {gen.busy ? "생성하는 중" : "추천 번호 생성"}
              </Button>
              {gen.busy && (
                <Button variant="secondary" onClick={gen.cancel}>
                  취소
                </Button>
              )}
            </div>
          </Card>
        )}

        {narrow && tab === "info" && (
          <Card title="분석 정보" className="ll-gen__analysis">
            <dl className="ll-gen__summary-list">
              <div>
                <dt>고정번호</dt>
                <dd className="ll-num">{fixed.length > 0 ? fixed.join(", ") : "없음"}</dd>
              </div>
              <div>
                <dt>제외번호</dt>
                <dd className="ll-num">{excluded.length > 0 ? excluded.join(", ") : "없음"}</dd>
              </div>
              <div>
                <dt>홀짝</dt>
                <dd>{odd === null ? "무관" : oddLabel(odd)}</dd>
              </div>
              <div>
                <dt>남은 후보</dt>
                <dd className="ll-num">{LOTTO_MAX - fixed.length - excluded.length}개</dd>
              </div>
            </dl>
            <p className="ll-muted">번호는 이 기기에서 만든 무작위 조합입니다. 지난 회차 통계는 참고용이며 미래 예측이 아닙니다.</p>
            {links.stats && (
              <a className="ll-link" href={links.stats}>
                <Icon name="stats" />
                지난 회차 통계 보기
              </a>
            )}
          </Card>
        )}

        {/* 결과는 탭을 바꿔도 남긴다(저장 상태·멱등 키 유지) — 분석 정보 탭에서는 숨김 */}
        <div className="ll-gen__col" hidden={(narrow && tab === "info") || undefined}>
          {gen.busy && <StateView kind="loading" title="번호를 만드는 중입니다" />}
          {gen.failed && (
            <StateView
              kind="error"
              title="번호를 만들지 못했어요"
              description="잠시 후 다시 시도하세요. 조건은 그대로 남아 있습니다."
              action={<Button onClick={generate}>다시 시도</Button>}
            />
          )}
          {batch ? (
            <GeneratedResults
              key={batch.batch_id}
              core={core}
              title={`추천 번호 (${batch.records.length}게임)`}
              rows={lottoRows(batch.records, fixedInResult)}
              savable={batch.saved}
              variant="primary"
              onRegenerate={generate}
              canShare={canShare}
              regenerateDisabled={!canGenerate}
            />
          ) : (
            !gen.busy &&
            !(narrow && tab === "pick") && (
              <Card title="추천 번호">
                <StateView kind="empty" title="아직 생성한 번호가 없습니다" description="조건을 정하고 추천 번호 생성을 누르세요." />
              </Card>
            )
          )}
          {narrow && batch && (
            <p className="ll-gen__caption">
              <strong>미래 예측 아님</strong> · 당첨과 무관한 무작위 조합 · 저장 = 즐겨찾기(구매 아님)
            </p>
          )}
          {!narrow && links.stats && (
            <a className="ll-link" href={links.stats}>
              <Icon name="stats" />
              지난 회차 통계 보기
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** 홀짝 옵션 아이콘(⇄) — 공통 아이콘 세트에 없어 이 화면에만 둔다. */
function SwapIcon() {
  return (
    <svg className="ll-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function lottoRows(records: GeneratedRecord[], fixed: ReadonlySet<number>): ResultRow[] {
  return records.flatMap((r, i) => {
    if (r.game !== "lotto") return [];
    const label = `${i + 1}게임`;
    return [
      {
        id: r.id,
        label,
        text: `${label} ${r.numbers.nums.join(", ")}`,
        content: (
          <span className="ll-balls" role="list" aria-label={`${label} 번호`}>
            {r.numbers.nums.map((n) => (
              <span role="listitem" key={n}>
                <Ball number={n} state={fixed.has(n) ? "fixed" : "default"} />
              </span>
            ))}
          </span>
        ),
      },
    ];
  });
}

type ProblemContext = {
  fixed: number[];
  excluded: number[];
  setFixed: (v: number[]) => void;
  setExcluded: (v: number[]) => void;
  setCount: (v: CountValue) => void;
  /** 홀짝 조건(~767). 없으면(null·생략) 홀짝 해결 방안을 내지 않는다 */
  odd?: number | null;
  setOdd?: (v: number | null) => void;
  clear: () => void;
};

/** 엔진 hint(lotto.*) + detail → 한국어 안내와 해결 방안. */
export function lottoProblem(p: EngineProblem, ctx: ProblemContext): ProblemView {
  const fix = (label: string, apply: () => void) => ({
    label,
    apply: () => {
      apply();
      ctx.clear();
    },
  });
  const clearExcluded = ctx.excluded.length > 0 ? [fix("제외수 모두 해제", () => ctx.setExcluded([]))] : [];
  const clearFixed = ctx.fixed.length > 0 ? [fix("고정수 모두 해제", () => ctx.setFixed([]))] : [];
  const setOdd = ctx.setOdd;
  const clearOdd = ctx.odd != null && setOdd ? [fix("홀짝 조건 해제", () => setOdd(null))] : [];
  const { max, requested, pool, need, overlap } = p.detail;
  switch (p.hint) {
    case "lotto.too_few_combinations":
      return {
        title: "조건에 맞는 조합이 부족해요",
        description: `고정수 ${ctx.fixed.length}개·제외수 ${ctx.excluded.length}개${ctx.odd != null ? `·${oddLabel(ctx.odd)}` : ""}로는 서로 다른 조합을 최대 ${max}게임까지 만들 수 있어요(요청 ${requested}게임). 게임 수를 줄이거나 조건을 풀어 주세요.`,
        fixes: [
          ...(typeof max === "number" && max >= 1 && (typeof requested !== "number" || max < requested) ? [fix(`게임 수를 ${max}게임으로 줄이기`, () => ctx.setCount(countValue(max, GAME_PRESETS)))] : []),
          ...clearOdd,
          ...clearExcluded,
          ...clearFixed,
        ],
      };
    case "lotto.parity": {
      const { odd, fixed_odd: fixedOdd, fixed_even: fixedEven, pool_odd: poolOdd, pool_even: poolEven } = p.detail;
      return {
        title: "홀짝 비율을 맞출 수 없어요",
        description: `고정번호(홀수 ${fixedOdd}개·짝수 ${fixedEven}개)와 남은 후보(홀수 ${poolOdd}개·짝수 ${poolEven}개)로는 ${typeof odd === "number" ? oddLabel(odd) : "고른 홀짝 비율"}을 만들 수 없어요. 홀짝 비율을 바꾸거나 고른 번호를 줄여 주세요.`,
        fixes: [...clearOdd, ...clearFixed, ...clearExcluded],
      };
    }
    case "lotto.odd":
      return { title: "홀짝 비율을 확인해 주세요", description: "홀수 개수는 0~6개 사이로 정해 주세요.", fixes: clearOdd };
    case "lotto.not_enough_pool":
      return {
        title: "남은 후보 번호가 부족해요",
        description: `남은 후보 ${pool}개로는 필요한 ${need}개를 고를 수 없어요. 제외수를 줄여 주세요.`,
        fixes: clearExcluded,
      };
    case "lotto.fixed_excluded_overlap":
      return {
        title: "고정수와 제외수가 겹쳐요",
        description: `같은 번호 ${overlap}개가 고정수와 제외수에 함께 들어 있어요. 겹친 번호를 한쪽에서 빼 주세요.`,
        fixes: [fix("겹친 번호를 제외수에서 빼기", () => ctx.setExcluded(ctx.excluded.filter((n) => !ctx.fixed.includes(n))))],
      };
    case "lotto.games":
      return { title: "게임 수를 확인해 주세요", description: "게임 수는 1~50 사이로 정해 주세요.", fixes: [fix("5게임으로 바꾸기", () => ctx.setCount({ preset: 5 }))] };
    case "lotto.fixed":
    case "lotto.excluded":
      return {
        title: "고른 번호를 확인해 주세요",
        description: `고정수는 최대 ${LOTTO_FIXED_LIMIT}개, 제외수는 최대 ${LOTTO_EXCLUDED_LIMIT}개까지 1~45에서 고를 수 있어요.`,
        fixes: [...clearFixed, ...clearExcluded],
      };
    default:
      return {
        title: "이 조건으로는 번호를 만들 수 없어요",
        description: "조건을 줄인 뒤 다시 생성하세요.",
        fixes: [...clearFixed, ...clearExcluded],
      };
  }
}
