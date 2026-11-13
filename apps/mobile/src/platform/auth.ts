// AuthClient ← Supabase Auth(@supabase/supabase-js). 클라이언트는 앱에 하나(task-043 결정 ②③).
// 세션은 보안 저장소(Android Keystore AES-GCM · iOS Keychain ThisDeviceOnly·iCloud 동기화 없음)에만 둔다 — Preferences·localStorage 금지.
// 웹(개발 서버·테스트)에서는 메모리에만 둔다(플러그인 웹 구현은 localStorage라 쓰지 않는다). 토큰·이메일은 로그에 남기지 않는다.
// 메일 링크·딥링크 없음: 가입 확인·재설정은 6자리 코드(verifyOtp), detectSessionInUrl false.
import { KeychainAccess, SecureStorage, StorageError, StorageErrorType } from "@aparajita/capacitor-secure-storage";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type {
  AppConfig,
  AuthClient,
  AuthFailure,
  AuthUser,
  FortuneProfileClient,
  FortuneProfileFailure,
  FortuneProfileResult,
  FortuneProfileRow,
} from "@lotto-lab/app-core";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  createClient,
  isAuthRetryableFetchError,
  type AuthError,
  type SupabaseClient,
  type SupportedStorage,
  type User,
} from "@supabase/supabase-js";

