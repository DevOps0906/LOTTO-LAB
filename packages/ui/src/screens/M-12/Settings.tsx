// M-12 설정(P0 범위): 화면 테마(시스템·라이트·다크 — 셸이 <html>.dark로 토큰 적용), 만 19세 확인 정보, 기기 권한 상태,
// 로컬 데이터 내보내기(JSON 복사·공유)·모두 삭제(문구 재입력 + AlertDialog 이중 확인), 앱 버전·오픈소스 라이선스·약관·개인정보(준비 중).
// 알림·로그인·동기화·계정 삭제는 P1 안내만, 광고 동의 변경(M-20)은 P1이라 보이지 않는다.
import { useState } from "react";
import { AlertDialog } from "../../components/AlertDialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { useNotice } from "../../components/Notice";
import { StateView } from "../../components/StateView";
import { formatTime, useAsync } from "../common/data";
import { Segment } from "../common/generator";

export type ThemePreference = "system" | "light" | "dark";
export type LocalDataSummary = { tickets: number; favorites: number; purchased: number; generated: number };

/** 설정 화면이 쓰는 app-core(AppCore) 기능. */
export type SettingsCore = {
  ageGate: { confirmedAt(): Promise<string | null> };
  theme: { get(): Promise<ThemePreference>; set(theme: ThemePreference): Promise<ThemePreference> };
  data: { summary(): Promise<LocalDataSummary>; exportJson(): Promise<string>; clearAll(): Promise<number> };
  adapters: {
    clipboard: { writeText(text: string): Promise<void> };
    share: { share(content: { title?: string; text: string }): Promise<void> };
  };
};

export type SettingsProps = {
  core: SettingsCore;
  /** 앱 버전(셸 package.json) */
  appVersion: string;
  /** 테마를 바꾸면 셸이 즉시 적용한다(<html>.dark) */
  onThemeChange: (theme: ThemePreference) => void;
  /** 모두 삭제 뒤 셸이 처음 상태(19세 확인부터)로 다시 시작한다 */
  onCleared: () => void;
};

/** 모두 삭제 확인 문구(사용자가 그대로 입력해야 삭제 버튼이 켜진다). */
export const CLEAR_PHRASE = "모두 삭제";

type Loaded = { theme: ThemePreference; confirmedAt: string | null; summary: LocalDataSummary };

export function Settings({ core, appVersion, onThemeChange, onCleared }: SettingsProps) {
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
        <Body core={core} loaded={state.value} appVersion={appVersion} onThemeChange={onThemeChange} onCleared={onCleared} />
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
}: {
  core: SettingsCore;
  loaded: Loaded;
  appVersion: string;
  onThemeChange: (theme: ThemePreference) => void;
  onCleared: () => void;
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
          <Button variant="secondary" disabled={total === 0} onClick={() => void exportTo("share")}>
            내보내기(공유)
          </Button>
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

      <Card title="알림·계정">
        <ul className="ll-tickets__activity">
          <li>회차·구매 번호 결과 알림 — 준비 중(다음 업데이트)</li>
          <li>로그인·기기 간 동기화 — 준비 중(다음 업데이트)</li>
          <li>계정 삭제 — 로그인 기능과 함께 제공 예정</li>
        </ul>
      </Card>

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
