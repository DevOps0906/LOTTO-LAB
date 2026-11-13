// M-12 설정(P0 범위): 화면 테마(시스템·라이트·다크 — 셸이 <html>.dark로 토큰 적용), 만 19세 확인 정보, 기기 권한 상태,
// 로컬 데이터 내보내기(JSON 복사·공유)·모두 삭제(문구 재입력 + AlertDialog 이중 확인), 앱 버전·오픈소스 라이선스·약관·개인정보(준비 중).
// 알림·동기화는 P1 안내만, 광고 동의 변경(M-20)은 P1이라 보이지 않는다.
// 계정(task-043): core.auth가 있으면 로그인 상태·로그인 진입·로그아웃·계정 삭제
// (AlertDialog → 비밀번호 재입력 → 재인증 → account-delete → 로컬 세션 삭제).
// core.auth가 없으면(Windows — task-043b) 예전처럼 준비 중 안내만 보인다.
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { AlertDialog } from "../../components/AlertDialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { useNotice } from "../../components/Notice";
import { StateView } from "../../components/StateView";
import { formatTime, useAsync } from "../common/data";
import type { AuthViewState } from "../M-06/Auth";
import { Segment } from "../common/generator";

export type ThemePreference = "system" | "light" | "dark";
export type LocalDataSummary = { tickets: number; favorites: number; purchased: number; generated: number };

/** 설정 화면이 쓰는 app-core AuthService 기능. */
export type SettingsAuth = {
  state(): AuthViewState;
  subscribe(listener: (state: unknown) => void): () => void;
  /** 기기 저장소 읽기 실패·동의 기록 조회 실패 뒤 다시 확인 */
  retry(): Promise<unknown>;
  /** 저장 값을 지우지 못하면 실패(로그인 상태 유지). */
  signOut(): Promise<{ ok: true } | { ok: false; message: string }>;
  /** 비밀번호 재입력으로 재인증한 뒤 삭제한다(서버는 최근 10분 안의 비밀번호 인증을 요구). */
  deleteAccount(password: string): Promise<{ ok: true } | { ok: false; message: string }>;
};

/** 설정 화면이 쓰는 app-core(AppCore) 기능. */
export type SettingsCore = {
  ageGate: { confirmedAt(): Promise<string | null> };
  theme: { get(): Promise<ThemePreference>; set(theme: ThemePreference): Promise<ThemePreference> };
  data: { summary(): Promise<LocalDataSummary>; exportJson(): Promise<string>; clearAll(): Promise<number> };
  adapters: {
    clipboard: { writeText(text: string): Promise<void> };
    share: { share(content: { title?: string; text: string }): Promise<void> };
  };
  /** 로그인(P1). 없거나 null이면 계정 항목은 준비 중 안내만. */
  auth?: SettingsAuth | null;
};

export type SettingsProps = {
  core: SettingsCore;
  /** 앱 버전(셸 package.json) */
  appVersion: string;
  /** 테마를 바꾸면 셸이 즉시 적용한다(<html>.dark) */
  onThemeChange: (theme: ThemePreference) => void;
  /** 모두 삭제 뒤 셸이 처음 상태(19세 확인부터)로 다시 시작한다 */
  onCleared: () => void;
  /** false면 "내보내기(공유)"를 숨긴다(Windows: 공유 = 클립보드 복사라 JSON 복사와 겹친다) */
  canShare?: boolean;
  /** 로그인 화면(M-06)으로 이동 — 셸이 복귀 경로를 기억한다. core.auth가 있을 때만 쓴다. */
  onLogin?: () => void;
};

/** 모두 삭제 확인 문구(사용자가 그대로 입력해야 삭제 버튼이 켜진다). */
export const CLEAR_PHRASE = "모두 삭제";

type Loaded = { theme: ThemePreference; confirmedAt: string | null; summary: LocalDataSummary };

