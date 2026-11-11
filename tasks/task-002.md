# task-002 보안 기본 설정 `/secure setup` (L2)

| 항목 | 내용 |
|---|---|
| 웨이브 | W0 |
| 선행 | — |
| 위험도 | 높음 |
| 보안 영향 | 키·권한 (비밀 관리·커밋 차단 규칙) |
| 담당 | 팀장(`/secure setup`) → reviewer(security) |
| 근거 | `docs/01_PRD.md#8` · `docs/02_ARCHITECTURE.md#7` |
| 쓰기 허용 | `.gitignore`, `.env.example`, 보안 설정 파일(`/secure setup`이 만드는 경로) |

## 할 것
- 보안 레벨 L2 기준으로 `/secure setup` 실행: 비밀 파일 무시 규칙, `.env.example`(키 이름만), 비밀 스캔 훅
- 서버 전용 키(service_role·Turnstile secret·서명 키)는 저장소·앱 번들 금지 규칙을 설정에 반영. AI 에이전트 접근 범위는 로컬 Supabase·anon 키만

## 하지 않을 것
- 실제 키 값 생성·기록, CI 비밀 등록(CI 도구는 팀장 결정 필요, `02#6`)

## 완료 조건 (실행 가능한 확인)
- [ ] `~/.claude/nomad/bin/secscan` 통과(발견 0건)
- [ ] `git check-ignore .env` 가 `.env`를 출력
