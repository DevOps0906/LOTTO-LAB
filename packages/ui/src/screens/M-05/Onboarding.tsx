// M-05 온보딩·19세 확인(마법사, DF-6): 서비스 안내 → 만 19세 확인 → 시작. 통과 전에는 셸이 다른 화면을 그리지 않는다.
// 미성년·거절은 종료 안내로 끝난다. 로그인(M-06)은 P1이라 비활성 표시만 한다.
import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { StateView } from "../../components/StateView";

export type OnboardingProps = {
  /** 만 19세 확인 기록(app-core AgeGate.confirm). 실패하면 재시도 안내 */
  confirm: () => Promise<unknown>;
  /** 확인 기록 저장 후 게스트 홈으로 */
  onDone: () => void;
  /** 앱 종료(네이티브 셸). 없으면 종료 안내만 보인다 */
  onExit?: () => void;
  /** 약관·개인정보 처리방침 주소. 없으면 준비 중 표기 */
  termsHref?: string;
};

const STEPS = ["서비스 안내", "만 19세 확인", "시작"] as const;
type Step = 0 | 1 | 2;
type Exit = "minor" | "declined";

export function Onboarding({ confirm, onDone, onExit, termsHref }: OnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [read, setRead] = useState(false);
  const [adult, setAdult] = useState<"yes" | "no" | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exit, setExit] = useState<Exit | null>(null);
  const hintId = useId();

  if (exit) {
    return (
      <div className="ll-onboarding">
        <Header title="이용 안내" />
        <StateView
          kind="empty"
          title={exit === "minor" ? "만 19세 이상만 이용할 수 있습니다" : "이용을 마칩니다"}
          description={
            exit === "minor"
              ? "LOTTO LAB은 만 19세 이상 성인을 위한 앱입니다. 앱을 종료해 주세요."
              : "서비스 안내와 연령 확인에 동의해야 이용할 수 있습니다. 앱을 종료해 주세요."
          }
          action={
            <div className="ll-onboarding__actions">
              {onExit && (
                <Button variant="secondary" onClick={onExit}>
                  앱 종료
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setExit(null);
                  setAdult(null);
                  setStep(0);
                }}
              >
                처음으로
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const canNext = step === 0 ? read : adult !== null;

  function next() {
    if (step === 1 && adult === "no") return setExit("minor");
    setStep((s) => (s + 1) as Step);
  }

  async function start() {
    setSaving(true);
    setFailed(false);
    try {
      await confirm();
      onDone();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <div className="ll-onboarding">
      <Header title="LOTTO LAB 시작하기" subtitle={`${step + 1} / ${STEPS.length} 단계 · ${STEPS[step]}`} />
      <ol className="ll-steps" aria-label="진행 단계">
        {STEPS.map((label, i) => (
          <li key={label} data-done={i <= step} aria-current={i === step ? "step" : undefined}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <section className="ll-card ll-onboarding__body" aria-labelledby={`${hintId}-t`}>
        {step === 0 && (
          <>
            <h2 id={`${hintId}-t`} className="ll-card__title">
              어떤 서비스인가요?
            </h2>
            <ul className="ll-onboarding__list">
              <li>지난 회차 데이터로 살펴보는 번호 생성과 내 번호 기록·관리 서비스입니다.</li>
              <li>복권을 판매하지 않으며, 구매 대행·중개를 하지 않습니다.</li>
              <li>통계는 지난 회차 요약이며 미래 예측이 아닙니다. 생성한 번호는 당첨을 보장하지 않습니다.</li>
            </ul>
            <label className="ll-check">
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} aria-describedby={hintId} />
              <span>위 서비스 안내를 확인했습니다 (필수)</span>
            </label>
          </>
        )}
        {step === 1 && (
          <fieldset className="ll-onboarding__fieldset" aria-describedby={hintId}>
            <legend id={`${hintId}-t`} className="ll-card__title">
              만 19세 이상인가요? (필수)
            </legend>
            <label className="ll-check">
              <input type="radio" name="adult" checked={adult === "yes"} onChange={() => setAdult("yes")} />
              <span>네, 만 19세 이상입니다</span>
            </label>
            <label className="ll-check">
              <input type="radio" name="adult" checked={adult === "no"} onChange={() => setAdult("no")} />
              <span>아니요, 만 19세 미만입니다</span>
            </label>
          </fieldset>
        )}
        {step === 2 && (
          <>
            <h2 id={`${hintId}-t`} className="ll-card__title">
              게스트로 시작합니다
            </h2>
            <p className="ll-onboarding__text">
              생성 기록과 저장한 번호는 이 기기에만 보관됩니다. 로그인하면 기기 간 동기화를 쓸 수 있습니다(준비 중).
            </p>
            {failed && (
              <p className="ll-onboarding__error" role="alert">
                확인 기록을 저장하지 못했습니다. 다시 시도해 주세요.
              </p>
            )}
            {saving && <p role="status">확인 기록을 저장하는 중입니다</p>}
          </>
        )}
        {step < 2 && (
          <p id={hintId} className="ll-onboarding__hint">
            {canNext ? "다음을 눌러 계속하세요." : "필수 항목을 선택하면 다음으로 넘어갈 수 있습니다."}
          </p>
        )}
      </section>

      <div className="ll-onboarding__actions">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)} disabled={saving}>
            이전
          </Button>
        )}
        {step < 2 ? (
          <Button onClick={next} disabled={!canNext}>
            다음
          </Button>
        ) : (
          <>
            <Button onClick={start} disabled={saving}>
              {failed ? "다시 시도" : "게스트로 시작"}
            </Button>
            <Button variant="secondary" disabled title="로그인은 준비 중입니다">
              로그인 (준비 중)
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={() => setExit("declined")} disabled={saving}>
          종료
        </Button>
      </div>

      <p className="ll-onboarding__foot">
        {termsHref ? <a href={termsHref}>약관·개인정보 처리방침</a> : "약관·개인정보 처리방침 (준비 중)"}
      </p>
    </div>
  );
}
