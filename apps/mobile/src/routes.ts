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

/** M-06 로그인·가입·재설정 */
export const LOGIN_PATH = "/login";

export const SUB_ROUTES: readonly SubRoute[] = [
  { path: "/generate/lotto", title: "로또 번호 생성", tab: "/generate" },
  { path: "/generate/pension", title: "연금복권 번호 생성", tab: "/generate" },
  { path: "/generate/theme", title: "테마 번호", tab: "/generate" },
  { path: "/draws", title: "회차 목록", tab: "/stats" },
  { path: "/tickets/register", title: "구매 등록", tab: "/tickets" },
  { path: "/tickets/check", title: "당첨 확인", tab: "/tickets" },
  { path: "/settings", title: "설정", tab: "/settings" },
  { path: LOGIN_PATH, title: "로그인", tab: "/settings" },
];

/** 로그인 뒤 복귀 허용 경로(결정 ⑥) — 탭·하위 화면 경로만(로그인 화면 자신 제외). 상세 화면(id 포함)은 소속 목록으로 돌아간다. */
export const AUTH_RETURN_PATHS: readonly string[] = [...ROUTES.map((r) => r.path), ...SUB_ROUTES.map((r) => r.path).filter((p) => p !== LOGIN_PATH)];

/** 회차 상세(M-11) 주소: /draws/{lotto|pension}/{회차}. 회차가 숫자가 아니면 화면이 잘못된 주소로 안내한다. */
export const DRAW_DETAIL = /^\/draws\/(lotto|pension)\/([^/]+)$/;

/** 내 번호 상세(M-08) 주소: /tickets/{저장 번호 id}. 목록에 없는 id면 화면이 안내한다. */
export const TICKET_DETAIL = /^\/tickets\/([0-9a-f-]{36})$/;

export const ticketDetailHref = (id: string): string => href(`/tickets/${id}`);
export const registerFromHref = (ticketId: string): string => href(`/tickets/register?ticket=${encodeURIComponent(ticketId)}`);

export const drawsHref = (game: "lotto" | "pension"): string => href(`/draws?game=${game}`);
export const drawDetailHref = (game: "lotto" | "pension", round: number): string => href(`/draws/${game}/${round}`);

/** 해시 주소(셸 링크용). */
export const href = (path: string): string => `#${path}`;

/** 모르는 경로는 홈으로 본다. tab = 하단 탭에서 현재로 표시할 경로. */
export function routeOf(path: string): { path: string; title: string; tab: string } {
  const sub = SUB_ROUTES.find((route) => route.path === path);
  if (sub) return sub;
  if (DRAW_DETAIL.test(path)) return { path, title: "회차 상세", tab: "/stats" };
  if (TICKET_DETAIL.test(path)) return { path, title: "내 번호 상세", tab: "/tickets" };
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  return { path: route.path, title: route.title, tab: route.path };
}
