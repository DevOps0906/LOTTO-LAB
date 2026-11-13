// 테스트 공용 목 어댑터(task-016 결정 ⑪): 비동기 지연·중간 실패 주입 KV, 고정 시계, 결정적 난수, fetch 목.
import type { Adapters, AppConfig, HttpFetch, KeyValueStore } from "../src/index.ts";

/** 결정적 의사 난수(xorshift32) — 지연 길이와 RandomBytes에 쓴다. */
export function xorshift(seed = 0x9e3779b9): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

type FailPredicate = (op: "get" | "set" | "delete" | "keys" | "flush", key: string, count: number) => boolean;

/** Map 기반 KV. 모든 연산을 무작위 지연(0~maxDelayMs)으로 비동기화하고, fail로 특정 호출을 실패시킨다. */
export class MockKv implements KeyValueStore {
  readonly data = new Map<string, string>();
  fail: FailPredicate = () => false;
  setCount = 0;
  active = 0;
  maxActiveWrites = 0;
  private readonly rand: () => number;
  private readonly maxDelayMs: number;

  constructor(options: { maxDelayMs?: number; seed?: number } = {}) {
    this.maxDelayMs = options.maxDelayMs ?? 3;
    this.rand = xorshift(options.seed);
  }

  private async delay(): Promise<void> {
    // 0이면 마이크로태스크 양보만(타이머 해상도가 거친 환경에서도 빠르게), 아니면 타이머 지연.
    const ms = this.maxDelayMs === 0 ? 0 : this.rand() % (this.maxDelayMs + 1);
    if (ms === 0) await Promise.resolve();
    else await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async get(key: string): Promise<string | null> {
    await this.delay();
    if (this.fail("get", key, 0)) throw new Error("get 실패 주입");
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.setCount++;
    const n = this.setCount;
    this.active++;
    this.maxActiveWrites = Math.max(this.maxActiveWrites, this.active);
    try {
      await this.delay();
      if (this.fail("set", key, n)) throw new Error("set 실패 주입");
      this.data.set(key, value);
    } finally {
      this.active--;
    }
  }

  async delete(key: string): Promise<void> {
    this.active++;
    this.maxActiveWrites = Math.max(this.maxActiveWrites, this.active);
    try {
      await this.delay();
      if (this.fail("delete", key, 0)) throw new Error("delete 실패 주입");
      this.data.delete(key);
    } finally {
      this.active--;
    }
  }

  async keys(prefix: string): Promise<string[]> {
    await this.delay();
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }

  async flush(): Promise<void> {
    await this.delay();
    if (this.fail("flush", "", 0)) throw new Error("flush 실패 주입");
  }

  keysOf(prefix: string): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
}

export class MockClock {
  constructor(public time = Date.parse("2026-11-12T03:00:00.000Z")) {}
  now = (): Date => new Date(this.time);
  advance(ms: number): void {
    this.time += ms;
  }
}

export type FetchCall = { url: string; headers: Record<string, string> };

/** 경로(테이블)별 응답을 돌려주는 fetch 목. respond가 throw하면 네트워크 실패. */
export function mockFetch(respond: (url: string) => { status?: number; body: unknown } | Error): HttpFetch & { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = async (url: string, init: { method: "GET"; headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const r = respond(url);
    if (r instanceof Error) throw r;
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body };
  };
  return Object.assign(fn, { calls });
}

export const CONFIG: AppConfig = { supabaseUrl: "https://project.example.test/", publishableKey: "sb_publishable_test" };

export const DRAW_LOTTO = {
  draw_no: 1200,
  draw_date: "2026-11-07",
  nums: [1, 2, 3, 4, 5, 6],
  bonus: 7,
  prizes: [{ rank: 1, bonus: false, amount_won: 2_000_000_000, winners: 10, payout: "lump" }],
  source_url: "https://source.example.test/lotto/1200",
  source_verified_at: "2026-11-07T12:30:00Z",
};

export const DRAW_PENSION = {
  draw_no: 290,
  draw_date: "2026-11-06",
  group_no: 3,
  digits: "000719",
  bonus_digits: "123450",
  prizes: [{ rank: 1, bonus: false, amount_won: 7_000_000, winners: 1, payout: "annuity", months: 240 }],
  source_url: "https://source.example.test/pension/290",
  source_verified_at: "2026-11-06T12:30:00Z",
};

export function adapters(kv: KeyValueStore, clock: MockClock, fetch: HttpFetch, seed = 12345): Adapters {
  const rand = xorshift(seed);
  return {
    store: kv,
    clock,
    random: { fill: (buffer) => buffer.forEach((_, i) => (buffer[i] = rand())) },
    fetch,
    clipboard: { writeText: async () => undefined },
    share: { share: async () => undefined },
    openExternal: { open: async () => undefined },
  };
}
