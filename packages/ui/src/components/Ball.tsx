import { ballRange } from "@lotto-lab/design-tokens";
import { Icon, type IconName } from "./icons";

/**
 * 번호공 상태(DESIGN.md 4.1).
 * default=결과 공(번호대 색) · unselected=그리드 미선택(흰 공+테두리) · selected=선택(번호대 색+체크)
 * fixed=고정수(번호대 색+핀) · excluded=제외수(흰 공+취소선+금지) · bonus=보너스("+" 기호)
 */
export type BallState = "default" | "unselected" | "selected" | "fixed" | "excluded" | "bonus";

export type BallProps = {
  /** 로또 번호 1~45 */
  number: number;
  state?: BallState;
  /** 부모(예: 그리드 버튼)가 접근성 이름을 가질 때 true — 공은 보조기기에서 숨긴다 */
  decorative?: boolean;
};

const STATE_TEXT: Partial<Record<BallState, string>> = {
  selected: "선택됨",
  fixed: "고정수",
  excluded: "제외수",
};

/** 색 외 상태 표시(DESIGN.md 4.1): 선택=체크, 고정=핀, 제외=금지 */
const BADGE: Partial<Record<BallState, IconName>> = { selected: "check", fixed: "pin", excluded: "ban" };

/** 접근성 라벨: "7번", "7번, 고정수", "보너스 7번". */
export function ballLabel(number: number, state: BallState = "default"): string {
  if (state === "bonus") return `보너스 ${number}번`;
  const text = STATE_TEXT[state];
  return text ? `${number}번, ${text}` : `${number}번`;
}

export function Ball({ number, state = "default", decorative = false }: BallProps) {
  const range = ballRange(number);
  const badge = BADGE[state];
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": ballLabel(number, state) } as const);
  const ball = (
    <span className={`ll-ball ${range}`} data-state={state} {...(state === "bonus" ? {} : a11y)}>
      <span className="ll-ball__num" aria-hidden="true">
        {number}
      </span>
      {badge && (
        <span className="ll-ball__badge" aria-hidden="true">
          <Icon name={badge} />
        </span>
      )}
    </span>
  );
  if (state !== "bonus") return ball;
  return (
    <span className="ll-ball-bonus" {...a11y}>
      <span className="ll-ball-bonus__plus" aria-hidden="true">
        +
      </span>
      {ball}
    </span>
  );
}
