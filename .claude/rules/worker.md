---
paths:
  - "services/analytics-worker/**"
---
# 분석 워커 규칙 (services/analytics-worker/** 작업 때만 로드)
- service_role은 이 워커와 Edge Function에만. 필수 환경변수가 없으면 기동 실패. 로그에 키·개인정보를 남기지 않는다.
- 정기 실행은 워커 스케줄 또는 pg_cron. 공개 HTTP 라우트로 트리거하지 않는다(외부 포트 없음).
- 의존성은 해시 고정 lockfile(`pip install --require-hashes -r requirements.txt`). 테스트는 `pytest -q`.
## 컨테이너로 돌릴 때 (근거: `DevOps0906/nomad-docker-module` 0.1.0 `services/worker`·`SECURITY.md`)
- 모듈 전체를 설치하지 않고 worker 템플릿만 가져온다(api·ClamAV·AI 프로파일은 이 앱 범위 밖).
- 베이스 이미지는 최신 stable 확인 후 버전 고정(latest 금지), 배포 전 `docker buildx imagetools inspect`로 `@sha256` digest 고정.
- 멀티스테이지(venv 복사), 비루트 uid 10001, `read_only` + tmpfs `/tmp`, `cap_drop: ALL`, `no-new-privileges`, 메모리 제한, exec-form CMD.
- `Dockerfile.dockerignore`로 `.env*`(`.env.example` 제외)·`*.pem`·`*.key`·`.git`·`tests`를 빼고, 빌드 전 컨텍스트에 키 파일이 없는지 사람이 확인한다.
- 로컬 Supabase는 `host.docker.internal:54321`. 키는 `.env`(커밋 금지)로만 주입하고 이미지에 굽지 않는다. 노출 시 재발급 후 `docker compose up -d --force-recreate`.
- 이미지 갱신 때 `docker scout cves` 또는 `trivy image`로 스캔한다.
