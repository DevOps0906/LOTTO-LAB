// 앱 설정(AppConfig) — Vite 공개 환경변수만 쓴다. publishable 키만 허용, 서버 키(sb_secret_ 등)는 넣지 않는다.
// 개발(DEV)에서만 URL이 없으면 로컬 Supabase 주소로 대체한다. 운영(PROD) 빌드는 대체하지 않는다 —
// URL·키가 없으면 빈 값 → app-core가 INVALID_CONFIG → 앱은 core 없이 안내만 보인다. 키는 .env.local(커밋 금지, README).
import type { AppConfig } from "@lotto-lab/app-core";

/** 개발 빌드에서만 값이 있다(운영 번들에서는 상수 접기로 빈 문자열 → 로컬 주소가 번들에 남지 않는다). */
export const LOCAL_SUPABASE_URL = import.meta.env.DEV ? "http://127.0.0.1:54521" : "";

type PublicEnv = { PROD?: boolean; VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string };

export function readAppConfig(env: PublicEnv = import.meta.env): AppConfig {
  const fallback = env.PROD ? "" : LOCAL_SUPABASE_URL;
  return {
    supabaseUrl: env.VITE_SUPABASE_URL?.trim() || fallback,
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
  };
}
