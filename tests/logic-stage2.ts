// v0.9 좌측 데이터 관리 2단계 로직 검사: npx tsx tests/logic-stage2.ts
// 변동률 상세(priceChange) · 납기 팝업(delivery) · 입고 기록(receipts) · 적정재고 고정(stockPolicy) · 수기 계약서의 이전 확정단가
import { loadSample } from "../src/data/sampleData";
import { SAMPLE_DOCS } from "../src/data/sample/documents";
import { derive } from "../src/lib/metrics";
import { runAnalysis } from "../src/lib/analysis";
import { answerSections } from "../src/lib/answerText";
import { deliveryLines } from "../src/lib/delivery";
import { buildEntry, emptyForm, mergeManual, syncAmount, validateManual, type ManualForm } from "../src/lib/manual";
import { NO_DATA, NO_REASON, explainPriceChange, pctChange, priceChangeLines, splitCommonLines, type PriceChangeCtx } from "../src/lib/priceChange";
import { mergeReceipts, sanitizeReceipts, upsertReceipt, validateReceipt } from "../src/lib/receipts";
import { NO_PLANS, applyStockPolicy, lockStock, shortageOf, unlockStock, validateStockQty } from "../src/lib/stockPolicy";
import type { Receipt } from "../src/data/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const { data, meta } = loadSample();
const d = derive(data, meta.asOf);
const pcx = (over: Partial<PriceChangeCtx> = {}): PriceChangeCtx => ({ asOf: meta.asOf, items: data.items, suppliers: data.suppliers, contracts: data.contracts, materialPrices: data.materialPrices, fxRates: data.fxRates, laborWages: data.laborWages, docs: SAMPLE_DOCS, isSample: true, ...over });
const cv = (id: string) => d.contractViews.find((c) => c.contractId === id)!;

// ── (4) 변동률 상세: 계산식 ──
check("변동률 = 증감액 ÷ 이전 × 100 (소수 1자리)", pctChange(100, 110) === 10 && pctChange(1210000, 1250000) === 3.3 && pctChange(200, 150) === -25);
check("이전 값이 없거나 0이면 계산 안 함(null)", pctChange(0, 5) === null && pctChange(null, 5) === null && pctChange(5, null) === null);
const e1 = explainPriceChange(cv("CT-2026-001"), pcx());
check("상승: 증감액 = 현재 − 이전, 변동률은 표(metrics.changeRate)와 같은 값", e1.status === "ok" && e1.delta === 40000 && e1.rate === 3.3 && e1.rate === cv("CT-2026-001").changeRate, JSON.stringify([e1.delta, e1.rate]));
const eAll = d.contractViews.filter((c) => c.docType !== "견적").map((c) => [c, explainPriceChange(c, pcx())] as const);
check("모든 샘플 계약에서 팝업 변동률 = 표 변동률 (상승·하락 모두)", eAll.every(([c, e]) => e.rate === c.changeRate));
const down = explainPriceChange({ ...cv("CT-2026-001"), unitPrice: 1000000, prevUnitPrice: 1250000, changeRate: null } as never, pcx());
check("하락도 지원: 증감액 음수·변동률 −20%", down.delta === -250000 && down.rate === -20);
const none = explainPriceChange({ ...cv("CT-2026-001"), prevUnitPrice: null } as never, pcx());
const zero = explainPriceChange({ ...cv("CT-2026-001"), prevUnitPrice: 0 } as never, pcx());
check("이전 단가가 없음/0이면 변동률·증감액을 계산하지 않고 사유 표시", none.rate === null && none.delta === null && !!none.whyNot && zero.rate === null && zero.delta === null && !!zero.whyNot);
const quote = explainPriceChange({ ...cv("CT-2026-001"), docType: "견적" } as never, pcx());
check("견적 단가는 변동률 계산 대상이 아님(확정단가와 구분)", quote.status === "quote" && quote.rate === null);

