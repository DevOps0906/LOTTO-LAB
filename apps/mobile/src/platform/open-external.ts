// 외부 링크는 시스템 브라우저로만 연다(앱 WebView에 원격 페이지를 띄우지 않는다). http·https만 허용.
import { Browser } from "@capacitor/browser";
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
    await Browser.open({ url: assertWebUrl(url) });
  },
};
