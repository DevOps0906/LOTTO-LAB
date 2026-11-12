// A-15·A-19 호출 결과를 화면 상태로 바꾼다. 응답 본문의 message는 쓰지 않고 상태 코드로만 분기한다.
export type ApiResult =
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "rate_limited"; retryAfterSec: number | null }
  | { kind: "unavailable" };

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function postJson(url: string, body: unknown, okStatus: number): Promise<ApiResult> {
  if (!url) return { kind: "unavailable" };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (res.status === okStatus) return { kind: "ok" };
  if (res.status === 400) return { kind: "invalid" };
  if (res.status === 429) return { kind: "rate_limited", retryAfterSec: parseRetryAfter(res.headers.get("retry-after")) };
  return { kind: "unavailable" };
}

export function retryText(sec: number | null): string {
  if (!sec) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  const min = Math.ceil(sec / 60);
  return `요청이 많아요. 약 ${min}분 후 다시 시도해 주세요.`;
}