// 원자재·인건비 연결
const lin = d.itemsByCode.get("ITM-1001")!;
check("원자재 = 품목 마스터의 주요 소재에만 연결(선철·철스크랩·몰리브덴)", JSON.stringify(e1.materials.map((m) => m.material)) === JSON.stringify(lin.materials));
check("관련 없는 원자재(니켈 등)는 연결하지 않음", !e1.materials.some((m) => m.material === "니켈"));
check("인건비 = 협력업체 공정(주조)→직종 연결표(주조원)만, 근거 문구 포함", JSON.stringify(e1.jobs.map((j) => j.job)) === '["주조원"]' && e1.jobBasis.includes("SAMPLE"), e1.jobBasis);
check("비교기간: 현재 계약 시작월(2026-01) → 기준일 이전 최근 자료월(2026-09), 모든 지표 같은 기간", e1.period.baseMonth === "2026-01" && e1.period.compMonth === "2026-09" && !e1.period.mixed && e1.materials.every((m) => !m.domestic || (m.domestic.baseMonth === "2026-01" && m.domestic.compMonth === "2026-09")));
const iron = data.materialPrices.filter((p) => p.material === "선철" && p.market === "국내");
const base = iron.find((p) => p.month === "2026-01")!.price;
const comp = iron.find((p) => p.month === "2026-09")!.price;
check("원자재 변동률 = (비교시점 − 기준시점) ÷ 기준시점 × 100 (선철 국내)", e1.materials[0].domestic?.rate === pctChange(base, comp) && e1.materials[0].domestic?.base === base, `${base} → ${comp}`);
// 연결 자료가 없을 때
const noMat = explainPriceChange(cv("CT-2026-001"), pcx({ materialPrices: [] }));
check("원자재 시세가 없으면 지어내지 않고 ‘연결된 자료 없음’", noMat.materials.every((m) => !m.domestic && !m.intl) && !!noMat.materialNote?.includes(NO_DATA) && priceChangeLines(noMat).some((l) => l.includes(NO_DATA)));
const noItemMat = explainPriceChange(cv("CT-2026-001"), pcx({ items: data.items.map((i) => (i.itemCode === "ITM-1001" ? { ...i, materials: [] } : i)) }));
check("품목에 주요 소재가 없으면 원자재를 임의로 붙이지 않음", noItemMat.materials.length === 0 && !!noItemMat.materialNote?.includes(NO_DATA));
const noJob = explainPriceChange(cv("CT-2026-001"), pcx({ suppliers: data.suppliers.map((s) => (s.supplierId === "SUP-001" ? { ...s, process: "" } : s)) }));
check("공정을 알 수 없으면 직종을 임의로 붙이지 않음", noJob.jobs.length === 0 && !!noJob.jobNote?.includes(NO_DATA));
// 사유
check("현재 자료에는 사유가 적힌 문서가 없어 ‘직접적인 단가 조정 사유는 미확인’", e1.confirmedReasons.length === 0 && e1.reasonLine === NO_REASON && priceChangeLines(e1).includes(NO_REASON));
const withDoc = explainPriceChange(cv("CT-2026-001"), pcx({ docs: [{ id: "DOC-X", title: "단가 조정 요청서", date: "2026-03-01", type: "계약서", supplier: "업체 A", item: "실린더 라이너", priceReason: "특수주철 원료비 인상분 반영 요청", priceDirection: "인상" }] }));
check("사유가 명시된 문서가 있으면 ‘확인된 사유’로 문서 ID와 함께 표시", withDoc.confirmedReasons.length === 1 && withDoc.confirmedReasons[0].docId === "DOC-X" && priceChangeLines(withDoc).some((l) => l.startsWith("확인된 사유") && l.includes("DOC-X")));
check("다른 업체·품목의 문서는 연결하지 않음", explainPriceChange(cv("CT-2026-002"), pcx({ docs: [{ id: "DOC-X", title: "t", date: "2026-03-01", type: "계약서", supplier: "업체 A", item: "실린더 라이너", priceReason: "x" }] })).confirmedReasons.length === 0);
check("원인 단정 금지·기여도 미계산 문구가 항상 포함", e1.interpretation.some((t) => t.includes("원인이라고 볼 수 없습니다")) && e1.interpretation.some((t) => t.includes("기여도는 계산하지 않았습니다")));
// 외화
// 샘플에서 USD 계약(CT-2026-004)을 뺐으므로 외화 처리 코드 경로는 합성 입력(실린더 라이너 업체 D USD 880→905)으로 검사한다
const usdCt = { ...cv("CT-2026-001"), contractId: "CT-SYN-USD", currency: "USD", prevUnitPrice: 880, unitPrice: 905, changeRate: pctChange(880, 905) } as ReturnType<typeof cv>;
const usd = explainPriceChange(usdCt, pcx());
const fxs = data.fxRates.filter((f) => f.currency === "USD");
check("외화(USD): 계약통화 기준 단가 변동과 환율 변동을 구분해 표시", usd.currency === "USD" && usd.rate === usdCt.changeRate && usd.fx?.rate === pctChange(fxs.find((f) => f.month === "2026-01")!.krw, fxs.find((f) => f.month === "2026-09")!.krw) && usd.caveats.some((t) => t.includes("계약통화(USD)")), JSON.stringify(usd.fx));
check("원화 계약에는 환율 지표 없음", e1.fx === null);
// 비교 어려움
const specDiff = explainPriceChange({ ...cv("CT-2026-001"), spec: "다른 규격" } as never, pcx());
check("규격이 달라 직접 비교가 어려우면 사유 표시", specDiff.caveats.some((t) => t.includes("직접 비교하기 어렵")));
// 비교기간이 다를 때 각각 표시
const shortWage = explainPriceChange(cv("CT-2026-001"), pcx({ laborWages: data.laborWages.filter((w) => w.month <= "2026-07") }));
check("지표별 기간이 다르면 실제 쓴 기간을 각각 표시(mixed)", shortWage.period.mixed && shortWage.period.label.includes("→"), shortWage.period.label);
// AI 답변과 팝업이 같은 계산
const r = runAnalysis({ kind: "price_increase", threshold: 3, itemCode: "ITM-1001" }, data, d, meta, "단가 왜 올랐어");
const sec = answerSections(r).find((s) => s.id === "pc-CT-2026-001");
const lines = priceChangeLines(e1);
const secs2 = answerSections(r);
const common = secs2.find((s) => s.id === "pcommon");
const pcs = secs2.filter((s) => s.id.startsWith("pc-"));
// 변경(v0.9.2): 답변은 모든 계약에 똑같은 줄(참고 동향·원가 구성비 없음·자료 기준일 등)을 한 번만 보여 준다 — 나머지는 팝업과 같은 priceChangeLines 결과 그대로
check("AI 답변의 단가 변동 상세 = 팝업과 같은 함수 결과(priceChangeLines)에서 계약 공통 줄만 따로 뺀 것", !!sec && !!common && JSON.stringify(sec.items) === JSON.stringify(lines.filter((l) => !common.items.includes(l))) && common.items.every((l) => lines.includes(l)));
check("공통 줄은 답변 전체에서 1번만(계약별 구획에 반복되지 않음)", !!common && common.items.length >= 3 && common.items.every((l) => pcs.every((s) => !s.items.includes(l)) && secs2.flatMap((s) => s.items).filter((x) => x === l).length === 1));
check("계약이 1건이면 공통 줄을 따로 빼지 않음(그대로 출력)", splitCommonLines([lines]).common.length === 0 && JSON.stringify(splitCommonLines([lines]).unique[0]) === JSON.stringify(lines));
check("AI 답변에 증감액·변동률·비교기간·사유 미확인·출처가 포함", !!sec && !!common && sec.items.some((l) => l.includes("+3.3%")) && sec.items.some((l) => l.startsWith("비교기간")) && [...sec.items, ...common.items].some((l) => l === NO_REASON) && [...sec.items, ...common.items].some((l) => l.includes("SAMPLE")));
check("답변 문구: 비문 ‘미확인한 계약’ 없음 · ‘순 순’ 없음", !secs2.some((s) => s.items.some((l) => l.includes("미확인한 계약")) || s.title.includes("순 순")));

