// 내비 아이콘(장식용, aria-hidden). 크기·색은 @lotto-lab/ui의 .ll-icon(토큰 계산값)을 따른다.
const PATHS = {
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  lotto: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9h6M12 9v6",
  pension: "M4 6h16v12H4zM8 10h8M8 14h5",
  stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  tickets: "M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6z",
  draws: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3",
  alerts: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20h4",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  brand: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8M12 8v8",
} as const;

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg className="ll-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