export function Settings({ core, appVersion, onThemeChange, onCleared, canShare = true, onLogin }: SettingsProps) {
  const [state, reload] = useAsync<Loaded>(async () => {
    const [theme, confirmedAt, summary] = await Promise.all([core.theme.get(), core.ageGate.confirmedAt(), core.data.summary()]);
    return { theme, confirmedAt, summary };
  });

  return (
    <div className="ll-settings">
      <Header title="설정" subtitle="이 기기에만 저장되는 설정과 데이터를 관리합니다." />
      {state.status === "loading" ? (
        <Card busy>
          <p role="status" className="ll-sr-only">
            설정을 불러오는 중입니다
          </p>
          <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
          <span className="ll-skeleton ll-skeleton--row" aria-hidden="true" />
        </Card>
      ) : state.status === "failed" ? (
        <StateView
          kind="error"
          title="설정을 불러오지 못했습니다"
          description="기기 저장소를 읽지 못했어요. 다시 시도하세요."
          action={<Button onClick={() => reload()}>다시 시도</Button>}
        />
      ) : (
        <Body
          core={core}
          loaded={state.value}
          appVersion={appVersion}
          onThemeChange={onThemeChange}
          onCleared={onCleared}
          canShare={canShare}
          onLogin={onLogin}
        />
      )}
    </div>
  );
}

