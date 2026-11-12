// 생성 화면(M-02·M-03) 테스트용 app-core 목(GeneratorCore 구조). generate는 조건대로 결정적 결과를 만든다.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { NoticeProvider, type GeneratorCore } from "../src";

type Request = Parameters<GeneratorCore["generator"]["generate"]>[0];
type Result = Awaited<ReturnType<GeneratorCore["generator"]["generate"]>>;
type Lotto = { fixed: number[]; excluded: number[]; games: number };
type Pension = { groups: number[]; positions: (string | null)[]; games: number };

const BASE_NUMS = [3, 9, 14, 25, 33, 42];

/** 결정적 생성: 로또 n번째 게임 = 기본 번호 +n(1~45 순환), 연금 n번째 기본 번호 = 자동 자리에 (n+자리) mod 10. */
export function fakeGenerate(request: Request, batchNo: number): Result {
  const batch_id = `batch-${batchNo}`;
  if (request.game === "lotto") {
    const records = Array.from({ length: request.config.games }, (_, i) => ({
      id: `${batch_id}-${i + 1}`,
      game: "lotto" as const,
      numbers: { nums: BASE_NUMS.map((n) => ((n + i - 1) % 45) + 1).sort((a, b) => a - b) },
      group_no: null,
    }));
    return { batch_id, records, saved: true };
  }
  const { groups, positions, games } = request.config;
  const records = Array.from({ length: games }).flatMap((_, i) => {
    const digits = positions.map((p, j) => p ?? String((i + j) % 10)).join("");
    return groups.map((g) => ({ id: `${batch_id}-${i + 1}-${g}`, game: "pension" as const, numbers: { digits }, group_no: g }));
  });
  return { batch_id, records, saved: true };
}

export function mockGeneratorCore() {
  let batchNo = 0;
  let keyNo = 0;
  const generate = vi.fn(async (request: Request): Promise<Result> => fakeGenerate(request, ++batchNo));
  const saveFromGenerated = vi.fn<(id: string, input: { idempotency_key: string }) => Promise<{ id: string }>>(async (_, input) => ({ id: input.idempotency_key }));
  const remove = vi.fn<(id: string) => Promise<void>>(async () => {});
  const newIdempotencyKey = vi.fn(() => `key-${++keyNo}`);
  const getLast = vi.fn<(game: "lotto" | "pension") => Promise<Lotto | Pension | null>>(async () => null);
  const saveLast = vi.fn<(request: Request) => Promise<boolean>>(async () => true);
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
  const share = vi.fn<(content: { title?: string; text: string }) => Promise<void>>(async () => {});
  const core = {
    generator: { generate },
    tickets: { saveFromGenerated, remove, newIdempotencyKey },
    lastConfig: { get: getLast, save: saveLast },
    adapters: { clipboard: { writeText }, share: { share } },
  } as unknown as GeneratorCore;
  return { core, generate, saveFromGenerated, remove, newIdempotencyKey, getLast, saveLast, writeText, share };
}

export const GEN_LINKS = { home: "#/", generate: "#/generate", stats: "#/stats" };

export function renderWithNotice(ui: ReactElement) {
  return render(<NoticeProvider>{ui}</NoticeProvider>);
}

/** lottery-core EngineError와 같은 모양의 오류. */
export function engineError(hint: string, detail: Record<string, number>, code = "IMPOSSIBLE_COMBINATION") {
  return Object.assign(new Error(`${code}: ${hint}`), { name: "EngineError", code, hint, detail });
}
