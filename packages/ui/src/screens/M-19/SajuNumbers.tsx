// M-19 사주 번호(P1): 저장된 사주 프로필(M-18)을 읽어 기기에서 오늘의 번호를 만든다(fortune-engine saju, 같은 날 같은 결과).
// 프로필 읽기는 온라인 필요(로컬 캐시 없음, ADR-0005). 결과는 생성 이력(method = saju)이고 저장하면 즐겨찾기(구매 아님).
// 천간지지·오행 카드는 task-046. 회원 전용(SajuGate) — 계정이 바뀌거나 로그아웃하면 프로필·결과가 즉시 사라진다.
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { StateView } from "../../components/StateView";
import { Segment, type GeneratorCore } from "../common/generator";
import { FORTUNE_NOTICE, FortuneBatchResult, type FortuneBatch, type FortuneRequestInput } from "../M-17/ThemeGenerator";
import { SajuGate } from "../M-18/SajuGate";
import { FORTUNE_PROFILE_MESSAGES, type FortuneProfileCore, type SajuHourOption, type SajuProfile, type SajuProfileErrorCode } from "../M-18/FortuneProfile";

export type SajuNumbersCore = Pick<GeneratorCore, "tickets" | "adapters"> &
  Pick<FortuneProfileCore, "auth"> & {
    fortuneProfile: { load: FortuneProfileCore["fortuneProfile"]["load"] };
    fortune: {
      generate(request: FortuneRequestInput): Promise<{ batch_id: string; records: FortuneBatch["records"]; saved: boolean; method: string }>;
    };
  };

export type SajuNumbersLinks = { home: string; generate: string; /** M-18 */ profile: string; /** M-17 */ theme: string };
export type SajuNumbersProps = {
  core: SajuNumbersCore;
  links: SajuNumbersLinks;
  hours: readonly SajuHourOption[];
  onLogin: () => void;
  /** 프로필 없음 → M-18 */
  navigate: (target: string) => void;
};

type Game = "lotto" | "pension";
const TITLE = "사주 번호";
const SUBTITLE = "저장한 사주 프로필로 오늘의 번호를 이 기기에서 만듭니다.";
/** 연금은 1~5조 각 1장(하루 1세트). */
const PENSION_GROUPS = [1, 2, 3, 4, 5];

export function SajuNumbers(props: SajuNumbersProps) {
  return (
    <SajuGate auth={props.core.auth} title={TITLE} subtitle={SUBTITLE} onLogin={props.onLogin}>
      {() => <Body {...props} />}
    </SajuGate>
  );
}

function Body({ core, links, hours, onLogin, navigate }: SajuNumbersProps) {
  const [loaded, setLoaded] = useState<"loading" | "failed" | "ready">("loading");
  const [loadCode, setLoadCode] = useState<SajuProfileErrorCode>("UNKNOWN");
  const [profile, setProfile] = useState<SajuProfile | null>(null);
  const [game, setGame] = useState<Game>("lotto");
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<FortuneBatch | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const token = useRef(0);
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
    setProfile(result.value);
    setLoaded("ready");
  }
  useEffect(() => {
    void load();
    // 마운트 때 한 번(계정이 바뀌면 화면이 다시 마운트된다)
  }, []);

  async function generate() {
    if (!profile || busy) return;
    const mine = ++token.current;
    const theme = { kind: "saju" as const, birth: { calendar: profile.calendar, date: profile.birth_date, leap: profile.is_leap_month, hour: profile.birth_hour } };
    const request: FortuneRequestInput = game === "lotto" ? { game, theme } : { game, groups: PENSION_GROUPS, theme };
    setBusy(true);
    setFailed(false);
    try {
      const result = await core.fortune.generate(request);
      if (!alive.current || mine !== token.current) return;
      setBatch({ batch_id: result.batch_id, records: result.records, saved: result.saved, method: result.method, game });
    } catch {
      if (!alive.current || mine !== token.current) return;
      setFailed(true);
    } finally {
      if (alive.current && mine === token.current) setBusy(false);
    }
  }

  function cancel() {
    token.current++;
    setBusy(false);
  }

  const hourLabel = profile?.birth_hour ? (hours.find((h) => h.id === profile.birth_hour)?.label ?? "알 수 없음") : "모름";

  return (
    <div className="ll-gen" data-game={game === "pension" ? "pension" : undefined}>
      <nav className="ll-breadcrumb" aria-label="현재 위치">
        <ol>
          <li>
            <a href={links.home}>홈</a>
          </li>
          <li>
            <a href={links.generate}>추천</a>
          </li>
          <li aria-current="page">사주 번호</li>
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
      {loaded === "ready" && profile === null && (
        <StateView
          kind="empty"
          title="사주 프로필이 아직 없어요"
          description="생년월일을 한 번 저장하면 사주 번호를 만들 수 있어요."
          action={<Button onClick={() => navigate(links.profile)}>프로필 입력하기</Button>}
        />
      )}
      {loaded === "ready" && profile !== null && (
        <div className="ll-gen__layout">
          <Card title="프로필 요약" className="ll-gen__cond">
            <p className="ll-gen__restore" role="note">
              <Icon name="info" />
              {FORTUNE_NOTICE}
            </p>
            <dl className="ll-muted">
              <dt>생년월일</dt>
              <dd>
                {profile.birth_date} ({profile.calendar === "lunar" ? (profile.is_leap_month ? "음력 윤달" : "음력") : "양력"})
              </dd>
              <dt>태어난 시각</dt>
              <dd>{hourLabel}</dd>
            </dl>
            <Segment<Game>
              legend="복권"
              name="saju-game"
              value={game}
              onChange={(g) => {
                setGame(g);
                setFailed(false);
              }}
              options={[
                { value: "lotto", label: "로또 6/45" },
                { value: "pension", label: "연금복권 720+" },
              ]}
            />
            <p className="ll-muted">기기에서 계산하며 같은 날 같은 결과가 나옵니다. 입력값은 서버로 보내지 않습니다.</p>
            <div className="ll-gen__submit">
              <Button block variant={game === "pension" ? "pension" : "primary"} disabled={busy} onClick={() => void generate()}>
                <Icon name="spark" />
                {busy ? "생성하는 중" : "오늘의 번호 생성"}
              </Button>
              {busy && (
                <Button variant="secondary" onClick={cancel}>
                  취소
                </Button>
              )}
            </div>
            <a className="ll-link" href={links.profile}>
              프로필 수정
            </a>
            <a className="ll-link" href={links.theme}>
              테마 번호
            </a>
          </Card>

          <div className="ll-gen__col">
            {busy && <StateView kind="loading" title="번호를 만드는 중입니다" />}
            {failed && (
              <StateView
                kind="error"
                title="번호를 만들지 못했어요"
                description="잠시 후 다시 시도하세요. 프로필과 이전 결과는 그대로 남아 있습니다."
                action={<Button onClick={() => void generate()}>다시 시도</Button>}
              />
            )}
            {batch ? (
              <FortuneBatchResult core={core} batch={batch} kind="사주" />
            ) : (
              !busy && (
                <Card title="오늘의 사주 번호">
                  <StateView kind="empty" title="아직 만든 번호가 없습니다" description="오늘의 번호 생성을 누르세요." />
                </Card>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
