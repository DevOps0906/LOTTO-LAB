// M-06 로그인·가입·비밀번호 재설정(task-043, P1). 이메일+비밀번호, 가입 확인·재설정은 메일로 받은 6자리 코드 입력(링크·딥링크 없음).
// 문구·규칙 판정은 app-core AuthService가 한다(오류 문구 통일·이메일 열거 방지). 화면은 입력·제출 잠금·결과 표시만.
// 로그인 전에는 이 기기의 번호를 서버로 보내지 않는다(안내 문구로 명시).
// 동의 게이트: 로그인됐지만 동의 기록이 없거나 확인하지 못하면(consentRequired) 복귀하지 않고 동의 단계를 보인다.
import { useId, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";

export type AuthField = "email" | "password" | "code" | "consent";
export type AuthOutcome = { ok: true; message?: string } | { ok: false; code: string; message: string; field?: AuthField };
export type AuthConsent = { terms: boolean; privacy: boolean; adult: boolean };

/** app-core AuthState 중 화면이 쓰는 부분(checkFailed = 동의 기록 조회 실패). */
export type AuthViewState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "signedOut" }
  | { status: "consentRequired"; user: { email: string | null }; checkFailed: boolean }
  | { status: "signedIn"; user: { email: string | null } };

/** M-06이 쓰는 app-core AuthService 기능. */
export type AuthCore = {
  auth: {
    state(): AuthViewState;
    subscribe(listener: () => void): () => void;
    /** 동의 기록 조회 실패 뒤 다시 확인 */
    retry(): Promise<AuthViewState>;
    /** 이 기기 로그아웃. 저장 값을 지우지 못하면 실패(상태 유지). */
    signOut(): Promise<AuthOutcome>;
    signIn(email: string, password: string): Promise<AuthOutcome>;
    signUp(email: string, password: string, consent: AuthConsent): Promise<AuthOutcome>;
    resendSignup(email: string): Promise<AuthOutcome>;
    verifySignup(email: string, code: string, consent: AuthConsent): Promise<AuthOutcome>;
    recordConsent(consent: AuthConsent): Promise<AuthOutcome>;
    requestReset(email: string): Promise<AuthOutcome>;
    confirmReset(email: string, code: string, newPassword: string): Promise<AuthOutcome>;
  };
};

export type AuthTab = "signin" | "signup" | "reset";
export type AuthLinks = { /** 게스트로 계속(로그인 없이 이전 화면·홈) */ guest: string };

export type AuthProps = {
  core: AuthCore;
  links: AuthLinks;
  initialTab?: AuthTab;
  /** 로그인 완료(가입 완료·재설정 완료 포함) → 셸이 원래 화면으로 복귀 */
  onDone: () => void;
};

const TABS: readonly { id: AuthTab; label: string }[] = [
  { id: "signin", label: "로그인" },
  { id: "signup", label: "가입" },
  { id: "reset", label: "비밀번호 재설정" },
];

const PASSWORD_HINT = "8자 이상, 영문과 숫자를 함께 써 주세요.";
const NO_CONSENT: AuthConsent = { terms: false, privacy: false, adult: false };
const CONSENT_CHECK_FAILED = "가입 동의 기록을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.";

type Problem = { message: string; field?: AuthField } | null;

/** 동의 단계로 넘길 때 함께 넘기는 값(가입 중 기록 실패면 체크한 동의와 실패 문구). */
type ConsentPending = { consent: AuthConsent; message: string | null };

