// 내비 아이콘(장식용, aria-hidden). 크기·색은 @lotto-lab/ui의 .ll-icon(토큰 계산값)을 따른다.
const PATHS = {
  home: "M3 11l9-7 9 7M5 10v10h14V10",
  generate: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z",
  stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  tickets: "M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6z",
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
