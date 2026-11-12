# task-045 Android 광고(AdMob) — 배너·보상형·UMP 동의

| 항목 | 내용 |
|---|---|
| 웨이브 | W7 (P1) |
| 선행 | task-009, task-020, task-021 |
| 위험도 | 높음 (challenger 착수 전 검토 — 새 의존성·노출 면·광고 식별자) |
| 보안 영향 | 새 의존성(AdMob 플러그인·SDK) · 노출 면(광고 네트워크·제3자 렌더) · 개인정보(광고 식별자·동의 상태) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/adr/0006-ads.md`(위협 메모 포함) · `docs/01_PRD.md#3·#6·#7·#8` · `docs/03_SCREENS_UX.md` M-01·M-04·M-16·M-20 · `DESIGN.md#4.8` · `.claude/rules/mobile.md` |
| 쓰기 허용 | 착수 시 팀장 지정(`apps/mobile/**` 광고 모듈·`capacitor.config`·Android 매니페스트 예상) |

## 할 것
- 착수 전: Q8(광고 등급) 팀장 결정, 플러그인·버전 `secscan license` 확인(GPL·AGPL 거부)
- M-20 UMP 동의(M-05 다음), 거부 시 비맞춤 광고, 미성년 대상 설정 끔
- M-01·M-04·M-16 하단 배너, M-04 보상형(선택). Plus 이상·Windows·웹은 광고 코드 경로 없음
- AdMob 콘솔: 도박·복권·사행성 카테고리 차단(사용자 작업, 체크리스트로 기록)

## 하지 않을 것
- 전면 광고, 생성·판정·폼·운세·결제 화면 광고, 운영 광고 ID 커밋, 광고 도메인을 앱 WebView에 허용

## 완료 조건 (실행 가능한 확인)
- [ ] 저장소 검색으로 광고 ID가 Google 테스트 ID뿐임을 확인, `secscan license` 통과
- [ ] 슬롯 렌더 테스트: 허용 3화면만 표시, Plus 이상·동의 전·로드 실패 시 미렌더, 탭바·스낵바와 겹침 없음(3구간 스크린샷)
- [ ] 출시 전 Q9(Play 정책) 확인 기록 — task-036 체크리스트에 항목 추가
