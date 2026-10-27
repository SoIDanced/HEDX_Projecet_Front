// 답변 본문: 분석 결과(AnalysisResult)를 글로만 풀어 쓴다 — 표·차트·카드 없이, 숫자와 문장은 모두 코드가 데이터로 만든다
import type { AnalysisResult, ColumnKind, ResultColumn } from "./analysisTypes";
import { fmtDate, fmtInt, fmtMoney, fmtNum, fmtPct, fmtSignedPct } from "./format";

export interface AnswerSection {
  id: string;
  title: string;
  items: string[];
}

export const MAX_ROW_LINES = 10;

export function cellText(kind: ColumnKind, v: unknown, currency = "KRW", digits?: number): string {
  if (v === null || v === undefined || v === "") return "–";
  switch (kind) {
    case "int":
      return fmtInt(Number(v));
    case "number":
      return fmtNum(Number(v), digits ?? 1);
    case "percent":
      return fmtPct(Number(v), digits ?? 1);
    case "signedPercent":
      return fmtSignedPct(Number(v), digits ?? 1);
    case "money":
      return fmtMoney(Number(v), currency);
    case "date":
      return fmtDate(String(v));
    default:
      return String(v);
  }
}

const unitOf = (c: ResultColumn) => (c.unit && !c.label.includes(c.unit) && c.kind !== "percent" && c.kind !== "signedPercent" && c.kind !== "money" ? ` ${c.unit}` : "");

export function answerSections(result: AnalysisResult): AnswerSection[] {
  const primary = result.columns.filter((c) => c.primary);
  const cols = primary.length ? primary : result.columns.slice(0, 5);
  const rowLine = (r: AnalysisResult["rows"][number]) => {
    const head = r.rank ? `${r.rank}) ` : "";
    const vals = cols.map((c) => `${c.label} ${cellText(c.kind, r.values[c.key], r.currency, c.digits)}${unitOf(c)}`).join(" · ");
    return `${head}${r.label}${r.sub ? ` (${r.sub})` : ""} — ${vals}${r.excludedReason ? ` [순위 제외: 조건 상이 — ${r.excludedReason}]` : ""}`;
  };
  const rows = result.rows.slice(0, MAX_ROW_LINES).map(rowLine);
  if (result.rows.length > MAX_ROW_LINES) rows.push(`그 밖 ${result.rows.length - MAX_ROW_LINES}건은 아래 ‘내보내기’(엑셀·CSV)에서 확인할 수 있습니다.`);
  const all: AnswerSection[] = [
    { id: "highlights", title: "핵심 지표", items: result.highlights.map((h) => `${h.label}: ${h.value}`) },
    { id: "rows", title: `${result.rankLabel ? `비교 결과 (${result.rankLabel} 순)` : "비교 결과"}`, items: rows },
    { id: "risks", title: "추가 검토가 필요한 위험 요소", items: result.risks.slice(0, 8) },
    { id: "review", title: "검토할 사항", items: result.reviewPoints },
    { id: "basis", title: "비교에 사용된 데이터와 평가 근거", items: [...result.basis, ...result.notes.map((n) => `참고: ${n}`)] },
  ];
  return all.filter((s) => s.items.length);
}
