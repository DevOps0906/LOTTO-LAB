// M-17 테마 번호(P1): 별자리·띠·생년월일·기념일·꿈 테마로 오늘의 번호를 기기에서 만든다(fortune-engine, 같은 날 같은 입력 = 같은 번호).
// 입력값은 엔진 호출에만 쓰고 저장·전송하지 않는다 — 화면 상태에만 있다. 결과는 생성 이력(method = 테마 출처)이고, 저장하면 즐겨찾기(구매 아님).
// 행운 숫자는 이 화면에서 만들지 않고 M-02 고정 번호로 연결한다. 고지 "재미·참고용 · 전통 상징 해석이며 당첨 확률과 무관"은 항상 보인다.
import { useRef, useState } from "react";
import { Ball } from "../../components/Ball";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { Icon } from "../../components/icons";
import { StateView } from "../../components/StateView";
import {
  GeneratedResults,
  ProblemBox,
  Segment,
  engineProblemOf,
  type GeneratedRecord,
  type GeneratorCore,
  type ResultRow,
} from "../common/generator";

/** 엔진 FortuneTheme과 구조 호환(셸이 AppCore를 넘길 때 typecheck). id 값은 fortune-engine 상수와 같다. */
export type FortuneThemeInput =
  | { kind: "zodiac_sign"; sign: string }
  | { kind: "zodiac_animal"; animal: string }
  | { kind: "birthday"; date: string }
  | { kind: "anniversary"; date: string }
  | { kind: "dream"; keywords: readonly string[] }
  | { kind: "lucky"; numbers: number[] }
  | { kind: "saju"; birth: unknown };
export type FortuneRequestInput =
  | { game: "lotto"; theme: FortuneThemeInput }
  | { game: "pension"; groups: number[]; theme: FortuneThemeInput };

/** 테마 번호 화면이 쓰는 app-core(AppCore) 기능. */
export type FortuneCore = Pick<GeneratorCore, "tickets" | "adapters"> & {
  fortune: {
    generate(request: FortuneRequestInput): Promise<{ batch_id: string; records: GeneratedRecord[]; saved: boolean; method: string }>;
  };
};

/** lotto = 행운 숫자를 고정 번호로 넣는 로또 생성기(M-02). saju가 있으면 사주 번호(회원) 링크를 보인다. */
export type ThemeGeneratorLinks = { home: string; generate: string; lotto: string; saju?: string };

/** 꿈 키워드 사전(셸이 app-core DREAM_KEYWORDS·DREAM_KEYWORDS_MAX를 넘긴다). */
export type DreamDictionary = { keywords: readonly { id: string; label: string }[]; max: number };

export type ThemeGeneratorProps = { core: FortuneCore; links: ThemeGeneratorLinks; dream: DreamDictionary };

type Tab = "zodiac_sign" | "zodiac_animal" | "birthday" | "anniversary" | "lucky" | "dream";
type Game = "lotto" | "pension";
type Field = "zodiac_sign" | "zodiac_animal" | "birthday" | "anniversary" | "dream";

const TABS: { value: Tab; label: string }[] = [
  { value: "zodiac_sign", label: "별자리" },
  { value: "zodiac_animal", label: "띠" },
  { value: "birthday", label: "생년월일" },
  { value: "anniversary", label: "기념일" },
  { value: "lucky", label: "행운 숫자" },
  { value: "dream", label: "꿈" },
];

// id 순서·값은 fortune-engine ZODIAC_SIGN_IDS·ZODIAC_ANIMAL_IDS와 같다(라벨만 화면 몫).
const ZODIAC_SIGNS = [
  ["aries", "양자리"], ["taurus", "황소자리"], ["gemini", "쌍둥이자리"], ["cancer", "게자리"],
  ["leo", "사자자리"], ["virgo", "처녀자리"], ["libra", "천칭자리"], ["scorpio", "전갈자리"],
  ["sagittarius", "사수자리"], ["capricorn", "염소자리"], ["aquarius", "물병자리"], ["pisces", "물고기자리"],
] as const;
const ZODIAC_ANIMALS = [
  ["rat", "쥐띠"], ["ox", "소띠"], ["tiger", "호랑이띠"], ["rabbit", "토끼띠"], ["dragon", "용띠"], ["snake", "뱀띠"],
  ["horse", "말띠"], ["goat", "양띠"], ["monkey", "원숭이띠"], ["rooster", "닭띠"], ["dog", "개띠"], ["pig", "돼지띠"],
] as const;

