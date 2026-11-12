// 내부 아이콘(장식용, aria-hidden). 크기는 .ll-icon 토큰 계산값.
export type IconName = "check" | "pin" | "ban" | "up" | "down" | "flat" | "inbox" | "alert" | "info" | "more" | "close";

const PATHS: Record<IconName, string> = {
  check: "M5 12.5l4.5 4.5L19 7",
  pin: "M12 17v5M9 3h6l-1 6 3 3H7l3-3z",
  ban: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M19 12l-7 7-7-7",
  flat: "M5 12h14",
  inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z",
  alert: "M12 8v5M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  info: "M12 11v5.5M12 7.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M6 6l12 12M18 6L6 18",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ll-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
