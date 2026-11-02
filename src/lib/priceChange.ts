// 원가-계약 변동률 상세: 계산은 모두 이 순수 함수가 한다. 변동률 팝업(PriceChangePop)과 AI 에이전트 답변(analysis.ts)이 같은 결과를 쓴다.
//  단가 증감액 = 현재 확정단가 − 이전 확정단가 / 단가 변동률 = 증감액 ÷ 이전 확정단가 × 100
//  원자재·인건비 변동률 = (비교시점 − 기준시점) ÷ 기준시점 × 100 (같은 비교기간으로 맞추고, 못 맞추면 실제 쓴 기간을 각각 표시)
//  설명은 ① 확인된 사유(사유가 적힌 문서가 있을 때만)와 ② 관련 동향(참고 지표)을 구분하고, 함께 움직였다는 사실만으로 원인을 단정하지 않는다.
//  원가 구성비 자료가 없어 요인별 기여도는 계산하지 않는다. 자료가 없으면 지어내지 않고 '연결된 자료 없음'.
import type { Contract, FxRate, Item, LaborWage, MaterialPrice, Supplier } from "../data/types";
import { fmtMoney, fmtNum, fmtSignedPct, round } from "./format";
import { buildWageTree, fxIndex, jobsForProcess, toKrwPerKg } from "./market";

export const NO_DATA = "연결된 자료 없음";
export const NO_REASON = "직접적인 단가 조정 사유는 미확인";
export const NO_CONTRIB = "원가 구성비 자료가 없어 요인별 기여도는 계산하지 않았습니다.";
export const CORRELATION_NOTE = "함께 움직였다는 사실만으로 단가 변동의 원인이라고 볼 수 없습니다.";

/** 단가 조정 사유가 적힌 문서(단가 조정 요청서·계약 문서). priceReason 이 있는 문서만 '확인된 사유'가 된다 */
export interface PriceDoc {
  id: string;
  title: string;
  date: string;
  type: string;
  supplier: string; // 협력업체 이름
  item: string; // 품목 이름
  priceReason?: string; // 문서에 명시된 인상·인하 사유
  priceDirection?: "인상" | "인하";
}

export interface PriceChangeCtx {
  asOf: string;
  items: Item[];
  suppliers: Supplier[];
  contracts: Contract[];
  materialPrices: MaterialPrice[];
  fxRates: FxRate[];
  laborWages: LaborWage[];
  docs: PriceDoc[];
  isSample: boolean;
}

export const pctChange = (from: number | null | undefined, to: number | null | undefined) =>
  from === null || from === undefined || to === null || to === undefined || !Number.isFinite(from) || !Number.isFinite(to) || from === 0 ? null : round(((to - from) / from) * 100, 1);

export interface RateRow {
  baseMonth: string;
  compMonth: string;
  base: number | null;
  comp: number | null;
  rate: number | null;
  unit: string;
}
export interface MaterialIndicator {
  material: string;
  domestic: RateRow | null; // 국내 시세(원/kg)
  intl: RateRow | null; // 국제 시세(원/kg로 환산)
}
export interface JobIndicator {
  job: string;
  row: RateRow | null;
}

export interface PriceChangeExplain {
  contractId: string;
  itemCode: string;
  itemName: string;
  supplierName: string;
  currency: string;
  asOf: string;
  isSample: boolean;
  status: "ok" | "no-prev" | "quote";
  whyNot: string | null; // 변동률을 계산하지 않은 이유
  prev: number | null;
  curr: number;
  delta: number | null;
  rate: number | null;
  priceBasis: string; // 단가 비교기간·이전 단가 출처
  period: { baseMonth: string; compMonth: string; label: string; basis: string; mixed: boolean }; // 참고 지표의 비교기간
  materials: MaterialIndicator[];
  materialNote: string | null; // 연결된 자료가 없을 때 이유
  jobs: JobIndicator[];
  jobBasis: string; // 어떤 근거로 직종을 연결했는지
  jobNote: string | null;
  fx: (RateRow & { currency: string }) | null; // 외화 계약: 환율 변동(계약통화 단가 변동과 구분)
  confirmedReasons: { docId: string; title: string; date: string; text: string; direction?: string }[];
  relatedDocs: { docId: string; title: string; date: string; type: string }[];
  reasonLine: string; // '직접적인 단가 조정 사유는 미확인' 또는 확인된 사유 건수
  caveats: string[]; // 직접 비교하기 어려운 사유
  interpretation: string[]; // 참고 해석
  sources: string[];
}

