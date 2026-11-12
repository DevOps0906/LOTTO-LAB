import { AppShell, Header, NoticeProvider, StateView, type NavItem, type ThemePreference } from "@lotto-lab/ui";
import { useState } from "react";
import { CoreContext, type CoreState } from "./core.ts";
import { NavIcon } from "./icons.tsx";
import { AgeGateRoute, createSessionAgeGate, type AgeGateLike } from "./routes/AgeGateRoute.tsx";
import { RouteScreen } from "./routes/screens.tsx";
import { ROUTES, TAB_ROUTES, href, routeOf } from "./routes.ts";
import { useHashPath } from "./router.ts";

export type AppProps = {
  core: CoreState;
  /** 설정(D-09)에서 테마를 바꾸면 즉시 적용 */
  onThemeChange?: (theme: ThemePreference) => void;
  /** 설정(D-09) 모두 삭제 뒤 다시 시작 */
  onCleared?: () => void;
};

export function App({ core, onThemeChange, onCleared }: AppProps) {
  const [gate] = useState<AgeGateLike>(() => core.core?.ageGate ?? createSessionAgeGate());
  const hashPath = useHashPath();
  const [path = "/", query = ""] = hashPath.split("?");
  const route = routeOf(path);
  const sideItems: NavItem[] = ROUTES.map((item) => ({
    href: href(item.path),
    label: item.label,
    icon: <NavIcon name={item.icon} />,
    current: item.path === route.path,
  }));
  const tabItems: NavItem[] = TAB_ROUTES.map((item) => ({
    href: href(item.path),
    label: item.label,
    icon: <NavIcon name={routeOf(item.path).icon} />,
    current: item.path === route.path,
  }));

  return (
    <CoreContext.Provider value={core}>
      <NoticeProvider>
        <AgeGateRoute gate={gate}>
          <AppShell
            brandMark={<NavIcon name="brand" />}
            brandName="LOTTO LAB"
            tabItems={tabItems}
            sideItems={sideItems}
            sideFooter={
              <>
                만 19세 이상 이용
                <br />
                복권 판매·구매 대행 아님
              </>
            }
          >
            <div className="app-page">
              {core.core ? (
                <RouteScreen
                  key={hashPath}
                  path={route.path}
                  query={query}
                  title={route.title}
                  core={core.core}
                  onThemeChange={onThemeChange}
                  onCleared={onCleared}
                />
              ) : (
                <>
                  <Header title={route.title} />
                  <StateView
                    kind="error"
                    title="서버 연결 설정이 없습니다"
                    description="회차·통계 정보를 불러올 수 없습니다. 앱 설정(공개 키)을 확인해 주세요."
                  />
                </>
              )}
            </div>
          </AppShell>
        </AgeGateRoute>
      </NoticeProvider>
    </CoreContext.Provider>
  );
}
