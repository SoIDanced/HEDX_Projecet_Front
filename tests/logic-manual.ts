// v0.7.0 수기 입력 로직 검사: npx tsx tests/logic-manual.ts
import { loadSample } from "../src/data/sampleData";
import { derive } from "../src/lib/metrics";
import { DIRECT, amountGapPct, autoAmount, buildEntry, emptyForm, entryRow, manualSig, mergeManual, parseNum, sanitizeManual, syncAmount, validateManual, type ManualForm } from "../src/lib/manual";
import { validateRows } from "../src/lib/validate";
import { runAnalysis } from "../src/lib/analysis";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const { data, meta } = loadSample();
const asOf = meta.asOf;
const base = derive(data, asOf);
const items = new Map(data.items.map((i) => [i.itemCode, i]));
const ctx = { asOf, items, supplierIds: new Set(data.suppliers.map((s) => s.supplierId)), currencies: ["KRW", "USD"], poNos: new Set(data.purchaseOrders.map((p) => p.poNo)), contractIds: new Set(data.contracts.map((c) => c.contractId)) };
const SUP = "SUP-001";
const ITEM = "ITM-1001";
const mk = (m: ManualForm, id: string, manual: Parameters<typeof buildEntry>[1]["manual"] = []) => buildEntry(m, { id, now: "t", items, manual });
const fill = (f: Partial<ManualForm>): ManualForm => syncAmount({ ...emptyForm(f.docType ?? "납기보고서", asOf), supplierId: SUP, itemSel: ITEM, unit: "EA", qty: "10", unitPrice: "1000", ...f });

// ── 금액 동기화 ──
check("금액 = 수량×단가 자동", fill({}).amount === "10000");
check("직접 고친 금액은 유지", syncAmount({ ...fill({}), qty: "20", amount: "5000", amountTouched: true }).amount === "5000");
check("자동 금액: 12.5 × 1,000 = 12500", autoAmount("12.5", "1,000") === 12500);
check("금액 차이 1%(10000 vs 10100) 감지", Math.abs((amountGapPct({ qty: "10", unitPrice: "1000", amount: "10100" }) ?? 0) - 1) < 1e-9);
check("금액 차이 0.4%는 경고 대상 아님", (amountGapPct({ qty: "10", unitPrice: "1000", amount: "10040" }) ?? 9) <= 0.5);
check("숫자 해석: 쉼표 허용 · 음수/문자/빈칸 거부", parseNum("1,250,000") === 1250000 && Number.isNaN(parseNum("-1")) && Number.isNaN(parseNum("abc")) && Number.isNaN(parseNum("")));

// ── 검증 ──
const ok = fill({ docNo: "PO-M-1", docDate: "2026-09-01", dueDate: "2026-10-01" });
check("올바른 납기보고서는 오류 없음", Object.keys(validateManual(ok, ctx)).length === 0, JSON.stringify(validateManual(ok, ctx)));
const e1 = validateManual(emptyForm("납기보고서", asOf), ctx) as Record<string, string>;
check("빈 입력: 공급사·품목·단위·수량·단가·금액·발주번호·납기 오류", ["supplierId", "itemSel", "unit", "qty", "unitPrice", "amount", "docNo", "dueDate"].every((k) => e1[k]), Object.keys(e1).join(","));
check("납기 < 발주일 거부", !!validateManual({ ...ok, dueDate: "2026-08-01" }, ctx).dueDate);
check("입고일 < 발주일 거부", !!validateManual({ ...ok, receivedDate: "2026-08-01" }, ctx).receivedDate);
check("입고 수량만 있고 입고일 없으면 거부", !!validateManual({ ...ok, receivedQty: "5" }, ctx).receivedQty);
check("중복 발주번호 거부", !!validateManual({ ...ok, docNo: "PO-2024-0001" }, ctx).docNo);
check("수량 0 · 상한 초과 거부", !!validateManual({ ...ok, qty: "0" }, ctx).qty && !!validateManual({ ...ok, qty: "2000000000" }, ctx).qty);
const ct = fill({ docType: "계약서", docNo: "CT-M-1", docDate: "2026-01-01", validUntil: "2026-12-31" });
check("계약서 통과 · 종료일 = 시작일 거부", Object.keys(validateManual(ct, ctx)).length === 0 && !!validateManual({ ...ct, validUntil: "2026-01-01" }, ctx).validUntil);
const qt = fill({ docType: "견적서", docDate: "2026-10-01", validUntil: "2026-10-31" });
check("견적서 통과 · 유효기한 < 견적일 거부", Object.keys(validateManual(qt, ctx)).length === 0 && !!validateManual({ ...qt, validUntil: "2026-09-01" }, ctx).validUntil);
check("직접입력 품목명: 빈칸 거부 · 61자 거부 · 공백 둘러싼 이름 통과", !!validateManual({ ...qt, itemSel: DIRECT }, ctx).itemName && !!validateManual({ ...qt, itemSel: DIRECT, itemName: "가".repeat(61) }, ctx).itemName && !validateManual({ ...qt, itemSel: DIRECT, itemName: " 새 품목 " }, ctx).itemName);

