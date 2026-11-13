// 사주 4주·오행 분포 — 표시 전용(번호 결정에 쓰지 않는다, ADR-0005 ②·task-046 ⓐ~ⓗ).
// 기준: 한국 표준시(+9), 진태양시 보정 없음, 자시는 입력 날짜 기준(자정 경계). 간지·생년월일은 로그·오류에 넣지 않는다.
import type { SajuBirthInput, SajuChartResult, SajuElementCounts, SajuPillar } from "../types.ts";
import { SAJU_HOUR_IDS } from "../types.ts";
import { jeolInstants, lunarToSolarYmd, pillarsAt, type LibPillar } from "./lib.ts";

const MIN_DATE = "1900-01-01";
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KST_OFFSET_MS = 9 * 3_600_000;
const MIN_MS = 60_000;
/** 절입 경계 판정 여유(±60분) — 서머타임·+8:30·LMT·라이브러리 1분 차를 한 규칙으로 덮는다. */
const MARGIN_MIN = 60;
const DAY_MIN = 1440;

const FAIL: SajuChartResult = { ok: false, reason: "UNCONVERTIBLE_DATE" };

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 출생 구간(그날 0시 기준 분, [시작, 끝)). 자시 라벨 23~01 = 전날 23:00~당일 01:00(-60~60). 4주는 입력 날짜 00:00(조자시) 기준으로 계산한다. */
function intervals(hour: SajuBirthInput["hour"]): [number, number][] {
  if (hour === null) return [[0, DAY_MIN]];
  const i = SAJU_HOUR_IDS.indexOf(hour);
  if (i === 0) return [[-60, 60]];
  return [[60 * (2 * i - 1), 60 * (2 * i + 1)]];
}

function toPillar(p: LibPillar): SajuPillar {
  return { stem: p.stem, branch: p.branch, stemElement: p.stemElement, branchElement: p.branchElement };
}

function countElements(pillars: SajuPillar[]): SajuElementCounts {
  const counts: SajuElementCounts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of pillars) {
    counts[p.stemElement as keyof SajuElementCounts]++;
    counts[p.branchElement as keyof SajuElementCounts]++;
  }
  return counts;
}

/**
 * 사주 4주와 오행 분포(천간·지지 본기 글자 수, 지장간 제외). today는 KST `YYYY-MM-DD`.
 * 음력→양력이 1900-01-01 이전이거나 today 이후이면, 또는 존재하지 않는 날짜(윤달 없는 해의 윤달, 29일 달의 30일)이면 실패.
 */
export function calculateSaju(birth: SajuBirthInput, today: string): SajuChartResult {
  const m = DATE_RE.exec(birth.date);
  if (!m) return FAIL;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let solar: { year: number; month: number; day: number } | null;
  if (birth.calendar === "solar") {
    if (birth.leap) return FAIL;
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return FAIL;
    solar = { year: y, month: mo, day: d };
  } else {
    solar = lunarToSolarYmd(y, mo, d, birth.leap);
    if (solar === null) return FAIL;
  }
  const iso = `${pad(solar.year, 4)}-${pad(solar.month)}-${pad(solar.day)}`;
  if (iso < MIN_DATE || iso > today) return FAIL;
  const hourIndex = birth.hour === null ? -1 : SAJU_HOUR_IDS.indexOf(birth.hour);
  if (birth.hour !== null && hourIndex < 0) return FAIL;

  const ivs = intervals(birth.hour);
  // 4주는 구간 시작 시각 기준 한 값(자시·시진 모름은 그날 00:00).
  const startHour = Math.max(0, ivs[0]![0] / 60);
  const lib = pillarsAt(solar.year, solar.month, solar.day, startHour);
  if (lib === null) return FAIL;

  // 절입 경계: 12절 순간이 어떤 구간의 [시작−60분, 끝+60분] 안에 있으면 년주·월주가 달라질 수 있다.
  const dayStartMs = Date.UTC(solar.year, solar.month - 1, solar.day) - KST_OFFSET_MS;
  const jeol = [solar.year - 1, solar.year, solar.year + 1].flatMap(jeolInstants);
  const boundary = ivs.some(([a, b]) => {
    const lo = dayStartMs + (a - MARGIN_MIN) * MIN_MS;
    const hi = dayStartMs + (b + MARGIN_MIN) * MIN_MS;
    return jeol.some((t) => t >= lo && t <= hi);
  });

  const pillars = {
    year: toPillar(lib.year),
    month: toPillar(lib.month),
    day: toPillar(lib.day),
    hour: birth.hour === null ? null : toPillar(lib.hour),
  };
  const used = [pillars.year, pillars.month, pillars.day, ...(pillars.hour ? [pillars.hour] : [])];
  return { ok: true, pillars, elements: countElements(used), boundary };
}
