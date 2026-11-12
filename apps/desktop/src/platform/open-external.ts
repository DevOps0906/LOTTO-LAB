// 외부 링크는 기본 브라우저로만 연다(앱 창에 원격 페이지를 띄우지 않는다). http·https만 — capability opener 범위와 같다.
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppCoreError, type OpenExternal } from "@lotto-lab/app-core";

export function assertWebUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppCoreError("INVALID_INPUT", "url");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new AppCoreError("INVALID_INPUT", "url");
  return parsed.href;
}

export const openExternal: OpenExternal = {
  async open(url) {
    await openUrl(assertWebUrl(url));
  },
};
