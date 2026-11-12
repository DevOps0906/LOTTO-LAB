// 시드 문자열(ADR-0005 착수 결정 ②). 형식은 이 파일 한 곳에서만 만든다 — 바꾸면 fortune@2(골든 벡터가 강제).
// fortune@1|<method>|<정규화 원본 입력>|<KST 날짜>|<game>|<기기 비밀값>
// 사주는 계산된 간지가 아니라 원본 입력만 넣는다. 시드는 결과·오류·로그에 넣지 않는다(결정 ⑤).
import type { FortuneMethod, FortuneTheme, NormalizedInput } from "./types.ts";

/** 테마 → generated_batches.method(결정 ①). */
export function methodOf(t: FortuneTheme): FortuneMethod {
  switch (t.kind) {
    case "zodiac_sign":
    case "zodiac_animal":
      return "zodiac";
    case "birthday":
    case "anniversary":
      return "birthday";
    case "lucky":
      return "condition";
    case "dream":
      return "dream";
    case "saju":
      return "saju";
  }
}

/** 정규화된 테마의 정본 문자열(목록은 normalize가 이미 정렬·중복 제거). */
function canonicalTheme(t: FortuneTheme): string {
  switch (t.kind) {
    case "zodiac_sign":
      return `sign:${t.sign}`;
    case "zodiac_animal":
      return `animal:${t.animal}`;
    case "birthday":
      return `birth:${t.date}`;
    case "anniversary":
      return `anniv:${t.date}`;
    case "lucky":
      return `lucky:${t.numbers.join(",")}`;
    case "dream":
      return `dream:${t.keywords.join(",")}`;
    case "saju":
      return `saju:${t.birth.date}|${t.birth.calendar}|${t.birth.leap ? 1 : 0}|${t.birth.hour ?? "-"}`;
  }
}

/** "lotto" 또는 "pension". 조는 시드에 넣지 않는다 — 기본 번호는 조 선택과 무관하고 조는 발급 확장에만 쓴다. */
function gameKey(n: NormalizedInput): string {
  return n.game;
}

export function buildSeed(n: NormalizedInput): string {
  return ["fortune@1", methodOf(n.theme), canonicalTheme(n.theme), n.date, gameKey(n), n.deviceSecret].join("|");
}
