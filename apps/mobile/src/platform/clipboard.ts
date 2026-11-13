import { Clipboard as CapClipboard } from "@capacitor/clipboard";
import type { Clipboard } from "@lotto-lab/app-core";

export const clipboard: Clipboard = {
  async writeText(text) {
    await CapClipboard.write({ string: text });
  },
};
