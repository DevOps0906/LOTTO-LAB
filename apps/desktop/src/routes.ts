// 내비 정본(DESIGN.md 4.4, docs/03 D-01): 사이드바 8항목. 1200~ 아이콘+라벨, 768~1199 아이콘 레일(라벨은 툴팁).
// 창 최소 폭 1024라 하단 탭은 보이지 않지만 AppShell 계약상 같은 4개 맥락(홈·추천·통계·내번호)을 넘긴다.
import type { NavIconName } from "./icons.tsx";

export type Route = { path: string; label: string; title: string; icon: NavIconName };

export const ROUTES: readonly Route[] = [
  { path: "/", label: "대시보드", title: "대시보드", icon: "dashboard" },
  { path: "/lotto", label: "로또 생성", title: "로또 6/45 번호 생성", icon: "lotto" },
  { path: "/pension", label: "연금 생성", title: "연금복권 720+ 번호 생성", icon: "pension" },
  { path: "/stats", label: "통계", title: "통계", icon: "stats" },
  { path: "/tickets", label: "내 번호", title: "내 번호", icon: "tickets" },
  { path: "/draws", label: "회차", title: "회차 결과", icon: "draws" },
  { path: "/alerts", label: "알림", title: "알림", icon: "alerts" },
  { path: "/settings", label: "설정", title: "설정", icon: "settings" },
];

export const TAB_ROUTES: readonly { path: string; label: string }[] = [
  { path: "/", label: "홈" },
  { path: "/lotto", label: "추천" },
  { path: "/stats", label: "통계" },
  { path: "/tickets", label: "내번호" },
];

/** 모르는 경로는 대시보드로 본다. */
export function routeOf(path: string): Route {
  return ROUTES.find((route) => route.path === path) ?? ROUTES[0];
}