function Body({
  core,
  loaded,
  appVersion,
  onThemeChange,
  onCleared,
  canShare,
  onLogin,
}: {
  core: SettingsCore;
  loaded: Loaded;
  appVersion: string;
  onThemeChange: (theme: ThemePreference) => void;
  onCleared: () => void;
  canShare: boolean;
  onLogin?: () => void;
}) {
  const notice = useNotice();
  const [theme, setTheme] = useState(loaded.theme);
  const [phrase, setPhrase] = useState("");
  const [dialog, setDialog] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const { summary } = loaded;
  const total = summary.tickets + summary.generated;

  function changeTheme(next: ThemePreference) {
    const prev = theme;
    setTheme(next);
    onThemeChange(next);
    core.theme.set(next).catch(() => {
      setTheme(prev);
      onThemeChange(prev);
      notice.toast("테마를 저장하지 못했어요. 다시 시도하세요.");
    });
  }

  async function exportTo(target: "copy" | "share") {
    let json: string;
    try {
      json = await core.data.exportJson();
    } catch {
      notice.toast("데이터를 읽지 못했어요. 다시 시도하세요.");
      return;
    }
    if (target === "copy") {
      core.adapters.clipboard.writeText(json).then(
        () => notice.toast("복사했어요"),
        () => notice.toast("복사하지 못했어요. 다시 시도하세요."),
      );
    } else {
      core.adapters.share.share({ title: "LOTTO LAB 내 데이터", text: json }).catch(() => {});
    }
  }

  async function clearAll() {
    setDialog(false);
    setClearing(true);
    setClearError(null);
    try {
      await core.data.clearAll();
      onCleared();
    } catch {
      setClearError("일부 데이터를 지우지 못했어요. 다시 시도하세요.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="ll-settings__grid">
      <Card title="화면">
        <Segment
          legend="테마"
          name="settings-theme"
          value={theme}
          options={[
            { value: "system", label: "시스템 설정" },
            { value: "light", label: "라이트" },
            { value: "dark", label: "다크" },
          ]}
          onChange={changeTheme}
          hint="시스템 설정은 기기의 다크 모드를 따릅니다."
        />
      </Card>

      <Card title="이용 확인·권한">
        <dl className="ll-tickets__info">
          <div>
            <dt>만 19세 이상 확인</dt>
            <dd>
              {loaded.confirmedAt ? (
                <>
                  확인함 · <time dateTime={loaded.confirmedAt}>{formatTime(loaded.confirmedAt)}</time>
                </>
              ) : (
                "이번 실행에서만 확인됨"
              )}
            </dd>
          </div>
          <div>
            <dt>기기 권한</dt>
            <dd>사용하는 권한 없음(카메라·알림은 쓰지 않습니다)</dd>
          </div>
        </dl>
      </Card>

      <Card title="데이터">
        <p className="ll-muted">
          이 기기에 저장된 기록: 즐겨찾기 {summary.favorites.toLocaleString("ko-KR")}개 · 구매 기록 {summary.purchased.toLocaleString("ko-KR")}개 · 생성 이력{" "}
          {summary.generated.toLocaleString("ko-KR")}개. 로그인·동기화가 없어 앱을 지우면 함께 사라집니다.
        </p>
        <div className="ll-gen__actions">
          <Button variant="secondary" disabled={total === 0} onClick={() => void exportTo("copy")}>
            내보내기(JSON 복사)
          </Button>
          {canShare && (
            <Button variant="secondary" disabled={total === 0} onClick={() => void exportTo("share")}>
              내보내기(공유)
            </Button>
          )}
        </div>
        {total === 0 && <p className="ll-muted">내보낼 기록이 아직 없습니다.</p>}
      </Card>

      <Card title="모두 삭제" className="ll-settings__danger">
        <p className="ll-muted">
          저장 번호·생성 이력·설정·만 19세 확인 기록을 이 기기에서 모두 지웁니다. 지운 뒤에는 되돌릴 수 없고, 앱은 처음 화면부터 다시 시작합니다.
        </p>
        <div className="ll-field">
          <label className="ll-field__legend" htmlFor="settings-clear-phrase">
            확인을 위해 &lsquo;{CLEAR_PHRASE}&rsquo;를 입력하세요
          </label>
          <input
            id="settings-clear-phrase"
            className="ll-input"
            autoComplete="off"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
        </div>
        {clearError && (
          <p className="ll-gen__error" role="alert">
            {clearError}
          </p>
        )}
        <Button variant="danger" disabled={phrase.trim() !== CLEAR_PHRASE || clearing} onClick={() => setDialog(true)}>
          {clearing ? "삭제하는 중" : "모든 데이터 삭제"}
        </Button>
        <AlertDialog
          open={dialog}
          title="이 기기의 LOTTO LAB 데이터를 모두 삭제할까요?"
          description="저장 번호·생성 이력·설정이 삭제되며 되돌릴 수 없습니다. 필요하면 먼저 내보내기로 보관하세요."
          confirmLabel="삭제"
          onConfirm={() => void clearAll()}
          onCancel={() => setDialog(false)}
        />
      </Card>

      {core.auth ? (
        <Account auth={core.auth} onLogin={onLogin} />
      ) : (
        <Card title="알림·계정">
          <ul className="ll-tickets__activity">
            <li>회차·구매 번호 결과 알림 — 준비 중(다음 업데이트)</li>
            <li>로그인·기기 간 동기화 — 준비 중(다음 업데이트)</li>
            <li>계정 삭제 — 로그인 기능과 함께 제공 예정</li>
          </ul>
        </Card>
      )}

      <Card title="앱 정보">
        <dl className="ll-tickets__info">
          <div>
            <dt>앱 버전</dt>
            <dd className="ll-num">{appVersion}</dd>
          </div>
          <div>
            <dt>오픈소스 라이선스</dt>
            <dd>준비 중</dd>
          </div>
          <div>
            <dt>이용약관</dt>
            <dd>준비 중</dd>
          </div>
          <div>
            <dt>개인정보 처리방침</dt>
            <dd>준비 중</dd>
          </div>
        </dl>
        <p className="ll-muted">LOTTO LAB은 복권 공식 서비스가 아니며 복권을 판매하지 않습니다.</p>
      </Card>
    </div>
  );
}

function Account({ auth, onLogin }: { auth: SettingsAuth; onLogin?: () => void }) {
  const notice = useNotice();
  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.state(),
  );
  const [dialog, setDialog] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const out = await auth.signOut();
      if (out.ok) notice.toast("로그아웃했어요");
      else setError(out.message);
    } catch {
      setError("로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function cancelDelete() {
    setReauth(false);
    setPassword("");
    setError(null);
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await auth.deleteAccount(password);
      setPassword("");
      if (out.ok) {
        setReauth(false);
        notice.toast("계정을 삭제했어요");
      } else setError(out.message);
    } catch {
      setError("계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="계정·알림">
      {state.status === "signedIn" || state.status === "consentRequired" ? (
        <>
          <dl className="ll-tickets__info">
            <div>
              <dt>로그인</dt>
              <dd>{state.user.email ?? "로그인됨"}</dd>
            </div>
          </dl>
          {state.status === "consentRequired" && (
            <>
              <p className="ll-muted" role="status">
                {state.checkFailed ? "가입 동의 기록을 확인하지 못했어요. 회원 기능은 확인 후 쓸 수 있습니다." : "가입 동의가 끝나지 않아 회원 기능을 쓸 수 없습니다."}
              </p>
              <div className="ll-gen__actions">
                {state.checkFailed ? (
                  <Button disabled={busy} onClick={() => void auth.retry()}>
                    다시 확인
                  </Button>
                ) : (
                  <Button disabled={busy || !onLogin} onClick={onLogin}>
                    가입 동의하기
                  </Button>
                )}
              </div>
            </>
          )}
          <p className="ll-muted">이 기기의 번호 기록은 자동으로 서버에 올라가지 않습니다(동기화 준비 중).</p>
          {error && (
            <p className="ll-gen__error" role="alert">
              {error}
            </p>
          )}
          {reauth ? (
            <form className="ll-field" onSubmit={(e) => void deleteAccount(e)} aria-busy={busy || undefined}>
              <label className="ll-field__legend" htmlFor="settings-delete-password">
                계정 삭제 확인을 위해 비밀번호를 다시 입력하세요
              </label>
              <input
                id="settings-delete-password"
                className="ll-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
              <div className="ll-gen__actions">
                <Button type="submit" variant="danger" disabled={busy || password.length === 0}>
                  {busy ? "삭제하는 중" : "비밀번호 확인 후 삭제"}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={cancelDelete}>
                  취소
                </Button>
              </div>
            </form>
          ) : (
            <div className="ll-gen__actions">
              <Button variant="secondary" disabled={busy} onClick={() => void signOut()}>
                로그아웃
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => setDialog(true)}>
                계정 삭제
              </Button>
            </div>
          )}
          <AlertDialog
            open={dialog}
            title="LOTTO LAB 계정을 삭제할까요?"
            description="계정과 서버에 저장된 동의 기록·회원 정보가 삭제되며 되돌릴 수 없습니다. 이 기기에 저장된 번호 기록은 지워지지 않습니다. 다음 단계에서 비밀번호를 다시 입력합니다."
            confirmLabel="계정 삭제"
            onConfirm={() => {
              setDialog(false);
              setReauth(true);
            }}
            onCancel={() => setDialog(false)}
          />
        </>
      ) : state.status === "signedOut" ? (
        <>
          <p className="ll-muted">로그인은 선택입니다. 로그인 전에는 이 기기의 번호를 서버로 보내지 않습니다.</p>
          <div className="ll-gen__actions">
            <Button disabled={!onLogin} onClick={onLogin}>
              로그인·가입
            </Button>
          </div>
        </>
      ) : state.status === "unavailable" ? (
        <>
          <p className="ll-gen__error" role="alert">
            이 기기에 저장된 로그인 정보를 읽지 못했어요.
          </p>
          <div className="ll-gen__actions">
            <Button variant="secondary" onClick={() => void auth.retry()}>
              다시 확인
            </Button>
          </div>
        </>
      ) : (
        <p className="ll-muted" role="status">
          로그인 상태를 확인하는 중입니다
        </p>
      )}
      <ul className="ll-tickets__activity">
        <li>회차·구매 번호 결과 알림 — 준비 중(다음 업데이트)</li>
        <li>기기 간 동기화 — 준비 중(다음 업데이트)</li>
      </ul>
    </Card>
  );
}