// ── 수기 계약서: 이전 확정단가를 직전 확정 계약에서 ──
const items = new Map(data.items.map((i) => [i.itemCode, i]));
const ctm = { asOf: meta.asOf, items, supplierIds: new Set(data.suppliers.map((s) => s.supplierId)), currencies: ["KRW", "USD"], poNos: new Set(data.purchaseOrders.map((p) => p.poNo)), contractIds: new Set(data.contracts.map((c) => c.contractId)) };
const fill = (f: Partial<ManualForm>): ManualForm => syncAmount({ ...emptyForm(f.docType ?? "계약서", meta.asOf), supplierId: "SUP-001", itemSel: "ITM-1001", unit: "EA", qty: "10", unitPrice: "1300000", ...f });
const newCt = buildEntry(fill({ docNo: "CT-M-NEW", docDate: "2026-10-01", validUntil: "2027-09-30" }), { id: "M-1", now: "t", items, manual: [] });
check("수기 계약서 입력 검사 통과", Object.keys(validateManual(fill({ docNo: "CT-M-NEW", docDate: "2026-10-01", validUntil: "2027-09-30" }), ctm)).length === 0);
const dm = derive(mergeManual(data, [newCt]), meta.asOf);
const mc = dm.contractViews.find((c) => c.contractId === "CT-M-NEW")!;
check("이전 확정단가 = 같은 업체·품목·통화의 직전 확정 계약(CT-2026-001, 1,250,000) → 변동률 +4.0%", mc.prevUnitPrice === 1250000 && mc.prevContractId === "CT-2026-001" && mc.changeRate === 4);
const qt = buildEntry(fill({ docType: "견적서", docDate: "2026-10-01", validUntil: "2026-12-31" }), { id: "M-2", now: "t", items, manual: [] });
const dq = derive(mergeManual(data, [qt]), meta.asOf);
check("견적 입력은 이전 단가·변동률·확정 계약 목록에 영향 없음(견적과 확정단가 변경 구분)", dq.contractViews.find((c) => c.docType === "견적")!.prevUnitPrice === null && dq.agreedContracts.length === d.agreedContracts.length);
const popEx = explainPriceChange(mc, pcx({ contracts: dm.contractViews }));
check("수기 계약의 변동률 팝업: 이전 단가 출처 계약번호와 이전 계약 시작월 기준 비교기간", popEx.priceBasis.includes("CT-2026-001") && popEx.period.baseMonth === "2026-01");

