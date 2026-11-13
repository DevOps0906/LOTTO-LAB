import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// 모바일 셸(Capacitor 8). 빌드 결과 dist/를 cap sync가 android/app/src/main/assets/public으로 복사한다.
// 환경변수는 VITE_* 공개 값만 번들에 들어간다(VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY). 서버 키 금지.
export default defineConfig({
  plugins: [tailwindcss()],
  oxc: { jsx: { runtime: "automatic" } },
  base: "./",
  build: { outDir: "dist", sourcemap: false },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    passWithNoTests: false,
  },
});
