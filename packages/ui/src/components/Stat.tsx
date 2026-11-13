import type { ReactNode } from "react";
import { Icon } from "./icons";

export type StatTrend = "up" | "down" | "flat";

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  /** 보조 캡션(회차·기준일) */
  hint?: ReactNode;
  /** 증감: 화살표 아이콘 + 부호 문자 + 색 병기(DESIGN.md 4.3). change는 부호 포함 문자열(예: "+2") */
  delta?: { trend: StatTrend; change: string; label?: string };
};

const TREND_TEXT: Record<StatTrend, string> = { up: "증가", down: "감소", flat: "변화 없음" };

/** KPI 카드(DESIGN.md 4.3). */
export function Stat({ label, value, hint, delta }: StatProps) {
  return (
    <dl className="ll-stat">
      <dt className="ll-stat__label">{label}</dt>
      <dd className="ll-stat__value">{value}</dd>
      {delta && (
        <dd className="ll-stat__delta" data-trend={delta.trend}>
          <Icon name={delta.trend} />
          <span className="ll-sr-only">{TREND_TEXT[delta.trend]}</span>
          <span>{delta.change}</span>
          {delta.label && <span>{delta.label}</span>}
        </dd>
      )}
      {hint && <dd className="ll-stat__hint">{hint}</dd>}
    </dl>
  );
}
