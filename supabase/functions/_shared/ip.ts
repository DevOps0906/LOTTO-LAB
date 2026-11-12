// 클라이언트 IP 추출·정규화 (A-15 레이트리밋 키용). 원문 IP는 저장·로그하지 않는다.

// 신뢰 순서. 플랫폼 프록시가 덮어쓰는 헤더만 둔다.
// 로컬 확인(supabase CLI 3.1.0, Kong): x-real-ip는 Kong이 덮어씀(위조 불가),
// cf-connecting-ip는 클라이언트 값이 그대로 통과(위조 가능)하므로 쓰지 않는다.
// x-forwarded-for는 클라이언트가 맨 왼쪽에 아무 값이나 넣을 수 있으므로
// 마지막 프록시가 붙인 맨 오른쪽 값만 쓴다(아래 clientIp 참고).
// 운영(호스티드) 헤더는 배포 후 다시 확인해 이 상수만 고친다.
export const CLIENT_IP_HEADERS = ["x-real-ip"] as const;
const XFF = "x-forwarded-for";

export function clientIp(headers: Headers): string | null {
  for (const name of CLIENT_IP_HEADERS) {
    const v = headers.get(name)?.trim();
    if (v) return v;
  }
  const xff = headers.get(XFF);
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return null;
}

const V4_OCTET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const HEXTET = /^[0-9a-f]{1,4}$/i;

function isIPv4(s: string): boolean {
  const p = s.split(".");
  return p.length === 4 && p.every((o) => V4_OCTET.test(o));
}

function expandIPv6(s: string): number[] | null {
  // 끝에 붙은 IPv4(예: ::ffff:1.2.3.4)는 16진 두 칸으로 바꾼 뒤 일반 규칙으로 처리
  const lastColon = s.lastIndexOf(":");
  if (lastColon >= 0 && s.slice(lastColon + 1).includes(".")) {
    const v4 = s.slice(lastColon + 1);
    if (!isIPv4(v4)) return null;
    const o = v4.split(".").map(Number);
    const hex = (n: number) => n.toString(16);
    s = s.slice(0, lastColon + 1) + hex((o[0] << 8) | o[1]) + ":" + hex((o[2] << 8) | o[3]);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string) => (h === "" ? [] : h.split(":"));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (![...head, ...rest].every((h) => HEXTET.test(h))) return null;
  const nums = (a: string[]) => a.map((h) => parseInt(h, 16));
  const known = head.length + rest.length;
  if (halves.length === 1) return known === 8 ? nums(head) : null;
  if (known > 7) return null;
  return [...nums(head), ...new Array(8 - known).fill(0), ...nums(rest)];
}

// IPv4는 그대로, IPv6는 /64 접두(한 가입자 대역)로 묶는다. 해석 불가면 null.
export function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end < 0) return null;
    s = s.slice(1, end);
  } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) {
    s = s.slice(0, s.indexOf(":"));
  }
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (isIPv4(s)) return s;
  const h = expandIPv6(s);
  if (!h) return null;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  }
  return h.slice(0, 4).map((x) => x.toString(16)).join(":") + "::/64";
}
