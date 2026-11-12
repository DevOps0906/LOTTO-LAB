// 화면 테마(D-09): 시스템·라이트·다크. <html>에 .dark를 붙이면 토큰이 .dark에서 덮어쓴다(packages/design-tokens).
// 시스템은 Windows 다크 모드를 따라 바뀐다. 저장은 app-core ThemeStore — 여기서는 적용만 한다.
import type { ThemePreference } from "@lotto-lab/ui";

export type ThemeController = { set(theme: ThemePreference): void; dispose(): void };

export function createThemeController(root: HTMLElement = document.documentElement): ThemeController {
  let pref: ThemePreference = "system";
  const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const apply = () => root.classList.toggle("dark", pref === "dark" || (pref === "system" && query?.matches === true));
  apply();
  query?.addEventListener("change", apply);
  return {
    set(theme) {
      pref = theme;
      apply();
    },
    dispose() {
      query?.removeEventListener("change", apply);
    },
  };
}
