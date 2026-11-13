// M-09 수동 구매 등록: 복권·회차·번호(로또 1~45 6개 / 연금 조 + 여섯 자리 문자열)·구매일·금액(정수 원)·실제 구매 확인.
// - 멱등 키는 화면에 들어올 때 한 번 발급한다 — 두 번 누름·다시 시도가 같은 기록 1건으로 수렴(R18).
// - 회차 기본값은 suggestRound. 최근 회차 정보가 오래됐으면(needs_confirmation) 비워 두고 사용자가 확인·입력한다(결정 ⑧).
// - 연금 여섯 자리는 문자열 그대로 다룬다(숫자로 바꾸지 않는다 — "000719" 보존).
// - 즐겨찾기에서 오면(fromTicketId) 번호는 고정하고 같은 기록을 구매로 전환한다(tickets.purchase — 한 번의 쓰기). 원본 추천 기록은 그대로 남는다.
// - 오류는 필드 옆에 보이고 입력은 유지한다. 결제·QR 등록 기능은 없다(QR은 P1이라 보이지 않는다).
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Header } from "../../components/Header";
import { useNotice } from "../../components/Notice";
import { StateView } from "../../components/StateView";
import { GAME_NAME, formatWon, useAsync, type Game } from "../common/data";
import { Segment } from "../common/generator";
import { StatusBadge, TicketNumbers, errorCode, kstToday, type TicketNumbersData, type TicketRecord, type TicketsCore } from "../common/ticket";

export type PurchaseRegisterLinks = { tickets: string; detail: (ticketId: string) => string };

export type PurchaseRegisterProps = {
  /** adapters.clock: 구매일 기본값(KST 오늘)을 앱 시계로 계산한다 */
  core: Pick<TicketsCore, "tickets"> & { adapters: { clock: { now(): Date } } };
  links: PurchaseRegisterLinks;
  /** 등록 후 상세로 이동(셸이 해시를 바꾼다) */
  navigate: (href: string) => void;
  /** 즐겨찾기 번호를 구매로 등록할 때 그 저장 번호 id */
  fromTicketId?: string;
  initialGame?: Game;
  /** KST 오늘 "YYYY-MM-DD". 없으면 core.adapters.clock 기준 */
  today?: string;
};

const LOTTO_MIN = 1;
const LOTTO_MAX = 45;
const PENSION_GROUPS = [1, 2, 3, 4, 5];
/** 한 줄(1게임·1매) 판매가 — 금액 기본값. 정수 원. */
const UNIT_PRICE = 1000;

type AmountChoice = "none" | "unit" | "custom";
/** 오류 필드 → 포커스할 요소 id(화면 순서). 제출 오류 시 첫 오류 필드로 포커스한다. */
const FOCUS_ORDER: [keyof FieldErrors, string][] = [
  ["nums", "register-num-0"],
  ["group", "register-group-1"],
  ["digits", "register-digits"],
  ["round", "register-round"],
  ["date", "register-date"],
  ["amount", "register-amount-custom"],
  ["form", "register-form-error"],
];

type FieldErrors = Partial<Record<"nums" | "group" | "digits" | "round" | "date" | "amount" | "confirm" | "form", string>>;

export function PurchaseRegister({ core, links, navigate, fromTicketId, initialGame = "lotto", today: todayProp }: PurchaseRegisterProps) {
  const [today] = useState(() => todayProp ?? kstToday(core.adapters.clock.now()));
  const [source] = useAsync<TicketRecord | null>(async () => (fromTicketId ? core.tickets.get(fromTicketId) : null));

  const header = (
    <Header
      title="구매 등록"
      subtitle="이미 구매한 복권의 번호를 기록합니다. 이 앱은 복권을 판매하거나 결제하지 않습니다."
    />
  );
  if (fromTicketId) {
    if (source.status === "loading") {
      return (
        <div className="ll-tickets">
          {header}
          <StateView kind="loading" title="번호를 불러오는 중입니다" />
        </div>
      );
    }
    const ticket = source.status === "done" ? source.value : null;
    if (!ticket) {
      return (
        <div className="ll-tickets">
          {header}
          <StateView
            kind={source.status === "failed" ? "error" : "empty"}
            title="구매로 등록할 번호를 찾을 수 없습니다"
            description="제거됐거나 이 기기에 없는 번호입니다. 번호를 직접 입력해 등록할 수 있어요."
            action={
              <a className="ll-button" data-variant="secondary" href={links.tickets}>
                내 번호로
              </a>
            }
          />
        </div>
      );
    }
    if (ticket.purchase_status === "purchased") {
      return (
        <div className="ll-tickets">
          {header}
          <StateView
            kind="empty"
            title="이미 구매 기록인 번호입니다"
            action={
              <a className="ll-button" data-variant="secondary" href={links.detail(ticket.id)}>
                상세 보기
              </a>
            }
          />
        </div>
      );
    }
    return (
      <div className="ll-tickets" data-game={ticket.game}>
        {header}
        <RegisterForm core={core} links={links} navigate={navigate} today={today} source={ticket} initialGame={ticket.game} />
      </div>
    );
  }
  return (
    <div className="ll-tickets">
      {header}
      <RegisterForm core={core} links={links} navigate={navigate} today={today} source={null} initialGame={initialGame} />
    </div>
  );
}

