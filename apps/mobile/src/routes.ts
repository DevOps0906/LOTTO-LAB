// 내비 정본(DESIGN.md 4.5): 하단 탭 홈·추천·통계·내번호. 768~(태블릿)에서는 같은 4항목이 사이드바로 바뀐다.
// 탭 아래 화면(로또·연금 생성 등)은 SUB_ROUTES — 내비 항목은 아니고, 소속 탭(tab)을 현재 탭으로 표시한다.
import type { NavIconName } from "./icons.tsx";

export type Route = { path: string; label: string; title: string; icon: NavIconName };
export type SubRoute = { path: string; title: string; tab: string };

export const ROUTES: readonly Route[] = [
  { path: "/", label: "홈", title: "홈", icon: "home" },
  { path: "/generate", label: "추천", title: "번호 추천", icon: "generate" },
  { path: "/stats", label: "통계", title: "통계", icon: "stats" },
  { path: "/tickets", label: "내번호", title: "내 번호", icon: "tickets" },
];

export const SUB_ROUTES: readonly SubRoute[] = [
  { path: "/generate/lotto", title: "로또 번호 생성", tab: "/generate" },
  { path: "/generate/pension", title: "연금복권 번호 생성", tab: "/generate" },
];

/** 해시 주소(셸 링크용). */
export const href = (path: string): string => `#${path}`;

/** 모르는 경로는 홈으로 본다. tab = 하단 탭에서 현재로 표시할 경로. */
export function routeOf(path: string): { path: string; title: string; tab: string } {
  const sub = SUB_ROUTES.find((route) => route.path === path);
  if (sub) return sub;
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  return { path: route.path, title: route.title, tab: route.path };
}
