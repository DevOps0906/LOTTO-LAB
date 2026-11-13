// 마지막 정상본 안내 배너: 오프라인·서버 오류(stale)·최신 회차 0행(EMPTY). 색만으로 구분하지 않고 문구로 알린다.
import type { ReactNode } from "react";
import { Icon } from "../../components/icons";
import { formatTime, type ReadResult } from "./data";

export type ReadBannerProps = {
  /** 이 화면이 읽은 결과들. 마지막 정상본(data 있음)을 보여 주는 stale 결과만 안내한다. */
  results: readonly (ReadResult<unknown> | undefined)[];
  /** 다시 시도(수동 새로고침) */
  action?: ReactNode;
};

export function ReadBanner({ results, action }: ReadBannerProps) {
  const stale = results.filter((r): r is ReadResult<unknown> => !!r && r.stale && r.data !== null);
  if (stale.length === 0) return null;
  const empty = stale.some((r) => r.error === "EMPTY");
  const offline = stale.some((r) => r.error !== "EMPTY");
  const synced = stale
    .map((r) => r.fetched_at)
    .filter((t): t is string => t !== null)
    .sort()[0];
  return (
    <div className="ll-banner" role="status">
      <Icon name="info" />
      <div className="ll-banner__text">
        {offline && <p>서버에 연결하지 못해 마지막으로 받은 정보를 보여 줍니다.</p>}
        {empty && <p>최신 회차가 아직 갱신되지 않아 이전 회차를 보여 줍니다.</p>}
        {synced && (
          <p className="ll-banner__meta">
            마지막 동기화 <time dateTime={synced}>{formatTime(synced)}</time>
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
