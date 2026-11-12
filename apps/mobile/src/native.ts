// 네이티브 연결: Android 백 버튼·다크 모드. 웹(개발 서버·테스트)에서는 다크 모드만 적용한다.
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/** 시스템 다크 모드를 따라 <html>에 .dark를 붙인다(토큰이 .dark에서 덮어쓴다). 해제 함수를 돌려준다. */
export function followColorScheme(root: HTMLElement = document.documentElement): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => root.classList.toggle("dark", query.matches);
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}

/** Android 백 버튼: 앱 안 기록이 있으면 뒤로, 없으면 앱 종료. */
export function handleBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}
