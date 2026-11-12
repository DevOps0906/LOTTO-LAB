# 작업 표

| 번호 | 제목 | 웨이브 | 선행 | 위험도 | 담당 | 상태 |
|---|---|---|---|---|---|---|
| task-001 | Q1 회차 데이터 수집·재배포 권리 확인 | W0 | — | 보통 | 팀장+사용자 | 대기 |
| task-002 | 보안 기본 설정 `/secure setup` L2 | W0 | — | 높음 | 팀장 | 완료 |
| task-003 | 사전알림 백엔드 waitlist + A-15 (R21·R22·R23·R25) | W0 | 002 | 높음 | builder | 완료 |
| task-003b | 사전알림 이메일 이중 확인(확인 메일·A-19) | W0 | 003 | 높음 | builder | 완료 |
| task-004 | 웹 랜딩 W-01 + 사전알림 폼 | W0 | 003 | 높음 | builder | 완료 |
| task-005 | 모노레포 (pnpm + Turborepo) | W1 | 002, 004 | 높음 | builder | 완료 |
| task-006a | PC 시안 D-01·D-02 확정 (모바일 시각 언어, ADR-0004) | W1 | — | 낮음 | designer | 완료 |
| task-006 | 디자인 토큰 패키지 + 공유 UI 블록 | W1 | 005 | 낮음 | builder | 완료 |
| task-006b | 공유 UI 오버레이(토스트·스낵바·얼럿·시트·메뉴·툴팁) | W1 | 006 | 보통 | builder | 완료 |
| task-007 | 공개·수집 스키마 + RLS | W1 | 003 | 높음 | builder | 완료 |
| task-008 | 사용자 스키마 + RLS·전환 트리거 | W1 | 007 | 높음 | builder | 완료 |
| task-009 | 모바일 셸 (Capacitor 8) | W1 | 005, 006 | 높음 | builder | 대기 |
| task-010 | Windows 셸 (Tauri 2) | W1 | 005, 006 | 높음 | builder | 대기 |
| task-011 | types + validation (Zod) | W2 | 005 | 높음 | builder | 완료 |
| task-012 | lottery-core 판정·오류 타입·속성 테스트 도구 | W2 | 011 | 높음 | builder+tester | 완료 |
| task-013 | lotto-engine 생성 | W2 | 012 | 보통 | builder+tester | 완료 |
| task-014 | pension-engine 생성 | W2 | 012 | 보통 | builder+tester | 완료 |
| task-015 | statistics 기본 통계 | W2 | 011 | 보통 | builder+tester | 완료 |
| task-016 | app-core 어댑터·로컬 저장·공개 읽기 (R22) | W2 | 007, 011, 013, 014 | 높음 | builder | 대기 |
| task-017 | 모바일 M-05·M-01·M-15 | W3 | 009, 016 | 보통 | builder | 대기 |
| task-018 | 모바일 M-02 로또 생성 | W3 | 017 | 보통 | builder | 대기 |
| task-019 | 모바일 M-03 연금 생성 | W3 | 017 | 보통 | builder | 대기 |
| task-020 | 모바일 M-04 통계 | W3 | 015, 017 | 보통 | builder | 대기 |
| task-021 | 모바일 M-16·M-11 회차 | W3 | 017 | 보통 | builder | 대기 |
| task-022 | 모바일 M-07·M-08 내 번호·기기 판정 | W3 | 018, 019, 021 | 보통 | builder | 대기 |
| task-023 | 모바일 M-09 구매등록·M-12 설정 | W3 | 022 | 보통 | builder | 대기 |
| task-024 | Windows D-11·D-01·D-09 | W4 | 010, 017, 023 | 보통 | builder | 대기 |
| task-025 | Windows D-02·D-03 생성 | W4 | 018, 019, 024 | 보통 | builder | 대기 |
| task-026 | Windows D-04·D-14·D-08 | W4 | 020, 021, 024 | 보통 | builder | 대기 |
| task-027 | Windows D-05 내 번호 + CSV | W4 | 022, 024 | 보통 | builder | 대기 |
| task-028 | Windows D-06·D-07 | W4 | 023, 027 | 보통 | builder | 대기 |
| task-029 | 수집 워커 수집·검증·UPSERT | W5 | 001, 007 | 높음 | builder+tester | 대기 |
| task-030 | 워커 통계 캐시 재계산 | W5 | 015, 029 | 보통 | builder+tester | 대기 |
| task-031 | 관리자 EF A-11·A-12·A-13·A-16 (R22·R24) | W5 | 029 | 높음 | builder | 대기 |
| task-032 | 관리자 웹 W-02 MFA 로그인·W-03 목록 | W5 | 004, 031 | 높음 | builder | 대기 |
| task-033 | 관리자 웹 W-04 수집 검토 상세 | W5 | 032 | 높음 | builder | 대기 |
| task-034 | 플랫폼 QA 인수 조건 회귀 | W6 | 023, 028 | 보통 | tester | 대기 |
| task-035 | 배포 빌드 MSI/NSIS + AAB | W6 | 034 | 높음 | builder | 대기 |
| task-036 | 출시 전 점검·보안 최종 점검 | W6 | 001, 033, 035 | 높음 | reviewer+planner | 대기 |
| task-037 | fortune-engine 테마·사주 결정적 생성 (ADR-0005) | W7(P1) | 013, 014 | 높음 | builder+tester | 대기 |
| task-038 | 모바일 M-17 테마 번호 | W7(P1) | 018, 037 | 보통 | builder | 대기 |
| task-039 | Windows D-15 테마 번호 | W7(P1) | 025, 038 | 보통 | builder | 대기 |
| task-040 | `fortune_profiles` 스키마 + RLS | W7(P1) | 008 | 높음 | builder | 대기 |
| task-041 | 모바일 M-18·M-19 사주 프로필·번호 | W7(P1) | 037, 038, 040, 043 | 높음 | builder | 대기 |
| task-042 | Windows D-16·D-17 사주 프로필·번호 | W7(P1) | 039, 041 | 높음 | builder | 대기 |
| task-043 | 로그인·가입·재설정 M-06 + 세션·Windows 대응 (Supabase Auth, P1) | W7(P1) | 008, 017 | 높음 | builder → reviewer(security) | 대기 |
| task-044 | 사전알림 메일 발송·수신 거부 링크 A-18·발송 후 파기 | W6 | 003 | 높음 | builder | 대기 |
| task-045 | Android 광고(AdMob) — 배너·보상형·UMP 동의 (ADR-0006) | W7(P1) | 009, 020, 021 | 높음 | builder → reviewer(security) | 대기 |

상태: 대기 / 진행 / 완료 / 보류

## 발견한 문제 (범위 밖 — 나중 작업 후보)
| 날짜 | 위치 | 내용 | 제안 |
|---|---|---|---|

## 교훈 (다음 작업에 그대로 적용할 것만, 20줄 이내 유지)
- 
