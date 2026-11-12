// 운세·테마 번호(task-038, ADR-0005): 기기 비밀값 + 오늘(KST) + 테마 → fortune-engine(기기 실행) → 생성 이력(generated) 저장.
// 테마 입력값(별자리·생년월일·꿈 키워드 등)은 엔진 호출에만 쓰고 저장·전송·로그하지 않는다 — 저장 레코드에는 번호·method·엔진 버전만.
// 기기 비밀값은 처음 쓸 때 RandomBytes(CSPRNG) 32바이트로 만들어 전용 키에 둔다. 내보내기(LocalData.export)는 레코드 종류
// (ticket·generated·settings)만 읽으므로 이 키는 들어가지 않는다. 모두 삭제하면 지워지고 다음 생성 때 새로 만든다.
import { kstToday } from "@lotto-lab/lottery-core";
import { generateFortune, type FortuneRequest, type FortuneResult } from "@lotto-lab/fortune-engine";
import type { Clock, KeyValueStore, RandomBytes } from "./adapters.ts";
import { AppCoreError } from "./errors.ts";
import type { GenerateResult, GenerateService, GeneratedLine } from "./generate-service.ts";
import { KEY_PREFIX, type LocalStore } from "./storage.ts";

/** 기기 비밀값 키 — 레코드 종류(`ll:v1:<kind>:`)와 겹치지 않는다. */
export const FORTUNE_SECRET_KEY = `${KEY_PREFIX}pref:fortune_secret`;
/** 32바이트 = 64자 소문자 hex(fortune-engine FortuneContext.deviceSecret 형식). */
const SECRET_PATTERN = /^[0-9a-f]{64}$/;
const SECRET_WORDS = 8; // Uint32 8개 = 32바이트

export type FortuneOutcome = GenerateResult & { method: FortuneResult["method"] };

export class FortuneService {
  private readonly store: LocalStore;
  private readonly kv: KeyValueStore;
  private readonly clock: Clock;
  private readonly random: RandomBytes;
  private readonly generator: GenerateService;

  constructor(store: LocalStore, kv: KeyValueStore, clock: Clock, random: RandomBytes, generator: GenerateService) {
    this.store = store;
    this.kv = kv;
    this.clock = clock;
    this.random = random;
    this.generator = generator;
  }

  /**
   * 오늘의 테마 번호를 만들고 생성 이력에 저장한다. 같은 날·같은 입력·같은 기기면 같은 번호.
   * 엔진 입력 오류·조건 오류(EngineError)는 그대로 던진다 — 저장하지 않는다. 비밀값을 쓰지 못하면 STORAGE_FAILED.
   */
  async generate(request: FortuneRequest): Promise<FortuneOutcome> {
    const deviceSecret = await this.deviceSecret();
    const result = generateFortune(request, { date: kstToday(this.clock.now()), deviceSecret });
    const lines: GeneratedLine[] =
      "games" in result
        ? result.games.map((nums) => ({ game: "lotto", numbers: { nums }, group_no: null, engine_version: result.engine_version }))
        : result.tickets.map((t) => ({ game: "pension", numbers: { digits: t.digits }, group_no: t.group_no, engine_version: result.engine_version }));
    return { ...(await this.generator.saveBatch(result.method, lines)), method: result.method };
  }

  /** 저장된 비밀값(형식이 맞을 때만) 또는 새로 만든 값. 만든 값은 한 번 저장해 계속 쓴다. */
  private deviceSecret(): Promise<string> {
    return this.store.run(async () => {
      const raw = await this.kv.get(FORTUNE_SECRET_KEY);
      const stored = raw === null ? null : parseSecret(raw);
      if (stored !== null) return stored;
      const words = new Uint32Array(SECRET_WORDS);
      this.random.fill(words);
      const secret = [...words].map((w) => w.toString(16).padStart(8, "0")).join("");
      try {
        await this.kv.set(FORTUNE_SECRET_KEY, JSON.stringify(secret));
        await this.kv.flush();
      } catch (cause) {
        throw new AppCoreError("STORAGE_FAILED", undefined, { cause });
      }
      return secret;
    });
  }
}

function parseSecret(raw: string): string | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" && SECRET_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}
