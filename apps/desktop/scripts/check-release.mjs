// 릴리스 번들 비밀·개발 흔적 검사(task-010): `pnpm build` 다음, 설치본 묶기 전에 실행한다(build:release가 자동 실행).
// 사용: node scripts/check-release.mjs [검사할 폴더=dist]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const target = path.resolve(root, process.argv[2] ?? "dist");
const errors = [];

// 완료 조건 grep(서버 키 이름 0건)에 이 파일이 걸리지 않도록 이름을 나눠 적는다.
const SERVER_ROLE = ["service", "role"].join("_");
// 네임스페이스 URI 등 실제 요청이 아닌 http:// 호스트(React·SVG·JSON Schema).
const HTTP_HOST_ALLOW = new Set(["www.w3.org", "json-schema.org"]);
const RULES = [
  [new RegExp(SERVER_ROLE), "서버 역할 이름"],
  [/sb_secret_[A-Za-z0-9_-]{16,}/, "Supabase 서버 키(sb_secret_)"],
  // app-core의 호스트 비교 문자열("127.0.0.1")은 허용, URL 형태(//127.0.0.1·//localhost)만 금지.
  [/\/\/(127\.0\.0\.1|localhost|\[::1\])/, "로컬 개발 주소"],
  [/wss?:\/\/[a-z0-9]/i, "웹소켓(개발 서버) 주소"],
];

function decodeJwtRole(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8")).role;
  } catch {
    return undefined;
  }
}

function scanText(rel, text) {
  for (const [re, label] of RULES) if (re.test(text)) errors.push(`${rel}: ${label}`);
  for (const [, host] of text.matchAll(/http:\/\/([a-z0-9.-]+)/gi)) {
    if (!HTTP_HOST_ALLOW.has(host.toLowerCase())) errors.push(`${rel}: 평문 http 주소(${host})`);
  }
  for (const [token] of text.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    if (decodeJwtRole(token) === SERVER_ROLE) errors.push(`${rel}: 서버 역할 JWT`);
  }
}

function scan(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) scan(file);
    else if (/\.(js|mjs|html|css|json|map|txt)$/.test(name)) scanText(path.relative(root, file), readFileSync(file, "utf8"));
  }
}

if (!existsSync(target)) errors.push(`${path.relative(root, target)} 없음 — 먼저 pnpm build`);
else scan(target);

if (errors.length) {
  console.error(`check:release 실패 ${errors.length}건\n` + [...new Set(errors)].join("\n"));
  process.exit(1);
}
console.log(`check:release 통과 (${path.relative(root, target)})`);
