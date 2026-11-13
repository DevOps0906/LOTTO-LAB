// 꿈 키워드 사전(task-037, 계획 승인 2026-11-13: 약 30개).
// 자체 작성 사전이다 — 외부 해몽 자료를 복제하지 않았다. 라벨은 상징 이름(명사)뿐이고 의미·효과 문구는 넣지 않는다.
// id는 영문 소문자 고정: 시드에 들어가므로 바꾸면 같은 입력의 결과가 바뀐다(바꿀 때는 fortune@2).
export const DREAM_KEYWORDS = [
  // 동물
  { id: "pig", label: "돼지" },
  { id: "dragon", label: "용" },
  { id: "snake", label: "뱀" },
  { id: "tiger", label: "호랑이" },
  { id: "cow", label: "소" },
  { id: "horse", label: "말" },
  { id: "dog", label: "개" },
  { id: "cat", label: "고양이" },
  { id: "fish", label: "물고기" },
  { id: "bird", label: "새" },
  { id: "turtle", label: "거북이" },
  // 자연
  { id: "water", label: "물" },
  { id: "fire", label: "불" },
  { id: "sea", label: "바다" },
  { id: "river", label: "강" },
  { id: "rain", label: "비" },
  { id: "snow", label: "눈" },
  { id: "mountain", label: "산" },
  { id: "sun", label: "해" },
  { id: "moon", label: "달" },
  { id: "star", label: "별" },
  { id: "rainbow", label: "무지개" },
  { id: "flower", label: "꽃" },
  { id: "tree", label: "나무" },
  // 사람·물건
  { id: "baby", label: "아기" },
  { id: "ancestor", label: "조상" },
  { id: "gold", label: "금" },
  { id: "ring", label: "반지" },
  { id: "house", label: "집" },
  { id: "key", label: "열쇠" },
  { id: "shoes", label: "신발" },
  { id: "teeth", label: "이빨" },
] as const;

export type DreamKeywordId = (typeof DREAM_KEYWORDS)[number]["id"];

/** 한 번에 고를 수 있는 꿈 키워드 수. */
export const DREAM_KEYWORDS_MIN = 1;
export const DREAM_KEYWORDS_MAX = 3;
