// 내부 아이콘(장식용, aria-hidden). 크기는 .ll-icon 토큰 계산값.
export type IconName = "check" | "pin" | "ban" | "up" | "down" | "flat" | "inbox" | "alert" | "info" | "more" | "close"
  | "arrow" | "stats" | "layers" | "spark" | "bell" | "gear" | "redo" | "calendar";

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
  arrow: "M5 12h14M13 6l6 6-6 6",
  stats: "M5 20V12M11 20V5M17 20v-9M3 20h18",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  spark: "M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  redo: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ll-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
