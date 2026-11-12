import { LOTTO_MAX, LOTTO_MIN } from "@lotto-lab/design-tokens";
import { Ball, ballLabel, type BallState } from "./Ball";

export type BallGridProps = {
  /** 그룹 접근성 이름(예: "고정수 선택") */
  label: string;
  /** 선택(눌림) 번호 */
  selected: readonly number[];
  onToggle: (number: number) => void;
  /** 고정수로 표시할 번호(핀 아이콘) */
  fixed?: readonly number[];
  /** 제외수로 표시할 번호(취소선·금지 아이콘) */
  excluded?: readonly number[];
  /** 누를 수 없는 번호(예: 다른 목록에서 이미 고른 번호) */
  disabled?: readonly number[];
};

const NUMBERS = Array.from({ length: LOTTO_MAX - LOTTO_MIN + 1 }, (_, i) => LOTTO_MIN + i);

function stateOf(n: number, selected: readonly number[], fixed: readonly number[], excluded: readonly number[]): BallState {
  if (fixed.includes(n)) return "fixed";
  if (excluded.includes(n)) return "excluded";
  return selected.includes(n) ? "selected" : "unselected";
}

/**
 * 번호 선택 그리드 1~45(DESIGN.md 4.1). 열 수 ~389 6열 · 390~767 7열 · 768~ 9열, 셀이 열 너비를 꽉 채운다.
 * 넘침 계산(열 간격 0, 페이지 여백 16×2): 320→288/6=48 · 360→328/6=54.7 · 390→358/7=51.1 — 모두 공 지름 36·터치 44 이상.
 * aria-pressed = 포함(선택 또는 고정). 고정·제외는 이름에 "고정수"/"제외수"를 넣는다.
 */
export function BallGrid({ label, selected, onToggle, fixed = [], excluded = [], disabled = [] }: BallGridProps) {
  return (
    <div className="ll-ball-grid ll-cols-6 ll-cols-sm-7 ll-cols-md-9" role="group" aria-label={label}>
      {NUMBERS.map((n) => {
        const state = stateOf(n, selected, fixed, excluded);
        return (
          <button
            key={n}
            type="button"
            className="ll-ball-grid__cell"
            aria-pressed={state === "selected" || state === "fixed"}
            aria-label={state === "selected" || state === "unselected" ? `${n}번` : ballLabel(n, state)}
            disabled={disabled.includes(n)}
            onClick={() => onToggle(n)}
          >
            <Ball number={n} state={state} decorative />
          </button>
        );
      })}
    </div>
  );
}
