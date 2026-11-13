import type { ReactNode } from "react";
import { Icon } from "./icons";

export type StateKind = "empty" | "loading" | "error";

export type StateViewProps = {
  kind: StateKind;
  title?: ReactNode;
  description?: ReactNode;
  /** 다음 행동(빈: 만들기 버튼, 오류: 다시 시도 버튼) */
  action?: ReactNode;
};

const DEFAULT_TITLE: Record<StateKind, string> = {
  empty: "아직 내용이 없습니다",
  loading: "불러오는 중입니다",
  error: "불러오지 못했습니다",
};

/**
 * 빈·로딩·오류 상태 틀. 로딩은 제목 줄만 role=status(알림 영역, busy 없음), 오류는 alert.
 * 갱신 중인 콘텐츠 컨테이너의 aria-busy는 소비 측(예: Card busy)에 두고, StateView는 그 바깥에 둔다.
 */
export function StateView({ kind, title, description, action }: StateViewProps) {
  return (
    <div className="ll-state" data-kind={kind} role={kind === "error" ? "alert" : undefined}>
      {kind === "loading" ? (
        <span className="ll-state__spinner" aria-hidden="true" />
      ) : (
        <span className="ll-state__icon">
          <Icon name={kind === "error" ? "alert" : "inbox"} />
        </span>
      )}
      <p className="ll-state__title" role={kind === "loading" ? "status" : undefined}>
        {title ?? DEFAULT_TITLE[kind]}
      </p>
      {description && <p className="ll-state__desc">{description}</p>}
      {action}
    </div>
  );
}
