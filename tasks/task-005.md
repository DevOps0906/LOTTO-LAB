# task-005 모노레포 구성 (pnpm workspaces + Turborepo)

| 항목 | 내용 |
|---|---|
| 웨이브 | W1 |
| 선행 | task-002, task-004 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(빌드 도구 최초 도입, lockfile) |
| 담당 | builder → codex-reviewer(code) |
| 근거 | `docs/02_ARCHITECTURE.md#4` `#2` · `docs/adr/0001-capacitor-tauri-shared-core.md` |
| 쓰기 허용 | 루트 `package.json`·`pnpm-workspace.yaml`·`turbo.json`·`tsconfig*.json`·lint 설정·`pnpm-lock.yaml`, `packages/*/package.json` 뼈대, `apps/web` 워크스페이스 편입, `docs/02_ARCHITECTURE.md` 머리말 버전 줄 |

## 할 것
- `02#4` 구조대로 패키지 뼈대 생성, 의존 방향 위반 import를 막는 lint 규칙(역방향·`@capacitor/*`·`@tauri-apps/*` 직접 import 금지)
- 도구 최신 stable 확인 후 `02` 머리말에 버전 기록, lockfile 커밋 대상
- 루트 스크립트 `typecheck`·`test`·`lint`·`build`

## 하지 않을 것
- 셸 앱(task-009·010)·패키지 구현

## 완료 조건 (실행 가능한 확인)
- [x] `pnpm install --frozen-lockfile` 후 `pnpm typecheck && pnpm lint` 통과
- [x] 역방향 import 샘플이 `pnpm lint`에서 실패함을 확인 후 샘플 삭제
