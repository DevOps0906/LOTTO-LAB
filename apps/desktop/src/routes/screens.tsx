// 라우트 → 화면. 화면 로직은 @lotto-lab/ui(screens)에 있고, 셸은 app-core 인스턴스와 해시 링크만 넘긴다.
// D 화면은 M 화면 컴포넌트를 재사용하고 배치만 넓힌다(ADR-0004). 아직 없는 화면은 Placeholder.
// Windows 공유는 클립보드 복사(platform/share.ts)라 "복사"와 겹치는 공유 버튼은 숨긴다(canShare=false).
// 생성기 주소에 `?from=last`가 붙으면 지난 설정을 복원해 연다("지난 설정으로 다시 만들기").
import type { AppCore } from "@lotto-lab/app-core";
import { Dashboard, LottoGenerator, PensionGenerator, Settings, type ThemePreference } from "@lotto-lab/ui";
import { version as APP_VERSION } from "../../package.json";
import { href } from "../routes.ts";
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
  // 통계·내 번호·회차·구매 등록은 아직 준비 중(Placeholder) — 링크를 넘기지 않아 화면 안 바로가기를 숨긴다.
  // 화면이 생기면 stats·tickets·draws·register를 추가한다. 사이드바 항목은 그대로 두고 준비 중 화면으로 간다.
};
// split 배치는 이동 경로(breadcrumb)를 그리지 않는다 — 사이드바가 내비를 맡는다. 통계 링크는 통계 화면이 생기면 추가.
const GENERATOR_LINKS = { home: href("/"), generate: href("/") };

export type RouteScreenProps = {
  path: string;
  /** 해시 경로의 `?` 뒤(없으면 빈 문자열) */
  query?: string;
  title: string;
  core: AppCore;
  onThemeChange?: (theme: ThemePreference) => void;
  onCleared?: () => void;
};

export function RouteScreen({ path, query = "", title, core, onThemeChange = () => {}, onCleared = () => {} }: RouteScreenProps) {
  const restoreLast = new URLSearchParams(query).get("from") === "last";
  switch (path) {
    case "/":
      return <Dashboard core={core} links={DASHBOARD_LINKS} />;
    case "/lotto":
      return <LottoGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} layout="split" canShare={false} />;
    case "/pension":
      return <PensionGenerator core={core} links={GENERATOR_LINKS} restoreLast={restoreLast} layout="split" canShare={false} />;
    case "/settings":
      return <Settings core={core} appVersion={APP_VERSION} onThemeChange={onThemeChange} onCleared={onCleared} canShare={false} />;
    default:
      return <Placeholder title={title} />;
  }
}
