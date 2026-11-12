/// <reference types="vite/client" />
// 번들에 들어가는 공개 환경변수(VITE_*). 서버 키는 여기에 추가하지 않는다.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
