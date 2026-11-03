// 답변 본문: 분석 결과(AnalysisResult)를 글로만 풀어 쓴다 — 표·차트·카드 없이, 숫자와 문장은 모두 코드가 데이터로 만든다
import type { AnalysisResult, ColumnKind, ResultColumn } from "./analysisTypes";
import type { DocSearchResult } from "./documentSearch";
import type { DataMeta } from "../data/types";
import { DATASET_LABEL } from "../data/types";
import { SAMPLE_DOCS } from "../data/sample/documents";
import { fmtDate, fmtInt, fmtMoney, fmtNum, fmtPct, fmtSignedPct } from "./format";

export interface AnswerSection {
  id: string;
  title: string;
  items: string[];
  /** 접이식 구획(기본 접힘) — 단가 변동 상세·평가 근거·검토할 사항 */
  fold?: boolean;
  /** fold 구획 중 처음부터 펼쳐 둘 것(첫 단가 변동 상세) */
  open?: boolean;
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

/** 한 열의 ‘이름 값’ 문구. 라벨 끝 ‘(%)’는 값 뒤 %로 옮기고, 점수 열에는 ‘점’을 붙인다 */
function colText(c: ResultColumn, r: AnalysisResult["rows"][number]): { text: string; has: boolean } {
  const raw = r.values[c.key];
  const pctLabel = c.label.endsWith("(%)");
  const label = pctLabel ? c.label.slice(0, -3) : c.label;
  const v = cellText(c.kind, raw, r.currency, c.digits);
  const has = !(raw === null || raw === undefined || raw === "");
  return { text: `${label} ${v}${has ? (pctLabel ? "%" : c.suffix ?? unitOf(c)) : ""}`, has };
}

const FOLD = (id: string) => id === "basis" || id === "review" || id === "pcommon" || id.startsWith("pc-");

export function answerSections(result: AnalysisResult): AnswerSection[] {
  const primary = result.columns.filter((c) => c.primary);
  const cols = primary.length ? primary : result.columns.slice(0, 5);
  const core = result.columns.find((c) => c.core);
  // 행 = ‘이름 — 핵심값 하나’ + 줄바꿈 뒤 보조값들(한 줄에 값이 줄줄이 붙지 않게)
  const rowLine = (r: AnalysisResult["rows"][number]) => {
    const head = r.rank ? `${r.rank}) ` : "";
    const ordered = core ? [core, ...cols.filter((c) => c.key !== core.key)] : cols;
    const parts = ordered.map((c) => colText(c, r));
    const lead = parts.find((p) => p.has) ?? parts[0];
    const rest = parts.filter((p, i) => p !== lead && (p.has || ordered[i] !== core)).map((p) => p.text);
    const note = r.excludedReason ? `[순위 제외: 조건 상이 — ${r.excludedReason}]` : "";
    const second = [rest.join(" · "), note].filter(Boolean).join(" ");
    return `${head}${r.label}${r.sub ? ` (${r.sub})` : ""} — ${lead ? lead.text : ""}${second ? `\n${second}` : ""}`;
  };
  const rows = result.rows.slice(0, MAX_ROW_LINES).map(rowLine);
  if (result.rows.length > MAX_ROW_LINES) rows.push(`그 밖 ${result.rows.length - MAX_ROW_LINES}건은 아래 ‘내보내기’(엑셀·CSV)에서 확인할 수 있습니다.`);
  const all: AnswerSection[] = [
    { id: "highlights", title: "핵심 지표", items: result.highlights.map((h) => `${h.label}: ${h.value}`) },
    { id: "rows", title: result.rankLabel ? `비교 결과 (${result.rankLabel})` : "비교 결과", items: rows },
    ...(result.detailSections ?? []),
    { id: "risks", title: "추가 검토가 필요한 위험 요소", items: result.risks.slice(0, 8) },
    { id: "review", title: "검토할 사항", items: result.reviewPoints },
    { id: "basis", title: "비교에 사용된 데이터와 평가 근거", items: [...result.basis, ...result.notes.map((n) => `참고: ${n}`)] },
  ];
  const out = all.filter((s) => s.items.length).map((s) => (FOLD(s.id) ? { ...s, fold: true } : s));
  const firstPc = out.find((s) => s.id.startsWith("pc-"));
  if (firstPc) firstPc.open = true;
  return out;
}

const UNITS = "개월|%p|%|원|점|건|곳|일|개|명|EA";
// 날짜·업체ID·품목코드·계약번호는 먼저 통째로 잡아 굵게 하지 않고, 그다음 ‘숫자+단위’만 굵게 한다
const EMPH = new RegExp(
  String.raw`(\d{4}[-.]\d{1,2}[-.]\d{1,2}|\d{4}년(?:\s?\d{1,2}월)?(?:\s?\d{1,2}일)?|\d{1,2}월(?:\s?\d{1,2}일)?|[A-Z]{2,}(?:-[A-Za-z0-9]+)+)|((?:USD\s?)?[+\-−]?\d[\d,]*(?:\.\d+)?(?:UNITS)|USD\s?\d[\d,]*(?:\.\d+)?)`.replace("UNITS", UNITS),
  "g",
);

/** 한 줄 글에서 ‘숫자+단위’ 토큰을 굵게 할 조각으로 나눈다(글자는 그대로, 한 줄에 최대 max개) */
export function emphasize(line: string, max = 3): { text: string; strong: boolean }[] {
  const out: { text: string; strong: boolean }[] = [];
  let last = 0;
  let n = 0;
  for (const m of line.matchAll(EMPH)) {
    if (m[2] === undefined) continue; // 날짜·ID: 굵게 하지 않음
    if (n >= max) break;
    const i = m.index as number;
    if (i > last) out.push({ text: line.slice(last, i), strong: false });
    out.push({ text: m[2], strong: true });
    last = i + m[2].length;
    n++;
  }
  if (last < line.length) out.push({ text: line.slice(last), strong: false });
  return out;
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

/** 답변 맨 위 ‘근거’ 블록의 내용 — 그 답변 계산에 실제로 쓴 문서·데이터 집합만 담는다(순수 함수, 새로 지어내지 않음) */
export interface AnswerBasis {
  docs: string[]; // 근거로 쓴(검색된) 문서. 없으면 빈 목록
  docNote?: string; // 문서가 없을 때의 사실 그대로의 이유
  data: string[]; // 계산에 쓴 데이터 집합 (예: ‘구매조달 발주 12건’)
  scope: string[]; // 사용한 조회 조건·필터 (예: ‘품목 실린더 라이너’)
  asOf: string;
  label: string; // 데이터 묶음 이름(SAMPLE 여부 포함)
  sample: boolean;
}

const metaPart = (meta: Pick<DataMeta, "asOf" | "label" | "isSample">) => ({ asOf: meta.asOf, label: meta.label, sample: meta.isSample });

/** 분석 답변(후보 비교·단가 상승·납기 저조 등): result.sources 의 데이터 집합(건수) + 상세 문단이 쓴 참고 지표 + 사유 문서 */
export function analysisBasis(r: AnalysisResult): AnswerBasis {
  const used = r.sources.filter((s) => s.ids.length);
  const listed = (used.length ? used : r.sources).map((s) => `${s.label} ${s.ids.length}건`);
  const have = new Set(r.sources.map((s) => s.label));
  const extra = (r.extraDatasets ?? []).map((k) => DATASET_LABEL[k]).filter((l) => !have.has(l));
  const docs = r.docRefs ?? [];
  return {
    docs,
    docNote: docs.length ? undefined : "없음(등록 데이터만 사용)",
    data: [...listed, ...extra],
    scope: r.scope.filter((s) => s.label !== "기준일").map((s) => `${s.label} ${s.value}`),
    asOf: r.asOf,
    label: r.dataLabel,
    sample: r.dataLabel.includes("SAMPLE"),
  };
}

/** 문서 검색 답변: 실제 검색에서 나온 문서(1순위 + 비슷한 문서)만. 못 찾았으면 ‘없음’이라고 그대로 적는다 */
export function docSearchBasis(r: DocSearchResult, meta: Pick<DataMeta, "asOf" | "label" | "isSample">): AnswerBasis {
  const docs = r.found && r.best ? [`${r.best.doc.title} (${r.best.doc.id})`, ...r.similar.map((h) => `${h.doc.title} (${h.doc.id})`)] : [];
  return {
    docs,
    docNote: docs.length ? undefined : "없음(관련 문서를 찾지 못함)",
    data: [`등록 문서 ${SAMPLE_DOCS.length}건 의미 검색`],
    scope: [],
    ...metaPart(meta),
  };
}

/** 분석·문서 검색 없이 안내만 한 답변(도움말·대상 못 찾음 등): 쓴 데이터가 없다는 사실을 그대로 적는다 */
export function noDataBasis(meta: Pick<DataMeta, "asOf" | "label" | "isSample">): AnswerBasis {
  return { docs: [], docNote: "없음(등록 데이터만 사용)", data: [], scope: [], ...metaPart(meta) };
}

/** 근거 블록의 화면 문구: [문서 줄, 데이터 줄, (있으면) 조회 조건 줄] */
export function basisLines(b: AnswerBasis): { docs: string; data: string; scope?: string } {
  return {
    docs: `문서 ${b.docs.length ? b.docs.join(", ") : b.docNote ?? "없음"}`,
    data: `데이터 ${b.data.length ? b.data.join(" · ") : "없음"}(기준일 ${b.asOf} · ${b.label}${b.sample ? " · 실제 자료 아님" : ""})`,
    scope: b.scope.length ? `조회 조건 ${b.scope.join(" · ")}` : undefined,
  };
}
