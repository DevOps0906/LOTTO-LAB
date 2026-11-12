// M-03 연금복권 생성: 생성 방식(낱장·선택 조·5조 세트)과 조 1~5, 십만~일 자리별 숫자(비우면 자동), 기본 번호 수 1~50.
// 기본 번호 1개를 고른 조마다 발급한다 — 총 장수 = 기본 번호 수 × 조 수(task-014 결정 ②③). "조 자동"은 P1.
// 번호는 처음부터 끝까지 문자열(앞자리 0 보존, `1조 000719`) — 숫자 입력 필드(type=number)를 쓰지 않는다.
import { useState } from "react";
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
  type PensionConfig,
  type ProblemView,
  type ResultRow,
} from "../common/generator";

const GROUPS = [1, 2, 3, 4, 5] as const;
const BASE_PRESETS = [1, 5, 10] as const;
export const DIGIT_LABELS = ["십만", "만", "천", "백", "십", "일"] as const;

/** stats가 없으면(셸에 통계 화면이 아직 없으면) 통계 링크를 숨긴다 */
export type PensionGeneratorLinks = { home: string; generate: string; stats?: string };

export type PensionGeneratorProps = {
  core: GeneratorCore;
  links: PensionGeneratorLinks;
  /** true면 지난 설정을 불러와 조건을 채운다("지난 설정으로 다시 만들기") */
  restoreLast?: boolean;
  /** "split" = Windows(D-02·D-03): 768~에서도 조건(좌)·결과(우). 기본 "stack"은 ~1199 상하·1200~ 좌우 */
  layout?: "stack" | "split";
  /** false면 공유 버튼을 숨긴다(Windows는 공유가 클립보드 복사라 "복사"와 겹친다) */
  canShare?: boolean;
};

type Kind = "single" | "select" | "set";
const AUTO: (string | null)[] = [null, null, null, null, null, null];

function kindOf(groups: readonly number[]): Kind {
  if (groups.length === GROUPS.length) return "set";
  return groups.length === 1 ? "single" : "select";
}

