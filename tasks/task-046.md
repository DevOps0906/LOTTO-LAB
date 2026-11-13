# task-046 사주 만세력 간지·오행 표시 (P1)

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-037, task-041 |
| 위험도 | 높음 (challenger 착수 전 검토 — 새 의존성·정확성) |
| 보안 영향 | 새 의존성(라이선스·공급망) |
| 담당 | builder+tester |
| 근거 | `docs/adr/0005-fortune-numbers.md` 착수 결정 ⑦ |
| 쓰기 허용 | `packages/fortune-engine/{package.json,src/saju/**,src/index.ts,test/saju*.test.ts}`, `packages/app-core/src/{fortune-service.ts,index.ts}`·`packages/app-core/test/fortune.test.ts`, `packages/ui/src/screens/M-19/**`·`packages/ui/test/M-19.test.tsx`, `apps/mobile/src/routes/screens.tsx`, 루트 `pnpm-lock.yaml` (2026-11-13 challenger 반영: ui는 fortune-engine 직접 import 금지 — app-core 경유 주입) |

- 팀장 결정안(2026-11-13, 조사 반영 — challenger 착수 전 검토 대상): ① 음양력·절입은 `manseryeok@2.0.0`(MIT, 런타임 의존성 0) 정확 버전 고정, fortune-engine `saju/` 어댑터 뒤에 둔다(교체 가능). 자체 절입표는 공식 출처 확보 불가로 기각. 위험: 메인테이너 1명·절입 시각 KASI 대비 최대 1분 차(이슈 #16) ② 절입 순간이 시진 구간(시진 모름이면 하루) 안에 있으면 한 값을 보여 주고 "절입 경계 — 출생 시각에 따라 년주·월주가 다를 수 있음" 안내 ③ 자시는 입력 날짜 일주 기준(midnight), 23시대 출생만 학파 차이 안내 ④ 시진 라벨 23~01 기준 ⑤ +8:30(1954-03-21~1961-08-10)·서머타임(1948~51·1955~60·1987~88)은 절입 경계 판정에만 적용, 4주는 라이브러리 기본 ⑥ 검증 범위 1900~KST 오늘 ⑦ 골든: 날짜 변환·윤달·일주는 KASI 음양력 API(data.go.kr 15012679, 이용허락 제한 없음) 픽스처 — 서비스 키는 사용자 발급 필요(열린 결정), 키 없으면 공개 만세력 표 수작업 대조 + 6tail 계열 교차는 참고만. 조사 원문: 세션 scratchpad task-046-options.md(요약을 여기 기록)

- 팀장 결정(2026-11-13, challenger REVISE 반영 — 위 결정안의 ②⑤⑦을 대체): ⓐ 4주는 입력 구간 **시작 시각**(시진 시작, 시진 모름이면 그날 00:00) KST(+9) 기준 한 값으로 계산. 절입 순간이 구간 [시작−60분, 끝+60분] 안이면 `boundary=true` + "절입 경계 — 출생 시각에 따라 년주·월주가 다를 수 있습니다" 안내(±60분 여유로 서머타임·+8:30·1908 이전 LMT·라이브러리 1분 차를 한 규칙으로 덮음 — offset 표 없음) ⓑ 반환은 합 타입 `{ok:true, pillars{year,month,day,hour|null}, elements, boundary} | {ok:false, reason:"UNCONVERTIBLE_DATE"}` — 윤달 없는 해의 leap=true, 29일 달의 30일, 음력→양력이 KST 오늘 이후·1900 이전이면 실패. M-19는 "변환할 수 없는 날짜 — 프로필 수정" 상태(번호 생성은 그대로 가능 — 시드는 원본 입력) ⓒ 오행 분포 = 천간·지지 본기 글자 수(지장간 제외), 시진 모름은 6자, 라벨에 기준 명시 ⓓ 표시 문구: 카드에 "번호는 이 표로 정하지 않습니다" + 기존 고정 고지. 강·약·부족·용신·해석 문장·부족 오행 강조 금지(UI 테스트로 금지어 확인). 계산된 간지는 로그·오류에 넣지 않음 ⓔ 검증: 일주는 독립 공식(JD mod 60)으로 1900-01-01~오늘 전수 대조, 음력 변환·절입은 라이브러리 단독 검증임을 테스트 파일 머리에 명시하고 대표값 스모크(1900·1954~61·1987~88·윤달 해 포함). KASI 픽스처는 서비스 키 확보 시 추가(열린 결정) ⓕ 공급망: `npm view manseryeok@2.0.0 scripts`로 설치 스크립트 없음 확인, `"manseryeok": "2.0.0"`(^ 없음), onlyBuiltDependencies 미추가, 라이선스 node_modules package.json 확인, mobile build 전후 번들 크기 차 보고(상한 gzip +60KB 초과 시 팀장 보고) ⓖ 메인테이너 1명 위험은 정확 버전 고정+어댑터 1파일 격리로 수용(데이터 vendoring은 하지 않음) ⓗ 시진 라벨 23~01 기준. 자시: 라벨 23~01, 4주는 입력 날짜 00:00(조자시) 기준으로 계산하고 boundary 구간은 전날 23:00~당일 01:00(±60분)

## 할 것
- 생년월일(양/음력·윤달)·시각 → 사주 8글자·오행 분포 **표시용** 계산(번호 결정에는 쓰지 않음 — ADR-0005 ②)
- 결정할 것: 음양력 변환(라이브러리 vs 자체 표, 한국 KASI 기준 UTC+9), 년주 입춘·월주 절입 시각, 자시(23시) 처리, 1954~61 UTC+8:30·서머타임 처리, 검증 범위(1900~2100)·골든 데이터 출처와 이용 조건

## 하지 않을 것
- 오행·간지로 번호를 정하는 규칙(의사 인과 금지, PRD#6)

## 완료 조건 (실행 가능한 확인)
- [ ] 골든 데이터(출처 명시) 대조 테스트 통과, `secscan license`/라이선스 확인
- 결과(2026-11-13): 일주 JD mod 60 전수 대조 불일치 0, saju 테스트 28건, 번들 gzip +17.3KB. npm 레지스트리: MIT·설치 스크립트 없음·dependencies 없음·integrity sha512-h4Yeu…8rpQ==. **보류**: KASI 픽스처(서비스 키 대기), lock integrity 대조·dist 정적 검사(fetch·eval·Function) — 권한 설정상 lock·node_modules 읽기 차단, 사용자 확인 대기
