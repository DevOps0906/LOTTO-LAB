// 메일 발송기. 송신 HTTP API 형식은 Mailpit `POST /api/v1/send`(로컬)를 따른다.
// 운영 메일 서비스는 사용자 결정 후 이 파일의 요청 본문만 맞춘다. 키·수신자는 로그에 남기지 않는다.
export const MAIL_TIMEOUT_MS = 5000;
export const MAIL_ENV = ["MAIL_API_URL", "MAIL_API_KEY", "MAIL_FROM", "CONFIRM_BASE_URL"] as const;

export interface MailConfig {
  mailApiUrl: string;
  mailApiKey: string;
  mailFrom: string;
  confirmBaseUrl: string; // origin(끝 슬래시 없음)
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const FROM_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

// http는 로컬·도커 내부 호스트만 예외(그 외 운영 주소는 https만).
function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "host.docker.internal" ||
    host.startsWith("supabase_");
}

function safeUrl(v: string): URL | null {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol === "https:") return u;
  return u.protocol === "http:" && isLocalHost(u.hostname) ? u : null;
}

// 링크 기준 주소: 사용자 정보·쿼리·프래그먼트·루트 외 경로 거부 → 파싱한 origin만 쓴다.
function confirmOrigin(v: string): string | null {
  if (/[?#@]/.test(v)) return null;
  const u = safeUrl(v);
  if (!u || u.username || u.password || u.pathname !== "/") return null;
  return u.origin;
}

// 기본값 없음: 하나라도 없거나 형식이 틀리면 null(fail-closed).
export function loadMailConfig(env: Record<string, string | undefined>): MailConfig | null {
  if (MAIL_ENV.some((k) => !env[k]?.trim())) return null;
  const apiUrl = env.MAIL_API_URL!.trim();
  const origin = confirmOrigin(env.CONFIRM_BASE_URL!.trim());
  const from = env.MAIL_FROM!.trim();
  if (!safeUrl(apiUrl) || !origin || !FROM_RE.test(from)) return null;
  return { mailApiUrl: apiUrl, mailApiKey: env.MAIL_API_KEY!, mailFrom: from, confirmBaseUrl: origin };
}

export async function sendMail(cfg: MailConfig, msg: MailMessage, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await fetchFn(cfg.mailApiUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.mailApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      From: { Email: cfg.mailFrom, Name: SERVICE_NAME },
      To: [{ Email: msg.to }],
      Subject: msg.subject,
      Text: msg.text,
      HTML: msg.html,
    }),
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
  });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`mail_http_${res.status}`);
}

export const SERVICE_NAME = "LOTTO-LAB";
// 문의처는 운영 연락처 확정 후 채운다(팀장 확인 필요).
export const CONTACT_LINE = "문의: (운영 연락처 확정 후 기재)";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// 확인 링크는 쿼리스트링이 아닌 프래그먼트(#token=)로 — 접근 로그·Referer 유출 방지.
export function confirmLink(cfg: MailConfig, token: string): string {
  return `${cfg.confirmBaseUrl}/waitlist/confirm#token=${encodeURIComponent(token)}`;
}

export function confirmMail(cfg: MailConfig, to: string, token: string): MailMessage {
  const link = confirmLink(cfg, token);
  const lines = [
    `${SERVICE_NAME} 출시 알림 신청을 확인해 주세요.`,
    "아래 링크를 열고 '확인' 버튼을 누르면 신청이 완료됩니다(24시간 유효).",
    link,
    "",
    "요청하지 않았다면 이 메일을 무시하세요. 확인하지 않은 신청은 24시간 후 자동 삭제됩니다.",
    "이 서비스는 만 19세 이상만 이용할 수 있습니다.",
    CONTACT_LINE,
  ];
  const html = lines
    .map((l) => l === link ? `<p><a href="${escapeHtml(link)}">신청 확인하기</a></p>` : `<p>${escapeHtml(l)}</p>`)
    .join("\n");
  return { to, subject: `[${SERVICE_NAME}] 출시 알림 신청 확인`, text: lines.join("\n"), html };
}