// ── (5) 납기 팝업 ──
const poOpen = d.poViews.find((p) => p.status === "진행 중")!;
const l1 = deliveryLines(poOpen, meta.asOf);
const left = Math.round((Date.parse(poOpen.dueDate) - Date.parse(meta.asOf)) / 86400000);
check("납기 팝업: 예정 납기일·데이터 기준일·‘납기까지 N일 남음’", l1[0].label === "예정 납기일" && l1[0].value === poOpen.dueDate && l1[1].label === "데이터 기준일" && l1[1].value === meta.asOf && l1.some((l) => l.value === `납기까지 ${left}일 남음`), JSON.stringify(l1));
const poLate = d.poViews.find((p) => p.status === "납기 지연")!;
check("납기 지난 미입고: ‘N일 지연’", deliveryLines(poLate, meta.asOf).some((l) => /^\d+일 지연$/.test(l.value) && l.tone === "late"));
const poDone = d.poViews.find((p) => p.status === "지연입고")!;
const ld = deliveryLines(poDone, meta.asOf);
check("완료된 발주: 예정 납기일과 실제 입고일을 구분해 표시", ld.some((l) => l.label === "예정 납기일") && ld.some((l) => l.label === "실제 입고일" && l.value.includes(poDone.receivedDate!)) && ld.some((l) => l.label === "예정 대비" && l.value.includes("지연 입고")));

