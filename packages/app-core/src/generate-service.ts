// 번호 생성(DF-1): 엔진(기기) 호출 → 결과 → 생성 이력(generated) 로컬 저장. 네트워크 불필요(D4·D6).
// 생성 이력은 추천 기록일 뿐 저장 번호·구매가 아니다 — ticket 레코드를 만들지 않는다(AGENTS 4장).
// 이력은 최근 200개만 유지하되 저장 번호가 참조하는 항목은 지우지 않는다(결정 ⑩).
import { createCryptoRng } from "@lotto-lab/lottery-core";
import { generateLotto } from "@lotto-lab/lotto-engine";
import { generatePension } from "@lotto-lab/pension-engine";
import { PENSION_GROUP_MAX, type LottoGeneratorConfig, type PensionGeneratorConfig } from "@lotto-lab/types";
import { LocalGeneratedSchema, type GenerationMethod, type LocalGenerated } from "@lotto-lab/validation";
import type { Clock, RandomBytes } from "./adapters.ts";
import type { LocalStore } from "./storage.ts";
import { uuidV4 } from "./storage.ts";

export const GENERATED_HISTORY_LIMIT = 200;

export type GenerateRequest =
  | { game: "lotto"; config: LottoGeneratorConfig }
  | { game: "pension"; config: PensionGeneratorConfig };

/**
 * saved = false면 표시만 하고 이력 저장(일부 또는 전부)에 실패한 것. 이미 쓴 줄은 남는다.
 * pruneFailed = true면 저장은 됐지만 200개 정리에 실패한 것(다음 생성 때 다시 정리한다).
 */
/** 생성 이력 한 줄의 번호 부분(id·배치·시각·method는 저장할 때 붙인다). 연금 digits는 문자열. */
export type GeneratedLine =
  | { game: "lotto"; numbers: { nums: number[] }; group_no: null; engine_version: string }
  | { game: "pension"; numbers: { digits: string }; group_no: number; engine_version: string };

export type GenerateResult = { batch_id: string; records: LocalGenerated[]; saved: boolean; pruneFailed: boolean };

export class GenerateService {
  private readonly store: LocalStore;
  private readonly clock: Clock;
  private readonly random: RandomBytes;

  constructor(store: LocalStore, clock: Clock, random: RandomBytes) {
    this.store = store;
    this.clock = clock;
    this.random = random;
  }

  /** 엔진 조건 오류(IMPOSSIBLE_COMBINATION·INVALID_INPUT)는 EngineError 그대로 던진다 — 저장하지 않는다. */
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const rng = createCryptoRng((buffer) => this.random.fill(buffer));
    const batchId = uuidV4(this.random);
    const createdAt = this.clock.now().toISOString();

    const lines: GeneratedLine[] =
      request.game === "lotto"
        ? (() => {
            const r = generateLotto(request.config, rng);
            return r.games.map((nums) => ({ game: "lotto" as const, numbers: { nums }, group_no: null, engine_version: r.engine_version }));
          })()
        : (() => {
            const r = generatePension(request.config, rng);
            return r.tickets.map((t) => ({
              game: "pension" as const,
              numbers: { digits: t.digits },
              group_no: t.group_no,
              engine_version: r.engine_version,
            }));
          })();
    return this.persist(batchId, createdAt, methodOf(request), lines);
  }

  /**
   * 다른 엔진(운세 번호 등)이 만든 결과 줄을 한 배치로 생성 이력에 저장한다 — generate와 같은 저장·정리 경로.
   * 줄에는 번호·엔진 버전만 담는다(입력값을 넣을 자리가 없다 — 스키마가 추가 키를 거부한다).
   */
  saveBatch(method: GenerationMethod, lines: GeneratedLine[]): Promise<GenerateResult> {
    return this.persist(uuidV4(this.random), this.clock.now().toISOString(), method, lines);
  }

  private async persist(batchId: string, createdAt: string, method: GenerationMethod, lines: GeneratedLine[]): Promise<GenerateResult> {
    const common = { v: 1, created_at: createdAt, batch_id: batchId, method };
    const records = lines.map((line, i) => LocalGeneratedSchema.parse({ ...common, ...line, id: uuidV4(this.random), line_no: i + 1 }));

    const outcome = await this.store.run(async () => {
      try {
        for (const record of records) await this.store.put("generated", record.id, record);
      } catch {
        return { saved: false, pruneFailed: false };
      }
      try {
        await this.prune();
        return { saved: true, pruneFailed: false };
      } catch {
        return { saved: true, pruneFailed: true };
      }
    });
    return { batch_id: batchId, records, ...outcome };
  }

  /** 최신순 이력(격리 레코드 제외). */
  history(): Promise<LocalGenerated[]> {
    return this.store.run(async () => sortNewest((await this.store.scan("generated", LocalGeneratedSchema)).map((e) => e.value)));
  }

  /** (큐 안에서) 최근 200개 밖이면서 어떤 저장 번호도 참조하지 않는 유효 이력만 지운다. */
  private async prune(): Promise<void> {
    if ((await this.store.count("generated")) <= GENERATED_HISTORY_LIMIT) return;
    const all = sortNewest((await this.store.scan("generated", LocalGeneratedSchema)).map((e) => e.value));
    if (all.length <= GENERATED_HISTORY_LIMIT) return;
    const referenced = await this.referencedIds();
    for (const g of all.slice(GENERATED_HISTORY_LIMIT)) {
      if (!referenced.has(g.id)) await this.store.remove("generated", g.id);
    }
  }

  /** 저장 번호가 참조하는 생성 id — 검증 실패(격리) 레코드의 참조도 원문에서 찾아 보존한다. */
  private async referencedIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const raw of await this.store.rawValues("ticket")) {
      try {
        const value: unknown = JSON.parse(raw);
        const ref = typeof value === "object" && value !== null ? (value as Record<string, unknown>).source_number_id : undefined;
        if (typeof ref === "string") ids.add(ref);
      } catch {
        // 파싱 불가 레코드는 참조를 알 수 없다 — 건너뛴다(그 레코드 자체는 보존).
      }
    }
    return ids;
  }
}

/** 조건이 하나라도 있으면 condition(05#2 generated_batches.method). */
function methodOf(request: GenerateRequest): GenerationMethod {
  if (request.game === "lotto") {
    const c = request.config;
    return c.fixed.length > 0 || c.excluded.length > 0 ? "condition" : "random";
  }
  const c = request.config;
  return c.positions.some((p) => p !== null) || c.groups.length < PENSION_GROUP_MAX ? "condition" : "random";
}

function sortNewest(list: LocalGenerated[]): LocalGenerated[] {
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.batch_id.localeCompare(a.batch_id) || a.line_no - b.line_no);
}
