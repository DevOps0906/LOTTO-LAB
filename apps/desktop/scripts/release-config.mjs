// 릴리스 설정 생성(task-010): 운영 Supabase origin을 CSP connect-src에 넣은 덮어쓰기 config를 만든다.
// 방식: `tauri build --config src-tauri/tauri.release.conf.json` — Tauri가 tauri.conf.json 위에 JSON 병합한다.
// 생성 파일은 커밋하지 않는다(.gitignore). 운영 URL이 없거나 https origin이 아니면 실패한다(로컬 주소 금지).
// 값 출처: Vite와 같은 규칙(loadEnv production — 환경변수 VITE_* > .env.production.local > .env.local > .env.production > .env).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";

const root = path.join(import.meta.dirname, "..");
const env = loadEnv("production", root, "VITE_");
const fail = (message) => {
  console.error(`release-config 실패: ${message}`);
  process.exit(1);
};

const raw = env.VITE_SUPABASE_URL?.trim();
if (!raw) fail("VITE_SUPABASE_URL(운영 Supabase https 주소)이 없다");
let url;
try {
  url = new URL(raw);
} catch {
  fail(`VITE_SUPABASE_URL이 URL이 아니다(${raw})`);
}
if (url.protocol !== "https:") fail("VITE_SUPABASE_URL은 https여야 한다");
if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) fail("운영 빌드에 로컬 주소는 쓸 수 없다");
if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) fail("VITE_SUPABASE_URL은 path·query 없는 origin만");
if (!env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()) fail("VITE_SUPABASE_PUBLISHABLE_KEY가 없다");

const base = JSON.parse(readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const csp = { ...base.app.security.csp, "connect-src": `'self' ipc: http://ipc.localhost ${url.origin}` };
const release = {
  build: { beforeBuildCommand: "pnpm build && node scripts/check-release.mjs" },
  app: { security: { csp } },
};
const out = path.join(root, "src-tauri/tauri.release.conf.json");
writeFileSync(out, JSON.stringify(release, null, 2) + "\n");
console.log(`release-config: ${path.relative(root, out)} 생성 (connect-src += ${url.origin})`);
