// 라우트 → 화면. 화면 로직은 @lotto-lab/ui(screens)에 있고, 셸은 app-core 인스턴스와 해시 링크만 넘긴다.
// 생성기 주소에 `?from=last`가 붙으면 지난 설정을 복원해 연다("지난 설정으로 다시 만들기").
import type { AppCore } from "@lotto-lab/app-core";
import { GenerateSelect, Home, LottoGenerator, PensionGenerator } from "@lotto-lab/ui";
import { href } from "../routes.ts";
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

/** query = 해시 경로의 `?` 뒤(없으면 빈 문자열). */
export function RouteScreen({ path, query = "", title, core }: { path: string; query?: string; title: string; core: AppCore }) {
  const restoreLast = new URLSearchParams(query).get("from") === "last";
  switch (path) {
    case "/":
      return <Home core={core} links={HOME_LINKS} />;
    case "/generate":
      return <GenerateSelect core={core} links={SELECT_LINKS} />;
    case "/generate/lotto":
      return <LottoGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} />;
    case "/generate/pension":
      return <PensionGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} />;
    default:
      return <Placeholder title={title} />;
  }
}
