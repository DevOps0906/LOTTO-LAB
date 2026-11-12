// 생성 화면 공통(M-02 로또·M-03 연금): app-core 구조 타입, 생성 실행(중복 제출 잠금·취소), 지난 설정 복원,
// 엔진 오류 읽기, 개수 입력, 결과 목록(선택 저장·실행 취소·복사·공유).
// 추천 번호는 생성 이력일 뿐이다 — 사용자가 저장하면 즐겨찾기(favorite)가 되고, 구매 기록이 아니다(AGENTS 4장).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionMenu } from "../../components/ActionMenu";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/icons";
import { useNotice } from "../../components/Notice";

export type LottoConfig = { fixed: number[]; excluded: number[]; games: number };
export type PensionConfig = { groups: number[]; positions: (string | null)[]; games: number };
export type GenerateRequest = { game: "lotto"; config: LottoConfig } | { game: "pension"; config: PensionConfig };

/** app-core LocalGenerated 중 화면이 쓰는 부분. 연금 digits는 문자열(앞자리 0 보존). */
export type GeneratedRecord =
  | { id: string; game: "lotto"; numbers: { nums: number[] }; group_no: null }
  | { id: string; game: "pension"; numbers: { digits: string }; group_no: number };

/** 생성 화면이 쓰는 app-core(AppCore) 기능 — 셸 typecheck가 AppCore와의 호환을 검사한다. */
export type GeneratorCore = {
  generator: {
    generate(request: GenerateRequest): Promise<{ batch_id: string; records: GeneratedRecord[]; saved: boolean }>;
  };
  tickets: {
    saveFromGenerated(
      generatedId: string,
      input: { purchase_status: "favorite"; round: null; idempotency_key: string },
    ): Promise<{ id: string }>;
    remove(id: string): Promise<void>;
    newIdempotencyKey(): string;
  };
  lastConfig: {
    get(game: "lotto"): Promise<LottoConfig | null>;
    get(game: "pension"): Promise<PensionConfig | null>;
    save(request: GenerateRequest): Promise<boolean>;
  };
  adapters: {
    clipboard: { writeText(text: string): Promise<void> };
    share: { share(content: { title?: string; text: string }): Promise<void> };
  };
};

/** 엔진 조건 오류(lottery-core EngineError와 같은 모양). 문구는 화면이 hint별로 고른다. */
export type EngineProblem = { code: "IMPOSSIBLE_COMBINATION" | "INVALID_INPUT"; hint: string; detail: Record<string, number> };

export function engineProblemOf(error: unknown): EngineProblem | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { code?: unknown; hint?: unknown; detail?: unknown };
  if ((e.code !== "IMPOSSIBLE_COMBINATION" && e.code !== "INVALID_INPUT") || typeof e.hint !== "string") return null;
  const detail = typeof e.detail === "object" && e.detail !== null ? (e.detail as Record<string, number>) : {};
  return { code: e.code, hint: e.hint, detail };
}

/** 해결 방안 버튼 1개 */
export type Fix = { label: string; apply: () => void };
export type ProblemView = { title: string; description: string; fixes: Fix[] };

/** request = 이 결과를 만든 조건(결과 공의 고정수 표시 등). */
export type GeneratedBatch = { batch_id: string; records: GeneratedRecord[]; saved: boolean; request: GenerateRequest };

/**
 * 생성 실행. 진행 중에는 다시 누를 수 없고(중복 제출 잠금), 취소하면 늦게 온 결과는 버린다.
 * 성공하면 그 조건을 지난 설정으로 남긴다(실패해도 생성 결과에는 영향 없음).
 * 엔진 조건 오류는 problem, 그 밖의 실패는 failed — 이전 결과는 그대로 둔다.
 */
export function useGeneration(core: Pick<GeneratorCore, "generator" | "lastConfig">) {
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<GeneratedBatch | null>(null);
  const [problem, setProblem] = useState<EngineProblem | null>(null);
  const [failed, setFailed] = useState(false);
  const token = useRef(0);

  async function run(request: GenerateRequest) {
    if (busy) return;
    const mine = ++token.current;
    setBusy(true);
    setProblem(null);
    setFailed(false);
    try {
      const result = await core.generator.generate(request);
      if (mine !== token.current) return;
      setBatch({ batch_id: result.batch_id, records: result.records, saved: result.saved, request });
      core.lastConfig.save(request).catch(() => {});
    } catch (error) {
      if (mine !== token.current) return;
      const p = engineProblemOf(error);
      if (p) setProblem(p);
      else setFailed(true);
    } finally {
      if (mine === token.current) setBusy(false);
    }
  }

  function cancel() {
    token.current++;
    setBusy(false);
  }

  function clearProblem() {
    setProblem(null);
    setFailed(false);
  }

  return { busy, batch, problem, failed, run, cancel, clearProblem };
}

