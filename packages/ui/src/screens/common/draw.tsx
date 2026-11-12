// 회차 표시 조각(M-16 목록·M-11 상세 공용): 당첨 번호(로또 공·보너스 / 연금 조·6자리 문자열·보너스 분리), 출처·검증 시각.
// 연금 번호는 문자열 그대로 보인다(앞자리 0 보존 — "000719").
import { Ball } from "../../components/Ball";
import { Updated } from "../../components/Updated";
import { sourceHost, type LottoDraw, type PensionDraw } from "./data";

export type AnyDraw = LottoDraw | PensionDraw;

export function isLottoDraw(draw: AnyDraw): draw is LottoDraw {
  return "nums" in draw;
}

export function DrawNumbers({ draw, small = false }: { draw: AnyDraw; small?: boolean }) {
  if (isLottoDraw(draw)) {
    return (
      <span className={small ? "ll-balls ll-balls--small" : "ll-balls"} role="list" aria-label="당첨 번호">
        {draw.nums.map((n) => (
          <span role="listitem" key={n}>
            <Ball number={n} />
          </span>
        ))}
        <span role="listitem">
          <Ball number={draw.bonus} state="bonus" />
        </span>
      </span>
    );
  }
  return (
    <span className="ll-pension-line" role="group" aria-label={`당첨 번호 ${draw.group_no}조 ${draw.digits}, 보너스 ${draw.bonus_digits}`}>
      <span className="ll-chip" data-game="pension">
        {draw.group_no}조
      </span>
      <span className="ll-mono">{draw.digits}</span>
      <span className="ll-muted">보너스</span>
      <span className="ll-mono">{draw.bonus_digits}</span>
    </span>
  );
}

/** 출처(공개 결과 호스트)·검증 시각. 공식 서비스로 오인되지 않게 "공개 결과"로 표기한다. */
export function DrawUpdated({ draw }: { draw: AnyDraw }) {
  return <Updated source={`${sourceHost(draw.source_url)} 공개 결과`} verifiedAt={draw.source_verified_at} />;
}
