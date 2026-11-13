# task-006a PC 시안 D-01·D-02 확정 (모바일 시각 언어)

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | — |
| 위험도 | 낮음 |
| 보안 영향 | 없음 |
| 담당 | designer → codex-reviewer(design) → 사용자 확정 |
| 근거 | `docs/adr/0004-pc-uses-mobile-visual-language.md` · `DESIGN.md` 2장·4.3~4.5장 · `spec D-01` · `spec D-02` · `design/reference/m-home.png`·`m-lotto.png` |
| 쓰기 허용 | `design/reference/d-home.html`, `design/reference/d-lotto.html`, `design/shots/d-*.png` |

## 할 것
- D-01·D-02를 모바일 시안의 시각 요소(히어로·번호 공·상품 카드·통계 요약·CTA)로 만들고 3구간 배치만 다르게(1200~ 사이드바+2열, 768~1199 아이콘 레일+2열, ~767 모바일과 같은 1열+하단 탭)

## 하지 않을 것
- 토큰 값 수정(부족하면 보고), 화면 구현 코드, 나머지 D 화면 시안

## 완료 조건 (실행 가능한 확인)
- [x] `design-preview --scan design/reference` hex·px 직접 사용 0건
- [x] `design-preview packages/design-tokens/tokens.css --check` 통과
- [x] `shot`으로 1440·1024·390 캡처, 가로 스크롤 없음
- [x] 사용자 확정
