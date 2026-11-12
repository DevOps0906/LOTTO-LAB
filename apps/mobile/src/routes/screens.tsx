// 라우트 → 화면. 화면 로직은 @lotto-lab/ui(screens)에 있고, 셸은 app-core 인스턴스와 해시 링크만 넘긴다.
import type { AppCore } from "@lotto-lab/app-core";
import { GenerateSelect, Home } from "@lotto-lab/ui";
import { href } from "../routes.ts";
import { Placeholder } from "../screens/Placeholder.tsx";

const HOME_LINKS = {
  generate: href("/generate"),
  lotto: href("/generate/lotto"),
  pension: href("/generate/pension"),
  stats: href("/stats"),
  tickets: href("/tickets"),
};
const SELECT_LINKS = { home: href("/"), lotto: href("/generate/lotto"), pension: href("/generate/pension") };

export function RouteScreen({ path, title, core }: { path: string; title: string; core: AppCore }) {
  switch (path) {
    case "/":
      return <Home core={core} links={HOME_LINKS} />;
    case "/generate":
      return <GenerateSelect core={core} links={SELECT_LINKS} />;
    default:
      return <Placeholder title={title} />;
  }
}
