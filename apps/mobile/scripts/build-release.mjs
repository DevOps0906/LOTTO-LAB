// 릴리스 빌드(task-009): 점검을 건너뛸 수 없도록 순서를 고정한다. 하나라도 실패하면 멈춘다.
// 웹 빌드 → cap sync → 점검 → 병합 매니페스트(release) 생성 → 병합본 점검 → assembleRelease.
// 서명은 task-035(지금은 서명 안 된 app-release-unsigned.apk). 운영 env(VITE_SUPABASE_URL·KEY)는 README 참고.
import { execSync } from "node:child_process";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const android = path.join(root, "android");
const gradlew = JSON.stringify(path.join(android, process.platform === "win32" ? "gradlew.bat" : "gradlew"));
if (process.env.CAP_SERVER_URL) {
  console.error("build-release 실패: CAP_SERVER_URL이 설정돼 있다(라이브 리로드 전용) — 비우고 다시 실행");
  process.exit(1);
}
const run = (command, cwd = root) => execSync(command, { cwd, stdio: "inherit" });

run("pnpm build");
run("pnpm exec cap sync android");
run("node scripts/check-release.mjs");
run(`${gradlew} :app:processReleaseMainManifest`, android);
run("node scripts/check-release.mjs --merged");
run(`${gradlew} assembleRelease`, android);
console.log("build-release 완료: android/app/build/outputs/apk/release/");