export type RestoreState = "off" | "loading" | "restored" | "none" | "failed";

/** restoreLast면 지난 설정을 한 번 읽어 apply한다. */
export function useRestore<T>(restoreLast: boolean, load: () => Promise<T | null>, apply: (config: T) => void): RestoreState {
  const [state, setState] = useState<RestoreState>(restoreLast ? "loading" : "off");
  useEffect(() => {
    if (!restoreLast) return;
    let alive = true;
    load().then(
      (config) => {
        if (!alive) return;
        if (config) apply(config);
        setState(config ? "restored" : "none");
      },
      () => {
        if (alive) setState("failed");
      },
    );
    return () => {
      alive = false;
    };
    // 화면 진입 시 한 번만 읽는다.
  }, []);
  return state;
}

export function RestoreNote({ state }: { state: RestoreState }) {
  if (state === "off") return null;
  const text = {
    loading: "지난 설정을 불러오는 중입니다",
    restored: "지난 설정을 불러왔어요. 바꾸지 않으면 같은 조건으로 만듭니다.",
    none: "저장된 지난 설정이 없어 기본값으로 시작합니다.",
    failed: "지난 설정을 읽지 못해 기본값으로 시작합니다.",
  }[state];
  return (
    <p className="ll-gen__restore" role="status">
      <Icon name={state === "restored" ? "check" : "info"} />
      {text}
    </p>
  );
}

