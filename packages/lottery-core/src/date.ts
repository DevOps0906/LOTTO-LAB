// KST(UTC+9, 일광절약 없음) 오늘 날짜. 시각은 인자로 받는다 — 시계 접근 없음(task-012 결정 ②).
// 현재 회차는 데이터(draws_* 최신 draw_no·draw_date)에서 구한다(task-016) — 여기서 계산하지 않는다.
import { invalidInput } from "./errors.ts";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** now 시점의 KST 날짜 `YYYY-MM-DD`. */
export function kstToday(now: Date): string {
  const t = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(t)) throw invalidInput("date.now");
  const kst = new Date(t + KST_OFFSET_MS);
  const y = String(kst.getUTCFullYear()).padStart(4, "0");
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