// ── 변환 ──
const eDirect = mk({ ...qt, itemSel: DIRECT, itemName: " 새 품목 " }, "M-1");
check("직접입력 → MANUAL-001 · 이름 trim · 견적번호 QT-M001", eDirect.itemCode === "MANUAL-001" && eDirect.itemName === "새 품목" && eDirect.newItem && eDirect.docNo === "QT-M001");
const eDirect2 = mk({ ...qt, itemSel: DIRECT, itemName: "다른 품목" }, "M-2", [eDirect]);
check("다음 새 품목 MANUAL-002 · 견적번호 QT-M002", eDirect2.itemCode === "MANUAL-002" && eDirect2.docNo === "QT-M002");
check("같은 이름은 같은 코드 재사용", mk({ ...qt, itemSel: DIRECT, itemName: "새 품목" }, "M-3", [eDirect]).itemCode === "MANUAL-001");
const row = entryRow(eDirect);
check("견적서 → 계약 행(docType 견적, source manual, 견적일~유효기한)", row.contract?.docType === "견적" && row.contract.source === "manual" && !row.po && row.contract.startDate === "2026-10-01" && row.contract.endDate === "2026-10-31");
check("계약서 → 계약 행 docType 계약", entryRow(mk(ct, "M-4")).contract?.docType === "계약");
check("납기보고서 → 발주 행(발주번호·입고일 null)", entryRow(mk(ok, "M-4b")).po?.poNo === "PO-M-1" && entryRow(mk(ok, "M-4b")).po?.receivedDate === null);

