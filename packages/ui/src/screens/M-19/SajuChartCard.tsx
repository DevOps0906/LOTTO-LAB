// M-19 사주 4주·오행 표(task-046, 표시 전용). 번호는 이 표로 정하지 않는다(ADR-0005 ②).
// 강·약·부족·용신·해석 문장·부족 오행 강조는 두지 않는다 — 글자 수와 기준만 보여 준다. 간지·생년월일은 로그에 남기지 않는다.
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StateView } from "../../components/StateView";
import { Table, type TableColumn } from "../../components/Table";

export type SajuChartPillar = { stem: string; branch: string; stemElement: string; branchElement: string };
export type SajuChart =
  | {
      ok: true;
      pillars: { year: SajuChartPillar; month: SajuChartPillar; day: SajuChartPillar; hour: SajuChartPillar | null };
      elements: Record<"목" | "화" | "토" | "금" | "수", number>;
      boundary: boolean;
    }
  | { ok: false; reason: "UNCONVERTIBLE_DATE" };

const ELEMENT_ORDER = ["목", "화", "토", "금", "수"] as const;
export const SAJU_BOUNDARY_NOTICE = "절입 경계 — 출생 시각에 따라 년주·월주가 다를 수 있습니다";
export const SAJU_NO_NUMBER_NOTICE = "번호는 이 표로 정하지 않습니다";
export const SAJU_BASIS = "한국 표준시 기준, 진태양시 보정 없음";
export const SAJU_JA_NOTICE = "자시(23~01시)는 입력한 날짜 기준으로 계산합니다(야자시 학파는 다를 수 있음)";

type Row = { key: string; label: string; stem: string; branch: string };

const COLUMNS: TableColumn<Row>[] = [
  { key: "label", header: "구분" },
  { key: "stem", header: "천간" },
  { key: "branch", header: "지지" },
];

export function SajuChartCard({ chart, hourIsJa, onEditProfile }: { chart: SajuChart; hourIsJa: boolean; onEditProfile: () => void }) {
  if (!chart.ok) {
    return (
      <Card title="사주 표">
        <StateView
          kind="error"
          title="변환할 수 없는 날짜"
          description="입력한 날짜를 양력으로 바꿀 수 없어 사주 표를 만들지 못했어요. 번호 생성은 그대로 할 수 있습니다."
          action={<Button variant="secondary" onClick={onEditProfile}>프로필 수정</Button>}
        />
      </Card>
    );
  }
  const cell = (p: SajuChartPillar | null, part: "stem" | "branch") => (p === null ? "모름" : `${p[part]} (${part === "stem" ? p.stemElement : p.branchElement})`);
  const p = chart.pillars;
  const rows: Row[] = [
    { key: "year", label: "년주", stem: cell(p.year, "stem"), branch: cell(p.year, "branch") },
    { key: "month", label: "월주", stem: cell(p.month, "stem"), branch: cell(p.month, "branch") },
    { key: "day", label: "일주", stem: cell(p.day, "stem"), branch: cell(p.day, "branch") },
    { key: "hour", label: "시주", stem: cell(p.hour, "stem"), branch: cell(p.hour, "branch") },
  ];
  const chars = p.hour === null ? 6 : 8;
  return (
    <Card title="사주 표">
      <Table caption="사주 4주 (괄호는 오행)" columns={COLUMNS} rows={rows} rowKey={(r) => r.key} />
      <dl className="ll-muted" aria-label={`오행 분포 — 천간·지지 본기 글자 수, 지장간 제외, 총 ${chars}글자`}>
        {ELEMENT_ORDER.map((e) => (
          <div key={e}>
            <dt>{e}</dt>
            <dd>{chart.elements[e]}글자</dd>
          </div>
        ))}
      </dl>
      <p className="ll-muted">오행 분포: 천간·지지 본기 글자 수(지장간 제외), 총 {chars}글자</p>
      {chart.boundary && <p role="note">{SAJU_BOUNDARY_NOTICE}</p>}
      {hourIsJa && <p className="ll-muted">{SAJU_JA_NOTICE}</p>}
      <p className="ll-muted">{SAJU_BASIS}</p>
      <p className="ll-muted">{SAJU_NO_NUMBER_NOTICE}</p>
    </Card>
  );
}
