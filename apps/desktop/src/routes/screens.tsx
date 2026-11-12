// 라우트 → 화면. 화면 로직은 @lotto-lab/ui(screens)에 있고, 셸은 app-core 인스턴스와 해시 링크만 넘긴다.
// D 화면은 M 화면 컴포넌트를 재사용하고 배치만 넓힌다(ADR-0004 — layout="split"/"wide"). 아직 없는 화면(알림 P1)은 Placeholder.
// Windows 공유는 클립보드 복사(platform/share.ts)라 "복사"와 겹치는 공유 버튼은 숨긴다(canShare=false).
// 생성기 주소에 `?from=last`가 붙으면 지난 설정을 복원해 연다("지난 설정으로 다시 만들기").
import type { AppCore } from "@lotto-lab/app-core";
import {
  Dashboard,
  DrawDetail,
  DrawList,
  LottoGenerator,
  MyTickets,
  PensionGenerator,
  PurchaseRegister,
  Settings,
  Statistics,
  TicketCheck,
  TicketDetail,
  type CsvExporter,
  type MyTicketsTab,
  type ThemePreference,
} from "@lotto-lab/ui";
import { version as APP_VERSION } from "../../package.json";
import { DRAW_DETAIL, TICKET_DETAIL, drawDetailHref, drawsHref, href, registerFromHref, ticketDetailHref } from "../routes.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

const LAST = "?from=last";
const DASHBOARD_LINKS = {
  // Windows에는 추천 선택(M-15)이 없다 — 번호 생성은 로또 생성으로 간다(연금 생성은 사이드바·상품 카드).
  generate: href("/lotto"),
  lotto: href("/lotto"),
  pension: href("/pension"),
  lottoLast: href(`/lotto${LAST}`),
  pensionLast: href(`/pension${LAST}`),
  settings: href("/settings"),
  stats: href("/stats"),
  tickets: href("/tickets"),
  draws: href("/draws"),
  register: href("/tickets/register"),
};
// split 배치는 이동 경로(breadcrumb)를 그리지 않는다 — 사이드바가 내비를 맡는다.
const GENERATOR_LINKS = { home: href("/"), generate: href("/"), stats: href("/stats") };
const STATS_LINKS = { home: href("/"), draws: drawsHref, detail: drawDetailHref };
// D-08 "구매번호 확인" → 구매 기록 당첨 확인.
const DRAW_LINKS = { home: href("/"), stats: href("/stats"), tickets: href("/tickets/check"), list: drawsHref, detail: drawDetailHref };
const TICKETS_LINKS = {
  generate: href("/lotto"),
  settings: href("/settings"),
  register: href("/tickets/register"),
  registerFrom: registerFromHref,
  check: href("/tickets/check"),
  detail: ticketDetailHref,
};
const CHECK_LINKS = { tickets: href("/tickets?tab=purchased"), register: href("/tickets/register"), detail: ticketDetailHref };
const DETAIL_LINKS = { tickets: href("/tickets"), registerFrom: registerFromHref, drawDetail: drawDetailHref };
const REGISTER_LINKS = { tickets: href("/tickets"), detail: ticketDetailHref };
const TABS: readonly MyTicketsTab[] = ["favorite", "purchased", "generated"];
const tabOf = (value: string | null): MyTicketsTab => TABS.find((t) => t === value) ?? "favorite";

type Game = "lotto" | "pension";
const gameOf = (value: string | null | undefined): Game => (value === "pension" ? "pension" : "lotto");
/** 주소의 회차: 1~6자리 정수 ≥1이 아니면 null. */
const roundOf = (value: string): number | null => (/^[0-9]{1,6}$/.test(value) && Number(value) >= 1 ? Number(value) : null);

function navigate(target: string) {
  window.location.hash = target.replace(/^#/, "");
}

/**
 * 회차 목록의 복권 선택을 주소에 남긴다(이력 교체, hashchange 없음) — 상세에서 뒤로 오면 같은 복권으로 복원(D-14 검색 상태 복원).
 */
function rememberDrawsGame(game: Game) {
  window.history.replaceState(window.history.state, "", drawsHref(game));
}

export type RouteScreenProps = {
  path: string;
  /** 해시 경로의 `?` 뒤(없으면 빈 문자열) */
  query?: string;
  title: string;
  core: AppCore;
  onThemeChange?: (theme: ThemePreference) => void;
  onCleared?: () => void;
  /** CSV 내보내기(없으면 버튼 숨김) */
  csv?: CsvExporter;
};

export function RouteScreen({ path, query = "", title, core, onThemeChange = () => {}, onCleared = () => {}, csv }: RouteScreenProps) {
  const params = new URLSearchParams(query);
  const restoreLast = params.get("from") === "last";
  const detail = DRAW_DETAIL.exec(path);
  if (detail) return <DrawDetail core={core} game={gameOf(detail[1])} round={roundOf(detail[2]!)} links={DRAW_LINKS} layout="wide" />;
  const ticket = TICKET_DETAIL.exec(path);
  if (ticket) {
    return <TicketDetail core={core} ticketId={ticket[1]!} links={DETAIL_LINKS} navigate={navigate} layout="wide" canShare={false} />;
  }
  switch (path) {
    case "/":
      return <Dashboard core={core} links={DASHBOARD_LINKS} csv={csv} />;
    case "/lotto":
      return <LottoGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} layout="split" canShare={false} />;
    case "/pension":
      return <PensionGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} layout="split" canShare={false} />;
    case "/stats":
      return <Statistics core={core} links={STATS_LINKS} initialGame={gameOf(params.get("game"))} layout="wide" />;
    case "/draws":
      return (
        <DrawList
          core={core}
          links={DRAW_LINKS}
          navigate={navigate}
          initialGame={gameOf(params.get("game"))}
          layout="wide"
          onGameChange={rememberDrawsGame}
        />
      );
    case "/tickets":
      return (
        <MyTickets
          core={core}
          links={TICKETS_LINKS}
          navigate={navigate}
          initialTab={tabOf(params.get("tab"))}
          layout="wide"
          csv={csv}
          canShare={false}
        />
      );
    case "/tickets/check":
      return <TicketCheck core={core} links={CHECK_LINKS} />;
    case "/tickets/register":
      return (
        <PurchaseRegister
          core={core}
          links={REGISTER_LINKS}
          navigate={navigate}
          fromTicketId={params.get("ticket") ?? undefined}
          initialGame={gameOf(params.get("game"))}
          layout="wide"
        />
      );
    case "/settings":
      return <Settings core={core} appVersion={APP_VERSION} onThemeChange={onThemeChange} onCleared={onCleared} canShare={false} />;
    default:
      return <Placeholder title={title} />;
  }
}
