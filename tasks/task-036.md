# task-036 출시 전 점검: 개인정보·스토어·복권 표현 + 보안 최종 점검

| 항목 | 내용 |
|---|---|
| 웨이브 | W6 |
| 선행 | task-001, task-033, task-035 |
| 위험도 | 높음 |
| 보안 영향 | 민감 데이터(개인정보 처리) · 노출 면 전체 재점검 |
| 담당 | reviewer(security) + planner(체크리스트) → 팀장 판단 |
| 근거 | `docs/01_PRD.md#6` `#8` `#9` 10 · `docs/04_API.md#5` · `docs/00_LEAN.md` 출시 차단 조건 |
| 쓰기 허용 | `tasks/release-checklist.md` |

## 할 것
- 체크리스트: Q1 결과 반영, 개인정보 처리방침(보관 기간은 팀장 결정 필요)·만 19세 확인·스토어 복권 정책(PRD Q9 — Play 도박 정책 '복권 보조 기능' 해석, 광고 빌드 배포 전 필수)·금지 문구·공식 오인 표현
- 노출 면별 위협 메모(`04#5`) 대비 구현 확인, 의존성 취약점 점검(`vuln-priority.md` 기준)

## 하지 않을 것
- 법률 판단 확정(불명확 항목은 `미확인`·전문가 확인 필요로 표시)

## 완료 조건 (실행 가능한 확인)
- [ ] `grep -rnE "과학적으로 추천|당첨 보장|확률 상승|당첨 확률이 높은|고확률" apps packages` 0건
- [ ] `pnpm audit --prod` 높음 이상 0건 · `~/.claude/nomad/bin/secscan` 통과 · `supabase test db` 통과
- [ ] `tasks/release-checklist.md` 항목 전부 체크 또는 `미확인`에 담당·기한 기재
