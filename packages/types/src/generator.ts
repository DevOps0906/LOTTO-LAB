// 생성 조건 입력 DTO(generator_profiles.config, 기기 생성 폼). 범위만 표현한다 —
// 고정·제외 겹침 등 불가능한 조합은 엔진이 `IMPOSSIBLE_COMBINATION`으로 판정(04#1 A-04·A-05).

/** 로또: 고정 0~6개·제외 0~39개(각 1~45, 목록 안 중복 없음), 게임 1~50. */
export type LottoGeneratorConfig = { fixed: number[]; excluded: number[]; games: number };

/** 연금: 조 1~5(1~5개, 중복 없음), 여섯 자리별 고정 숫자("0"~"9") 또는 자동(null), 게임 1~50. */
export type PensionGeneratorConfig = { groups: number[]; positions: (string | null)[]; games: number };