/** Supabase 세션 저장 키(보안 저장소 안). */
export const AUTH_STORAGE_KEY = "ll-auth";
const STORAGE_KEYS = [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`];

/** 메모리 저장소(웹·테스트). 앱을 다시 열면 로그아웃 상태다. */
export function memoryStorage(): SupportedStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => void map.set(key, value),
    removeItem: async (key) => void map.delete(key),
  };
}

/**
 * 네이티브 보안 저장소. 복호화 실패(invalidData)는 값을 지우고 없는 것으로 본다 → 로그아웃 상태(결정 ③).
 * 그 밖의 읽기 오류는 지우지 않고 throw → AuthService가 unavailable(재시도 안내).
 */
export function secureStorage(): SupportedStorage {
  const ready = (async () => {
    await SecureStorage.setKeyPrefix("lottolab_");
    await SecureStorage.setSynchronize(false);
    await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  })();
  return {
    async getItem(key) {
      await ready;
      try {
        return await SecureStorage.getItem(key);
      } catch (error) {
        if (error instanceof StorageError && error.code === StorageErrorType.invalidData) {
          await SecureStorage.removeItem(key).catch(() => {});
          return null;
        }
        throw error;
      }
    },
    async setItem(key, value) {
      await ready;
      await SecureStorage.setItem(key, value);
    },
    async removeItem(key) {
      await ready;
      await SecureStorage.removeItem(key);
    },
  };
}

const userOf = (user: User): AuthUser => ({ id: user.id, email: user.email ?? null });

/** Supabase 오류 → AuthFailure(문구·토큰 제외). */
export function failureOf(error: AuthError | null): AuthFailure | null {
  if (!error) return null;
  if (isAuthRetryableFetchError(error)) return { code: null, status: 0, network: true };
  return { code: error.code ?? null, status: error.status ?? null };
}

/** 앱에 하나인 Supabase 클라이언트(auth·사주 프로필이 같은 세션을 쓴다, task-041 결정 ①). */
function createSupabase(config: AppConfig, storage: SupportedStorage): SupabaseClient {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      storage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

const PROFILE_COLUMNS = "birth_date,calendar,is_leap_month,birth_hour";

/** PostgREST 오류 → 코드만(message·detail·hint는 생년월일 원문을 담을 수 있어 버린다). */
function profileFailure(error: { code?: string }, status: number): FortuneProfileFailure {
  return status === 0 ? { code: null, status: 0, network: true } : { code: error.code || null, status };
}

/** 사주 프로필(A-17). user_id는 호출 시점 세션 uid. 세션이 없으면 401. */
export function createFortuneProfileClient(supabase: SupabaseClient): FortuneProfileClient {
  const uid = async (): Promise<string | null> => (await supabase.auth.getSession()).data.session?.user.id ?? null;
  const noSession = (): FortuneProfileResult<never> => ({ ok: false, failure: { code: null, status: 401 } });
  return {
    async get() {
      const { data, error, status } = await supabase.from("fortune_profiles").select(PROFILE_COLUMNS).limit(1);
      if (error) return { ok: false, failure: profileFailure(error, status) };
      return { ok: true, value: (data[0] as FortuneProfileRow | undefined) ?? null };
    },
    async upsert(row) {
      const user_id = await uid();
      if (!user_id) return noSession();
      // 5개 열 모두 명시(birth_hour null 포함) — 이전 값 잔존 방지.
      const { error, status } = await supabase.from("fortune_profiles").upsert(
        { user_id, birth_date: row.birth_date, calendar: row.calendar, is_leap_month: row.is_leap_month, birth_hour: row.birth_hour },
        { onConflict: "user_id" },
      );
      return error ? { ok: false, failure: profileFailure(error, status) } : { ok: true, value: null };
    },
    async delete() {
      const user_id = await uid();
      if (!user_id) return noSession();
      const { error, status } = await supabase.from("fortune_profiles").delete().eq("user_id", user_id);
      return error ? { ok: false, failure: profileFailure(error, status) } : { ok: true, value: null };
    },
  };
}

const defaultStorage = (): SupportedStorage => (Capacitor.isNativePlatform() ? secureStorage() : memoryStorage());

/** auth·사주 프로필 클라이언트를 같은 Supabase 클라이언트(= 같은 세션)로 만든다. */
export function createSupabaseClients(config: AppConfig, storage: SupportedStorage = defaultStorage()): { auth: AuthClient; fortuneProfile: FortuneProfileClient } {
  const supabase = createSupabase(config, storage);
  return { auth: authClientOf(supabase, storage), fortuneProfile: createFortuneProfileClient(supabase) };
}

export function createAuthClient(config: AppConfig, storage: SupportedStorage = defaultStorage()): AuthClient {
  return authClientOf(createSupabase(config, storage), storage);
}

function authClientOf(supabase: SupabaseClient, storage: SupportedStorage): AuthClient {
  const auth = supabase.auth;

  // 앱이 앞으로 오면 토큰 자동 갱신, 뒤로 가면 멈춘다(결정 ③).
  if (Capacitor.isNativePlatform()) {
    void App.addListener("appStateChange", ({ isActive }) => {
      void (isActive ? auth.startAutoRefresh() : auth.stopAutoRefresh());
    });
  }

  async function clearLocalSession() {
    await Promise.all(STORAGE_KEYS.map((key) => storage.removeItem(key)));
  }

  return {
    async getUser() {
      const { data, error } = await auth.getSession();
      if (error) throw error;
      return data.session ? userOf(data.session.user) : null;
    },
    onChange(listener) {
      // 콜백 안에서 supabase 호출을 기다리지 않는다(내부 잠금 교착 방지).
      const { data } = auth.onAuthStateChange((_event, session) => listener(session ? userOf(session.user) : null));
      return () => data.subscription.unsubscribe();
    },
    async signUp(email, password) {
      return failureOf((await auth.signUp({ email, password })).error);
    },
    async resendSignup(email) {
      return failureOf((await auth.resend({ type: "signup", email })).error);
    },
    async verifyOtp(email, token, type) {
      return failureOf((await auth.verifyOtp({ email, token, type })).error);
    },
    async signIn(email, password) {
      return failureOf((await auth.signInWithPassword({ email, password })).error);
    },
    async requestReset(email) {
      return failureOf((await auth.resetPasswordForEmail(email)).error);
    },
    async updatePassword(password) {
      return failureOf((await auth.updateUser({ password })).error);
    },
    async insertConsent(userId, consent) {
      const { error, status } = await supabase.from("user_consents").insert({ user_id: userId, ...consent });
      if (!error) return null;
      return status === 0 ? { code: null, status: 0, network: true } : { code: error.code || null, status };
    },
    async hasConsent(userId, versions) {
      // 본인 행만 보인다(RLS user_consents_select_own). 현재 버전과 같은 행만 인정(개정 시 재동의).
      // 조회 실패는 throw → AuthService가 checkFailed로 재시도 안내.
      const { data, error } = await supabase
        .from("user_consents")
        .select("user_id")
        .eq("user_id", userId)
        .eq("terms_version", versions.terms_version)
        .eq("privacy_version", versions.privacy_version)
        .limit(1);
      if (error) throw new Error("consent check failed");
      return data.length > 0;
    },
    // 호출 전 AuthService가 같은 이메일·비밀번호로 다시 로그인해 새 액세스 토큰(amr password)을 받는다.
    async deleteAccount() {
      const { error } = await supabase.functions.invoke("account-delete", { method: "POST" });
      if (!error) return null;
      if (error instanceof FunctionsFetchError) return { code: null, status: 0, network: true };
      if (error instanceof FunctionsHttpError) {
        const response = error.context as Response;
        // 본문 {code}만 읽는다(예: 403 REAUTH_REQUIRED — 최근 10분 안의 비밀번호 인증 필요).
        const body: unknown = await response.json().catch(() => null);
        const code = body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : null;
        return { code, status: response.status };
      }
      return { code: null, status: null };
    },
    async signOut() {
      // scope local: 이 기기 세션만. 서버 호출 실패 시 supabase가 저장 값을 남길 수 있어 아래에서 직접 지운다.
      try {
        await auth.signOut({ scope: "local" });
      } finally {
        await clearLocalSession();
      }
    },
    clearLocalSession,
  };
}
