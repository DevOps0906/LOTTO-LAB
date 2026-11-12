import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Clipboard } from "@lotto-lab/app-core";

export const clipboard: Clipboard = {
  async writeText(text) {
    await writeText(text);
  },
};
