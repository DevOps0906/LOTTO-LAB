# DESIGN.md — LOTTO LAB 디자인 시스템

> 정답 소스: `packages/design-tokens/tokens.css` (Tailwind CSS v4 `@theme`, 라이트·다크).
> 값 표(색 hex·3구간 폰트)는 `docs/DESIGN_TOKENS.md` — `design-preview`가 토큰에서 재생성한다. 이 문서는 **토큰 이름**만 쓴다.
> 미리보기: `design/preview/index.html` · 화면 근거: `spec <화면 ID>` + `design/wireframes/<ID>.html`.
> 상태: **초안** — 비주얼 수치는 사람이 미리보기를 보고 확정한다(확정 전 화면 구현 착수 금지).

## 1. 브리프

| 항목 | 내용 |
|---|---|
| 대상 | 매주 로또 6/45·연금복권 720+를 사는 만 19세 이상 성인. 모바일 우선, Windows에서 넓게 비교하는 사용자 |
| 주된 일 | 최신 회차 확인 → 조건 정해 번호 생성 → 저장·당첨 확인 → 통계로 살펴보기 |
| 분위기 3단어 | 신뢰감 · 명료함 · 산뜻함 (Premium fintech, 라운드 카드) |
| 피할 것 | 카지노·도박 연출(번쩍임·코인 폭발), 공식 동행복권 로고·상호·서체 모방, "과학적으로 추천"·"당첨 보장"·"확률 상승" 문구 |
| 문구 원칙 | "데이터로 살펴보는" 톤. 통계는 과거 기록이며 미래 결과를 예측하지 않음을 화면에 함께 표기 |
| 브랜드 | 가칭 LOTTO LAB(상표 확인 전). 로고는 자체 워드마크만 |

## 2. 레이아웃 원칙 (반응형 3구간)

| 구간 | 폭 | 내비게이션 | 본문 |
|---|---|---|---|
| 모바일 | ~767 | 하단 탭바 4개(홈·추천·통계·내번호), 높이 `--spacing-tabbar` + safe-area | 1열 카드, 좌우 여백 `--spacing-page` |
| 태블릿 / 작은 Windows 창 | 768~1199 | 좌측 아이콘형 사이드바 `--spacing-sidebar-rail` (라벨은 툴팁) | 2열 그리드, Windows 생성 화면도 **조건(좌)·결과(우)** (레일 사이드바로 폭 확보). 조건/결과 상하는 모바일·웹 좁은 화면만 |
| 데스크톱 Windows | 1200~ | 좌측 사이드바 `--spacing-sidebar` (아이콘+라벨) | 2~3열 그리드. 홈: 히어로 한 줄 전체 → 아래 2열 [최근 회차 + 상품 카드 2개 \| 이번 주 요약 + 번호 생성 CTA]. 생성 화면은 **조건(좌)·결과(우)** 한 화면 |

- **시각 언어는 하나**([ADR-0004](docs/adr/0004-pc-uses-mobile-visual-language.md)): 히어로 그라데이션·번호 공·상품 카드(로또/연금)·요약 리스트·주 CTA는 3구간 모두 같다(기준 = 모바일 시안 `design/reference/m-*.png`). 구간별로 바꾸는 것은 내비게이션과 열 배치뿐이며 PC 전용 컴포넌트는 만들지 않는다.
- Windows 창 최소 1024×700. 페이지 가로 스크롤 금지 — 넓은 표·히트맵은 카드 안에서만 스크롤.
- 카드 간격 `--spacing-gap`, 카드 반경 `--radius-card`, 그림자 `--shadow-card`. 면은 `--color-bg` 위 `--color-surface` 카드.
- 헤더(모바일 홈 상단·사이드바 배경)는 `--color-navy` / `--color-navy-fg` / `--color-navy-muted`.
- 로또 맥락은 `--color-primary`, 연금복권 맥락은 `--color-pension`으로 일관되게 구분하되 화면 제목·라벨 문자로도 구분한다.
- iOS Safe Area·Android Window Insets 반영. `prefers-reduced-motion`이면 번호 생성 애니메이션 생략.

## 3. 타이포그래피

- 본문 `--font-sans`(Pretendard → Segoe UI/맑은 고딕 폴백). 숫자·금액·연금 6자리·회차는 `--font-mono` 또는 `font-variant-numeric: tabular-nums`.
- 크기 토큰: `--text-display` · `--text-h1` · `--text-h2` · `--text-body` · `--text-caption` · `--text-kpi` · `--text-ball`.
- 3구간 값 표: `docs/DESIGN_TOKENS.md` (토큰에서 재생성, 직접 수정 금지).

## 4. 컴포넌트 명세

