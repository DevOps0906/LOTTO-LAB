// 해시 라우팅(결정 ⑥): "#/stats" → "/stats". 정적 파일만으로 동작하고 서버 설정이 필요 없다.
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function readHashPath(hash: string = window.location.hash): string {
  const path = hash.replace(/^#/, "");
  return path.startsWith("/") ? path : "/";
}

export function useHashPath(): string {
  return useSyncExternalStore(subscribe, () => readHashPath(), () => "/");
}
