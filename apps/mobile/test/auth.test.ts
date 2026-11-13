// 인증 어댑터(task-043): 보안 저장소 복호화 실패 처리·오류 변환·로그아웃 시 로컬 세션 삭제·웹은 메모리 저장(localStorage 미사용).
import { describe, expect, it, vi } from "vitest";

const secure = vi.hoisted(() => {
  const data = new Map<string, string>();
  class StorageError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return { data, StorageError, failNext: null as null | string };
});

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
  StorageErrorType: { invalidData: "invalidData", osError: "osError" },
  StorageError: secure.StorageError,
  SecureStorage: {
    setKeyPrefix: vi.fn(async () => {}),
    setSynchronize: vi.fn(async () => {}),
    setDefaultKeychainAccess: vi.fn(async () => {}),
    getItem: vi.fn(async (key: string) => {
      if (secure.failNext) {
        const code = secure.failNext;
        secure.failNext = null;
        throw new secure.StorageError("fail", code);
      }
      return secure.data.get(key) ?? null;
    }),
    setItem: vi.fn(async (key: string, value: string) => void secure.data.set(key, value)),
    removeItem: vi.fn(async (key: string) => void secure.data.delete(key)),
  },
}));

const { AUTH_STORAGE_KEY, createAuthClient, failureOf, memoryStorage, secureStorage } = await import("../src/platform/auth.ts");
const { SecureStorage, KeychainAccess } = await import("@aparajita/capacitor-secure-storage");
const { AuthError, AuthRetryableFetchError } = await import("@supabase/supabase-js");

describe("보안 저장소", () => {
  it("iCloud 동기화 끔·ThisDeviceOnly, 복호화 실패(invalidData)는 값을 지우고 null", async () => {
    const storage = secureStorage();
    await storage.setItem(AUTH_STORAGE_KEY, "{}");
    expect(SecureStorage.setSynchronize).toHaveBeenCalledWith(false);
    expect(SecureStorage.setDefaultKeychainAccess).toHaveBeenCalledWith(KeychainAccess.whenUnlockedThisDeviceOnly);
    secure.failNext = "invalidData";
    expect(await storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(secure.data.has(AUTH_STORAGE_KEY)).toBe(false);
  });

  it("그 밖의 읽기 오류는 지우지 않고 throw(AuthService가 unavailable로 재시도 안내)", async () => {
    const storage = secureStorage();
    await storage.setItem(AUTH_STORAGE_KEY, "{}");
    secure.failNext = "osError";
    await expect(storage.getItem(AUTH_STORAGE_KEY)).rejects.toThrow();
    expect(secure.data.has(AUTH_STORAGE_KEY)).toBe(true);
  });
});

describe("오류 변환", () => {
  it("코드·상태만 옮기고, 연결 실패는 network", () => {
    expect(failureOf(null)).toBeNull();
    expect(failureOf(new AuthError("bad", 400, "invalid_credentials"))).toEqual({ code: "invalid_credentials", status: 400 });
    expect(failureOf(new AuthRetryableFetchError("offline", 0))).toEqual({ code: null, status: 0, network: true });
  });
});

describe("createAuthClient", () => {
  it("웹에서는 localStorage에 세션을 쓰지 않는다", async () => {
    const client = createAuthClient({ supabaseUrl: "http://127.0.0.1:9", publishableKey: "sb_publishable_test" }, memoryStorage());
    expect(await client.getUser()).toBeNull();
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("signOut: 서버에 닿지 못해도 저장된 세션을 지운다", async () => {
    const storage = memoryStorage();
    const session = {
      access_token: "header.payload.signature",
      refresh_token: "r",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "00000000-0000-4000-8000-000000000001", email: "a@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-11-13T00:00:00Z" },
    };
    await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    const client = createAuthClient({ supabaseUrl: "http://127.0.0.1:9", publishableKey: "sb_publishable_test" }, storage);
    expect(await client.getUser()).toEqual({ id: session.user.id, email: "a@example.com" });
    await client.signOut().catch(() => {});
    expect(await storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(await client.getUser()).toBeNull();
  });
});
