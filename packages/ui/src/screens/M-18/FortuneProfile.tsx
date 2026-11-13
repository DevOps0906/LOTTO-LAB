// M-18 사주 프로필(P1, A-17): 동의 후 생년월일·양력/음력·윤달·태어난 시각(모르면 비움)을 저장·삭제한다. 회원 전용(SajuGate).
// 생년월일·시각은 개인정보 — 화면 상태에만 있고 로그·분석·로컬 저장소에 남기지 않는다(오류도 코드로만 안내). 성별 등은 수집하지 않는다.
// 클라이언트 검증은 필수·형식뿐이며 범위·음력 유효성은 서버(DB CHECK) 판정을 입력 오류로 보여 준다. 저장 실패해도 입력은 보존한다.
import { useEffect, useRef, useState } from "react";
import { AlertDialog } from "../../components/AlertDialog";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { StateView } from "../../components/StateView";
import { Segment } from "../common/generator";
import { FORTUNE_NOTICE } from "../M-17/ThemeGenerator";
import { SajuGate, type SajuAuth } from "./SajuGate";

export type SajuProfile = { birth_date: string; calendar: "solar" | "lunar"; is_leap_month: boolean; birth_hour: string | null };
export type SajuProfileErrorCode = "OFFLINE" | "SESSION_EXPIRED" | "FORBIDDEN" | "INVALID_INPUT" | "CONSENT_REQUIRED" | "UNKNOWN";
export type SajuProfileOutcome<T> = { ok: true; value: T } | { ok: false; code: SajuProfileErrorCode; field?: string };

/** 12시진(app-core SAJU_HOURS와 같은 순서·id) */
export type SajuHourOption = { id: string; label: string };

/** M-18이 쓰는 app-core 기능(AppCore.auth·fortuneProfile과 구조 호환). */
export type FortuneProfileCore = {
  auth: SajuAuth;
  fortuneProfile: {
    load(): Promise<SajuProfileOutcome<SajuProfile | null>>;
    save(
      input: { birth_date: string; calendar: string; is_leap_month: boolean; birth_hour: string | null },
      consent: boolean,
    ): Promise<SajuProfileOutcome<SajuProfile>>;
    remove(): Promise<SajuProfileOutcome<null>>;
  };
};

export type FortuneProfileLinks = { home: string; generate: string; saju: string; /** 없으면 "준비 중" 표기 */ privacy?: string };
export type FortuneProfileProps = {
  core: FortuneProfileCore;
  links: FortuneProfileLinks;
  hours: readonly SajuHourOption[];
  onLogin: () => void;
  /** 저장 완료 → M-19, 취소 → 추천 */
  navigate: (target: string) => void;
};

const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TITLE = "사주 프로필";
const SUBTITLE = "사주 번호 계산에 쓸 생년월일을 동의 후 저장합니다.";

/** 오류 코드 → 안내(서버 문구·입력값은 쓰지 않는다). */
export const FORTUNE_PROFILE_MESSAGES: Record<SajuProfileErrorCode, string> = {
  OFFLINE: "인터넷에 연결되어 있지 않아요. 연결을 확인한 뒤 다시 시도하세요. 입력한 내용은 그대로 남아 있습니다.",
  SESSION_EXPIRED: "로그인이 만료됐어요. 다시 로그인한 뒤 시도하세요. 입력한 내용은 이 화면에 남아 있습니다.",
  FORBIDDEN: "이 작업을 할 권한이 없어요. 다시 로그인한 뒤 시도하세요.",
  INVALID_INPUT: "생년월일을 확인해 주세요. 1900-01-01부터 오늘까지의 날짜여야 하고, 음력은 월 1~12·일 1~30이며 윤달은 음력에서만 고를 수 있어요.",
  CONSENT_REQUIRED: "개인정보 수집·이용에 동의해야 저장할 수 있어요.",
  UNKNOWN: "처리하지 못했어요. 잠시 후 다시 시도하세요. 입력한 내용은 그대로 남아 있습니다.",
};

type Problem = { code: SajuProfileErrorCode; field?: string } | null;

export function FortuneProfile({ core, links, hours, onLogin, navigate }: FortuneProfileProps) {
  return (
    <SajuGate auth={core.auth} title={TITLE} subtitle={SUBTITLE} onLogin={onLogin}>
      {() => <ProfileForm core={core} links={links} hours={hours} onLogin={onLogin} navigate={navigate} />}
    </SajuGate>
  );
}

