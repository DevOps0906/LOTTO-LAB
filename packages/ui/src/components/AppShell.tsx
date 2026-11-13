import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  /** 장식용 아이콘(aria-hidden 처리는 소비 측 SVG에) */
  icon: ReactNode;
  /** 현재 화면이면 true → aria-current="page" */
  current?: boolean;
};

export type AppShellProps = {
  /** 브랜드 마크(아이콘). 레일(768~1199)에서는 이것만 보인다 */
  brandMark: ReactNode;
  /** 브랜드 이름(1200~에서 표시, 자체 워드마크만 — 공식 로고·상호 모방 금지) */
  brandName: string;
  /** ~767 하단 탭바 항목(DESIGN.md 4.5: 홈·추천·통계·내번호) */
  tabItems: NavItem[];
  /** 768~ 사이드바 항목(DESIGN.md 4.4) */
  sideItems: NavItem[];
  /** 사이드바 하단 문구(1200~에서 표시) */
  sideFooter?: ReactNode;
  /** 셸의 링크 컴포넌트(Next Link·라우터 Link 등). 기본 <a>. href·className·aria-*·title·children을 받는다 */
  linkComponent?: ElementType<ComponentPropsWithoutRef<"a">>;
  children: ReactNode;
};

/**
 * 앱 셸(DESIGN.md 2장). 같은 마크업을 CSS가 구간별로 바꾼다:
 * ~767 하단 탭바 / 768~1199 아이콘 레일(aria-label + 호버·포커스 시 라벨 툴팁) / 1200~ 사이드바(아이콘+라벨).
 * 숨긴 쪽 내비는 display:none이라 보조기기에도 한 벌만 노출된다.
 */
export function AppShell({
  brandMark,
  brandName,
  tabItems,
  sideItems,
  sideFooter,
  linkComponent: Link = "a",
  children,
}: AppShellProps) {
  return (
    <div className="ll-shell">
      <aside className="ll-shell__side">
        <div className="ll-side__brand">
          {brandMark}
          <span className="ll-side__brand-text">{brandName}</span>
        </div>
        <nav className="ll-side__nav" aria-label="주 메뉴">
          <ul>
            {sideItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={item.current ? "page" : undefined}
                >
                  {item.icon}
                  <span className="ll-side__label">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {sideFooter && <div className="ll-side__foot">{sideFooter}</div>}
      </aside>
      <main className="ll-shell__main">{children}</main>
      <nav className="ll-tabbar" aria-label="하단 탭">
        <ul>
          {tabItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={item.current ? "page" : undefined}>
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