const SRC_NONE = "출처 표기 없음";
const monthOf = (d: string | null | undefined) => (d ? d.slice(0, 7) : null);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** 기준월은 그대로, 비교월은 '그 지표에 값이 있는 가장 최근 달(비교월 이하)' — 지표마다 자료 끝이 다르면 실제 쓴 기간이 각각 달라진다 */
function rateRow(series: Map<string, number | null>, baseMonth: string, compMonth: string, unit: string): RateRow {
  const last = [...series].filter(([m, v]) => v !== null && m <= compMonth).map(([m]) => m).sort().pop() ?? compMonth;
  const base = series.get(baseMonth) ?? null;
  const comp = series.get(last) ?? null;
  return { baseMonth, compMonth: last, base, comp, rate: pctChange(base, comp), unit };
}

export function explainPriceChange(c: Contract & { itemName?: string; supplierName?: string }, ctx: PriceChangeCtx): PriceChangeExplain {
  const item = ctx.items.find((i) => i.itemCode === c.itemCode);
  const sup = ctx.suppliers.find((s) => s.supplierId === c.supplierId);
  const itemName = c.itemName ?? item?.name ?? c.itemCode;
  const supplierName = c.supplierName ?? sup?.name ?? c.supplierId;
  const prevC = c.prevContractId ? ctx.contracts.find((x) => x.contractId === c.prevContractId) : undefined;

  // ── 단가 ──
  const quote = c.docType === "견적";
  const prev = c.prevUnitPrice ?? null;
  let status: PriceChangeExplain["status"] = "ok";
  let whyNot: string | null = null;
  if (quote) {
    status = "quote";
    whyNot = "견적 단가는 확정된 계약이 아니라서 변동률을 계산하지 않습니다.";
  } else if (!prev) {
    status = "no-prev";
    whyNot = prev === 0 ? "이전 확정단가가 0이라 변동률을 계산하지 않습니다." : "이전 확정단가가 없어 변동률을 계산하지 않습니다.";
  }
  const delta = status === "ok" ? c.unitPrice - (prev as number) : null;
  const rate = status === "ok" ? pctChange(prev, c.unitPrice) : null;
  const priceBasis = prevC
    ? `이전 확정단가 = 계약 ${prevC.contractId} (${prevC.startDate ?? "–"} ~ ${prevC.endDate ?? "–"}), 현재 = 계약 ${c.contractId} (${c.startDate ?? "–"} ~ ${c.endDate ?? "–"})`
    : `이전 확정단가의 적용 기간은 자료에 기록되어 있지 않습니다. 현재 확정단가 = 계약 ${c.contractId} (${c.startDate ?? "–"} ~ ${c.endDate ?? "–"})`;

  // ── 참고 지표의 비교기간: 기준 = (이전 계약 시작월 또는 현재 계약 시작월), 비교 = 기준일 이전의 가장 최근 자료월 ──
  const asOfMonth = ctx.asOf.slice(0, 7);
  const allMonths = [...ctx.materialPrices.map((m) => m.month), ...ctx.laborWages.map((w) => w.month)].filter((m) => m <= asOfMonth).sort();
  const compMonth = allMonths[allMonths.length - 1] ?? asOfMonth;
  const baseMonth = monthOf(prevC?.startDate) ?? monthOf(c.startDate) ?? compMonth;
  const periodBasis = prevC ? "이전 확정 계약 시작월 → 가장 최근 자료월" : "현재 계약 시작월 → 가장 최근 자료월 (이전 단가의 적용 시점이 자료에 없어 현재 계약 기준으로 맞춤)";

  // ── 원자재: 품목 마스터의 주요 소재와 연결 (품목에 소재가 없으면 연결하지 않는다) ──
  const fx = fxIndex(ctx.fxRates);
  const mats = item?.materials ?? [];
  const materials: MaterialIndicator[] = mats.map((m) => {
    const rows = ctx.materialPrices.filter((p) => p.material === m);
    const dom = new Map<string, number | null>();
    const intl = new Map<string, number | null>();
    for (const r of rows) {
      const v = toKrwPerKg(r, fx);
      (r.market === "국내" ? dom : intl).set(r.month, v === null ? null : round(v, 0));
    }
    return { material: m, domestic: dom.size ? rateRow(dom, baseMonth, compMonth, "원/kg") : null, intl: intl.size ? rateRow(intl, baseMonth, compMonth, "원/kg 환산") : null };
  });
  const materialNote = !mats.length ? `품목 마스터에 주요 소재가 없어 ${NO_DATA}` : materials.every((m) => !m.domestic && !m.intl) ? `주요 소재(${mats.join("·")})의 시세 ${NO_DATA}` : null;

  // ── 인건비: 계약 협력업체의 공정 → 직종 연결표(SAMPLE, market.ts PROCESS_TO_JOBS) ──
  const jobNames = jobsForProcess(sup?.process);
  const tree = buildWageTree(ctx.laborWages);
  const jobs: JobIndicator[] = jobNames.map((j) => {
    const node = tree.byMinor.get(j);
    if (!node) return { job: j, row: null };
    const s = new Map(tree.months.map((m, i) => [m, node.series[i]] as [string, number | null]));
    return { job: j, row: rateRow(s, baseMonth, compMonth, "원/월") };
  });
  const jobBasis = sup?.process ? `협력업체 공정 ‘${sup.process}’ → 직종 연결표(프로젝트용 SAMPLE 매핑, 공정 이름의 낱말 기준)` : "협력업체 공정 정보 없음";
  const jobNote = !jobNames.length ? `협력업체 공정(${sup?.process ?? "미기재"})에 연결된 직종 ${NO_DATA}` : jobs.every((j) => !j.row) ? `연결된 직종의 임금 ${NO_DATA}` : null;

  // ── 외화: 계약통화 기준 단가 변동과 환율 변동을 구분 ──
  let fxRow: PriceChangeExplain["fx"] = null;
  if (c.currency !== "KRW") {
    const s = new Map(ctx.fxRates.filter((f) => f.currency.toUpperCase() === c.currency.toUpperCase()).map((f) => [f.month, f.krw] as [string, number | null]));
    if (s.size) fxRow = { ...rateRow(s, baseMonth, compMonth, `원/${c.currency}`), currency: c.currency };
  }

  // ── 사유: 확인된 사유(사유가 적힌 문서) / 관련 문서(사유 명시 없음) ──
  const mine = ctx.docs.filter((d) => d.supplier === supplierName && d.item === itemName);
  const confirmedReasons = mine.filter((d) => d.priceReason).map((d) => ({ docId: d.id, title: d.title, date: d.date, text: d.priceReason as string, direction: d.priceDirection }));
  const relatedDocs = mine.filter((d) => !d.priceReason && (d.type === "계약서" || d.type === "견적서")).map((d) => ({ docId: d.id, title: d.title, date: d.date, type: d.type }));
  const reasonLine = confirmedReasons.length ? `확인된 사유 ${confirmedReasons.length}건 (문서 근거 있음)` : NO_REASON;

  // ── 직접 비교가 어려운 사유 ──
  const caveats: string[] = [];
  if (prevC) {
    if (prevC.spec && c.spec && prevC.spec !== c.spec) caveats.push(`이전 확정 계약(${prevC.contractId})과 규격이 달라 단가를 직접 비교하기 어렵습니다 (${prevC.spec} → ${c.spec}).`);
    if (prevC.deliveryTerms && c.deliveryTerms && prevC.deliveryTerms !== c.deliveryTerms) caveats.push(`이전 확정 계약과 인도조건이 달라 직접 비교하기 어렵습니다 (${prevC.deliveryTerms} → ${c.deliveryTerms}).`);
  } else if (status === "ok") caveats.push("이전 확정단가의 규격·수량 단위·인도조건은 자료에 기록이 없어, 현재 계약과 같은 조건이라고 보고 비교한 값입니다.");
  if (item?.spec && c.spec && item.spec !== c.spec) caveats.push(`계약 규격이 품목 마스터 규격과 달라 직접 비교하기 어렵습니다 (${item.spec} / ${c.spec}).`);
  if (c.currency !== "KRW") caveats.push(`${c.currency} 계약입니다. 단가 변동은 계약통화(${c.currency}) 기준이며, 환율 변동은 별도 지표입니다. 원화 환산 단가 변동은 두 값을 합친 것이라 따로 계산하지 않았습니다.`);
  const periods = uniq([...materials.flatMap((m) => [m.domestic, m.intl]), ...jobs.map((j) => j.row), fxRow].filter((r): r is RateRow => !!r).map((r) => `${r.baseMonth} → ${r.compMonth}`));
  const mixed = periods.length > 1;

  // ── 참고 해석(숫자는 위에서 계산한 값만 사용) ──
  const interpretation: string[] = [];
  const sum = (label: string, rs: (number | null)[]) => {
    const known = rs.filter((x): x is number => x !== null);
    if (!known.length) return;
    const up = known.filter((x) => x > 0).length;
    const down = known.filter((x) => x < 0).length;
    interpretation.push(`${label} ${known.length}개 중 상승 ${up} · 하락 ${down} · 보합 ${known.length - up - down}`);
  };
  sum("관련 원자재(국내 시세)", materials.map((m) => m.domestic?.rate ?? null));
  sum("관련 직종 인건비", jobs.map((j) => j.row?.rate ?? null));
  interpretation.push(`${confirmedReasons.length ? "확인된 사유는 문서에 적힌 내용이며, 아래 지표는 참고 동향입니다." : "위 지표는 참고 동향입니다."} ${CORRELATION_NOTE}`);
  interpretation.push(NO_CONTRIB);

  const sources = uniq([
    `계약 단가: ${c.source === "manual" ? "수기 입력" : "원가-계약 자료"}`,
    ...ctx.materialPrices.filter((p) => mats.includes(p.material)).map((p) => `원자재 시세: ${p.source ?? SRC_NONE}`),
    ...ctx.laborWages.filter((w) => jobNames.includes(w.minor)).map((w) => `인건비: ${w.source ?? SRC_NONE}`),
    ...(fxRow ? ctx.fxRates.filter((f) => f.currency.toUpperCase() === c.currency.toUpperCase()).map((f) => `환율: ${f.source ?? SRC_NONE}`) : []),
    ...confirmedReasons.map((r) => `사유 문서: ${r.docId}`),
  ]);

  return {
    contractId: c.contractId,
    itemCode: c.itemCode,
    itemName,
    supplierName,
    currency: c.currency,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    status,
    whyNot,
    prev,
    curr: c.unitPrice,
    delta,
    rate,
    priceBasis,
    period: { baseMonth, compMonth, label: mixed ? `지표별로 다름 (${periods.join(" / ")})` : `${baseMonth} → ${compMonth}`, basis: periodBasis, mixed },
    materials,
    materialNote,
    jobs,
    jobBasis,
    jobNote,
    fx: fxRow,
    confirmedReasons,
    relatedDocs,
    reasonLine,
    caveats,
    interpretation,
    sources,
  };
}