function RegisterForm({
  core,
  links,
  navigate,
  today,
  source,
  initialGame,
}: {
  core: PurchaseRegisterProps["core"];
  links: PurchaseRegisterLinks;
  navigate: (href: string) => void;
  today: string;
  source: TicketRecord | null;
  initialGame: Game;
}) {
  const notice = useNotice();
  // 화면 진입 시 한 번 발급(다시 제출해도 같은 키).
  const [idempotencyKey] = useState(() => core.tickets.newIdempotencyKey());
  const [game, setGame] = useState<Game>(initialGame);
  const [nums, setNums] = useState<string[]>(() => Array(6).fill(""));
  const [group, setGroup] = useState("");
  const [digits, setDigits] = useState("");
  const [round, setRound] = useState(source?.round != null ? String(source.round) : "");
  const [roundLater, setRoundLater] = useState(false);
  const [suggest, setSuggest] = useState<{ round: number | null; needs_confirmation: boolean } | null>(null);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState<AmountChoice>("unit");
  const [customAmount, setCustomAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  // 제출 오류가 생기면 첫 오류 필드로 포커스(오류 문구는 aria-describedby로 함께 읽힌다).
  useEffect(() => {
    if (focusTick === 0) return;
    const target = FOCUS_ORDER.find(([field]) => errors[field]);
    if (target) document.getElementById(target[1])?.focus();
    // errors는 같은 렌더에서 함께 바뀐다 — 제출마다(focusTick) 한 번만 옮긴다.
  }, [focusTick]);

  // 회차 제안: 복권이 바뀔 때마다. 사용자가 이미 입력했으면 덮어쓰지 않는다.
  useEffect(() => {
    let alive = true;
    setSuggest(null);
    core.tickets.suggestRound(game).then(
      (s) => {
        if (!alive) return;
        setSuggest(s);
        if (!s.needs_confirmation && s.round !== null) setRound((r) => (r === "" ? String(s.round) : r));
      },
      () => {
        if (alive) setSuggest({ round: null, needs_confirmation: true });
      },
    );
    return () => {
      alive = false;
    };
    // core는 화면 수명 동안 같다 — 복권이 바뀔 때만 다시 묻는다.
  }, [game]);

  const clear = (field: keyof FieldErrors) => setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));

  function validate(): { errors: FieldErrors; data?: TicketNumbersData; round: number | null; amount: number | null } {
    const next: FieldErrors = {};
    let data: TicketNumbersData | undefined;
    if (source) {
      data = source;
    } else if (game === "lotto") {
      const values = nums.map((v) => (/^[0-9]{1,2}$/.test(v) ? Number(v) : NaN));
      const ok = values.every((n) => Number.isInteger(n) && n >= LOTTO_MIN && n <= LOTTO_MAX) && new Set(values).size === 6;
      if (ok) data = { game: "lotto", ticket_data: { nums: [...values].sort((a, b) => a - b) } };
      else next.nums = `${LOTTO_MIN}~${LOTTO_MAX} 사이 서로 다른 숫자 6개를 입력하세요.`;
    } else {
      const g = PENSION_GROUPS.includes(Number(group)) ? Number(group) : null;
      if (g === null) next.group = "조(1~5조)를 고르세요.";
      if (!/^[0-9]{6}$/.test(digits)) next.digits = "여섯 자리 숫자를 입력하세요(앞자리 0 포함, 예: 000719).";
      if (g !== null && !next.digits) data = { game: "pension", ticket_data: { group_no: g, digits } };
    }
    let r: number | null = null;
    if (!roundLater) {
      const t = round.trim();
      if (/^[0-9]{1,7}$/.test(t) && Number(t) >= 1) r = Number(t);
      else next.round = "구매한 복권에 적힌 회차(1 이상 숫자)를 입력하세요. 모르면 '회차는 나중에 입력'을 고르세요.";
    }
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) next.date = "구매일을 YYYY-MM-DD 형식으로 입력하세요.";
    else if (date > today) next.date = "구매일은 오늘 이후일 수 없어요.";
    let won: number | null = null;
    if (amount === "unit") won = UNIT_PRICE;
    else if (amount === "custom") {
      if (/^[0-9]{1,9}$/.test(customAmount)) won = Number(customAmount);
      else next.amount = "금액은 원 단위 정수(숫자만)로 입력하세요.";
    }
    if (!confirmed) next.confirm = "실제로 구매한 번호인지 확인해 주세요.";
    return { errors: next, data, round: r, amount: won };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const v = validate();
    setErrors(v.errors);
    if (Object.values(v.errors).some(Boolean) || !v.data) {
      setFocusTick((n) => n + 1);
      return;
    }
    setSubmitting(true);
    try {
      let saved: TicketRecord;
      if (source) {
        saved = await core.tickets.purchase(source.id, {
          round: v.round,
          purchase_date: date,
          ...(v.amount === null ? {} : { amount_won: v.amount }),
        });
      } else {
        saved = await core.tickets.save({
          ...v.data,
          purchase_status: "purchased",
          purchase_date: date,
          amount_won: v.amount,
          round: v.round,
          idempotency_key: idempotencyKey,
        });
      }
      notice.toast("구매 기록으로 등록했어요");
      navigate(links.detail(saved.id));
    } catch (error) {
      setErrors({ form: submitMessage(error) });
      setFocusTick((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const roundHint =
    suggest === null
      ? "다음 추첨 회차를 확인하는 중입니다."
      : suggest.needs_confirmation
        ? "최근 회차 정보가 오래됐거나 없어 회차를 채우지 않았어요. 복권에 적힌 회차를 확인해 입력하세요."
        : "다음 추첨 회차로 채웠어요. 복권에 적힌 회차와 같은지 확인하세요.";

  return (
    <form className="ll-tickets__form" onSubmit={(e) => void submit(e)} noValidate aria-label="구매 등록">
      <Card title="번호">
        {source ? (
          <div className="ll-tickets__source">
            <p className="ll-muted">
              <StatusBadge kind="favorite" /> 즐겨찾기 번호를 구매 기록으로 바꿉니다. 번호는 바꿀 수 없어요.
            </p>
            <TicketNumbers data={source} />
            {source.source_number_id && <p className="ll-muted">원본 추천 기록과 연결된 채로 남습니다.</p>}
          </div>
        ) : (
          <>
            <Segment
              legend="복권"
              name="register-game"
              value={game}
              options={[
                { value: "lotto", label: GAME_NAME.lotto },
                { value: "pension", label: GAME_NAME.pension },
              ]}
              onChange={(g) => {
                setGame(g);
                setRound("");
                setErrors({});
              }}
            />
            {game === "lotto" ? (
              <Field legend="로또 번호 6개" error={errors.nums} errorId="register-nums-error" group>
                <div className="ll-tickets__nums">
                  {nums.map((value, i) => (
                    <label key={i} className="ll-digit">
                      <span className="ll-digit__label">{i + 1}</span>
                      <input
                        id={`register-num-${i}`}
                        className="ll-input ll-num"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={2}
                        aria-label={`로또 번호 ${i + 1}`}
                        aria-invalid={errors.nums ? true : undefined}
                        aria-describedby={errors.nums ? "register-nums-error" : undefined}
                        value={value}
                        onChange={(e) => {
                          const next = [...nums];
                          next[i] = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                          setNums(next);
                          clear("nums");
                        }}
                      />
                    </label>
                  ))}
                </div>
              </Field>
            ) : (
              <>
                <Field legend="조" error={errors.group} errorId="register-group-error" group>
                  <div className="ll-seg" role="radiogroup" aria-label="조">
                    {PENSION_GROUPS.map((g) => (
                      <label key={g} className="ll-seg__item">
                        <input
                          id={`register-group-${g}`}
                          type="radio"
                          name="register-group"
                          checked={group === String(g)}
                          aria-describedby={errors.group ? "register-group-error" : undefined}
                          onChange={() => {
                            setGroup(String(g));
                            clear("group");
                          }}
                        />
                        <span>{g}조</span>
                      </label>
                    ))}
                  </div>
                </Field>
                <Field legend="여섯 자리" htmlFor="register-digits" error={errors.digits} errorId="register-digits-error">
                  <input
                    id="register-digits"
                    className="ll-input ll-mono"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="예: 000719"
                    aria-invalid={errors.digits ? true : undefined}
                    aria-describedby={errors.digits ? "register-digits-error" : "register-digits-hint"}
                    value={digits}
                    onChange={(e) => {
                      // 문자열 그대로(숫자 변환 금지) — 앞자리 0 보존.
                      setDigits(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
                      clear("digits");
                    }}
                  />
                  <p id="register-digits-hint" className="ll-muted ll-field__hint">
                    앞자리 0도 그대로 입력하세요.
                  </p>
                </Field>
              </>
            )}
          </>
        )}
      </Card>
      <Card title="구매 정보">
        <Field legend="회차" htmlFor="register-round" error={errors.round} errorId="register-round-error">
          <p id="register-round-hint" className="ll-muted ll-field__hint">
            {roundHint}
          </p>
          <input
            id="register-round"
            className="ll-input ll-num"
            inputMode="numeric"
            autoComplete="off"
            placeholder={suggest?.round != null ? `예: ${suggest.round}` : "예: 1133"}
            disabled={roundLater}
            aria-invalid={errors.round ? true : undefined}
            aria-describedby={errors.round ? "register-round-error register-round-hint" : "register-round-hint"}
            value={round}
            onChange={(e) => {
              setRound(e.target.value.replace(/[^0-9]/g, "").slice(0, 7));
              clear("round");
            }}
          />
          <label className="ll-check">
            <input
              type="checkbox"
              checked={roundLater}
              onChange={(e) => {
                setRoundLater(e.target.checked);
                clear("round");
              }}
            />
            회차는 나중에 입력(당첨 확인은 회차 입력 후)
          </label>
        </Field>
        <Field legend="구매일" htmlFor="register-date" error={errors.date} errorId="register-date-error">
          <input
            id="register-date"
            className="ll-input ll-num"
            type="date"
            max={today}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? "register-date-error" : undefined}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              clear("date");
            }}
          />
        </Field>
        <Segment
          legend="금액(원)"
          name="register-amount"
          value={amount}
          options={[
            { value: "unit", label: formatWon(UNIT_PRICE) },
            { value: "custom", label: "직접 입력" },
            { value: "none", label: "입력 안 함" },
          ]}
          onChange={(a) => {
            setAmount(a);
            clear("amount");
          }}
        />
        {amount === "custom" && (
          <Field legend="금액 직접 입력(원)" htmlFor="register-amount-custom" error={errors.amount} errorId="register-amount-error">
            <input
              id="register-amount-custom"
              className="ll-input ll-num"
              inputMode="numeric"
              autoComplete="off"
              placeholder="예: 5000"
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? "register-amount-error" : undefined}
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value.replace(/[^0-9]/g, "").slice(0, 9));
                clear("amount");
              }}
            />
          </Field>
        )}
      </Card>
      <Card>
        <label className="ll-check">
          <input
            type="checkbox"
            checked={confirmed}
            aria-describedby={errors.confirm ? "register-confirm-error" : undefined}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              clear("confirm");
            }}
          />
          실제로 구매한 번호가 맞습니다(필수)
        </label>
        {errors.confirm && (
          <p id="register-confirm-error" className="ll-gen__error" role="alert">
            {errors.confirm}
          </p>
        )}
        <p className="ll-muted">추천 번호를 등록해도 당첨과는 무관합니다. 구매 기록만 회차 결과와 대조합니다.</p>
        {errors.form && (
          <p id="register-form-error" className="ll-gen__error" role="alert" tabIndex={-1}>
            {errors.form}
          </p>
        )}
        <div className="ll-gen__actions">
          <Button type="submit" variant={game === "pension" ? "pension" : "primary"} disabled={!confirmed || submitting}>
            {submitting ? "등록하는 중" : "구매 등록 확정"}
          </Button>
          <a className="ll-button" data-variant="secondary" href={links.tickets}>
            취소
          </a>
        </div>
      </Card>
    </form>
  );
}

