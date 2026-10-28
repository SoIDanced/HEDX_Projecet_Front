// 문서 "의미 검색" 시연 — 벡터DB 검색처럼 보이지만 코드로만 계산하는 결정적(deterministic) 점수 함수다.
// (규칙 2: LLM은 쓰지 않는다. 임베딩·벡터DB는 없다. 실제 벡터DB 검색은 나중에 백엔드가 맡는다.)
// 점수 = 질문에서 뽑은 조건(품목·문서 종류·날짜·업체·키워드) 중 질문에 실제로 있는 것만 가중 평균.
//   품목 .30 · 날짜 .25 · 문서 종류 .20 · 키워드(동의어 묶음) .15 · 업체 .10
//   질문에 적은 문서 종류·날짜·업체·품목이 문서와 다르면 항목마다 점수 ×0.6 (다른 문서를 원본이라고 내놓지 않게).
import { SAMPLE_DOCS, type DocType, type SampleDoc } from "../data/sample/documents";

export const MIN_SCORE = 0.5; // 이보다 낮으면 "찾지 못했습니다"
export const CLOSE_GAP = 0.08; // 1등과 이 차이 이내면 "비슷한 문서"로 함께 알림

export interface DocHit {
  doc: SampleDoc;
  score: number;
}
export interface DocSearchResult {
  found: boolean;
  best: DocHit | null; // 점수가 기준 미만이어도 최고 점수는 알려 준다
  similar: DocHit[];
  threshold: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 같은 뜻으로 묶는 말 (스크래치≈긁힘≈흠집, 민원≈클레임≈불만, 납기≈지연 …) */
const SYN: string[][] = [
  ["스크래치", "스크레치", "긁힘", "긁힌", "긁혔", "흠집", "상처"],
  ["민원", "클레임", "불만"],
  ["납기", "지연", "지체", "늦"],
  ["견적", "견적서"],
  ["검사", "성적서", "시험"],
  ["계약", "계약서"],
];
const groupOf = (tok: string) => SYN.find((g) => g.some((m) => tok.includes(m)));

const PARTICLES = ["에서", "으로", "에게", "까지", "부터", "이랑", "에는", "의", "를", "을", "은", "는", "이", "가", "에", "로", "와", "과", "도", "자", "만"];
const STOP = /^(찾|검색|조회|보여|알려|열어|확인|문서|자료|내용|원본|관련|해당|있|좀|줘|주세요|업체|협력사|공급사|품목|민원|클레임|불만|견적서|견적|계약서|성적서|보고서|검사)/;

export function stripParticle(tok: string): string {
  for (const p of PARTICLES) if (tok.length > p.length + 1 && tok.endsWith(p)) return tok.slice(0, -p.length);
  return tok;
}

export interface QueryDate {
  year: number;
  month: number;
  day: number | null;
}

/** '2026년 9월 18일자' · '2026-09-18' · '2026.9.18' · '9월 18일' · '9/18' · '9월' */
export function extractDate(text: string, asOf: string): { date: QueryDate | null; rest: string } {
  const y0 = Number(asOf.slice(0, 4));
  const pats: [RegExp, (m: RegExpMatchArray) => QueryDate][] = [
    [/(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/, (m) => ({ year: +m[1], month: +m[2], day: +m[3] })],
    [/(\d{4})\s*년\s*(\d{1,2})\s*월/, (m) => ({ year: +m[1], month: +m[2], day: null })],
    [/(\d{1,2})\s*월\s*(\d{1,2})\s*일/, (m) => ({ year: y0, month: +m[1], day: +m[2] })],
    [/(?<![\d.])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/, (m) => ({ year: y0, month: +m[1], day: +m[2] })],
    [/(\d{1,2})\s*월/, (m) => ({ year: y0, month: +m[1], day: null })],
  ];
  for (const [re, f] of pats) {
    const m = text.match(re);
    if (m) {
      const d = f(m);
      if (d.month >= 1 && d.month <= 12 && (d.day === null || (d.day >= 1 && d.day <= 31))) return { date: d, rest: text.replace(m[0], " 일자 ") };
    }
  }
  return { date: null, rest: text };
}

export function extractType(text: string): DocType | null {
  if (/(민원|클레임|불만)/.test(text)) return "민원";
  if (/견적/.test(text)) return "견적서";
  if (/계약서/.test(text)) return "계약서";
  if (/(성적서|검사)/.test(text)) return "검사성적서";
  if (/(납기|지연)?\s*보고서/.test(text)) return "납기보고서";
  return null;
}

const ITEM_NAMES = [...new Set(SAMPLE_DOCS.map((d) => d.item))];
const ITEM_TOKENS = new Set(ITEM_NAMES.flatMap((n) => [norm(n), ...n.split(/\s+/).map(norm)]));
const tokenCount = (t: string) => ITEM_NAMES.filter((n) => n.split(/\s+/).map(norm).includes(t)).length;

/** 품목 이름이 질문에 공백 유무와 상관없이 들어 있으면 1, 고유한 낱말만 있으면 .8, 여러 품목이 나눠 쓰는 낱말(예: 실린더)이면 .4 */
function itemScore(item: string, q: string): number {
  if (q.includes(norm(item))) return 1;
  let best = 0;
  for (const t of item.split(/\s+/).map(norm)) {
    if (t.length < 3 || !q.includes(t)) continue;
    best = Math.max(best, tokenCount(t) === 1 ? 0.8 : 0.4);
  }
  return best;
}

function supplierLetter(q: string): string | null {
  return q.match(/업체([a-z])(?![a-z])/)?.[1] ?? q.match(/(?<![a-z])([a-z])(?:업체|사)(?![a-z])/)?.[1] ?? null;
}

function keywords(rest: string): string[] {
  const out: string[] = [];
  for (const raw of rest.split(/[^0-9A-Za-z가-힣]+/)) {
    const tok = stripParticle(raw.toLowerCase());
    if (tok.length < 2 || /^\d+$/.test(tok) || tok === "일자" || STOP.test(tok) || ITEM_TOKENS.has(tok) || /^[a-z]$/.test(tok)) continue;
    out.push(tok);
  }
  return out;
}

function dateScore(d: QueryDate, doc: string): number {
  const [y, m, day] = doc.split("-").map(Number);
  if (d.year !== y || d.month !== m) return 0;
  return d.day === null || d.day === day ? 1 : 0.2;
}

export function scoreDoc(query: string, doc: SampleDoc, asOf: string): number {
  const { date, rest } = extractDate(query, asOf);
  const q = norm(rest);
  const type = extractType(query);
  const letter = supplierLetter(q);
  const kws = keywords(rest);
  const hay = norm([doc.title, doc.body, doc.type, doc.item, doc.supplier, ...doc.tags].join(" "));

  const parts: [number, number][] = []; // [가중치, 점수]
  if (ITEM_NAMES.some((n) => itemScore(n, q) > 0)) parts.push([0.3, itemScore(doc.item, q)]);
  if (date) parts.push([0.25, dateScore(date, doc.date)]);
  if (type) parts.push([0.2, type === doc.type ? 1 : 0]);
  if (kws.length) {
    const hit = kws.filter((k) => {
      const g = groupOf(k);
      return g ? g.some((m) => hay.includes(m)) : hay.includes(norm(k));
    }).length;
    parts.push([0.15, hit / kws.length]);
  }
  if (letter) parts.push([0.1, norm(doc.supplier) === `업체${letter}` ? 1 : 0]);
  if (!parts.length) return 0;

  let s = parts.reduce((a, [w, v]) => a + w * v, 0) / parts.reduce((a, [w]) => a + w, 0);
  // 질문에 적은 문서 종류·날짜·업체·품목이 문서와 다르면 감점
  const mismatch = [type && type !== doc.type, date && dateScore(date, doc.date) < 1, letter && norm(doc.supplier) !== `업체${letter}`, parts.some(([w, v]) => w === 0.3 && v === 0)].filter(Boolean).length;
  s *= 0.6 ** mismatch;
  return Math.round(s * 100) / 100;
}

export function searchDocuments(query: string, asOf: string, docs: SampleDoc[] = SAMPLE_DOCS): DocSearchResult {
  const ranked = docs
    .map((doc) => ({ doc, score: scoreDoc(query, doc, asOf) }))
    .sort((a, b) => b.score - a.score || b.doc.date.localeCompare(a.doc.date) || a.doc.id.localeCompare(b.doc.id));
  const best = ranked[0] && ranked[0].score > 0 ? ranked[0] : null;
  if (!best || best.score < MIN_SCORE) return { found: false, best, similar: [], threshold: MIN_SCORE };
  const similar = ranked.slice(1).filter((h) => h.score >= MIN_SCORE && best.score - h.score <= CLOSE_GAP);
  return { found: true, best, similar, threshold: MIN_SCORE };
}
