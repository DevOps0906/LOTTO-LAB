// manseryeok@2.0.0(MIT) 어댑터 — 이 파일만 라이브러리를 import한다(교체·격리 지점, task-046 ⓖ).
// 년·월·일·시주 한글 간지와 절입 순간(UTC ms)만 밖으로 내보낸다. 오류 메시지·간지는 로그에 남기지 않는다.
import {
  calculateFourPillars,
  getHeavenlyStemElement,
  getEarthlyBranchElement,
  getSolarTerm,
  lunarToSolar,
  solarToLunar,
} from "manseryeok";

export type LibPillar = { stem: string; branch: string; stemElement: string; branchElement: string };
export type LibPillars = { year: LibPillar; month: LibPillar; day: LibPillar; hour: LibPillar };
export type YmdLib = { year: number; month: number; day: number };

/** 음력 → 양력. 변환 불가·존재하지 않는 날짜는 null(왕복 대조로 29일 달의 30일 등도 걸러낸다). */
export function lunarToSolarYmd(year: number, month: number, day: number, leap: boolean): YmdLib | null {
  try {
    const s = lunarToSolar(year, month, day, leap);
    const back = solarToLunar(s.year, s.month, s.day);
    if (back.year !== year || back.month !== month || back.day !== day || back.isLeapMonth !== leap) return null;
    return { year: s.year, month: s.month, day: s.day };
  } catch {
    return null;
  }
}

/** 양력 입력 시각(KST 벽시계, 보정 없음, 자시는 자정 기준)의 4주. 계산 실패는 null. */
export function pillarsAt(year: number, month: number, day: number, hour: number): LibPillars | null {
  try {
    const p = calculateFourPillars({ year, month, day, hour, minute: 0, dayBoundary: "midnight" });
    const wrap = (x: { heavenlyStem: string; earthlyBranch: string }): LibPillar => ({
      stem: x.heavenlyStem,
      branch: x.earthlyBranch,
      stemElement: getHeavenlyStemElement(x.heavenlyStem as never),
      branchElement: getEarthlyBranchElement(x.earthlyBranch as never),
    });
    return { year: wrap(p.year), month: wrap(p.month), day: wrap(p.day), hour: wrap(p.hour) };
  } catch {
    return null;
  }
}

/** 한 해의 12절(짝수 인덱스) 절입 순간(UTC ms). */
export function jeolInstants(year: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 24; i += 2) out.push(getSolarTerm(year, i).date.getTime());
  return out;
}
