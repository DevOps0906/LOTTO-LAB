# task-035 배포 빌드: Windows 설치본(MSI/NSIS) + Android AAB

| 항목 | 내용 |
|---|---|
| 웨이브 | W6 |
| 선행 | task-034 |
| 위험도 | 높음 (challenger 착수 전 검토) |
| 보안 영향 | 키·권한(코드 서명 인증서·Android 업로드 키) · 배포 채널 |
| 담당 | builder → reviewer(security) |
| 근거 | `docs/02_ARCHITECTURE.md#6` `#7` · `docs/01_PRD.md#9` 13 · `#7` Q3·Q4 |
| 쓰기 허용 | `apps/desktop/src-tauri/tauri.conf.json`(번들 설정), `apps/mobile/android/app/build.gradle`(서명 설정은 환경 변수 참조만), CI 설정(도구는 팀장 결정 필요) |

## 할 것
- Tauri MSI/NSIS 빌드, WebView2 배포 방식은 착수 시 Tauri 문서 확인. 코드 서명은 Q4 결정 후(미결이면 미서명 빌드로 검증만)
- Android release AAB, 업로드 키는 CI 비밀·오프라인 백업, Play 앱 서명 사용 여부 팀장 결정 필요
- 번들 산출물에 서버 전용 키 없음 확인. 자동 업데이트는 P1(이 작업 아님)

## 하지 않을 것
- 키 파일 커밋, 스토어 제출(사용자 승인 후 팀장)

## 완료 조건 (실행 가능한 확인)
- [ ] `pnpm --filter ./apps/desktop tauri build` 로 MSI·NSIS 생성, 깨끗한 Windows에서 설치·실행·제거 확인
- [ ] `cd apps/mobile/android && ./gradlew bundleRelease` 성공
- [ ] 산출물 대상 `grep -c "service_role"` 0 · `~/.claude/nomad/bin/secscan` 통과
