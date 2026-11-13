// 플랫폼 어댑터 인터페이스(02#2). 셸(apps/mobile·apps/desktop)이 네이티브 플러그인으로 구현해 주입한다.
// app-core는 @capacitor/*·@tauri-apps/*를 import하지 않는다(eslint 경계 규칙).

/**
 * 문자열 키-값 저장소(Capacitor Preferences·tauri-plugin-store 등). 값은 JSON 문자열.
 * 동시성: app-core가 쓰기를 단일 큐로 직렬화한다 — 구현은 다중 창·탭 동시 쓰기를 고려하지 않아도 된다(결정 ①).
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** prefix로 시작하는 키 목록(순서 무관). */
  keys(prefix: string): Promise<string[]>;
  /** 디스크에 즉시 반영(tauri-store save 등). 즉시 저장 저장소는 아무것도 하지 않아도 된다. */
  flush(): Promise<void>;
}

export interface Clipboard {
  writeText(text: string): Promise<void>;
}

export interface Share {
  share(content: { title?: string; text: string; url?: string }): Promise<void>;
}

/** 외부 브라우저로 열기(공식 결과 출처 링크 등). */
export interface OpenExternal {
  open(url: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

/** 암호학적 난수: 인자로 받은 배열 자체를 채운다(예: `(a) => crypto.getRandomValues(a)`). */
export interface RandomBytes {
  fill(buffer: Uint32Array): void;
}

/** fetch 응답 중 app-core가 쓰는 부분(전역 Response와 구조 호환). */
export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** fetch 주입(전역 fetch와 구조 호환). */
export type HttpFetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string> },
) => Promise<HttpResponse>;

/** 인증 사용자(세션 토큰은 app-core로 넘기지 않는다 — 셸 안의 보안 저장소에만 있다). */
export type AuthUser = { id: string; email: string | null };

/** 인증 요청 실패(셸이 Supabase 오류에서 옮긴다). code = Supabase 오류 코드, network = 서버에 닿지 못함. 문구·토큰을 담지 않는다. */
export type AuthFailure = { code: string | null; status: number | null; network?: boolean };

/** 6자리 코드 종류(메일 링크·딥링크 없음, task-043 결정 ①). */
export type OtpType = "signup" | "recovery";

/** 가입 동의 기록 행(task-043a user_consents). user_id·consented_at은 서버가 검증·기록한다. */
export type ConsentRecord = { terms_version: string; privacy_version: string; adult_confirmed: true };

/**
 * 인증 클라이언트(task-043). 셸이 Supabase Auth로 구현한다 — 세션은 Keychain/Keystore 보안 저장소에만(.claude/rules/mobile.md).
 * 실패는 throw 대신 AuthFailure로 돌려준다(getUser는 저장소 읽기·복호화 실패 시 throw).
 */
export interface AuthClient {
  /** 이 기기에 저장된 세션의 사용자(없으면 null). 복호화 실패는 셸이 저장 값을 지우고 null, 그 밖의 읽기 실패는 throw. */
  getUser(): Promise<AuthUser | null>;
  /** 세션 변화(로그인·로그아웃·만료) 구독. 해제 함수를 돌려준다. */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<AuthFailure | null>;
  resendSignup(email: string): Promise<AuthFailure | null>;
  verifyOtp(email: string, token: string, type: OtpType): Promise<AuthFailure | null>;
  signIn(email: string, password: string): Promise<AuthFailure | null>;
  requestReset(email: string): Promise<AuthFailure | null>;
  /** 로그인 상태에서 비밀번호 변경(재설정 코드 확인 직후). */
  updatePassword(password: string): Promise<AuthFailure | null>;
  insertConsent(userId: string, consent: ConsentRecord): Promise<AuthFailure | null>;
  /** 본인 동의 기록(user_consents) 중 현재 약관·개인정보 버전과 같은 행이 있는지(개정 시 재동의). 조회 실패(오프라인 등)는 throw. */
  hasConsent(userId: string, versions: Pick<ConsentRecord, "terms_version" | "privacy_version">): Promise<boolean>;
  /** 계정 삭제 Edge Function(account-delete, JWT 필수). */
  deleteAccount(): Promise<AuthFailure | null>;
  /** 이 기기에서만 로그아웃(scope local). */
  signOut(): Promise<void>;
  /** 서버 응답과 무관하게 이 기기의 세션 저장 값을 지운다. */
  clearLocalSession(): Promise<void>;
}

/** 사주 프로필 행(A-17 fortune_profiles). 생년월일·시진은 개인정보 — 로그·분석·로컬 저장소에 남기지 않는다. */
export type FortuneProfileRow = {
  birth_date: string;
  calendar: "solar" | "lunar";
  is_leap_month: boolean;
  birth_hour: string | null;
};

/** 프로필 요청 실패(셸이 PostgREST 오류에서 코드만 옮긴다). detail·message·hint(생년월일 원문 포함 가능)는 담지 않는다. */
export type FortuneProfileFailure = { code: string | null; status: number | null; network?: boolean };

export type FortuneProfileResult<T> = { ok: true; value: T } | { ok: false; failure: FortuneProfileFailure };

/**
 * 사주 프로필 클라이언트(task-041). 셸이 auth와 같은 Supabase 클라이언트로 구현한다.
 * user_id는 호출 시점 세션 uid를 셸이 넣는다(세션 없으면 status 401 실패).
 */
export interface FortuneProfileClient {
  /** 본인 행(0행이면 null). */
  get(): Promise<FortuneProfileResult<FortuneProfileRow | null>>;
  /** 5개 열을 항상 모두 보내 upsert(이전 값 잔존 방지). */
  upsert(row: FortuneProfileRow): Promise<FortuneProfileResult<null>>;
  delete(): Promise<FortuneProfileResult<null>>;
}

export interface Adapters {
  store: KeyValueStore;
  clock: Clock;
  random: RandomBytes;
  fetch: HttpFetch;
  clipboard: Clipboard;
  share: Share;
  openExternal: OpenExternal;
  /** 로그인(P1, 선택). 없으면 AppCore.auth = null(게스트 전용 — Windows는 task-043b). */
  auth?: AuthClient;
  /** 사주 프로필(P1, task-041). 없으면 AppCore.fortuneProfile = null. */
  fortuneProfile?: FortuneProfileClient;
}

/** 셸이 빌드 설정에서 주입하는 공개 값. publishable(anon) 키만 — 서버 키 금지(AGENTS 4장). */
export interface AppConfig {
  supabaseUrl: string;
  publishableKey: string;
}