/** 지표 한 줄 문구(팝업·AI 답변 공통) */
export const rateText = (r: RateRow | null) => (r ? (r.rate === null ? `${NO_DATA} (${r.baseMonth} 또는 ${r.compMonth} 값 없음)` : `${fmtSignedPct(r.rate)} (${fmtNum(r.base, 0)} → ${fmtNum(r.comp, 0)} ${r.unit}, ${r.baseMonth} → ${r.compMonth})`) : NO_DATA);

export const signedMoney = (n: number, currency: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtMoney(Math.abs(n), currency)}`;

/** AI 에이전트 답변용 문장들 — 팝업과 같은 계산 결과·비교기간·출처를 글로 옮긴 것(숫자를 새로 계산하지 않는다) */
export function priceChangeLines(e: PriceChangeExplain): string[] {
  const out: string[] = [];
  if (e.status === "ok") out.push(`단가: ${fmtMoney(e.prev, e.currency)} → ${fmtMoney(e.curr, e.currency)} (증감 ${signedMoney(e.delta as number, e.currency)}, 변동률 ${fmtSignedPct(e.rate)})`);
  else out.push(`단가 ${fmtMoney(e.curr, e.currency)} — ${e.whyNot}`);
  out.push(`비교기간: ${e.priceBasis}`);
  out.push(`참고 지표 비교기간: ${e.period.label}${e.period.mixed ? "" : ` (${e.period.basis})`}`);
  if (e.materials.length) out.push(`관련 원자재 시세: ${e.materials.map((m) => `${m.material} 국내 ${m.domestic ? (m.domestic.rate === null ? NO_DATA : fmtSignedPct(m.domestic.rate)) : NO_DATA}, 국제(원화 환산) ${m.intl ? (m.intl.rate === null ? NO_DATA : fmtSignedPct(m.intl.rate)) : NO_DATA}`).join(" · ")}`);
  else out.push(`관련 원자재 시세: ${e.materialNote}`);
  if (e.jobs.length) out.push(`관련 직종 인건비: ${e.jobs.map((j) => `${j.job} ${j.row ? (j.row.rate === null ? NO_DATA : fmtSignedPct(j.row.rate)) : NO_DATA}`).join(" · ")} (${e.jobBasis})`);
  else out.push(`관련 직종 인건비: ${e.jobNote}`);
  if (e.fx) out.push(`환율(${e.fx.unit}) 변동: ${rateText(e.fx)} — 계약통화(${e.currency}) 기준 단가 변동과 별개의 지표`);
  out.push(e.confirmedReasons.length ? `확인된 사유: ${e.confirmedReasons.map((r) => `${r.text} (${r.docId})`).join("; ")}` : e.reasonLine);
  for (const cv of e.caveats) out.push(`비교 시 유의: ${cv}`);
  out.push(...e.interpretation.slice(-2));
  out.push(`자료 기준일 ${e.asOf} · ${e.sources.join(" · ")}${e.isSample ? " (SAMPLE · 실제 자료 아님)" : ""}`);
  return out;
}
