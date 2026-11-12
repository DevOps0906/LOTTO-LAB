// 범위 상수 — 엔진(lottery-core·*-engine)과 검증(validation)이 같은 값을 import한다.
// 근거: docs/05_DATA_MODEL.md#1·#2(DB CHECK) · docs/03_SCREENS_UX.md M-02(고정 0~6·제외 0~39) · docs/01_PRD.md#9(1~50게임).

export const GAME_TYPES = ["lotto", "pension"] as const;
export type GameType = (typeof GAME_TYPES)[number];

// 로또 6/45
export const LOTTO_NUMBER_MIN = 1;
export const LOTTO_NUMBER_MAX = 45;
export const LOTTO_PICK_COUNT = 6;
export const LOTTO_FIXED_MAX = 6;
export const LOTTO_EXCLUDED_MAX = 39;

// 한 번에 생성하는 게임 수
export const GAMES_PER_REQUEST_MIN = 1;
export const GAMES_PER_REQUEST_MAX = 50;

// 연금복권 720+ — 번호는 문자열(앞자리 0 보존, 05#4). 패턴은 DB CHECK `^[0-9]{6}$`와 같은 식.
export const PENSION_GROUP_MIN = 1;
export const PENSION_GROUP_MAX = 5;
export const PENSION_DIGITS_LENGTH = 6;
export const PENSION_DIGITS_PATTERN = "^[0-9]{6}$";

// 당첨금 등위(prizes 요소 rank, 05#1)
// 로또는 1~5등만, 보너스 표현 없음(2등이 rank 2). 연금은 1~7등 + 보너스(rank null·bonus true).
export const PRIZE_RANK_MIN = 1;
export const PRIZE_RANK_MAX = 7;
export const LOTTO_PRIZE_RANK_MAX = 5;

// Postgres int4 범위 — round·draw_no·range_*·sample_size 열(05#2). 넘으면 DB가 22003으로 거부한다.
export const INT4_MIN = -2147483648;
export const INT4_MAX = 2147483647;

// 저장 티켓 상태(saved_tickets.purchase_status). 추천(generated)은 별도 테이블 — 섞지 않는다.
export const PURCHASE_STATUSES = ["favorite", "purchased"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

// 통계 키(A-06 window·metric, statistics_cache.window_key·metric) — task-015 팀장 결정 ②.
// last10은 홈 요약용. "보너스 포함"은 metric 키로 구분한다. 순위·예측 성격의 키(hot·cold·due 등)는 두지 않는다(결정 ⑦).
export const STAT_WINDOWS = ["last10", "last20", "last50", "last100", "all"] as const;
export type StatWindow = (typeof STAT_WINDOWS)[number];
export const STAT_METRICS = [
  "lotto.number_freq",
  "lotto.number_freq_bonus",
  "lotto.range_dist",
  "lotto.odd_even",
  "lotto.sum_dist",
  "lotto.gap",
  "pension.digit_freq",
  "pension.group_freq",
  "pension.bonus_digit_freq",
] as const;
export type StatMetric = (typeof STAT_METRICS)[number];
