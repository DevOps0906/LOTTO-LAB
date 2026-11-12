// 라우트 → 화면. 화면 로직은 @lotto-lab/ui(screens)에 있고, 셸은 app-core 인스턴스와 해시 링크만 넘긴다.
// 생성기 주소에 `?from=last`가 붙으면 지난 설정을 복원해 연다("지난 설정으로 다시 만들기").
import type { AppCore } from "@lotto-lab/app-core";
import {
  DrawDetail,
  DrawList,
  GenerateSelect,
  Home,
  LottoGenerator,
  MyTickets,
  PensionGenerator,
  PurchaseRegister,
  Settings,
  Statistics,
  TicketCheck,
  TicketDetail,
  type MyTicketsTab,
  type ThemePreference,
} from "@lotto-lab/ui";
import { version as APP_VERSION } from "../../package.json";
import { DRAW_DETAIL, TICKET_DETAIL, drawDetailHref, drawsHref, href, registerFromHref, ticketDetailHref } from "../routes.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

const LAST = "?from=last";
const HOME_LINKS = {
  generate: href("/generate"),
  lotto: href("/generate/lotto"),
  pension: href("/generate/pension"),
  lottoLast: href(`/generate/lotto${LAST}`),
  pensionLast: href(`/generate/pension${LAST}`),
  stats: href("/stats"),
  tickets: href("/tickets"),
  settings: href("/settings"),
};
const SELECT_LINKS = {
  home: href("/"),
  lotto: href("/generate/lotto"),
  pension: href("/generate/pension"),
  lottoLast: HOME_LINKS.lottoLast,
  pensionLast: HOME_LINKS.pensionLast,
};
const GENERATOR_LINKS = { home: href("/"), generate: href("/generate"), stats: href("/stats") };
const STATS_LINKS = { home: href("/"), draws: drawsHref };
// M-11 "내 번호에서 확인하기" → 구매 기록 당첨 확인(M-08).
const DRAW_LINKS = { home: href("/"), stats: href("/stats"), tickets: href("/tickets/check"), list: drawsHref, detail: drawDetailHref };
const TICKETS_LINKS = {
  generate: href("/generate"),
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

export type RouteScreenProps = {
  path: string;
  /** 해시 경로의 `?` 뒤(없으면 빈 문자열) */
  query?: string;
  title: string;
  core: AppCore;
  onThemeChange?: (theme: ThemePreference) => void;
  onCleared?: () => void;
};

export function RouteScreen({ path, query = "", title, core, onThemeChange = () => {}, onCleared = () => navigate(href("/")) }: RouteScreenProps) {
  const params = new URLSearchParams(query);
  const restoreLast = params.get("from") === "last";
  const detail = DRAW_DETAIL.exec(path);
  if (detail) return <DrawDetail core={core} game={gameOf(detail[1])} round={roundOf(detail[2]!)} links={DRAW_LINKS} />;
  const ticket = TICKET_DETAIL.exec(path);
  if (ticket) return <TicketDetail core={core} ticketId={ticket[1]!} links={DETAIL_LINKS} navigate={navigate} />;
  switch (path) {
    case "/":
      return <Home core={core} links={HOME_LINKS} />;
    case "/generate":
      return <GenerateSelect core={core} links={SELECT_LINKS} />;
    case "/generate/lotto":
      return <LottoGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} />;
    case "/generate/pension":
      return <PensionGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} />;
    case "/stats":
      return <Statistics core={core} links={STATS_LINKS} initialGame={gameOf(params.get("game"))} />;
    case "/draws":
      return <DrawList core={core} links={DRAW_LINKS} navigate={navigate} initialGame={gameOf(params.get("game"))} />;
    case "/tickets":
      return <MyTickets core={core} links={TICKETS_LINKS} navigate={navigate} initialTab={tabOf(params.get("tab"))} />;
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
        />
      );
    case "/settings":
      return <Settings core={core} appVersion={APP_VERSION} onThemeChange={onThemeChange} onCleared={onCleared} />;
    default:
      return <Placeholder title={title} />;
  }
}
