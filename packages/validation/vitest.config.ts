import { defineConfig } from "vitest/config";

// 테스트 0개로 통과하지 않는다(passWithNoTests: false).
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"], passWithNoTests: false },
});