export function Auth({ core, links, initialTab = "signin", onDone }: AuthProps) {
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const state = useSyncExternalStore(
    (listener) => core.auth.subscribe(listener),
    () => core.auth.state(),
  );
  // 제출 중 잠깐 거치는 consentRequired로 화면이 바뀌지 않게, 진입 시점·제출 완료 뒤에만 동의 단계로 넘긴다.
  const [pending, setPending] = useState<ConsentPending | null>(() =>
    core.auth.state().status === "consentRequired" ? { consent: NO_CONSENT, message: null } : null,
  );
  /** 로그인 계열 성공 뒤: 최종 상태가 signedIn이면 복귀, consentRequired면 동의 단계(그 밖은 서비스가 실패로 돌려준다). */
  const finish = () => {
    const status = core.auth.state().status;
    if (status === "consentRequired") setPending({ consent: NO_CONSENT, message: null });
    else if (status === "signedIn") onDone();
  };
  return (
    <div className="ll-settings">
      <Header title="로그인" subtitle="로그인은 선택입니다. 로그인하지 않아도 번호 생성·저장은 이 기기에서 그대로 쓸 수 있습니다." />
      {pending && state.status === "consentRequired" ? (
        <ConsentStep core={core} initial={pending} checkFailed={state.checkFailed} onDone={onDone} />
      ) : (
        <>
          <Tabs tab={tab} onChange={setTab} />
          <div role="tabpanel" id={`auth-panel-${tab}`} aria-labelledby={`auth-tab-${tab}`}>
            {tab === "signin" && <SignIn key="signin" core={core} onDone={finish} onForgot={() => setTab("reset")} />}
            {tab === "signup" && <SignUp key="signup" core={core} onDone={finish} onConsentFailed={setPending} />}
            {tab === "reset" && <Reset key="reset" core={core} onDone={finish} />}
          </div>
        </>
      )}
      <Card>
        <p className="ll-muted">이 기기에 저장한 번호는 로그인 전에 서버로 보내지 않습니다.</p>
        <p>
          <a href={links.guest}>게스트로 계속</a>
        </p>
      </Card>
    </div>
  );
}

