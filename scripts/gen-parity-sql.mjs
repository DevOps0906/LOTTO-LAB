// 공용 판정 벡터(packages/validation/test/vectors/*.json) → pgTAP(supabase/tests/validation_parity_test.sql) 생성.
// 같은 벡터를 vitest(Zod)도 실행한다(packages/validation/test/parity.test.ts) — 양쪽이 같은 valid를 내면 DB CHECK와 Zod가 같은 판정.
// 사용: node scripts/gen-parity-sql.mjs [--check]   (--check: 파일이 최신이 아니면 실패, 쓰지 않음)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const vectorDir = path.join(root, "packages/validation/test/vectors");
const outFile = path.join(root, "supabase/tests/validation_parity_test.sql");

const load = (name) => JSON.parse(readFileSync(path.join(vectorDir, name), "utf8"));
const numbers = load("numbers.json");
const tickets = load("tickets.json");
const status = load("ticket-status.json");

// 값은 모두 표준 문자열 리터럴(작은따옴표 이중화)로만 넣는다 — 달러 인용을 쓰지 않으므로 값 안의 $$는 의미가 없다.
// standard_conforming_strings=on(PG 기본)이라 역슬래시는 그대로 문자다. NUL은 리터럴에 넣을 수 없어 거부.
const lit = (s) => {
  if (typeof s !== "string") throw new Error(`문자열이 아니다: ${JSON.stringify(s)}`);
  if (s.includes(String.fromCharCode(0))) throw new Error("NUL 문자 금지");
  return `'${s.replaceAll("'", "''")}'`;
};
const jsonbLit = (v) => `${lit(JSON.stringify(v))}::jsonb`;
const intLit = (n) => {
  if (!Number.isSafeInteger(n)) throw new Error(`안전 정수가 아니다: ${JSON.stringify(n)}`);
  return String(n);
};
const bool = (b) => {
  if (typeof b !== "boolean") throw new Error(`boolean이 아니다: ${JSON.stringify(b)}`);
  return String(b);
};
const GAMES = ["lotto", "pension"];
const gameLit = (g) => {
  if (!GAMES.includes(g)) throw new Error(`game 값 오류: ${g}`);
  return `${lit(g)}::public.game_type`;
};
// 키 없음(undefined)과 null은 둘 다 SQL NULL.
const nullable = (v, f) => (v === undefined || v === null ? "null" : f(v));
const sqlstate = (c) => {
  if (!/^[0-9A-Z]{5}$/.test(c)) throw new Error(`SQLSTATE 형식 오류: ${c}`);
  return lit(c);
};
// 앱·DB 기대값: valid 하나 또는 app·db 따로(의도적 차이). 여기서는 DB 쪽만 쓴다.
const dbExpect = (c) => bool(c.db ?? c.valid);

const PARITY_USER = "00000000-0000-4000-8000-0000000c0001";
const keyFor = (i) => `00000000-0000-4000-8000-${(0xd0000 + i).toString(16).padStart(12, "0")}`;

const lines = [];
const fnTest = (fn, kind, c) =>
  `select is(private.${fn}(${gameLit(c.game)}, ${jsonbLit(c.data)}), ${dbExpect(c)}, ${lit(`${kind}: ${c.name}`)});`;

for (const c of numbers.cases) lines.push(fnTest("valid_numbers", "numbers", c));
for (const c of tickets.cases) lines.push(fnTest("valid_ticket", "ticket", c));

const base = status.base;
status.cases.forEach((c, i) => {
  const f = c.fields;
  const insert =
    "insert into public.saved_tickets (user_id, game, round, ticket_data, purchase_status, purchase_date, amount_won, idempotency_key) values (" +
    [
      `${lit(PARITY_USER)}::uuid`,
      gameLit(base.game),
      intLit(f.round ?? base.round),
      jsonbLit(base.ticket_data),
      nullable(f.purchase_status, lit),
      nullable(f.purchase_date, (d) => `${lit(d)}::date`),
      nullable(f.amount_won, intLit),
      `${lit(keyFor(i))}::uuid`,
    ].join(", ") +
    ")";
  const desc = lit(`ticket-status: ${c.name}`);
  lines.push(
    dbExpect(c) === "true"
      ? `select lives_ok(${lit(insert)}, ${desc});`
      : `select throws_ok(${lit(insert)}, ${sqlstate(c.sqlstate ?? "23514")}, null, ${desc});`,
  );
});

const sql = `-- 자동 생성 파일 — 손으로 고치지 않는다. 생성: node scripts/gen-parity-sql.mjs
-- 근거: task-011 팀장 결정 ⑤. 공용 판정 벡터(packages/validation/test/vectors/*.json)를 DB 정본
-- (private.valid_numbers · private.valid_ticket · saved_tickets 상태-열 CHECK)에 그대로 돌려 Zod와 같은 판정임을 증명한다.
-- 소유자 권한(테스트 실행 역할)으로 호출한다. 시드에 기대지 않고 트랜잭션 안에서 넣고 rollback.
begin;
create extension if not exists pgtap with schema extensions;

select plan(${lines.length});

insert into auth.users (id, email) values (${lit(PARITY_USER)}, 'parity@synthetic.invalid');

${lines.join("\n")}

select * from finish();
rollback;
`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(outFile, "utf8");
  } catch {
    // 없으면 아래에서 실패
  }
  if (current !== sql) {
    console.error("validation_parity_test.sql이 벡터와 다르다: node scripts/gen-parity-sql.mjs 실행");
    process.exit(1);
  }
  console.log(`validation_parity_test.sql 최신 (${lines.length}건)`);
} else {
  writeFileSync(outFile, sql);
  console.log(`생성: supabase/tests/validation_parity_test.sql (${lines.length}건)`);
}
