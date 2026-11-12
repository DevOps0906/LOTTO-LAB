import type { ReactNode } from "react";

export type HeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 오른쪽 도구(알림·설정 버튼 등) */
  actions?: ReactNode;
};

/** 화면 상단 제목 줄. 화면당 하나의 h1. */
export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="ll-header">
      <div className="ll-header__titles">
        <h1 className="ll-header__title">{title}</h1>
        {subtitle && <p className="ll-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ll-header__actions">{actions}</div>}
    </header>
  );
}
