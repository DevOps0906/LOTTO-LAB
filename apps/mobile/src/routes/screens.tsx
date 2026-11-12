// 라우트 → 화면. 화면 로직은 @lotto-lab/ui(screens)에 있고, 셸은 app-core 인스턴스와 해시 링크만 넘긴다.
// 생성기 주소에 `?from=last`가 붙으면 지난 설정을 복원해 연다("지난 설정으로 다시 만들기").
import type { AppCore } from "@lotto-lab/app-core";
import { DrawDetail, DrawList, GenerateSelect, Home, LottoGenerator, PensionGenerator, Statistics } from "@lotto-lab/ui";
import { DRAW_DETAIL, drawDetailHref, drawsHref, href } from "../routes.ts";
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
const DRAW_LINKS = { home: href("/"), stats: href("/stats"), tickets: href("/tickets"), list: drawsHref, detail: drawDetailHref };

type Game = "lotto" | "pension";
const gameOf = (value: string | null | undefined): Game => (value === "pension" ? "pension" : "lotto");
/** 주소의 회차: 1~6자리 정수 ≥1이 아니면 null. */
const roundOf = (value: string): number | null => (/^[0-9]{1,6}$/.test(value) && Number(value) >= 1 ? Number(value) : null);

function navigate(target: string) {
  window.location.hash = target.replace(/^#/, "");
}

/** query = 해시 경로의 `?` 뒤(없으면 빈 문자열). */
export function RouteScreen({ path, query = "", title, core }: { path: string; query?: string; title: string; core: AppCore }) {
  const params = new URLSearchParams(query);
  const restoreLast = params.get("from") === "last";
  const detail = DRAW_DETAIL.exec(path);
  if (detail) return <DrawDetail core={core} game={gameOf(detail[1])} round={roundOf(detail[2]!)} links={DRAW_LINKS} />;
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
    default:
      return <Placeholder title={title} />;
  }
}
