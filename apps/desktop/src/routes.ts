// 내비 정본(DESIGN.md 4.4, docs/03 D-01): 사이드바 8항목. 1200~ 아이콘+라벨, 768~1199 아이콘 레일(라벨은 툴팁).
// 창 최소 폭 1024라 하단 탭은 보이지 않지만 AppShell 계약상 같은 4개 맥락(홈·추천·통계·내번호)을 넘긴다.
// 하위 화면(회차 상세·내 번호 상세·구매 등록·당첨 확인)은 사이드바 항목이 아니고, 소속 항목(회차·내 번호)을 현재로 표시한다.
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

/** 회차 상세(D-08) 주소: /draws/{lotto|pension}/{회차}. 회차가 숫자가 아니면 화면이 잘못된 주소로 안내한다. */
export const DRAW_DETAIL = /^\/draws\/(lotto|pension)\/([^/]+)$/;

/** 내 번호 상세(D-06) 주소: /tickets/{저장 번호 id}. 목록에 없는 id면 화면이 안내한다. */
export const TICKET_DETAIL = /^\/tickets\/([0-9a-f-]{36})$/;

const SUB_ROUTES: readonly { path: string; parent: string; title: string }[] = [
  { path: "/tickets/register", parent: "/tickets", title: "구매 등록" },
  { path: "/tickets/check", parent: "/tickets", title: "당첨 확인" },
];

/** 해시 주소(셸 링크용). */
export const href = (path: string): string => `#${path}`;

export const drawsHref = (game: "lotto" | "pension"): string => href(`/draws?game=${game}`);
export const drawDetailHref = (game: "lotto" | "pension", round: number): string => href(`/draws/${game}/${round}`);
export const ticketDetailHref = (id: string): string => href(`/tickets/${id}`);
export const registerFromHref = (ticketId: string): string => href(`/tickets/register?ticket=${encodeURIComponent(ticketId)}`);

/**
 * 주소 → 사이드바 항목(현재 표시)과 화면 제목. screen = 화면을 고를 경로(모르는 경로는 대시보드 "/").
 */
export function routeOf(path: string): Route & { screen: string } {
  const sub = SUB_ROUTES.find((r) => r.path === path);
  if (sub) return { ...ROUTES.find((r) => r.path === sub.parent)!, title: sub.title, screen: path };
  if (DRAW_DETAIL.test(path)) return { ...ROUTES.find((r) => r.path === "/draws")!, title: "회차 상세", screen: path };
  if (TICKET_DETAIL.test(path)) return { ...ROUTES.find((r) => r.path === "/tickets")!, title: "내 번호 상세", screen: path };
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  return { ...route, screen: route.path };
}
