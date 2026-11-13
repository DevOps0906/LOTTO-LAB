// 워크스페이스 점검: 모든 패키지가 private · @lotto-lab/* 이름이고, 내부 @lotto-lab/* 의존이 정확히 "workspace:*"인지 확인한다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const files = ["package.json"];
for (const dir of ["apps", "packages"]) {
  for (const name of readdirSync(path.join(root, dir))) {
    const file = path.join(dir, name, "package.json");
    if (existsSync(path.join(root, file))) files.push(file);
  }
}

const errors = [];
for (const file of files) {
  const pkg = JSON.parse(readFileSync(path.join(root, file), "utf8"));
  if (pkg.private !== true) errors.push(`${file}: "private": true 가 아니다`);
  if (file !== "package.json" && !pkg.name?.startsWith("@lotto-lab/")) errors.push(`${file}: 이름이 @lotto-lab/* 가 아니다 (${pkg.name})`);
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
      if (dep.startsWith("@lotto-lab/") && range !== "workspace:*") errors.push(`${file}: ${field}.${dep} = "${range}" (workspace:* 이어야 한다)`);
    }
  }
}

if (errors.length) {
  console.error(`check:workspace 실패 ${errors.length}건\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`check:workspace 통과 (${files.length}개 package.json)`);
