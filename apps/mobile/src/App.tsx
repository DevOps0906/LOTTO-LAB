import { AppShell, Header, NoticeProvider, StateView, type NavItem } from "@lotto-lab/ui";
import { useState } from "react";
import { CoreContext, type CoreState } from "./core.ts";
import { NavIcon } from "./icons.tsx";
import { AgeGateRoute, createSessionAgeGate, type AgeGateLike } from "./routes/AgeGateRoute.tsx";
import { RouteScreen } from "./routes/screens.tsx";
import { ROUTES, href, routeOf } from "./routes.ts";
import { useHashPath } from "./router.ts";

export function App({ core, onExit }: { core: CoreState; onExit?: () => void }) {
  const [gate] = useState<AgeGateLike>(() => core.core?.ageGate ?? createSessionAgeGate());
  const route = routeOf(useHashPath());
  const items: NavItem[] = ROUTES.map((item) => ({
    href: href(item.path),
    label: item.label,
    icon: <NavIcon name={item.icon} />,
    current: item.path === route.tab,
  }));

  return (
    <CoreContext.Provider value={core}>
      <NoticeProvider>
        <AgeGateRoute gate={gate} onExit={onExit}>
          <AppShell brandMark={<NavIcon name="brand" />} brandName="LOTTO LAB" tabItems={items} sideItems={items}>
            <div className="app-page">
              {core.core ? (
                <RouteScreen key={route.path} path={route.path} title={route.title} core={core.core} />
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