function Field({
  legend,
  htmlFor,
  error,
  errorId,
  group = false,
  children,
}: {
  legend: string;
  htmlFor?: string;
  error?: string;
  errorId: string;
  group?: boolean;
  children: ReactNode;
}) {
  const message = error && (
    <p id={errorId} className="ll-gen__error" role="alert">
      {error}
    </p>
  );
  if (group) {
    return (
      <fieldset className="ll-field">
        <legend className="ll-field__legend">{legend}</legend>
        {children}
        {message}
      </fieldset>
    );
  }
  return (
    <div className="ll-field">
      <label className="ll-field__legend" htmlFor={htmlFor}>
        {legend}
      </label>
      {children}
      {message}
    </div>
  );
}

function submitMessage(error: unknown): string {
  switch (errorCode(error)) {
    case "INVALID_INPUT":
      return "입력값이 형식에 맞지 않아요. 번호·회차·구매일·금액을 확인하세요.";
    case "LIMIT_EXCEEDED":
      return "저장 번호가 가득 찼어요(최대 1,000개). 내 번호에서 정리한 뒤 다시 등록하세요.";
    case "IDEMPOTENCY_CONFLICT":
      return "이 화면에서 이미 다른 내용으로 등록됐어요. 내 번호에서 확인하세요.";
    case "NOT_FOUND":
      return "번호를 찾을 수 없어요. 내 번호에서 다시 시도하세요.";
    case "INVALID_TRANSITION":
      return "이 번호는 상태를 바꿀 수 없어요.";
    default:
      return "등록하지 못했어요. 기기 저장 공간을 확인한 뒤 다시 시도하세요.";
  }
}