function ProfileForm({ core, links, hours, onLogin, navigate }: FortuneProfileProps) {
  const [loaded, setLoaded] = useState<"loading" | "failed" | "ready">("loading");
  const [loadCode, setLoadCode] = useState<SajuProfileErrorCode>("UNKNOWN");
  const [exists, setExists] = useState(false);
  const [date, setDate] = useState("");
  const [calendar, setCalendar] = useState<"solar" | "lunar">("solar");
  const [leap, setLeap] = useState(false);
  const [hour, setHour] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [formatError, setFormatError] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [dialog, setDialog] = useState(false);
  /** 언마운트(계정 전환·로그아웃) 뒤 도착한 응답은 버린다. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function load() {
    setLoaded("loading");
    const result = await core.fortuneProfile.load();
    if (!alive.current) return;
    if (!result.ok) {
      setLoadCode(result.code);
      return setLoaded("failed");
    }
    const profile = result.value;
    if (profile) {
      setExists(true);
      setDate(profile.birth_date);
      setCalendar(profile.calendar);
      setLeap(profile.is_leap_month);
      setHour(profile.birth_hour ?? "");
      setConsent(true); // 저장할 때 이미 동의했다
    }
    setLoaded("ready");
  }
  useEffect(() => {
    void load();
    // 마운트 때 한 번(계정이 바뀌면 화면이 다시 마운트된다)
  }, []);

  function touch() {
    setProblem(null);
    setFormatError(false);
    setRemoved(false);
  }

  async function save() {
    if (busy || !consent) return;
    if (!DATE_PATTERN.test(date)) return setFormatError(true);
    setBusy("save");
    touch();
    const result = await core.fortuneProfile.save(
      { birth_date: date, calendar, is_leap_month: calendar === "lunar" && leap, birth_hour: hour === "" ? null : hour },
      consent,
    );
    if (!alive.current) return;
    setBusy(null);
    if (!result.ok) return setProblem({ code: result.code, field: result.field });
    setExists(true);
    navigate(links.saju);
  }

  async function remove() {
    setDialog(false);
    if (busy) return;
    setBusy("remove");
    touch();
    const result = await core.fortuneProfile.remove();
    if (!alive.current) return;
    setBusy(null);
    if (!result.ok) return setProblem({ code: result.code });
    setExists(false);
    setDate("");
    setCalendar("solar");
    setLeap(false);
    setHour("");
    setConsent(false);
    setRemoved(true);
  }

  const dateInvalid = formatError || problem?.field === "birth_date";

  return (
    <div className="ll-gen">
      <nav className="ll-breadcrumb" aria-label="현재 위치">
        <ol>
          <li>
            <a href={links.home}>홈</a>
          </li>
          <li>
            <a href={links.generate}>추천</a>
          </li>
          <li aria-current="page">사주 프로필</li>
        </ol>
      </nav>
      <Header title={TITLE} subtitle={SUBTITLE} />

      {loaded === "loading" && <StateView kind="loading" title="프로필을 불러오는 중입니다" />}
      {loaded === "failed" && (
        <StateView
          kind="error"
          title="프로필을 불러오지 못했어요"
          description={FORTUNE_PROFILE_MESSAGES[loadCode]}
          action={
            loadCode === "SESSION_EXPIRED" || loadCode === "FORBIDDEN" ? (
              <Button onClick={onLogin}>다시 로그인</Button>
            ) : (
              <Button onClick={() => void load()}>다시 시도</Button>
            )
          }
        />
      )}
      {loaded === "ready" && (
        <Card title="생년월일 입력" className="ll-gen__cond">
          <p className="ll-gen__restore" role="note">
            <Icon name="info" />
            {FORTUNE_NOTICE}
          </p>
          {!exists && !removed && <p className="ll-muted">저장된 프로필이 없어요. 생년월일을 입력하고 동의하면 저장할 수 있어요.</p>}
          {removed && (
            <p className="ll-muted" role="status">
              프로필을 삭제했어요. 서버에 저장된 생년월일·태어난 시각이 파기됐습니다.
            </p>
          )}

          <div className="ll-field">
            <label className="ll-field__legend" htmlFor="saju-date">
              생년월일(필수)
            </label>
            <input
              id="saju-date"
              className="ll-input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="YYYY-MM-DD"
              maxLength={10}
              value={date}
              disabled={busy !== null}
              aria-invalid={dateInvalid || undefined}
              aria-describedby={dateInvalid ? "saju-date-error" : undefined}
              onChange={(e) => {
                setDate(e.target.value.trim());
                touch();
              }}
            />
            {formatError && (
              <p className="ll-gen__error" role="alert" id="saju-date-error">
                생년월일을 YYYY-MM-DD 형식으로 입력하세요. 예: 1990-03-15
              </p>
            )}
            {problem?.field === "birth_date" && (
              <p className="ll-gen__error" role="alert" id="saju-date-error">
                {FORTUNE_PROFILE_MESSAGES.INVALID_INPUT}
              </p>
            )}
          </div>

          <Segment<"solar" | "lunar">
            legend="양력/음력(필수)"
            name="saju-calendar"
            value={calendar}
            onChange={(v) => {
              setCalendar(v);
              if (v === "solar") setLeap(false);
              touch();
            }}
            options={[
              { value: "solar", label: "양력" },
              { value: "lunar", label: "음력" },
            ]}
          />
          {calendar === "lunar" && (
            <label className="ll-seg__item">
              <input
                type="checkbox"
                checked={leap}
                disabled={busy !== null}
                onChange={(e) => {
                  setLeap(e.target.checked);
                  touch();
                }}
              />
              <span>윤달</span>
            </label>
          )}

          <div className="ll-field">
            <label className="ll-field__legend" htmlFor="saju-hour">
              태어난 시각(모르면 비움)
            </label>
            <select
              id="saju-hour"
              className="ll-input"
              value={hour}
              disabled={busy !== null}
              onChange={(e) => {
                setHour(e.target.value);
                touch();
              }}
            >
              <option value="">모름</option>
              {hours.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ll-field">
            <p className="ll-muted">
              수집 항목: 생년월일·양력/음력·윤달 여부·태어난 시각(선택). 목적: 사주 번호를 이 기기에서 계산하는 데만 씁니다. 보유 기간: 프로필 삭제
              또는 계정 삭제 시까지(계정을 삭제하면 함께 파기됩니다). 성별 등 다른 정보는 수집하지 않습니다. 동의하지 않아도 다른 번호 생성은
              이용할 수 있고, 사주 번호만 쓸 수 없습니다.
            </p>
            <label className="ll-seg__item">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy !== null}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  touch();
                }}
              />
              <span>개인정보 수집·이용에 동의합니다(필수)</span>
            </label>
            <p className="ll-muted">
              {links.privacy ? (
                <a className="ll-link" href={links.privacy}>
                  개인정보 처리방침
                </a>
              ) : (
                "개인정보 처리방침(준비 중)"
              )}
            </p>
          </div>

          {problem && problem.field !== "birth_date" && (
            <p className="ll-gen__error" role="alert">
              {FORTUNE_PROFILE_MESSAGES[problem.code]}
              {problem.code === "SESSION_EXPIRED" && (
                <>
                  {" "}
                  <button type="button" className="ll-link" onClick={onLogin}>
                    다시 로그인
                  </button>
                </>
              )}
            </p>
          )}

          <div className="ll-gen__submit">
            <Button block disabled={!consent || date === "" || busy !== null} onClick={() => void save()}>
              {busy === "save" ? "저장하는 중" : "저장"}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => navigate(links.generate)}>
              취소
            </Button>
            {exists && (
              <Button variant="secondary" disabled={busy !== null} onClick={() => setDialog(true)}>
                {busy === "remove" ? "삭제하는 중" : "프로필 삭제"}
              </Button>
            )}
          </div>
          <AlertDialog
            open={dialog}
            title="사주 프로필을 삭제할까요?"
            description="서버에 저장된 생년월일·태어난 시각이 삭제되며 되돌릴 수 없습니다. 이미 만든 번호 기록은 지워지지 않습니다. 사주 번호를 다시 만들려면 프로필을 새로 입력해야 합니다."
            confirmLabel="삭제"
            onConfirm={() => void remove()}
            onCancel={() => setDialog(false)}
          />
        </Card>
      )}
    </div>
  );
}
