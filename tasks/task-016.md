# task-016 app-core: 어댑터·로컬 저장·티켓 상태·공개 데이터 읽기

| 항목 | 내용 |
|---|---|
| 웨이브 | W2 |
| 선행 | task-011, task-013, task-014, task-007 |
| 위험도 | 높음 |
| 보안 영향 | 의존성(Supabase JS) · 키·권한(anon 키만 번들) |
| 담당 | builder → codex-reviewer(code) + reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#2` `#3` DF-1·DF-4·DF-5·DF-6 · `docs/04_API.md#1` A-01~A-03·A-06 · `#4` · R22 |
| 쓰기 허용 | `packages/app-core/**` |

## 할 것
- 플랫폼 어댑터 인터페이스(클립보드·공유·로컬 저장), 19세 확인 기록(로컬)
- 게스트 로컬 저장: 생성 이력·즐겨찾기·구매(멱등 키 발급, 역전환 금지), 추천은 구매로 간주 안 함
- anon 공개 읽기(회차·통계) + 기기 캐시·오프라인 마지막 동기화 표시, 판정은 `lottery-core` 호출
- R22: 캐시 TTL은 측정 후 확정해 `docs/04_API.md#4`에 기록

## 하지 않을 것
- 로그인·동기화(P1), 서버 생성 호출(D4)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./packages/app-core test` 통과: 추천→구매 미승격, purchased→favorite 거부, 오프라인 시 캐시 반환
- [ ] `pnpm lint` 통과(`@capacitor/*`·`@tauri-apps/*` import 없음)
