import { AppShell, NoticeProvider, StateView, type NavItem } from "@lotto-lab/ui";
import { CoreContext, type CoreState } from "./core.ts";
import { NavIcon } from "./icons.tsx";
import { ROUTES, routeOf } from "./routes.ts";
import { useHashPath } from "./router.ts";
import { Placeholder } from "./screens/Placeholder.tsx";

export function App({ core }: { core: CoreState }) {
  const route = routeOf(useHashPath());
  const items: NavItem[] = ROUTES.map((item) => ({
    href: `#${item.path}`,
    label: item.label,
    icon: <NavIcon name={item.icon} />,
    current: item.path === route.path,
  }));

  return (
    <CoreContext.Provider value={core}>
      <NoticeProvider>
        <AppShell brandMark={<NavIcon name="brand" />} brandName="LOTTO LAB" tabItems={items} sideItems={items}>
          <div className="app-page">
            {core.configError && (
              <StateView
                kind="error"
                title="서버 연결 설정이 없습니다"
                description="회차·통계 정보를 불러올 수 없습니다. 생성·저장 기능은 이후 작업에서 연결됩니다."
              />
            )}
            <Placeholder title={route.title} />
          </div>
        </AppShell>
      </NoticeProvider>
    </CoreContext.Provider>
  );
}
