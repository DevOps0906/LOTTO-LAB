// Windows에는 공유 시트가 없다(02#5) — 공유는 클립보드 복사로 대신한다. 화면은 복사 완료 토스트를 띄운다.
import type { Clipboard, Share } from "@lotto-lab/app-core";

export function createClipboardShare(clipboard: Clipboard): Share {
  return {
    async share({ title, text, url }) {
      await clipboard.writeText([title, text, url].filter(Boolean).join("\n"));
    },
  };
}
