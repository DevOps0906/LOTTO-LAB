# task-043b Windows 로그인 대응 (Tauri, P1)

| 항목 | 내용 |
|---|---|
| 웨이브 | W7(P1) |
| 선행 | task-043 |
| 위험도 | 높음 (세션 저장 — OS 자격 증명 저장소) |
| 보안 영향 | 세션 토큰 저장 · 새 의존성 |
| 담당 | builder → reviewer(security) |
| 근거 | `tasks/task-043.md` 팀장 결정 · `.claude/rules/desktop.md` |
| 쓰기 허용 | `apps/desktop/**`, `packages/ui/src/screens/D-*`(로그인·계정 삭제 배치), `pnpm-lock.yaml`, `Cargo.lock` |

## 할 것
- task-043 AuthService를 Windows 셸에 연결: 세션은 Windows 자격 증명 관리자(keyring), 6자리 코드 방식 그대로(브라우저 복귀 없음)

## 완료 조건 (실행 가능한 확인)
- [ ] desktop 테스트·빌드, `secscan license`, 세션이 파일·localStorage에 평문으로 남지 않음을 테스트로 확인
