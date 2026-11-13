import { defineConfig } from "vitest/config";

// 테스트 0개로 통과하지 않는다(passWithNoTests: false). 커버리지 기준 라인 90%(task-012 결정 ⑧과 같은 기준).
// 리포트는 터미널 출력만 — 파일을 남기지 않는다.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text"],
      thresholds: { lines: 90 },
    },
  },
});
