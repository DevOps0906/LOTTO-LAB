# 문서 리뷰 1차 — 지적과 팀장 결정 (2026-11-12)

| # | 지적 | 팀장 결정 | 반영 문서 |
|---|---|---|---|
| R1 🔴 | 당첨 판정 주체 불일치 | P0: 기기에서 `lottery-core` 판정(공개 회차 데이터 사용). P1 로그인 사용자: A-09가 같은 함수로 서버 판정·이력·푸시. 판정 함수는 하나 | 02 F5, ADR-0002, 03 머리말 |
| R2 🔴 | 구매등록 필드가 계약에 없음 | `saved_tickets`에 `purchase_date`·`amount_won int`·`source_number_id`·`idempotency_key` 추가. A-14 `PATCH /v1/tickets/{id}`(상태 변경 favorite→purchased) 신설 | 04, 05, 03 |
| R3 🔴 | 사전알림 신청 경로 없음 | W-01에 신청 폼(이메일·수신 동의·만 19세 확인). A-15 `POST /v1/waitlist`, `waitlist_signups`(anon INSERT만, SELECT 금지), 위협 메모(스팸·레이트리밋·보관 6개월) | 03, 04, 05, 01#8 |
| R4 🔴 | 1024 창 생성 화면 배치 | Windows는 768~1199에서도 **좌우**(사이드바 레일 72). 상하 배치는 모바일/웹 좁은 화면만 | DESIGN.md, 03 |
| R5 | A-04/A-05 vs D4 | 서버 생성 없음 확정. 두 행은 "미구현(D4)"로 표기, 화면 API 열에서 제거. 409는 엔진 오류 타입으로. 유료 생성 한도는 01#7 미결 | 04, 03, 01#7 |
| R6 | 회차·통계 읽기 경로 | 공개 읽기(`draws_*`·`statistics_cache`)는 anon SELECT RLS 직접 허용. EF는 판정·관리자·waitlist만 | ADR-0003, 02 |
| R7 | 회차 상세 필드 누락 | `draws_*`에 `prizes jsonb`(등위별 당첨금·인원)·`source_url` 추가, A-01~03 출력 일치 | 05, 04 |
| R8 | 대조 이력 불가 | `draw_checks` UNIQUE(ticket_id) 제거 → (ticket_id, draw_no) 인덱스, 이력 누적 | 05, 04 |
| R9 | 관리자 승인 조건 | A-16 `POST /v1/admin/ingestions/{id}/reverify` 신설. 재검증 통과 건만 A-12 승인 가능 | 04, 05#5, 03 W-04 |
| R10 | 자동 업데이트 단계 | P1로 통일(P0은 수동 설치본) | 02 |
| R11 | 웹 19세 확인 | R3 폼에 포함 | 03 |
| R12 | AI 자연어 필터 | P2로 이동(AI 키·위협 메모는 P2 착수 시) | 01#3 |
| R13 | 관리자 MFA | 필수(TOTP). 01#8에 명시 | 01, 04#5 |
| R14 | 사이드바 항목 | 03 D-01의 8개가 정본, DESIGN.md를 맞춤 | DESIGN.md |
| R15 | 근거 없는 표현 | DESIGN "20~50대" → "만 19세 이상 성인". ADR-0002 "3면 동일" → "모바일·Windows 동일" | DESIGN.md, ADR-0002 |
| R16 | 흐름 ID 충돌 | 02의 F1~F6 → DF-1~DF-6(데이터 흐름) | 02 |
| R17 | AGENTS.md 불일치 | 팀장이 직접 수정 | AGENTS.md |

## 2차 세부 결정 (04·05 반영 중 생긴 질문)
| # | 질문 | 팀장 결정 | 반영 문서 |
|---|---|---|---|
| R18 | A-07 멱등 키 중복 응답 | 기존 행을 200으로 반환(재시도 안전) | 04 |
| R19 | A-14 purchased→favorite 역전환 | 금지. DB 트리거로 강제(422 `INVALID_TRANSITION`) | 04, 05 |
| R20 | A-16 재검증 방식 | 출처 재수집 후 `raw_payload`와 대조. 출처 접속 실패 시 503 | 04, 05#5 |
| R21 | waitlist 운영 | 중복 이메일도 같은 202(가입 여부 노출 금지), 봇 차단 Cloudflare Turnstile + IP 레이트리밋, 6개월 경과 행은 pg_cron 일 1회 삭제 | 04, 05 |
| R22 | 캐시 TTL·레이트리밋 수치 | 구현 작업에서 측정 후 확정(task에 명시) | tasks |
| R23 | A-15 Turnstile 실패 응답 | 400 `INVALID_INPUT`(기존 코드 재사용, 사유 노출 안 함) | tasks |
| R24 | A-16 대조 방식 | 해시가 아닌 정규화 필드 비교(회차·날짜·번호·보너스·prizes) | tasks |
| R25 | 새 의존성 Turnstile·pg_cron | security-baseline 확인 후 도입(위험도 높음 task) | tasks, 01#8 |
