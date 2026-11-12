// 운세·테마 번호 생성(task-037, ADR-0005). 순수 함수 — 네트워크·저장소·시계 접근 없음(날짜는 ctx로 받는다).
// 입력+날짜+기기 비밀값 → 결정적 시드 → lotto-engine·pension-engine에 Rng 주입. 하루 1세트(결정 ③).
import { createSeededRng } from "@lotto-lab/lottery-core";
import { generateLotto } from "@lotto-lab/lotto-engine";
import { generatePension } from "@lotto-lab/pension-engine";
import type { LottoGeneratorConfig, PensionGeneratorConfig } from "@lotto-lab/types";
import { normalize } from "./normalize.ts";
import { buildSeed, methodOf } from "./seed.ts";
import {
  FORTUNE_ENGINE_VERSION,
  type FortuneContext,
  type FortuneLottoRequest,
  type FortuneLottoResult,
  type FortunePensionRequest,
  type FortunePensionResult,
  type FortuneRequest,
  type FortuneResult,
  type FortuneTheme,
} from "./types.ts";

/** 로또 하루 1세트 = 5게임(결정 ③). */
export const FORTUNE_LOTTO_GAMES = 5;
/** 연금 하루 1세트 = 기본 번호 1개 × 선택 조. */
export const FORTUNE_PENSION_BASES = 1;

function toLottoConfig(theme: FortuneTheme): LottoGeneratorConfig {
  // 운세 번호에는 고정·제외를 섞지 않는다(결정 ③). 행운 숫자만 고정 번호 방식.
  const fixed = theme.kind === "lucky" ? theme.numbers : [];
  return { fixed, excluded: [], games: FORTUNE_LOTTO_GAMES };
}

function toPensionConfig(groups: number[]): PensionGeneratorConfig {
  return { groups, positions: [null, null, null, null, null, null], games: FORTUNE_PENSION_BASES };
}

/**
 * 테마 하나로 오늘의 로또 5게임 또는 연금 번호(선택 조마다 1장)를 만든다. 같은 입력·날짜·비밀값이면 같은 결과.
 * - INVALID_INPUT: normalize의 hint(값은 담지 않는다)
 * - 하위 엔진 오류(EngineError)는 그대로 전파한다.
 */
export function generateFortune(req: FortuneLottoRequest, ctx: FortuneContext): FortuneLottoResult;
export function generateFortune(req: FortunePensionRequest, ctx: FortuneContext): FortunePensionResult;
export function generateFortune(req: FortuneRequest, ctx: FortuneContext): FortuneResult;
export function generateFortune(req: FortuneRequest, ctx: FortuneContext): FortuneResult {
  const input = normalize(req, ctx);
  const rng = createSeededRng(buildSeed(input));
  const method = methodOf(input.theme);
  if (input.game === "lotto") {
    const r = generateLotto(toLottoConfig(input.theme), rng);
    return { method, games: r.games, engine_version: `${FORTUNE_ENGINE_VERSION}+${r.engine_version}` };
  }
  const r = generatePension(toPensionConfig(input.groups), rng);
  return { method, tickets: r.tickets, engine_version: `${FORTUNE_ENGINE_VERSION}+${r.engine_version}` };
}
