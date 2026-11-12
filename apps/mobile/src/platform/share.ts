import { Share as CapShare } from "@capacitor/share";
import type { Share } from "@lotto-lab/app-core";

export const share: Share = {
  async share({ title, text, url }) {
    await CapShare.share({ title, text, url });
  },
};
