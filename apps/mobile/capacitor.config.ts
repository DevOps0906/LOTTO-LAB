// Capacitor 8 설정. 앱 ID kr.lottolab.app(사용자 결정, 변경 불가).
// 보안(.claude/rules/mobile.md): cleartext 금지·https 스킴·외부 탐색 허용 없음. server.url은 개발 라이브 리로드에서만
// CAP_SERVER_URL 환경변수로 켠다 — 릴리스 전 `pnpm check:release`가 server.url·cleartext가 없는지 확인한다.
// WebView 원격 디버깅은 Capacitor 기본값(디버그 빌드만 켜짐)을 따른다.
import type { CapacitorConfig } from "@capacitor/cli";

const devServerUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "kr.lottolab.app",
  appName: "LOTTO LAB",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: false,
    allowNavigation: [],
    ...(devServerUrl ? { url: devServerUrl } : {}),
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
