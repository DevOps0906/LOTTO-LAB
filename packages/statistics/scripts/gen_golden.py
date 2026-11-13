# 독립 구현(브루트포스)으로 골든 기대값 생성 — TS 구현과 코드 공유 없음(task-015, task-030 워커가 같은 파일로 대조).
# 사용법(저장소 루트): python -I packages/statistics/scripts/gen_golden.py packages/statistics/test/golden
# 시드 고정이라 다시 실행해도 같은 파일이 나온다. 기존 세트를 바꾸지 않도록 새 세트는 별도 Random을 쓴다.
import itertools, json, math, random, sys
from fractions import Fraction
from collections import Counter

out = sys.argv[1]
WINDOWS = {"last10": 10, "last20": 20, "last50": 50, "last100": 100, "all": None}
LOTTO_M = ["lotto.number_freq", "lotto.number_freq_bonus", "lotto.range_dist", "lotto.odd_even", "lotto.sum_dist", "lotto.gap"]
PENSION_M = ["pension.digit_freq", "pension.group_freq", "pension.bonus_digit_freq"]

def fr(x):
    x = Fraction(x)
    return {"num": x.numerator, "den": x.denominator}

# 합계 분포: 8,145,060 조합 전수
sum_counter = Counter(sum(c) for c in itertools.combinations(range(1, 46), 6))
TOTAL = math.comb(45, 6)
assert sum(sum_counter.values()) == TOTAL

def window(draws, w):
    s = sorted(draws, key=lambda d: -d["draw_no"])
    return s if WINDOWS[w] is None else s[: WINDOWS[w]]

def lotto(metric, sample):
    n = len(sample)
    if metric in ("lotto.number_freq", "lotto.number_freq_bonus"):
        bonus = metric.endswith("bonus")
        v = [0] * 45
        for d in sample:
            for x in d["nums"] + ([d["bonus"]] if bonus else []):
                v[x - 1] += 1
        return v, fr(Fraction(n * (7 if bonus else 6), 45))
    if metric == "lotto.range_dist":
        rs = [(1, 10), (11, 20), (21, 30), (31, 40), (41, 45)]
        v = [sum(1 for d in sample for x in d["nums"] if lo <= x <= hi) for lo, hi in rs]
        return v, [fr(Fraction(n * 6 * (hi - lo + 1), 45)) for lo, hi in rs]
    if metric == "lotto.odd_even":
        v = [0] * 7
        for d in sample:
            v[sum(x % 2 for x in d["nums"])] += 1
        return v, [fr(Fraction(n * math.comb(23, k) * math.comb(22, 6 - k), TOTAL)) for k in range(7)]
    if metric == "lotto.sum_dist":
        v = [0] * 235
        for d in sample:
            v[sum(d["nums"]) - 21] += 1
        return v, [fr(Fraction(n * sum_counter[s], TOTAL)) for s in range(21, 256)]
    if metric == "lotto.gap":
        to = max(d["draw_no"] for d in sample)
        v = []
        for x in range(1, 46):
            seen = [d["draw_no"] for d in sample if x in d["nums"]]
            v.append({"gap": to - max(seen), "censored": False} if seen else {"gap": None, "censored": True})
        return v, fr(Fraction(45, 6))

def pension(metric, sample):
    n = len(sample)
    if metric == "pension.group_freq":
        return [sum(1 for d in sample if d["group_no"] == g) for g in range(1, 6)], fr(Fraction(n, 5))
    key = "digits" if metric == "pension.digit_freq" else "bonus_digits"
    return [[sum(1 for d in sample if int(d[key][i]) == k) for k in range(10)] for i in range(6)], fr(Fraction(n, 10))

def build(game, draws):
    cases = []
    for m in (LOTTO_M if game == "lotto" else PENSION_M):
        for w in WINDOWS:
            s = window(draws, w)
            if not s:
                exp = None
            else:
                values, baseline = (lotto if game == "lotto" else pension)(m, s)
                exp = {"metric": m, "window": w, "range": {"from": s[-1]["draw_no"], "to": s[0]["draw_no"]},
                       "sample_size": len(s), "baseline": baseline, "values": values}
            cases.append({"metric": m, "window": w, "expected": exp})
    return {"game": game, "draws": draws, "cases": cases}

rnd = random.Random(20261112)
# 로또 12회차: draw_no 7 결번(존재하는 회차 기준), 입력 순서 섞음. 45는 최근 10회에 안 나오게(censored 확인).
lotto_draws = []
for no in [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13]:
    pool = list(range(1, 46)) if no <= 2 else list(range(1, 45))
    picked = sorted(rnd.sample(pool, 7))
    b = picked.pop(rnd.randrange(7))
    lotto_draws.append({"draw_no": no, "nums": picked, "bonus": b})
lotto_draws[0]["nums"] = [1, 2, 3, 4, 5, 6]; lotto_draws[0]["bonus"] = 45  # 합계 최소
lotto_draws[1]["nums"] = [40, 41, 42, 43, 44, 45]; lotto_draws[1]["bonus"] = 1  # 합계 최대
rnd.shuffle(lotto_draws)

pension_draws = []
for no in range(1, 13):
    pension_draws.append({"draw_no": no, "group_no": rnd.randint(1, 5),
                          "digits": "".join(str(rnd.randint(0, 9)) for _ in range(6)),
                          "bonus_digits": "".join(str(rnd.randint(0, 9)) for _ in range(6))})
pension_draws[0]["digits"] = "000719"  # 앞자리 0 보존
rnd.shuffle(pension_draws)

# 큰 세트: 회차 1~111 중 결번 3개(108회) → last10·20·50·100·all이 모두 다른 표본.
big = random.Random(20261113)
BIG_NOS = [no for no in range(1, 112) if no not in (40, 77, 95)]
lotto_big = []
for no in BIG_NOS:
    picked = big.sample(range(1, 46), 7)
    lotto_big.append({"draw_no": no, "nums": sorted(picked[:6]), "bonus": picked[6]})
big.shuffle(lotto_big)
pension_big = [{"draw_no": no, "group_no": big.randint(1, 5),
                "digits": "".join(str(big.randint(0, 9)) for _ in range(6)),
                "bonus_digits": "".join(str(big.randint(0, 9)) for _ in range(6))} for no in BIG_NOS]
big.shuffle(pension_big)

for name, data in [("lotto", build("lotto", lotto_draws)), ("pension", build("pension", pension_draws)),
                   ("lotto-large", build("lotto", lotto_big)), ("pension-large", build("pension", pension_big)),
                   ("empty-lotto", build("lotto", [])), ("empty-pension", build("pension", []))]:
    with open(f"{out}/{name}.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
print("ok", sum_counter[138], max(sum_counter.values()))