// ── 입고 기록: 부분입고 · 누적 · 잔량 · 재고 · 멱등 ──
const target = d.poViews.find((p) => p.status === "진행 중" && p.itemCode === "ITM-1001") ?? poOpen;
const inv0 = d.inventoryViews.find((v) => v.itemCode === target.itemCode)!;
const rc = (id: string, qty: number, date = "2026-10-14"): Receipt => ({ id, poNo: target.poNo, date, qty, createdAt: "t" });
const m1 = derive(mergeReceipts(data, [rc("RC-1", 3)]), meta.asOf);
const p1 = m1.poViews.find((p) => p.poNo === target.poNo)!;
check("부분입고: 누적 3 · 잔량 = 발주수량 − 3 · 상태는 아직 진행 중(입고완료 아님) · partial", p1.rcvQty === 3 && p1.remainQty === target.qty - 3 && p1.partial && p1.status === target.status && p1.receivedDate == null && p1.lastReceivedDate === "2026-10-14", JSON.stringify([p1.rcvQty, p1.remainQty, p1.status]));
check("현재재고는 입고수량만큼 함께 증가(+3), 부족수량 재계산", m1.inventoryViews.find((v) => v.itemCode === target.itemCode)!.stockQty === inv0.stockQty + 3 && m1.inventoryViews.find((v) => v.itemCode === target.itemCode)!.shortage === shortageOf(inv0.safetyStock, inv0.stockQty + 3));
const m2 = derive(mergeReceipts(data, [rc("RC-1", 3), rc("RC-2", target.qty - 3, "2026-10-15")]), meta.asOf);
const p2 = m2.poViews.find((p) => p.poNo === target.poNo)!;
check("나머지 전량 입고 → 누적 = 발주수량, 잔량 0, 입고완료(또는 지연입고)로 전환", p2.rcvQty === target.qty && p2.remainQty === 0 && !p2.partial && (p2.status === "입고완료" || p2.status === "지연입고") && p2.receivedDate === "2026-10-15");
check("입고예정수량(재고 표)은 진행 중 발주의 ‘남은’ 수량 합 — 부분입고분은 빠짐", m1.inventoryViews.find((v) => v.itemCode === target.itemCode)!.openOrderQty === inv0.openOrderQty - 3);
const dup = upsertReceipt(upsertReceipt([], rc("RC-1", 3)), rc("RC-1", 3));
check("같은 입고 ID 재제출은 한 건만 반영(이중 가산 없음)", dup.length === 1 && derive(mergeReceipts(data, dup), meta.asOf).poViews.find((p) => p.poNo === target.poNo)!.rcvQty === 3);
const ed = upsertReceipt([rc("RC-1", 3)], rc("RC-1", 5));
check("같은 입고를 수정(3→5)해도 5만 반영(3+5 아님)", ed.length === 1 && derive(mergeReceipts(data, ed), meta.asOf).poViews.find((p) => p.poNo === target.poNo)!.rcvQty === 5);
check("원본 데이터 불변 · 기록을 지우면 원래대로", data.purchaseOrders.find((p) => p.poNo === target.poNo)!.receivedQty === undefined && derive(mergeReceipts(data, []), meta.asOf).poViews.find((p) => p.poNo === target.poNo)!.rcvQty === 0);
const po1 = p1;
check("검사: 0·음수·잔량 초과·발주일 이전 거부", !!validateReceipt({ date: "2026-10-14", qty: "0" }, po1).qty && !!validateReceipt({ date: "2026-10-14", qty: String(po1.remainQty! + 1) }, po1).qty && !!validateReceipt({ date: "1999-01-01", qty: "1" }, po1).date && Object.keys(validateReceipt({ date: "2026-10-14", qty: "1" }, po1)).length === 0);
check("검사: 수정 중인 입고 자신의 수량은 잔량 계산에서 제외(RC-1 3→잔량 전체까지)", Object.keys(validateReceipt({ date: "2026-10-14", qty: String(target.qty) }, po1, "RC-1")).length === 0);
check("취소된 발주·이미 전량 입고된 발주는 거부", !!validateReceipt({ date: "2026-10-14", qty: "1" }, { ...po1, canceled: true }).qty && !!validateReceipt({ date: "2026-10-16", qty: "1" }, p2).qty);
check("저장본 검사: 깨진 값·중복 ID 제거", sanitizeReceipts([rc("RC-1", 3), rc("RC-1", 4), { id: 1 }, null, { ...rc("RC-9", 0) }]).length === 1);
// 기존(SAMPLE) 완료 발주: 입고일 기준 전량, 재고에는 더하지 않음
const doneBase = d.poViews.find((p) => p.status === "입고완료")!;
check("기존 SAMPLE 완료 발주: 누적 = 발주수량(입고일 기준 전량·assumed), 잔량 0, 입고 기록을 합쳐도 변하지 않음, 재고 불변", doneBase.rcvQty === doneBase.qty && doneBase.rcvAssumed && doneBase.remainQty === 0 && JSON.stringify(mergeReceipts(data, []).inventory) === JSON.stringify(data.inventory));
// 수기 발주: 입고 수량 < 발주수량이면 부분입고
const poForm = fill({ docType: "납기보고서", docNo: "PO-M-P1", docDate: "2026-09-01", dueDate: "2026-10-01", receivedDate: "2026-09-20", receivedQty: "7" });
const poE = buildEntry(poForm, { id: "M-3", now: "t", items, manual: [] });
const dp = derive(mergeReceipts(mergeManual(data, [poE]), []), meta.asOf);
const pm = dp.poViews.find((p) => p.poNo === "PO-M-P1")!;
check("수기 발주(발주 10 · 입고 7): 부분입고 — 누적 7·잔량 3·납기 지연 유지·입고예정에 잔량 3", pm.rcvQty === 7 && pm.remainQty === 3 && pm.partial && pm.status === "납기 지연" && pm.lastReceivedDate === "2026-09-20");
check("수기 발주 입고 수량이 발주 수량보다 크면 입력 거부", !!validateManual({ ...poForm, receivedQty: "11" }, ctm).receivedQty);
const dp2 = derive(mergeReceipts(mergeManual(data, [poE]), [{ id: "RC-M", poNo: "PO-M-P1", date: "2026-10-05", qty: 3, createdAt: "t" }]), meta.asOf);
const pm2 = dp2.poViews.find((p) => p.poNo === "PO-M-P1")!;
check("수기 발주에 추가 입고 3 → 전량 입고(지연입고), 같은 발주를 두 번 더하지 않음", pm2.rcvQty === 10 && pm2.remainQty === 0 && pm2.status === "지연입고" && pm2.delayDays === 4);
check("수기 발주 입고분은 현재재고에 반영(+10)", dp2.inventoryViews.find((v) => v.itemCode === "ITM-1001")!.stockQty === d.inventoryViews.find((v) => v.itemCode === "ITM-1001")!.stockQty + 10);