export function PensionGenerator({ core, links, restoreLast = false, layout = "stack", canShare = true }: PensionGeneratorProps) {
  const [kind, setKind] = useState<Kind>("single");
  const [groups, setGroups] = useState<number[]>([1]);
  const [positions, setPositions] = useState<(string | null)[]>(AUTO);
  const [count, setCount] = useState<CountValue>({ preset: 1 });
  const gen = useGeneration(core);

  const restore = useRestore<PensionConfig>(
    restoreLast,
    () => core.lastConfig.get("pension"),
    (c) => {
      setKind(kindOf(c.groups));
      setGroups([...c.groups].sort((a, b) => a - b));
      setPositions([...c.positions]);
      setCount(countValue(c.games, BASE_PRESETS));
    },
  );

  const bases = countOf(count);
  const config: PensionConfig | null = bases === null || groups.length === 0 ? null : { groups, positions, games: bases };
  const canGenerate = config !== null && !gen.busy && restore !== "loading";
  const autoCount = positions.filter((p) => p === null).length;

  function changeKind(next: Kind) {
    setKind(next);
    gen.clearProblem();
    if (next === "set") setGroups([...GROUPS]);
    else if (next === "single") setGroups([groups[0] ?? 1]);
    else if (groups.length === GROUPS.length) setGroups([groups[0] ?? 1]);
  }

  function toggleGroup(g: number) {
    gen.clearProblem();
    if (kind === "single") setGroups([g]);
    else if (kind === "select") setGroups(groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g].sort((a, b) => a - b));
  }

  function setDigit(i: number, raw: string) {
    gen.clearProblem();
    const digit = raw.replace(/[^0-9]/g, "").slice(-1);
    setPositions(positions.map((p, j) => (j === i ? digit || null : p)));
  }

  function generate() {
    if (config) void gen.run({ game: "pension", config });
  }

  const problem = gen.problem
    ? pensionProblem(gen.problem, { autoCount, setCount, setAllAuto: () => setPositions(AUTO), regenerate: generate, clear: gen.clearProblem })
    : null;
  const batch = gen.batch;
  const batchGroups = batch?.request.game === "pension" ? batch.request.config.groups.length : 0;
  const cta = kind === "set" ? "세트 생성" : "번호 생성";

  return (
    <div className="ll-gen" data-game="pension" data-layout={layout === "split" ? "split" : undefined}>
      {layout !== "split" && (
        <nav className="ll-breadcrumb" aria-label="현재 위치">
          <ol>
            <li>
              <a href={links.home}>홈</a>
            </li>
            <li>
              <a href={links.generate}>추천</a>
            </li>
            <li aria-current="page">연금복권 720+</li>
          </ol>
        </nav>
      )}
      <Header title="연금복권 번호 생성" subtitle="번호는 이 기기에서 만들어집니다. 오프라인에서도 생성할 수 있습니다." />

      <div className="ll-gen__layout">
        <Card title="생성 조건" className="ll-gen__cond">
          <RestoreNote state={restore} />
          <Segment<Kind>
            legend="생성 방식"
            name="pension-kind"
            value={kind}
            onChange={changeKind}
            options={[
              { value: "single", label: "낱장(조 1개)" },
              { value: "select", label: "선택 조" },
              { value: "set", label: "5조 세트" },
            ]}
            hint="같은 여섯 자리 번호를 고른 조마다 1장씩 만듭니다."
          />

          <fieldset className="ll-field">
            <legend className="ll-field__legend">조 선택</legend>
            <p className="ll-muted ll-field__hint">
              {kind === "single" ? "1개를 고르세요." : kind === "select" ? "여러 조를 고를 수 있어요." : "5조 세트는 1~5조를 모두 씁니다."}
            </p>
            <div className="ll-seg ll-groups">
              {GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className="ll-seg__button"
                  aria-pressed={groups.includes(g)}
                  disabled={kind === "set"}
                  onClick={() => toggleGroup(g)}
                >
                  {g}조
                </button>
              ))}
            </div>
            {groups.length === 0 && (
              <p className="ll-gen__error" role="status">
                조를 1개 이상 고르세요.
              </p>
            )}
          </fieldset>

          <fieldset className="ll-field">
            <legend className="ll-field__legend">번호 설정(6자리)</legend>
            <p className="ll-muted ll-field__hint">자리마다 0~9를 넣거나 비워 두면 자동(무작위)입니다.</p>
            <div className="ll-digits">
              {DIGIT_LABELS.map((label, i) => (
                <label key={label} className="ll-digit">
                  <span className="ll-digit__label">{label}</span>
                  <input
                    className="ll-input ll-mono"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={1}
                    placeholder="자동"
                    aria-label={`${label} 자리`}
                    value={positions[i] ?? ""}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              ))}
            </div>
            <button type="button" className="ll-link" disabled={autoCount === positions.length} onClick={() => setPositions(AUTO)}>
              모든 자리 자동으로
            </button>
          </fieldset>

          <CountField
            legend="기본 번호 수"
            name="pension-bases"
            unit="개"
            presets={BASE_PRESETS}
            value={count}
            onChange={(v) => {
              setCount(v);
              gen.clearProblem();
            }}
            hint="서로 다른 여섯 자리 번호의 개수입니다."
          />
          <p className="ll-gen__summary" aria-live="polite">
            {bases === null || groups.length === 0 ? (
              "기본 번호 수와 조를 정하면 총 장수가 보입니다."
            ) : (
              <>
                기본 번호 <strong className="ll-num">{bases}</strong>개 × 조 <strong className="ll-num">{groups.length}</strong>개 = 총{" "}
                <strong className="ll-num">{bases * groups.length}</strong>장
              </>
            )}
          </p>

          {problem && <ProblemBox view={problem} />}

          <div className="ll-gen__submit">
            <Button variant="pension" block disabled={!canGenerate} onClick={generate}>
              <Icon name="spark" />
              {gen.busy ? "생성하는 중" : cta}
            </Button>
            {gen.busy && (
              <Button variant="secondary" onClick={gen.cancel}>
                취소
              </Button>
            )}
          </div>
        </Card>

        <div className="ll-gen__col">
          {gen.busy && <StateView kind="loading" title="번호를 만드는 중입니다" />}
          {gen.failed && (
            <StateView
              kind="error"
              title="번호를 만들지 못했어요"
              description="잠시 후 다시 시도하세요. 조건은 그대로 남아 있습니다."
              action={<Button variant="pension" onClick={generate}>다시 시도</Button>}
            />
          )}
          {batch ? (
            <GeneratedResults
              key={batch.batch_id}
              core={core}
              title={batchGroups === GROUPS.length ? `추천 번호 (5조 세트 · 총 ${batch.records.length}장)` : `추천 번호 (총 ${batch.records.length}장)`}
              rows={pensionRows(batch.records)}
              savable={batch.saved}
              variant="pension"
              onRegenerate={generate}
              canShare={canShare}
              regenerateDisabled={!canGenerate}
            />
          ) : (
            !gen.busy && (
              <Card title="추천 번호">
                <StateView kind="empty" title="아직 생성한 번호가 없습니다" description="조와 자리를 정하고 생성을 누르세요. 비운 자리는 자동입니다." />
              </Card>
            )
          )}
          {links.stats && (
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

/** 결과 줄: 조 + 여섯 자리 문자열 그대로. 같은 기본 번호 묶음을 data-group(1부터)으로 구분한다. */
function pensionRows(records: GeneratedRecord[]): ResultRow[] {
  const baseIndex = new Map<string, number>();
  return records.flatMap((r) => {
    if (r.game !== "pension") return [];
    const digits = r.numbers.digits;
    if (!baseIndex.has(digits)) baseIndex.set(digits, baseIndex.size + 1);
    const label = `${r.group_no}조`;
    return [
      {
        id: r.id,
        label,
        name: `${label} ${digits}`,
        group: baseIndex.get(digits),
        text: `${label} ${digits}`,
        content: (
          <span className="ll-mono ll-result__digits" aria-label={`${label} ${digits.split("").join(" ")}`}>
            {digits}
          </span>
        ),
      },
    ];
  });
}

type ProblemContext = {
  autoCount: number;
  setCount: (v: CountValue) => void;
  setAllAuto: () => void;
  regenerate: () => void;
  clear: () => void;
};

/** 엔진 hint(pension.*) + detail → 한국어 안내와 해결 방안. */
export function pensionProblem(p: EngineProblem, ctx: ProblemContext): ProblemView {
  const fix = (label: string, apply: () => void) => ({
    label,
    apply: () => {
      apply();
      ctx.clear();
    },
  });
  const allAuto = ctx.autoCount < DIGIT_LABELS.length ? [fix("모든 자리 자동으로", ctx.setAllAuto)] : [];
  const { max, requested } = p.detail;
  switch (p.hint) {
    case "pension.rng_exhausted":
      // 재추첨 시도 상한 초과 — 정상 난수로는 거의 닿지 않는다. 조건 문제가 아니므로 다시 생성만 안내한다.
      return {
        title: "이번에는 번호를 다 만들지 못했어요",
        description: "잠시 후 다시 생성해 주세요. 조건은 그대로 남아 있습니다.",
        fixes: [{ label: "다시 생성", apply: ctx.regenerate }],
      };
    case "pension.too_few_combinations":
      return {
        title: "고정한 자리가 많아 서로 다른 번호가 부족해요",
        description: `자동 자리 ${ctx.autoCount}개로는 서로 다른 기본 번호를 최대 ${max}개까지 만들 수 있어요(요청 ${requested}개). 기본 번호 수를 줄이거나 자동 자리를 늘려 주세요.`,
        fixes: [
          ...(typeof max === "number" && max >= 1 && (typeof requested !== "number" || max < requested) ? [fix(`기본 번호 수를 ${max}개로 줄이기`, () => ctx.setCount(countValue(max, BASE_PRESETS)))] : []),
          ...allAuto,
        ],
      };
    case "pension.groups":
      return { title: "조를 확인해 주세요", description: "1~5조 중 1개 이상을 겹치지 않게 고르세요.", fixes: [] };
    case "pension.positions":
      return { title: "자리 숫자를 확인해 주세요", description: "자리마다 0~9 한 글자를 넣거나 비워 두세요.", fixes: allAuto };
    case "pension.games":
      return { title: "기본 번호 수를 확인해 주세요", description: "기본 번호 수는 1~50 사이로 정해 주세요.", fixes: [fix("1개로 바꾸기", () => ctx.setCount({ preset: 1 }))] };
    default:
      return { title: "이 조건으로는 번호를 만들 수 없어요", description: "조건을 줄인 뒤 다시 생성하세요.", fixes: allAuto };
  }
}