/** 연금은 1~5조 각 1장(하루 1세트). */
const PENSION_GROUPS = [1, 2, 3, 4, 5];

/** 테마 출처(generated_batches.method) 표시 이름. */
export const FORTUNE_METHOD_LABEL: Record<string, string> = {
  zodiac: "별자리·띠",
  birthday: "생년월일·기념일",
  dream: "꿈",
  condition: "행운 숫자",
  saju: "사주",
};

export const FORTUNE_NOTICE = "재미·참고용 · 전통 상징 해석이며 당첨 확률과 무관";

const FIELD_ERROR: Record<Field, string> = {
  zodiac_sign: "별자리를 하나 골라 주세요.",
  zodiac_animal: "띠를 하나 골라 주세요.",
  birthday: "생년월일은 1900-01-01부터 오늘까지의 날짜로 입력하세요.",
  anniversary: "기념일은 1900-01-01부터 오늘까지의 날짜로 입력하세요.",
  dream: "꿈 키워드를 사전 목록에서 골라 주세요.",
};

type Batch = { batch_id: string; records: GeneratedRecord[]; saved: boolean; method: string; game: Game };

export function ThemeGenerator({ core, links, dream }: ThemeGeneratorProps) {
  const [game, setGame] = useState<Game>("lotto");
  const [tab, setTab] = useState<Tab>("zodiac_sign");
  const [sign, setSign] = useState<string | null>(null);
  const [animal, setAnimal] = useState<string | null>(null);
  const [birthday, setBirthday] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [fieldError, setFieldError] = useState<Field | null>(null);
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);
  const token = useRef(0);

  const theme: FortuneThemeInput | null =
    tab === "zodiac_sign" ? (sign ? { kind: "zodiac_sign", sign } : null)
    : tab === "zodiac_animal" ? (animal ? { kind: "zodiac_animal", animal } : null)
    : tab === "birthday" ? (birthday ? { kind: "birthday", date: birthday } : null)
    : tab === "anniversary" ? (anniversary ? { kind: "anniversary", date: anniversary } : null)
    : tab === "dream" ? (keywords.length > 0 ? { kind: "dream", keywords } : null)
    : null;
  const canGenerate = theme !== null && !busy;

  function clearErrors() {
    setFieldError(null);
    setConflict(false);
    setFailed(false);
  }

  async function generate() {
    if (!theme || busy) return;
    const mine = ++token.current;
    const request: FortuneRequestInput = game === "lotto" ? { game, theme } : { game, groups: PENSION_GROUPS, theme };
    setBusy(true);
    clearErrors();
    try {
      const result = await core.fortune.generate(request);
      if (mine !== token.current) return;
      setBatch({ batch_id: result.batch_id, records: result.records, saved: result.saved, method: result.method, game });
    } catch (error) {
      if (mine !== token.current) return;
      const p = engineProblemOf(error);
      const field = p?.code === "INVALID_INPUT" ? fieldOf(p.hint) : null;
      if (field) setFieldError(field);
      else if (p?.code === "IMPOSSIBLE_COMBINATION") setConflict(true);
      else setFailed(true);
    } finally {
      if (mine === token.current) setBusy(false);
    }
  }

  function cancel() {
    token.current++;
    setBusy(false);
  }

  function toggleKeyword(id: string) {
    clearErrors();
    setKeywords((list) => (list.includes(id) ? list.filter((k) => k !== id) : list.length >= dream.max ? list : [...list, id]));
  }

  const errorOf = (field: Field) =>
    fieldError === field ? (
      <p className="ll-gen__error" role="alert" id={`theme-${field}-error`}>
        {FIELD_ERROR[field]}
      </p>
    ) : null;

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
          <li aria-current="page">테마 번호</li>
        </ol>
      </nav>
      <Header title="테마 번호" subtitle="별자리·띠·날짜·꿈 테마로 오늘의 번호를 이 기기에서 만듭니다." />

      <div className="ll-gen__layout">
        <Card title="테마 고르기" className="ll-gen__cond">
          <p className="ll-gen__restore" role="note">
            <Icon name="info" />
            {FORTUNE_NOTICE}
          </p>
          <Segment<Game>
            legend="복권"
            name="theme-game"
            value={game}
            onChange={(g) => {
              setGame(g);
              clearErrors();
            }}
            options={[
              { value: "lotto", label: "로또 6/45" },
              { value: "pension", label: "연금복권 720+" },
            ]}
          />
          <Segment<Tab>
            legend="테마"
            name="theme-kind"
            value={tab}
            onChange={(t) => {
              setTab(t);
              clearErrors();
            }}
            options={TABS}
          />

          {tab === "zodiac_sign" && (
            <>
              <Segment<string>
                legend="별자리 12궁"
                name="theme-sign"
                value={sign ?? ""}
                onChange={(v) => {
                  setSign(v);
                  clearErrors();
                }}
                options={ZODIAC_SIGNS.map(([value, label]) => ({ value, label }))}
              />
              {errorOf("zodiac_sign")}
            </>
          )}
          {tab === "zodiac_animal" && (
            <>
              <Segment<string>
                legend="띠 12지"
                name="theme-animal"
                value={animal ?? ""}
                onChange={(v) => {
                  setAnimal(v);
                  clearErrors();
                }}
                options={ZODIAC_ANIMALS.map(([value, label]) => ({ value, label }))}
                hint="태어난 해의 띠를 직접 고릅니다."
              />
              {errorOf("zodiac_animal")}
            </>
          )}
          {(tab === "birthday" || tab === "anniversary") && (
            <div className="ll-field">
              <label className="ll-field__legend" htmlFor="theme-date">
                {tab === "birthday" ? "생년월일 날짜" : "기념일 날짜"}
              </label>
              <input
                id="theme-date"
                type="date"
                className="ll-input"
                min="1900-01-01"
                value={tab === "birthday" ? birthday : anniversary}
                aria-invalid={fieldError === tab || undefined}
                aria-describedby={fieldError === tab ? `theme-${tab}-error` : undefined}
                onChange={(e) => {
                  (tab === "birthday" ? setBirthday : setAnniversary)(e.target.value);
                  clearErrors();
                }}
              />
              {errorOf(tab)}
            </div>
          )}
          {tab === "lucky" && (
            <div className="ll-field">
              <p className="ll-muted ll-field__hint">
                행운 숫자는 로또 생성의 고정 번호로 넣어 만듭니다. 고정 번호는 모든 게임에 들어갑니다.
              </p>
              <a className="ll-button" data-variant="secondary" data-block="true" href={links.lotto}>
                <Icon name="pin" />
                행운 숫자는 고정 번호 설정
              </a>
            </div>
          )}
          {tab === "dream" && (
            <fieldset className="ll-field">
              <legend className="ll-field__legend">꿈 키워드</legend>
              <p className="ll-muted ll-field__hint">
                사전 목록에서 최대 {dream.max}개를 고릅니다(<span className="ll-num">{keywords.length}</span> / {dream.max}).
              </p>
              <div className="ll-seg" role="group" aria-label="꿈 키워드">
                {dream.keywords.map((k) => {
                  const on = keywords.includes(k.id);
                  return (
                    <label key={k.id} className="ll-seg__item">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && keywords.length >= dream.max}
                        onChange={() => toggleKeyword(k.id)}
                      />
                      <span>{k.label}</span>
                    </label>
                  );
                })}
              </div>
              {errorOf("dream")}
            </fieldset>
          )}

          <p className="ll-muted">
            입력값은 이 기기에서만 처리하고 서버로 보내거나 저장하지 않습니다. 같은 날 같은 입력은 같은 번호가 나옵니다.
          </p>
          {theme === null && tab !== "lucky" && <p className="ll-muted">테마를 고르면 생성할 수 있어요.</p>}

          {conflict && (
            <ProblemBox
              view={{
                title: "고정 번호와 충돌해 번호를 만들 수 없어요",
                description: "테마 번호와 고정 번호 조건이 함께 맞는 조합이 없어요. 다른 테마를 고르거나 고정 번호를 줄여 주세요.",
                fixes: [],
              }}
            />
          )}

          <div className="ll-gen__submit">
            <Button block variant={game === "pension" ? "pension" : "primary"} disabled={!canGenerate} onClick={() => void generate()}>
              <Icon name="spark" />
              {busy ? "생성하는 중" : "오늘의 번호 생성"}
            </Button>
            {busy && (
              <Button variant="secondary" onClick={cancel}>
                취소
              </Button>
            )}
          </div>
          {links.saju && (
            <a className="ll-link" href={links.saju}>
              사주 번호(회원)
            </a>
          )}
        </Card>

        <div className="ll-gen__col">
          {busy && <StateView kind="loading" title="번호를 만드는 중입니다" />}
          {failed && (
            <StateView
              kind="error"
              title="번호를 만들지 못했어요"
              description="잠시 후 다시 시도하세요. 고른 테마와 이전 결과는 그대로 남아 있습니다."
              action={<Button onClick={() => void generate()}>다시 시도</Button>}
            />
          )}
          {batch ? (
            <>
              <p className="ll-gen__summary" role="status">
                테마 출처 <strong>{FORTUNE_METHOD_LABEL[batch.method] ?? batch.method}</strong> ·{" "}
                {batch.saved ? "생성 이력에 저장됨" : "생성 이력에 저장하지 못함(결과는 그대로 볼 수 있어요)"}
              </p>
              <GeneratedResults
                key={batch.batch_id}
                core={core}
                title={batch.game === "lotto" ? `오늘의 테마 번호 (${batch.records.length}게임)` : `오늘의 테마 번호 (${batch.records.length}장)`}
                rows={batch.game === "lotto" ? lottoRows(batch.records) : pensionRows(batch.records)}
                savable={batch.saved}
                variant={batch.game === "pension" ? "pension" : "primary"}
              />
              <p className="ll-gen__note">
                <strong>{FORTUNE_NOTICE}</strong> · 테마 번호도 추천 번호이며 구매·당첨 기록이 아닙니다.
              </p>
            </>
          ) : (
            !busy && (
              <Card title="오늘의 테마 번호">
                <StateView kind="empty" title="아직 만든 번호가 없습니다" description="테마를 고르고 오늘의 번호 생성을 누르세요." />
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** 엔진 INVALID_INPUT hint → 고칠 입력 칸(그 밖의 hint는 일반 실패). */
function fieldOf(hint: string): Field | null {
  const key = hint.replace(/^fortune\./, "");
  return key === "zodiac_sign" || key === "zodiac_animal" || key === "birthday" || key === "anniversary" || key === "dream" ? key : null;
}

function lottoRows(records: GeneratedRecord[]): ResultRow[] {
  return records.flatMap((r, i) => {
    if (r.game !== "lotto") return [];
    const label = `${i + 1}게임`;
    return [
      {
        id: r.id,
        label,
        text: `${label} ${r.numbers.nums.join(", ")}`,
        content: (
          <span className="ll-balls" role="list" aria-label={`${label} 번호`}>
            {r.numbers.nums.map((n) => (
              <span role="listitem" key={n}>
                <Ball number={n} />
              </span>
            ))}
          </span>
        ),
      },
    ];
  });
}

function pensionRows(records: GeneratedRecord[]): ResultRow[] {
  return records.flatMap((r) => {
    if (r.game !== "pension") return [];
    const label = `${r.group_no}조`;
    const digits = r.numbers.digits;
    return [
      {
        id: r.id,
        label,
        name: `${label} ${digits}`,
        group: 1,
        text: `${label} ${digits}`,
        content: (
          <span className="ll-mono ll-result__digits" aria-label={`${label} ${digits.split("").join(" ")}`}>
            {digits}
          </span>
        ),
      },
    ];
  });
}
