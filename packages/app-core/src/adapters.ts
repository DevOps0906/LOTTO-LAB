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

export interface Adapters {
  store: KeyValueStore;
  clock: Clock;
  random: RandomBytes;
  fetch: HttpFetch;
  clipboard: Clipboard;
  share: Share;
  openExternal: OpenExternal;
}

/** 셸이 빌드 설정에서 주입하는 공개 값. publishable(anon) 키만 — 서버 키 금지(AGENTS 4장). */
export interface AppConfig {
  supabaseUrl: string;
  publishableKey: string;
}
