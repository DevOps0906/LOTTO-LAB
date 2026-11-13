import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Windows 셸(Tauri 2). tauri.conf.json의 devUrl·frontendDist와 포트·출력 경로를 맞춘다.
// 환경변수는 VITE_* 공개 값만 번들에 들어간다(VITE_SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY). 서버 키 금지.
export default defineConfig({
  plugins: [tailwindcss()],
  oxc: { jsx: { runtime: "automatic" } },
  clearScreen: false,
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  server: { host: "127.0.0.1", port: 5174, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    passWithNoTests: false,
  },
});
