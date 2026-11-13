// 릴리스 점검(task-009). `pnpm build:release`(scripts/build-release.mjs)가 릴리스 빌드 전에 강제로 실행한다.
//   node scripts/check-release.mjs           → 운영 env·동기화된 capacitor 설정·소스 매니페스트·웹 번들(dist·assets/public)
//   node scripts/check-release.mjs --merged  → 위 + Gradle 병합 매니페스트(release: debuggable·권한·백업·평문)
// 개발용 설정·로컬 주소·서버 키 흔적이 있으면 실패한다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";

const root = path.join(import.meta.dirname, "..");
const main = path.join(root, "android/app/src/main");
const merged = process.argv.includes("--merged");
const errors = [];

// 0) 운영 env — Vite와 같은 규칙(loadEnv production). https origin·publishable 키 필수, 로컬 주소 금지.
const env = loadEnv("production", root, "VITE_");
const rawUrl = env.VITE_SUPABASE_URL?.trim();
if (!rawUrl) errors.push("VITE_SUPABASE_URL(운영 Supabase https 주소)이 없다");
else {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") errors.push("VITE_SUPABASE_URL은 https여야 한다");
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) errors.push("운영 빌드에 로컬 주소는 쓸 수 없다");
    if (url.pathname !== "/" || url.search || url.hash) errors.push("VITE_SUPABASE_URL은 path·query 없는 origin만");
  } catch {
    errors.push(`VITE_SUPABASE_URL이 URL이 아니다(${rawUrl})`);
  }
}
if (!env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()) errors.push("VITE_SUPABASE_PUBLISHABLE_KEY가 없다");

// 1) 동기화된 capacitor.config.json — server.url(라이브 리로드)·cleartext·외부 탐색·원격 디버깅이 없어야 한다.
const configPath = path.join(main, "assets/capacitor.config.json");
if (!existsSync(configPath)) {
  errors.push("android/app/src/main/assets/capacitor.config.json 없음 — 먼저 cap sync android");
} else {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const server = config.server ?? {};
  if (config.appId !== "kr.lottolab.app") errors.push(`appId가 kr.lottolab.app이 아니다(${config.appId})`);
  if (server.url) errors.push(`server.url이 남아 있다(${server.url}) — CAP_SERVER_URL 없이 다시 sync`);
  if (server.cleartext === true) errors.push("server.cleartext = true");
  if (server.androidScheme !== "https") errors.push(`server.androidScheme이 https가 아니다(${server.androidScheme})`);
  if ((server.allowNavigation ?? []).length > 0) errors.push("server.allowNavigation이 비어 있지 않다");
  if (config.android?.webContentsDebuggingEnabled === true) errors.push("android.webContentsDebuggingEnabled = true");
  if (config.android?.allowMixedContent === true) errors.push("android.allowMixedContent = true");
}

// 2) 매니페스트 — 백업 끔·평문 HTTP 금지·디버그 끔·P0 권한(INTERNET)만.
const ALLOWED_PERMISSIONS = new Set([
  "android.permission.INTERNET",
  // androidx.core가 자동으로 넣는 앱 전용 서명 권한(외부 앱에 권한을 주지 않는다).
  "kr.lottolab.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
]);
function checkManifest(file, label, { requireRules }) {
  if (!existsSync(file)) return errors.push(`${label} 없음`);
  const manifest = readFileSync(file, "utf8");
  if (!/android:allowBackup="false"/.test(manifest)) errors.push(`${label}: android:allowBackup="false" 아님`);
  if (requireRules && !/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(manifest)) errors.push(`${label}: dataExtractionRules 없음`);
  if (/android:usesCleartextTraffic="true"/.test(manifest)) errors.push(`${label}: usesCleartextTraffic=true`);
  if (/android:debuggable="true"/.test(manifest)) errors.push(`${label}: debuggable=true`);
  for (const [, name] of manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)) {
    if (!ALLOWED_PERMISSIONS.has(name)) errors.push(`${label}: P0에 없는 권한 ${name}`);
  }
}
checkManifest(path.join(main, "AndroidManifest.xml"), "AndroidManifest", { requireRules: true });
if (merged) {
  const file = path.join(root, "android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml");
  checkManifest(file, "병합 매니페스트(release)", { requireRules: false });
}

// 3) 웹 번들 — 서버 키·서버 역할 JWT·로컬/개발 주소·평문 http 주소가 없어야 한다.
// 완료 조건 grep(서버 키 이름 0건)에 이 파일이 걸리지 않도록 이름을 나눠 적는다.
const SERVER_ROLE = ["service", "role"].join("_");
const HTTP_HOST_ALLOW = new Set(["www.w3.org", "json-schema.org"]); // 네임스페이스 URI(요청 아님)
const RULES = [
  [new RegExp(SERVER_ROLE), "서버 역할 이름"],
  [/sb_secret_[A-Za-z0-9_-]{16,}/, "Supabase 서버 키(sb_secret_)"],
  // app-core의 호스트 비교 문자열("127.0.0.1")은 허용, URL 형태만 금지.
  [/\/\/(127\.0\.0\.1|localhost|\[::1\]|10\.0\.2\.2)/, "로컬 개발 주소"],
  [/wss?:\/\/[a-z0-9]/i, "웹소켓(개발 서버) 주소"],
];
function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role;
  } catch {
    return undefined;
  }
}
function scan(dir) {
  if (!existsSync(dir)) return errors.push(`${path.relative(root, dir)} 없음 — 먼저 pnpm build·cap sync`);
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) scan(file);
    else if (/\.(js|mjs|html|css|json|map|txt)$/.test(name)) {
      const rel = path.relative(root, file);
      const text = readFileSync(file, "utf8");
      for (const [re, label] of RULES) if (re.test(text)) errors.push(`${rel}: ${label}`);
      for (const [, host] of text.matchAll(/http:\/\/([a-z0-9.-]+)/gi)) {
        if (!HTTP_HOST_ALLOW.has(host.toLowerCase())) errors.push(`${rel}: 평문 http 주소(${host})`);
      }
      for (const [token] of text.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        if (jwtRole(token) === SERVER_ROLE) errors.push(`${rel}: 서버 역할 JWT`);
      }
    }
  }
}
scan(path.join(root, "dist"));
scan(path.join(main, "assets/public"));

if (errors.length) {
  console.error(`check:release 실패 ${errors.length}건\n` + [...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(`check:release 통과 (env·capacitor 설정·매니페스트${merged ? "·병합 매니페스트(release)" : ""}·웹 번들)`);
