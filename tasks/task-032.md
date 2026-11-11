# task-032 관리자 웹 W-02 로그인(TOTP MFA) + W-03 수집 검토 목록

| 항목 | 내용 |
|---|---|
| 웨이브 | W5 |
| 선행 | task-004, task-031 |
| 위험도 | 높음 |
| 보안 영향 | 인증(관리자 로그인·MFA) · 관리자 노출 면 |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `spec W-02` · `spec W-03` · `docs/04_API.md#1` A-11 · `#5` · `docs/01_PRD.md#8` · R13 |
| 쓰기 허용 | `apps/web/src/app/admin/**`(login·collections 목록) |

## 할 것
- W-02: 이메일·비밀번호 → TOTP 단계, 역할 검사는 서버(EF) 결과만 신뢰, 401 재로그인·403 접근 차단
- W-03: A-11 목록(검증실패·미갱신·검토대기 필터, 발송중단 상태·갱신 시각)
- 관리자 경로 검색 엔진 색인 차단, 브라우저에 서버 키 없음

## 하지 않을 것
- 상세·승인 화면(task-033), 관리자 가입 화면

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./apps/web test -- admin` 통과(MFA 미통과 시 목록 미표시, 403 화면)
- [ ] `pnpm --filter ./apps/web build` 후 `grep -r "service_role" apps/web/.next` 0건