/** 라디오 묶음(세그먼트 모양). */
export function Segment<T extends string | number>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  return (
    <fieldset className="ll-field">
      <legend className="ll-field__legend">{legend}</legend>
      {hint && <p className="ll-muted ll-field__hint">{hint}</p>}
      <div className="ll-seg" role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <label key={String(o.value)} className="ll-seg__item">
            <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 개수 입력값: 미리 정한 값 또는 직접 입력(문자열 그대로 — type=number 쓰지 않음). */
export type CountValue = { preset: number } | { custom: string };

export const COUNT_MIN = 1;
export const COUNT_MAX = 50;

/** 1~50 정수면 그 값, 아니면 null(입력 오류). */
export function countOf(value: CountValue): number | null {
  if ("preset" in value) return value.preset;
  if (!/^[0-9]{1,2}$/.test(value.custom)) return null;
  const n = Number(value.custom);
  return n >= COUNT_MIN && n <= COUNT_MAX ? n : null;
}

export function countValue(n: number, presets: readonly number[]): CountValue {
  return presets.includes(n) ? { preset: n } : { custom: String(n) };
}

export function CountField({
  legend,
  name,
  unit,
  presets,
  value,
  onChange,
  hint,
}: {
  legend: string;
  name: string;
  unit: string;
  presets: readonly number[];
  value: CountValue;
  onChange: (value: CountValue) => void;
  hint?: ReactNode;
}) {
  const custom = "custom" in value;
  const invalid = custom && countOf(value) === null;
  const inputId = `${name}-custom`;
  const errorId = `${name}-error`;
  return (
    <fieldset className="ll-field">
      <legend className="ll-field__legend">{legend}</legend>
      {hint && <p className="ll-muted ll-field__hint">{hint}</p>}
      <div className="ll-seg">
        {presets.map((n) => (
          <label key={n} className="ll-seg__item">
            <input type="radio" name={name} checked={!custom && value.preset === n} onChange={() => onChange({ preset: n })} />
            <span>
              {n}
              {unit}
            </span>
          </label>
        ))}
        <label className="ll-seg__item">
          <input
            type="radio"
            name={name}
            checked={custom}
            onChange={() => onChange({ custom: custom ? value.custom : "" })}
          />
          <span>직접</span>
        </label>
      </div>
      {custom && (
        <div className="ll-gen__custom">
          <label htmlFor={inputId}>
            직접 입력({COUNT_MIN}~{COUNT_MAX}
            {unit})
          </label>
          <input
            id={inputId}
            className="ll-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={value.custom}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(e) => onChange({ custom: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })}
          />
          {invalid && (
            <p id={errorId} className="ll-gen__error">
              {COUNT_MIN}~{COUNT_MAX} 사이 숫자로 입력하세요.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

/** 엔진 조건 오류 안내 + 해결 방안 버튼(대기 없이 바로 표시). */
export function ProblemBox({ view }: { view: ProblemView }) {
  return (
    <div className="ll-gen__problem" role="alert">
      <p className="ll-gen__problem-title">
        <Icon name="alert" />
        {view.title}
      </p>
      <p>{view.description}</p>
      {view.fixes.length > 0 && (
        <div className="ll-gen__fixes">
          {view.fixes.map((fix) => (
            <Button key={fix.label} variant="secondary" onClick={fix.apply}>
              {fix.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export const GENERATED_NOTE = (
  <p className="ll-gen__note">
    <strong>미래 예측 아님</strong> · 추천 번호는 기기에서 만든 무작위 조합이며 당첨과 무관합니다. 저장은 즐겨찾기로만 기록되고 구매
    기록이 아닙니다. 구매 등록은 내 번호에서 따로 합니다.
  </p>
);

/** name = 줄을 가리키는 고유 이름(체크박스·메뉴 접근성 이름에 쓴다. 예: "1조 000719"). 없으면 label. */
export type ResultRow = { id: string; label: string; name?: string; content: ReactNode; text: string; group?: number };

function saveFailMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === "LIMIT_EXCEEDED") return "저장 번호가 가득 찼어요(최대 1,000개). 내 번호에서 정리한 뒤 다시 저장하세요.";
  if (code === "NOT_FOUND") return "생성 이력이 기기에 남지 않아 저장할 수 없어요. 다시 생성한 뒤 저장하세요.";
  return "저장하지 못했어요. 기기 저장 공간을 확인한 뒤 다시 시도하세요.";
}

const SHARE_TITLE = "LOTTO LAB 추천 번호";

/**
 * 생성 결과 목록. 줄마다 멱등 키를 결과가 보일 때 한 번 발급한다(두 번 누름·다시 시도가 같은 저장 번호로 수렴).
 * 저장 → 스낵바 "저장했어요"+실행 취소(= 저장 번호 삭제), 복사 → 토스트 "복사했어요". 저장 실패해도 결과는 그대로 둔다.
 * 부모는 배치가 바뀔 때 key로 새로 그린다.
 */
export function GeneratedResults({
  core,
  title,
  rows,
  savable,
  variant,
  onRegenerate,
  regenerateDisabled,
  canShare = true,
}: {
  core: Pick<GeneratorCore, "tickets" | "adapters">;
  title: ReactNode;
  rows: ResultRow[];
  /** 생성 이력이 기기에 저장됐는지(아니면 즐겨찾기로 저장할 수 없다) */
  savable: boolean;
  variant: "primary" | "pension";
  onRegenerate: () => void;
  regenerateDisabled?: boolean;
  /** false면 공유 버튼·메뉴를 숨긴다(Windows: 공유 = 클립보드 복사라 "복사"와 겹친다) */
  canShare?: boolean;
}) {
  const notice = useNotice();
  const [keys] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, core.tickets.newIdempotencyKey()])));
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const unsaved = rows.filter((r) => !saved[r.id]);
  const allChecked = unsaved.length > 0 && unsaved.every((r) => checked.has(r.id));
  const selectedIds = unsaved.filter((r) => checked.has(r.id)).map((r) => r.id);

  async function save(ids: string[]) {
    const targets = ids.filter((id) => !saved[id]);
    if (targets.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    const done: Record<string, string> = {};
    let failure: unknown = null;
    for (const id of targets) {
      try {
        const ticket = await core.tickets.saveFromGenerated(id, { purchase_status: "favorite", round: null, idempotency_key: keys[id]! });
        done[id] = ticket.id;
      } catch (error) {
        failure ??= error;
      }
    }
    setSaving(false);
    const count = Object.keys(done).length;
    if (count > 0) {
      setSaved((s) => ({ ...s, ...done }));
      setChecked((c) => new Set([...c].filter((id) => !done[id])));
      notice.snackbar({
        message: count === 1 ? "저장했어요" : `${count}개를 저장했어요`,
        action: { label: "실행 취소", onAction: () => void undo(done) },
      });
    }
    if (failure !== null) {
      const message = saveFailMessage(failure);
      setSaveError(message);
      notice.snackbar({
        message,
        tone: "error",
        action: { label: "다시 시도", onAction: () => void save(targets.filter((id) => !done[id])) },
      });
    }
  }

  async function undo(done: Record<string, string>) {
    let failed = false;
    for (const [rowId, ticketId] of Object.entries(done)) {
      try {
        await core.tickets.remove(ticketId);
        setSaved((s) => {
          const next = { ...s };
          delete next[rowId];
          return next;
        });
      } catch {
        failed = true;
      }
    }
    notice.toast(failed ? "실행 취소하지 못했어요. 내 번호에서 제거할 수 있어요." : "저장을 취소했어요");
  }

  function copy(text: string) {
    core.adapters.clipboard.writeText(text).then(
      () => notice.toast("복사했어요"),
      () => notice.toast("복사하지 못했어요. 다시 시도하세요."),
    );
  }

  function share(text: string) {
    // 사용자가 공유 창을 닫아도 실패로 오므로 알리지 않는다.
    core.adapters.share.share({ title: SHARE_TITLE, text: `${text}\n(추천 번호 · 당첨과 무관)` }).catch(() => {});
  }

  const allText = rows.map((r) => r.text).join("\n");

  return (
    <Card
      title={title}
      className="ll-gen__result"
      busy={saving}
      action={
        <button type="button" className="ll-icon-button" aria-label="같은 조건으로 다시 생성" onClick={onRegenerate} disabled={regenerateDisabled}>
          <Icon name="redo" />
        </button>
      }
    >
      {savable ? (
        <label className="ll-gen__all">
          <input
            type="checkbox"
            checked={allChecked}
            disabled={unsaved.length === 0}
            onChange={() => setChecked(allChecked ? new Set() : new Set(unsaved.map((r) => r.id)))}
          />
          전체 선택
        </label>
      ) : (
        <p className="ll-gen__error" role="status">
          생성 이력을 기기에 저장하지 못해 이 결과는 즐겨찾기로 저장할 수 없어요. 복사·공유는 할 수 있어요.
        </p>
      )}
      <ol className="ll-result" aria-label="추천 번호 목록">
        {rows.map((row) => {
          const isSaved = Boolean(saved[row.id]);
          const name = row.name ?? row.label;
          return (
            <li key={row.id} className="ll-result__row" data-saved={isSaved || undefined} data-group={row.group}>
              {savable && (
                <label className="ll-result__check">
                <input
                  type="checkbox"
                  checked={checked.has(row.id)}
                  disabled={isSaved}
                  onChange={() =>
                    setChecked((c) => {
                      const next = new Set(c);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    })
                  }
                />
                  <span className="ll-sr-only">{name} 선택</span>
                </label>
              )}
              <span className="ll-result__label">{row.label}</span>
              <span className="ll-result__content">{row.content}</span>
              <span className="ll-result__status" data-saved={isSaved || undefined}>
                {isSaved ? "즐겨찾기 저장됨" : "추천 번호"}
              </span>
              <ActionMenu
                label={`${name} 메뉴`}
                items={[
                  { id: "save", label: isSaved ? "저장됨" : "즐겨찾기로 저장", disabled: isSaved || !savable || saving, onSelect: () => void save([row.id]) },
                  { id: "copy", label: "복사", onSelect: () => copy(row.text) },
                  ...(canShare ? [{ id: "share", label: "공유", onSelect: () => share(row.text) }] : []),
                ]}
              />
            </li>
          );
        })}
      </ol>
      {saveError && (
        <p className="ll-gen__error" role="alert">
          {saveError}
        </p>
      )}
      <div className="ll-gen__actions">
        {savable && (
          <Button variant={variant} disabled={selectedIds.length === 0 || saving} onClick={() => void save(selectedIds)}>
            {saving ? "저장하는 중" : `선택 ${selectedIds.length}개 저장`}
          </Button>
        )}
        <Button variant="secondary" onClick={() => copy(allText)}>
          전체 복사
        </Button>
        {canShare && (
          <Button variant="secondary" onClick={() => share(allText)}>
            공유
          </Button>
        )}
      </div>
      {GENERATED_NOTE}
    </Card>
  );
}
