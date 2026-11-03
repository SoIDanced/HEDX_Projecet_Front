// 표시 형식 도우미
export const fmtInt = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "–" : Math.round(n).toLocaleString("ko-KR");

export const fmtNum = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "–"
    : n.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtPct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "–" : `${fmtNum(n, digits)}%`);

export const fmtSignedPct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "–" : `${n > 0 ? "+" : ""}${fmtNum(n, digits)}%`;

export function fmtMoney(n: number | null | undefined, currency = "KRW") {
  if (n === null || n === undefined) return "–";
  if (currency === "KRW") return `${fmtInt(n)}원`;
  return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export const fmtDate = (s: string | null | undefined) => (s ? s : "–");

const DAY = 86400000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

/** 오늘(브라우저 현지 날짜) YYYY-MM-DD */
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** D-day: 기한이 남았으면 D-12, 오늘이면 D-day, 지났으면 D+3 */
export function dday(date: string | null | undefined, today = todayStr()): string {
  if (!date) return "–";
  const n = daysBetween(today, date);
  return n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`;
}

export function addMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const quarterOf = (date: string) => `${date.slice(2, 4)}년 ${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}분기`;
export const quarterSortKey = (date: string) => `${date.slice(0, 4)}-${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;

export const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// 한국어 조사 선택: 이름 끝 글자에 받침이 있는지로 고른다 (영문·숫자는 읽는 소리 기준)
const LATIN_BATCHIM = new Set(["l", "m", "n", "r"]);
const DIGIT_BATCHIM = new Set(["0", "1", "3", "6", "7", "8"]);
export function hasBatchim(word: string): boolean {
  const ch = word.trim().replace(/[\s)\]"'’”]+$/, "").slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[a-z]/i.test(ch)) return LATIN_BATCHIM.has(ch.toLowerCase());
  if (/[0-9]/.test(ch)) return DIGIT_BATCHIM.has(ch);
  return false;
}
/** josa("업체 L", "이/가") → "이" */
export function josa(word: string, pair: "이/가" | "은/는" | "을/를" | "과/와" | "이면/면"): string {
  const [a, b] = pair.split("/");
  return hasBatchim(word) ? a : b;
}

// 계약 조건 칸: '창원 공장 도착도'는 모든 계약 공통이라 뺀다. 남는 기한은 계약 종료일 기준 D-day
export const condText = (c: { endDate?: string | null; deliveryTerms?: string; paymentTerms?: string }, asOf: string) =>
  [c.endDate ? `종료 ${dday(c.endDate, asOf)}` : "", c.deliveryTerms?.replace(/^창원 공장 도착도\s*/, ""), c.paymentTerms].filter(Boolean).join(" · ");
