// 내비 정본(DESIGN.md 4.5): 하단 탭 홈·추천·통계·내번호. 768~(태블릿)에서는 같은 4항목이 사이드바로 바뀐다.
import type { NavIconName } from "./icons.tsx";

export type Route = { path: string; label: string; title: string; icon: NavIconName };

export const ROUTES: readonly Route[] = [
  { path: "/", label: "홈", title: "홈", icon: "home" },
  { path: "/generate", label: "추천", title: "번호 추천", icon: "generate" },
  { path: "/stats", label: "통계", title: "통계", icon: "stats" },
  { path: "/tickets", label: "내번호", title: "내 번호", icon: "tickets" },
];

/** 모르는 경로는 홈으로 본다. */
export function routeOf(path: string): Route {
  return ROUTES.find((route) => route.path === path) ?? ROUTES[0];
}
