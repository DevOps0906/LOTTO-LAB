// D-11 첫 실행 만 19세 확인(DF-6): M-05를 창 가운데 카드로 보인다. 확인 전에는 셸·사이드바·다른 화면을 그리지 않는다.
// core가 없으면(설정 오류) 기기에 기록할 수 없어 이번 실행 동안만 확인 상태를 둔다.
import { Onboarding, StateView } from "@lotto-lab/ui";
import { useEffect, useState, type ReactNode } from "react";

export type AgeGateLike = { isConfirmed(): Promise<boolean>; confirm(): Promise<unknown> };

export function createSessionAgeGate(): AgeGateLike {
  let confirmed = false;
  return {
    isConfirmed: async () => confirmed,
    confirm: async () => {
      confirmed = true;
    },
  };
}

type Gate = "checking" | "required" | "passed";

export function AgeGateRoute({ gate, children }: { gate: AgeGateLike; children: ReactNode }) {
  const [state, setState] = useState<Gate>("checking");

  useEffect(() => {
    let alive = true;
    gate.isConfirmed().then(
      (ok) => {
        if (alive) setState(ok ? "passed" : "required");
      },
      () => {
        // 읽기 실패는 미확인으로 본다 — 다시 확인받는다.
        if (alive) setState("required");
      },
    );
    return () => {
      alive = false;
    };
  }, [gate]);

  if (state === "passed") return <>{children}</>;
  return (
    <div className="app-center">
      {state === "checking" ? (
        <StateView kind="loading" title="시작하는 중입니다" />
      ) : (
        // 창 닫기는 Windows 창 버튼으로 한다(onExit 없음 → 종료 안내만).
        <Onboarding layout="card" confirm={() => gate.confirm()} onDone={() => setState("passed")} />
      )}
    </div>
  );
}
