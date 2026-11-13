export type UpdatedProps = {
  /** 출처(예: "동행복권 공식 결과") */
  source: string;
  /** 검증(갱신) 시각 */
  verifiedAt: Date | string;
  /** 통계 기준(예: "최근 100회차") */
  basis?: string;
  /** 통계 화면: "미래 예측 아님" 고지(AGENTS.md 4장) */
  notPrediction?: boolean;
};

const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 출처·검증 시각(회차 결과·통계 하단). */
export function Updated({ source, verifiedAt, basis, notPrediction = false }: UpdatedProps) {
  const date = typeof verifiedAt === "string" ? new Date(verifiedAt) : verifiedAt;
  return (
    <p className="ll-updated">
      <span>
        출처 <strong>{source}</strong>
      </span>
      <span>
        검증 <time dateTime={date.toISOString()}>{formatter.format(date)}</time>
      </span>
      {basis && <span>기준 {basis}</span>}
      {notPrediction && <span>과거 데이터 통계이며 미래 예측이 아닙니다.</span>}
    </p>
  );
}
