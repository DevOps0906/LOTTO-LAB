// 루트 ESLint flat config — 모든 워크스페이스 패키지가 이 파일 하나를 쓴다.
// 의존 방향(docs/02_ARCHITECTURE.md#4): apps → ui → app-core → (엔진·통계·검증) → lottery-core → types. 역방향 import 금지.
// 네이티브 플러그인(@capacitor/*·@tauri-apps/*)은 셸(apps/mobile·apps/desktop)만 import한다(#2, 어댑터는 셸이 주입).
import path from "node:path";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const DOMAIN = ["lottery-core", "lotto-engine", "pension-engine", "statistics", "validation"];

// 패키지별로 import해도 되는 내부 패키지(자기 자신 제외). 나머지 @lotto-lab/*는 금지.
const ALLOWED = {
  ui: ["app-core", "design-tokens", ...DOMAIN, "types"],
  "app-core": [...DOMAIN, "types"],
  ...Object.fromEntries(DOMAIN.map((name) => [name, ["types"]])),
  // 엔진·통계는 lottery-core(판정·오류 타입·공통 규칙, task-012)를 쓴다. lottery-core·validation은 types만.
  "lotto-engine": ["lottery-core", "types"],
  "pension-engine": ["lottery-core", "types"],
  statistics: ["lottery-core", "types"],
  types: [],
  "design-tokens": [],
};

const SHELLS = ["mobile", "desktop"];
const APPS = ["web", ...SHELLS];
const NATIVE_RE = /^@(capacitor|tauri-apps)\//;
const ROOT = import.meta.dirname;
const MSG_LAYER = "apps → ui → app-core → (엔진·통계·검증) → lottery-core → types(02#4)";

// 파일·경로가 속한 워크스페이스("packages/ui" 등). 루트·그 밖이면 null.
function ownerOf(absPath) {
  const [kind, name] = path.relative(ROOT, absPath).split(path.sep);
  return (kind === "packages" || kind === "apps") && name ? `${kind}/${name}` : null;
}

// 정적·동적 import, re-export, require 모두 같은 경계 검사를 한다.
const boundaries = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      native: "네이티브 플러그인은 셸(apps/mobile·apps/desktop)만 import한다. app-core 어댑터 인터페이스를 쓴다(02#2).",
      layer: "'{{from}}'에서 '{{to}}' import는 금지된 의존 방향이다. " + MSG_LAYER + ".",
      relative: "다른 패키지·앱을 상대 경로로 import하지 않는다('{{to}}'). @lotto-lab/* 이름으로 의존 방향을 지킨다(02#4).",
      dynamic: "packages의 동적 import·require는 정적 문자열만 쓴다(경계 검사 대상).",
    },
  },
  create(context) {
    const owner = ownerOf(context.filename);
    if (!owner) return {};
    const [kind, name] = owner.split("/");

    function check(node, spec) {
      if (NATIVE_RE.test(spec)) {
        if (!(kind === "apps" && SHELLS.includes(name))) context.report({ node, messageId: "native" });
        return;
      }
      if (spec.startsWith(".")) {
        const target = path.resolve(path.dirname(context.filename), spec);
        if (ownerOf(target) !== owner) context.report({ node, messageId: "relative", data: { to: spec } });
        return;
      }
      const m = /^@lotto-lab\/([^/]+)/.exec(spec);
      if (!m || m[1] === name) return;
      const to = m[1];
      const ok = kind === "apps" ? !APPS.includes(to) : (ALLOWED[name] ?? []).includes(to);
      if (!ok) context.report({ node, messageId: "layer", data: { from: name, to: spec } });
    }

    function checkSource(node, source) {
      if (!source) return;
      if (source.type === "Literal" && typeof source.value === "string") return check(source, source.value);
      if (source.type === "TemplateLiteral" && source.expressions.length === 0) return check(source, source.quasis[0].value.cooked);
      if (kind === "packages") context.report({ node, messageId: "dynamic" });
    }

    return {
      ImportDeclaration: (n) => checkSource(n, n.source),
      ExportNamedDeclaration: (n) => checkSource(n, n.source),
      ExportAllDeclaration: (n) => checkSource(n, n.source),
      ImportExpression: (n) => checkSource(n, n.source),
      TSImportEqualsDeclaration: (n) =>
        n.moduleReference.type === "TSExternalModuleReference" && checkSource(n, n.moduleReference.expression),
      CallExpression: (n) =>
        n.callee.type === "Identifier" && n.callee.name === "require" && checkSource(n, n.arguments[0]),
    };
  },
};

const SOURCE_GLOB = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/next-env.d.ts",
      "supabase/**",
      "services/**",
      // 셸 생성물(task-009·010 결정 ⑤): Android 프로젝트(복사된 웹 자산 포함)·Tauri 빌드·생성 스키마
      "apps/mobile/android/**",
      "apps/desktop/src-tauri/target/**",
      "apps/desktop/src-tauri/gen/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: [`{packages,apps}/${SOURCE_GLOB}`],
    plugins: { "lotto-lab": { rules: { boundaries } } },
    rules: { "lotto-lab/boundaries": "error" },
  },
);