### 4.1 번호공 (Ball)
- 지름 `--spacing-ball`, 반경 `--radius-pill`, 숫자 `--text-ball` 굵게, 숫자는 항상 표시.
- 구간색: 1~10 `--color-ball-1` · 11~20 `--color-ball-11` · 21~30 `--color-ball-21` · 31~40 `--color-ball-31` · 41~45 `--color-ball-41`, 글자는 각 `-fg`.
- 상태: 기본(구간색) / 그리드 미선택(`--color-ball-empty` + 1px `--color-input` 테두리) / 선택(번호대 색 `--color-ball-*` 채움 — 결과 공과 같은 색, 미선택은 흰 공+테두리라 색 없이도 구분) / 고정수(구간색 + 핀 아이콘) / 제외수(`--color-ball-empty` + 취소선·금지 아이콘) / 보너스(앞에 "+" 기호와 "보너스" 접근성 라벨).
- 번호 선택 그리드(1~45): ~767은 **7열**(터치 영역 44px 확보), 768~는 9열. 시각 지름은 `--spacing-ball`, 터치 영역만 44px로 넓힌다.
- 색만으로 상태를 전달하지 않는다(아이콘·텍스트 병기). 터치 영역 최소 44px.

### 4.2 생성 카드 (Generator / Result)
- 조건 카드: 세그먼트 탭(`--color-primary-soft` 배경, 선택 `--color-primary`) · 칩(고정/제외/홀짝) · 게임 수 세그먼트 · CTA 높이 `--spacing-control`, 반경 `--radius-control`, `--shadow-cta`.
- 결과 카드: 게임별 한 줄(라벨 `--color-text-muted` + 번호공 6개), 우상단 다시 생성·복사·저장.
- 연금복권: 조 선택 세그먼트·자리별 스테퍼(숫자 `--font-mono`), CTA·강조는 `--color-pension`, 선택행 `--color-pension-soft` / `--color-pension-soft-fg`.
- 결과 아래 고지(캡션): "과거 데이터를 참고한 조합이며 당첨을 보장하지 않습니다."

### 4.3 KPI 카드 (개인 기록 요약)
- `--color-surface` 카드, 라벨 `--text-caption` `--color-text-muted`, 값 `--text-kpi` `--font-mono`, 보조(회차·기준일) 캡션.
- 증감 표시는 화살표 아이콘 + 부호 문자 + 색(`--color-success`/`--color-danger`) 병기.
- 홈의 주인공이 아니다: Windows 홈(D-01)에서는 우측 열의 작은 카드로 둔다(1200~ 우측 열 세로 묶음, 768~1199 2열 하단). 모바일은 가로 스크롤 대신 2열. 히어로·상품 카드보다 위에 두지 않는다(ADR-0004).

### 4.4 사이드바 (768~)
- 배경 `--color-navy`, 항목 글자 `--color-navy-muted`, 활성 항목 `--color-navy-fg` + 좌측 인디케이터 `--color-primary` + 반투명 강조면.
- 1200~ 폭 `--spacing-sidebar`(아이콘+라벨), 768~1199 `--spacing-sidebar-rail`(아이콘만, 툴팁·aria-label 필수).
- 항목(정본: `docs/03_SCREENS_UX.md` D-01): 대시보드 · 로또 생성 · 연금 생성 · 통계 · 내 번호 · 회차 · 알림 · 설정.
- 사이드바는 하단 탭바(4.5)를 대신하는 내비게이션일 뿐이다. 본문 카드·번호 공·CTA는 모바일과 같은 컴포넌트를 쓴다(ADR-0004).

### 4.5 하단 탭바 (~767)
- `--color-surface` 배경, 상단 1px `--color-border`, 높이 `--spacing-tabbar` + safe-area.
- 4개: 홈·추천·통계·내번호. 활성 `--color-primary`(아이콘 채움 + 라벨), 비활성 `--color-text-muted`. 라벨은 항상 표시.
- 768~에서는 사이드바(4.4)로 바뀐다. 탭바와 사이드바 사이에서 바뀌는 것은 내비게이션 위치뿐이다.

### 4.6 차트
- 계열 순서: `--color-chart-1`(로또) → `--color-chart-2`(연금) → `--color-chart-3` → `--color-chart-4` → `--color-chart-5`(평균·기타). 격자 `--color-chart-grid`.
- 막대(번호별 출현 빈도): 값 라벨 상단 표기. 히트맵(끝자리·자리별): `--color-heat-1`~`--color-heat-5` 5단계 + 칸 안 숫자 병기.
- 축·범례 `--text-caption` `--color-text-muted`. 차트마다 "최근 N회차 기준" 캡션과 표 보기 대안(스크린리더) 제공.

## 5. 접근성

- 대비: 본문 4.5:1, 아이콘·입력 경계 3:1 — `design-preview packages/design-tokens/tokens.css --check`로 확인(현재 라이트·다크 전 항목 통과).
- 포커스 링 `--color-focus` 2px + 2px 오프셋. `--color-primary`를 글자로 쓸 때는 흰 배경(`--color-surface`)에서만(배경 `--color-bg` 위 4.35:1).
- 다크 모드: `.dark` 클래스, 같은 토큰 이름을 덮어쓴다. 번호공 구간색은 모드와 무관하게 유지.

## 6. 변경 절차
토큰 한 줄 수정 → `design-preview packages/design-tokens/tokens.css -o design/preview/index.html --md docs/DESIGN_TOKENS.md` 재실행 → `--check` 통과 확인. 컴포넌트에 hex·px 직접 사용 금지(`design-preview --scan <컴포넌트 폴더>`).