// ── 합치기 · 납기 준수율 ──
const del0 = base.supplierDelivery.get(SUP)!;
// 윈도우 안 발주일, 납기 2026-10-01, 입고 2026-10-10(9일 지연) → 마감 +1, 기한 내 +0
const late = mk(fill({ docNo: "PO-M-LATE", docDate: "2026-08-01", dueDate: "2026-10-01", receivedDate: "2026-10-10", delayReason: "소재 수급" }), "M-5");
const merged = mergeManual(data, [late]);
const d1 = derive(merged, asOf);
const del1 = d1.supplierDelivery.get(SUP)!;
const expectRate = Math.round((del0.onTime / (del0.evaluated + 1)) * 1000) / 10;
check("합친 데이터: 발주 +1, 원본 data 불변", merged.purchaseOrders.length === data.purchaseOrders.length + 1 && data.purchaseOrders.every((p) => p.source !== "manual"));
check(`마감 ${del0.evaluated}→${del0.evaluated + 1}건, 기한 내 ${del0.onTime}건 그대로`, del1.evaluated === del0.evaluated + 1 && del1.onTime === del0.onTime);
check(`납기 준수율 ${del0.rate}% → ${expectRate}% (= ${del0.onTime}/${del0.evaluated + 1})`, del1.rate === expectRate && del1.rate !== del0.rate, String(del1.rate));
check("협력사 표의 납기 준수율도 같은 값", d1.supplierViews.find((s) => s.supplierId === SUP)!.onTimeRate === expectRate);
const ev0 = base.evaluations.get(SUP)!.total;
const ev1 = d1.evaluations.get(SUP)!.total;
check("종합 점수 재계산(준수율 하락 → 점수 하락)", ev0 !== null && ev1 !== null && ev1 < ev0, `${ev0} → ${ev1}`);
const dOk = derive(mergeManual(data, [mk(fill({ docNo: "PO-M-OK", docDate: "2026-08-01", dueDate: "2026-10-01", receivedDate: "2026-09-30" }), "M-6")]), asOf).supplierDelivery.get(SUP)!;
check("기한 내 입고 1건 → 기한 내 +1 · 준수율 하락 없음", dOk.onTime === del0.onTime + 1 && (dOk.rate ?? 0) >= (del0.rate ?? 0), `${del0.rate} → ${dOk.rate}`);
const d3 = derive(mergeManual(data, [mk(fill({ docNo: "PO-M-OPEN", docDate: "2026-10-10", dueDate: "2026-12-31" }), "M-7")]), asOf);
check("입고일 없고 납기 전 → 진행 중 · 준수율 변화 없음", d3.poViews.find((p) => p.poNo === "PO-M-OPEN")!.status === "진행 중" && d3.supplierDelivery.get(SUP)!.rate === del0.rate);
check("입고일 없고 납기 지남 → 납기 지연", derive(mergeManual(data, [mk(fill({ docNo: "PO-M-OVD", docDate: "2026-08-01", dueDate: "2026-10-01" }), "M-8")]), asOf).poViews.find((p) => p.poNo === "PO-M-OVD")!.status === "납기 지연");
check("삭제하면 원래 값(수기 0건 = 같은 객체, 준수율 복귀)", mergeManual(data, []) === data && derive(mergeManual(data, []), asOf).supplierDelivery.get(SUP)!.rate === del0.rate);

// ── 견적서 · 계약서 ──
const dq = derive(mergeManual(data, [mk({ ...qt, unitPrice: "1", qty: "1" }, "M-9")]), asOf);
check("견적서: 계약 표 +1행, 확정 계약·원가 평가·결제 계산은 그대로", dq.contractViews.length === base.contractViews.length + 1 && dq.agreedContracts.length === base.agreedContracts.length && dq.evaluations.get(SUP)!.total === base.evaluations.get(SUP)!.total && dq.payments.rows.length === base.payments.rows.length);
check("계약서: 확정 계약 +1", derive(mergeManual(data, [mk(ct, "M-10")]), asOf).agreedContracts.length === base.agreedContracts.length + 1);
const nm = mergeManual(data, [eDirect]);
check("직접입력 품목은 품목 마스터에 MANUAL-001로 추가(원본 불변)", nm.items.some((i) => i.itemCode === "MANUAL-001" && i.source === "manual") && !data.items.some((i) => i.itemCode === "MANUAL-001"));
check("새 품목 행의 품목명 표시", derive(nm, asOf).contractViews.find((c) => c.itemCode === "MANUAL-001")?.itemName === "새 품목");

// ── 분석(챗) 엔진 ──
const res = runAnalysis({ kind: "item_candidates", itemCode: ITEM, priority: "balanced" }, merged, d1, meta, "후보 업체 비교");
check("품목 후보 분석 근거에 수기 발주번호 포함", JSON.stringify(res.sources).includes("PO-M-LATE"));
const low = runAnalysis({ kind: "low_delivery", threshold: 99 }, merged, d1, meta, "납기 준수율 낮은 협력사");
check("납기 저조 분석이 새 준수율을 사용", JSON.stringify(low.rows).includes(String(expectRate)), String(expectRate));

// ── 업로드 · 저장본 ──
check("업로드 검증은 그대로(발주 행)", validateRows("purchaseOrders", [{ poNo: "PO-X", itemCode: ITEM, supplierId: SUP, qty: 1, orderDate: "2026-01-01", dueDate: "2026-02-01" }], data).rows.length === 1);
check("저장본 검사: 깨진 항목은 버림", sanitizeManual([late, { id: 1 }, null, "x"]).length === 1 && sanitizeManual("x").length === 0);
check("분석 식별값: 수기 있으면 달라짐", manualSig([late]) !== manualSig([]) && manualSig([]) === "");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
