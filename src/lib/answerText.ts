// 답변 본문: 분석 결과(AnalysisResult)를 글로만 풀어 쓴다 — 표·차트·카드 없이, 숫자와 문장은 모두 코드가 데이터로 만든다
import type { AnalysisResult, ColumnKind, ResultColumn } from "./analysisTypes";
import type { DocSearchResult } from "./documentSearch";
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

export const DOC_SAMPLE_NOTE = "※ SAMPLE 문서입니다(가상 데이터, 실제 자료 아님)";

/** 문서 검색 답변: 글로만 — 찾은 문서의 원본 ID와 내용을 그대로 옮기고, 못 찾으면 지어내지 않고 그렇게 말한다 */
export function documentAnswerText(r: DocSearchResult): string[] {
  const sim = (n: number) => n.toFixed(2);
  if (!r.found || !r.best) {
    return [
      "관련 문서를 찾지 못했습니다. 질문과 의미가 가까운 문서가 없어서 임의로 답하지 않습니다.",
      "날짜, 문서 종류(민원·견적서·계약서·납기 보고서·검사 성적서), 업체명, 품목명을 넣어 다시 질문해 보세요. 예: 2026년 9월 18일자 실린더 라이너 스크래치 민원 찾아줘",
      `(의미 검색 결과: 최고 유사도 ${sim(r.best?.score ?? 0)}, 기준 ${sim(r.threshold)} 미만)`,
      DOC_SAMPLE_NOTE,
    ];
  }
  const { doc, score } = r.best;
  const out = [`해당 ${doc.type} 문서 원본 ID는 (${doc.id})입니다. 다음은 문서 내용입니다: ${doc.body}`, `(의미 검색 결과: 유사도 ${sim(score)})`];
  if (r.similar.length) out.push(`ID가 비슷한 문서 ${r.similar.length}건도 있습니다: ${r.similar.map((h) => h.doc.id).join(", ")}`);
  out.push(DOC_SAMPLE_NOTE);
  return out;
}