// ── (6) 적정재고 ──
const invRow = data.inventory[3]; // ITM-1004: 재고 85 / 적정 120
check("초기값 = 기존 안전재고 값(정책 없음)", applyStockPolicy(data.inventory, {}).find((x) => x.itemCode === invRow.itemCode)!.safetyStock === invRow.safetyStock && !applyStockPolicy(data.inventory, {}).some((x) => x.safetyLocked));
const locked = lockStock({}, invRow.itemCode, 50, invRow.safetyStock, "t");
const al = applyStockPolicy(data.inventory, locked).find((x) => x.itemCode === invRow.itemCode)!;
check("고정: 적용값 50 · 초기값 120 보존 · locked", al.safetyStock === 50 && al.safetyInitial === invRow.safetyStock && al.safetyLocked === true);
const planned = applyStockPolicy(data.inventory, locked, { [invRow.itemCode]: 200 }).find((x) => x.itemCode === invRow.itemCode)!;
check("고정하면 계획이 바뀌어도 적용 적정재고 유지", planned.safetyStock === 50);
check("고정 해제 + 계획 없음 → 현재 설정값(50) 유지 + 안내 문구", (() => { const u = unlockStock(locked, invRow.itemCode, invRow.safetyStock, NO_PLANS, "t"); const a = applyStockPolicy(data.inventory, u.policy).find((x) => x.itemCode === invRow.itemCode)!; return a.safetyStock === 50 && !a.safetyLocked && a.safetySource === "설정값" && u.message.includes("연결된 계획이 없어"); })());
check("고정 해제 + 계획 있음 → 최신 계획값 적용(항목 제거)", (() => { const u = unlockStock(locked, invRow.itemCode, invRow.safetyStock, { [invRow.itemCode]: 200 }, "t"); const a = applyStockPolicy(data.inventory, u.policy, { [invRow.itemCode]: 200 }).find((x) => x.itemCode === invRow.itemCode)!; return a.safetyStock === 200 && a.safetySource === "계획" && !(invRow.itemCode in u.policy); })());
check("계획 데이터가 없으면 임의 추천값을 만들지 않음(자동 상태는 현재 설정값)", applyStockPolicy(data.inventory, {}, NO_PLANS).every((x, i) => x.safetyStock === data.inventory[i].safetyStock && x.safetySource === "초기값"));
check("업로드로 원자료 값이 바뀌면 해제 후 유지값은 버리고 새 원자료 값을 씀(고정은 유지)", (() => { const u = unlockStock(locked, invRow.itemCode, invRow.safetyStock, NO_PLANS, "t").policy; const chg = data.inventory.map((x) => (x.itemCode === invRow.itemCode ? { ...x, safetyStock: 99 } : x)); return applyStockPolicy(chg, u).find((x) => x.itemCode === invRow.itemCode)!.safetyStock === 99 && applyStockPolicy(chg, locked).find((x) => x.itemCode === invRow.itemCode)!.safetyStock === 50; })());
check("잠금은 품목 ID에 연결 — 행 순서를 바꿔도 같은 품목에 적용", (() => { const rev = [...data.inventory].reverse(); const a = applyStockPolicy(rev, locked); return a.find((x) => x.itemCode === invRow.itemCode)!.safetyStock === 50 && a.filter((x) => x.safetyLocked).length === 1; })());
const dl = derive({ ...data, inventory: applyStockPolicy(data.inventory, locked) }, meta.asOf);
const vl = dl.inventoryViews.find((v) => v.itemCode === invRow.itemCode)!;
check("부족수량 = max(적용 적정재고 − 현재재고, 0): 고정 50 · 재고 85 → 0, 상태 정상", vl.shortage === 0 && shortageOf(50, 85) === 0 && shortageOf(120, 85) === 35 && vl.status === "정상" || vl.status === "공급 지연");
const dl2 = derive(mergeReceipts({ ...data, inventory: applyStockPolicy(data.inventory, lockStock({}, invRow.itemCode, 100, invRow.safetyStock, "t")) }, [{ id: "RC-S", poNo: d.poViews.find((p) => p.itemCode === invRow.itemCode && (p.status === "진행 중" || p.status === "납기 지연"))!.poNo, date: "2026-10-14", qty: 5, createdAt: "t" }]), meta.asOf);
const vl2 = dl2.inventoryViews.find((v) => v.itemCode === invRow.itemCode)!;
check("적정재고를 고정(100)해도 입고 반영으로 현재재고(85→90)·부족수량(15→10)은 계속 갱신", vl2.stockQty === 90 && vl2.shortage === 10 && vl2.safetyStock === 100);
check("고정 수량 입력 검사: 빈칸·음수·소수·문자 거부, 0 허용", !!validateStockQty("") && !!validateStockQty("-1") && !!validateStockQty("1.5") && !!validateStockQty("abc") && validateStockQty("0") === null && validateStockQty("1,200") === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