function Tabs({ tab, onChange }: { tab: AuthTab; onChange: (tab: AuthTab) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : step ? TABS[(i + step + TABS.length) % TABS.length] : undefined;
    if (!target) return;
    event.preventDefault();
    onChange(target.id);
    refs.current[target.id]?.focus();
  };
  return (
    <div className="ll-tabs" role="tablist" aria-label="로그인 방법" onKeyDown={onKeyDown}>
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`auth-tab-${t.id}`}
          aria-selected={t.id === tab}
          aria-controls={`auth-panel-${t.id}`}
          tabIndex={t.id === tab ? 0 : -1}
          className="ll-tabs__tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 제출 잠금 + 결과 처리. 실패는 문제(문구·필드)로, 예외는 공통 문구로. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  async function run(task: () => Promise<AuthOutcome>, onOk: (out: { ok: true; message?: string }) => void) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const out = await task();
      if (out.ok) onOk(out);
      else setProblem({ message: out.message, field: out.field });
    } catch {
      setProblem({ message: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }
  return { busy, problem, setProblem, run };
}

function ProblemText({ problem }: { problem: Problem }) {
  if (!problem) return null;
  return (
    <p className="ll-gen__error" role="alert">
      {problem.message}
    </p>
  );
}

function TextField({
  id,
  label,
  hint,
  invalid,
  ...input
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  invalid?: boolean;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  inputMode?: "email" | "numeric";
  maxLength?: number;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="ll-field">
      <label className="ll-field__legend" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ll-input"
        type={input.type}
        value={input.value}
        onChange={(e) => input.onChange(e.target.value)}
        autoComplete={input.autoComplete}
        inputMode={input.inputMode}
        maxLength={input.maxLength}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        spellCheck={false}
        autoCapitalize="off"
      />
      {hint && (
        <p id={hintId} className="ll-field__hint ll-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function SignIn({ core, onDone, onForgot }: { core: AuthCore; onDone: () => void; onForgot: () => void }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, problem, run } = useSubmit();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => core.auth.signIn(email, password), () => onDone());
  };
  return (
    <Card title="이메일로 로그인">
      <form className="ll-field" onSubmit={submit} noValidate aria-busy={busy || undefined}>
        <TextField id={`${id}-email`} label="이메일" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} invalid={problem?.field === "email"} />
        <TextField id={`${id}-pw`} label="비밀번호" type="password" autoComplete="current-password" value={password} onChange={setPassword} invalid={problem?.field === "password"} />
        <ProblemText problem={problem} />
        <div className="ll-gen__actions">
          <Button type="submit" disabled={busy}>
            {busy ? "로그인하는 중" : "로그인"}
          </Button>
          <Button variant="secondary" onClick={onForgot}>
            비밀번호를 잊었어요
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ConsentFields({ consent, onChange }: { consent: AuthConsent; onChange: (consent: AuthConsent) => void }) {
  const check = (key: keyof AuthConsent) => (e: { target: { checked: boolean } }) => onChange({ ...consent, [key]: e.target.checked });
  return (
    <fieldset className="ll-field">
      <legend className="ll-field__legend">필수 동의</legend>
      <label className="ll-check">
        <input type="checkbox" checked={consent.terms} onChange={check("terms")} />
        <span>이용약관에 동의합니다 (필수)</span>
      </label>
      <label className="ll-check">
        <input type="checkbox" checked={consent.privacy} onChange={check("privacy")} />
        <span>개인정보 수집·이용(이메일·동의 기록)에 동의합니다 (필수)</span>
      </label>
      <label className="ll-check">
        <input type="checkbox" checked={consent.adult} onChange={check("adult")} />
        <span>만 19세 이상입니다 (필수)</span>
      </label>
      <p className="ll-field__hint ll-muted">약관·개인정보 처리방침 전문은 준비 중입니다.</p>
    </fieldset>
  );
}

/** 로그인됐지만 동의 기록이 없거나(동의 → 기록) 확인하지 못함(다시 확인). 로그아웃으로 빠져나갈 수 있다. */
function ConsentStep({ core, initial, checkFailed, onDone }: { core: AuthCore; initial: ConsentPending; checkFailed: boolean; onDone: () => void }) {
  const [consent, setConsent] = useState<AuthConsent>(initial.consent);
  const { busy, problem, run } = useSubmit();
  const record = (e: FormEvent) => {
    e.preventDefault();
    void run(() => core.auth.recordConsent(consent), () => onDone());
  };
  const recheck = () =>
    void run(
      async (): Promise<AuthOutcome> => {
        const next = await core.auth.retry();
        if (next.status === "consentRequired" && next.checkFailed) return { ok: false, code: "CONSENT_CHECK_FAILED", message: CONSENT_CHECK_FAILED };
        return { ok: true };
      },
      () => {
        if (core.auth.state().status === "signedIn") onDone();
      },
    );
  const signOut = () => void run(() => core.auth.signOut(), () => {});

  if (checkFailed) {
    return (
      <Card title="가입 동의 확인">
        <p className="ll-gen__error" role="alert">
          {problem?.message ?? CONSENT_CHECK_FAILED}
        </p>
        <div className="ll-gen__actions">
          <Button disabled={busy} onClick={recheck}>
            {busy ? "확인하는 중" : "다시 확인"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={signOut}>
            로그아웃
          </Button>
        </div>
      </Card>
    );
  }

  const shown = problem ?? (initial.message ? { message: initial.message } : null);
  return (
    <Card title="가입 동의">
      <form className="ll-field" onSubmit={record} noValidate aria-busy={busy || undefined}>
        <p className="ll-muted">회원 기능을 쓰려면 필수 항목에 동의해 주세요. 동의하지 않으려면 로그아웃할 수 있습니다.</p>
        <ConsentFields consent={consent} onChange={setConsent} />
        <ProblemText problem={shown} />
        <div className="ll-gen__actions">
          <Button type="submit" disabled={busy}>
            {busy ? "저장하는 중" : "동의하고 계속"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={signOut}>
            로그아웃
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SignUp({ core, onDone, onConsentFailed }: { core: AuthCore; onDone: () => void; onConsentFailed: (pending: ConsentPending) => void }) {
  const id = useId();
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState<AuthConsent>(NO_CONSENT);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, problem, setProblem, run } = useSubmit();

  const requestCode = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => core.auth.signUp(email, password, consent),
      (out) => {
        setPassword("");
        setSent(out.message ?? null);
        setStep("code");
      },
    );
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(
      async () => {
        const out = await core.auth.verifySignup(email, code, consent);
        // 코드 확인(로그인)은 됐지만 동의 기록이 실패(오프라인·429 포함) — 오류 종류와 무관하게 동의 단계에서 다시 기록한다(소비된 코드 재검증 금지).
        if (!out.ok && core.auth.state().status === "consentRequired") {
          onConsentFailed({ consent, message: out.message });
        }
        return out;
      },
      () => onDone(),
    );
  };

  if (step === "code") {
    return (
      <Card title="메일로 받은 코드 입력">
        <form className="ll-field" onSubmit={verify} noValidate aria-busy={busy || undefined}>
          {sent && (
            <p className="ll-muted" role="status">
              {sent}
            </p>
          )}
          <TextField
            id={`${id}-code`}
            label="6자리 코드"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(v) => setCode(v.replace(/[^0-9]/g, ""))}
            invalid={problem?.field === "code"}
          />
          <ProblemText problem={problem} />
          <div className="ll-gen__actions">
            <Button type="submit" disabled={busy}>
              {busy ? "확인하는 중" : "가입 완료"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => core.auth.resendSignup(email), (out) => setSent(out.message ?? null))}
            >
              코드 다시 받기
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setProblem(null);
                setCode("");
                setStep("form");
              }}
            >
              이메일 다시 입력
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card title="이메일로 가입">
      <form className="ll-field" onSubmit={requestCode} noValidate aria-busy={busy || undefined}>
        <TextField id={`${id}-email`} label="이메일" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} invalid={problem?.field === "email"} />
        <TextField
          id={`${id}-pw`}
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          value={password}
          onChange={setPassword}
          invalid={problem?.field === "password"}
        />
        <ConsentFields consent={consent} onChange={setConsent} />
        <ProblemText problem={problem} />
        <div className="ll-gen__actions">
          <Button type="submit" disabled={busy}>
            {busy ? "요청하는 중" : "코드 받기"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Reset({ core, onDone }: { core: AuthCore; onDone: () => void }) {
  const id = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, problem, run } = useSubmit();

  const request = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => core.auth.requestReset(email),
      (out) => {
        setSent(out.message ?? null);
        setStep("code");
      },
    );
  };
  const confirm = (e: FormEvent) => {
    e.preventDefault();
    void run(() => core.auth.confirmReset(email, code, password), () => onDone());
  };

  if (step === "code") {
    return (
      <Card title="코드와 새 비밀번호 입력">
        <form className="ll-field" onSubmit={confirm} noValidate aria-busy={busy || undefined}>
          {sent && (
            <p className="ll-muted" role="status">
              {sent}
            </p>
          )}
          <TextField
            id={`${id}-code`}
            label="6자리 코드"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(v) => setCode(v.replace(/[^0-9]/g, ""))}
            invalid={problem?.field === "code"}
          />
          <TextField
            id={`${id}-pw`}
            label="새 비밀번호"
            type="password"
            autoComplete="new-password"
            hint={PASSWORD_HINT}
            value={password}
            onChange={setPassword}
            invalid={problem?.field === "password"}
          />
          <ProblemText problem={problem} />
          <div className="ll-gen__actions">
            <Button type="submit" disabled={busy}>
              {busy ? "바꾸는 중" : "비밀번호 바꾸기"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => core.auth.requestReset(email), (out) => setSent(out.message ?? null))}>
              코드 다시 받기
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card title="비밀번호 재설정">
      <form className="ll-field" onSubmit={request} noValidate aria-busy={busy || undefined}>
        <TextField id={`${id}-email`} label="가입한 이메일" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} invalid={problem?.field === "email"} />
        <ProblemText problem={problem} />
        <div className="ll-gen__actions">
          <Button type="submit" disabled={busy}>
            {busy ? "요청하는 중" : "코드 받기"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
