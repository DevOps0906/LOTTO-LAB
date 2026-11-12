// 시스템 다크 모드를 따라 <html>에 .dark를 붙인다(토큰이 .dark에서 덮어쓴다). 해제 함수를 돌려준다.
export function followColorScheme(root: HTMLElement = document.documentElement): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => root.classList.toggle("dark", query.matches);
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}
