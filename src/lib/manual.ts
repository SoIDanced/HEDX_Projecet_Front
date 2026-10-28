// v0.7.0 수기 입력: 견적서·납기보고서·계약서를 손으로 입력해 화면 데이터에 합치는 순수 함수들 (화면 없음 → tests/logic-manual.ts로 검사)
// 원본은 ManualEntry 목록. 화면에 쓰는 데이터는 mergeManual(기본 데이터, 목록)로 매번 만든다 → 지우면 곧바로 원래대로 돌아간다.
import type { Contract, DataSet, Item, ManualDocType, ManualEntry, PurchaseOrder } from "../data/types";

export const DOC_TYPES: ManualDocType[] = ["견적서", "납기보고서", "계약서"];
export const DIRECT = "__direct__";
export const UNITS = ["EA", "SET", "개", "KG", "M", "L", "BOX"];
export const MAX = { qty: 1e9, price: 1e12, amount: 1e15, name: 60, no: 30, note: 200, text: 60 };

export interface ManualForm {
  docType: ManualDocType;
  supplierId: string;
  itemSel: string; // "" | 품목코드 | DIRECT
  itemName: string; // 직접입력일 때만 사용
  spec: string;
  unit: string;
  qty: string;
  unitPrice: string;
  amount: string;
  amountTouched: boolean;
  currency: string;
  docNo: string;
  docDate: string;
  validUntil: string;
  dueDate: string;
  receivedDate: string;
  receivedQty: string;
  delayReason: string;
  deliveryTerms: string;
  paymentTerms: string;
  note: string;
}

export type FieldKey = keyof ManualForm;
export interface DetailField {
  key: FieldKey;
  label: string;
  kind: "text" | "date" | "num";
  required?: boolean;
  hint?: string;
}

/** 문서 종류마다 달라지는 세부 입력 칸 (공통 칸: 공급사·품목명·규격·수량·단위·단가·통화·금액) */
export const DETAIL_FIELDS: Record<ManualDocType, DetailField[]> = {
  견적서: [
    { key: "docDate", label: "견적일", kind: "date", required: true },
    { key: "validUntil", label: "견적 유효기한", kind: "date", required: true },
    { key: "dueDate", label: "희망 납기일", kind: "date" },
    { key: "deliveryTerms", label: "인도 조건", kind: "text" },
    { key: "note", label: "비고", kind: "text" },
  ],
  납기보고서: [
    { key: "docNo", label: "발주번호", kind: "text", required: true },
    { key: "docDate", label: "발주일", kind: "date", required: true },
    { key: "dueDate", label: "납기 예정일", kind: "date", required: true },
    { key: "receivedDate", label: "실제 입고일", kind: "date", hint: "비우면 아직 입고되지 않은 발주(진행 중·납기 지연)로 계산합니다" },
    { key: "receivedQty", label: "입고 수량", kind: "num" },
    { key: "delayReason", label: "지연 사유", kind: "text" },
    { key: "note", label: "비고", kind: "text" },
  ],
  계약서: [
    { key: "docNo", label: "계약번호", kind: "text", required: true },
    { key: "docDate", label: "계약 시작일", kind: "date", required: true },
    { key: "validUntil", label: "계약 종료일", kind: "date", required: true },
    { key: "paymentTerms", label: "결제 조건", kind: "text" },
    { key: "deliveryTerms", label: "인도 조건", kind: "text" },
    { key: "note", label: "비고", kind: "text" },
  ],
};

/** 문서 종류 → 반영되는 데이터 종류(탭) */
export const DOC_TAB = { 견적서: "contracts", 납기보고서: "purchaseOrders", 계약서: "contracts" } as const;
export const DOC_TARGET: Record<ManualDocType, string> = { 견적서: "원가-계약 · 계약 단가 표(견적 단가로 표시)", 납기보고서: "구매조달 · 발주 목록", 계약서: "원가-계약 · 계약 단가 표" };

/** 공통 칸 + 문서 종류별 칸의 화면 라벨(검사용) */
export const commonLabels = (isDirect: boolean) => ["공급사", "품목명", ...(isDirect ? ["품목명 직접 입력"] : []), "규격", "수량", "단위", "단가", "통화", "금액"];

export function emptyForm(docType: ManualDocType, asOf: string, keep?: Pick<ManualForm, "supplierId">): ManualForm {
  return {
    docType,
    supplierId: keep?.supplierId ?? "",
    itemSel: "",
    itemName: "",
    spec: "",
    unit: "",
    qty: "",
    unitPrice: "",
    amount: "",
    amountTouched: false,
    currency: "KRW",
    docNo: "",
    docDate: asOf, // 기준일(앱의 '오늘')을 날짜 기본값으로 — 다른 값은 미리 채우지 않는다
    validUntil: "",
    dueDate: "",
    receivedDate: "",
    receivedQty: "",
    delayReason: "",
    deliveryTerms: "",
    paymentTerms: "",
    note: "",
  };
}

/** 숫자 칸 해석: 쉼표·공백 허용, 양수만. 비었거나 잘못되면 NaN */
export function parseNum(s: string): number {
  const t = s.replace(/[,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const autoAmount = (qty: string, price: string) => {
  const q = parseNum(qty);
  const p = parseNum(price);
  return Number.isNaN(q) || Number.isNaN(p) ? NaN : round2(q * p);
};
/** 직접 고친 금액이 수량×단가와 얼마나 다른지(%) — 0.5% 넘게 다르면 경고용. 비교할 수 없으면 null */
export function amountGapPct(form: Pick<ManualForm, "qty" | "unitPrice" | "amount">): number | null {
  const auto = autoAmount(form.qty, form.unitPrice);
  const amt = parseNum(form.amount);
  if (Number.isNaN(auto) || Number.isNaN(amt) || auto === 0) return null;
  return Math.abs(amt - auto) / auto * 100;
}
export const AMOUNT_WARN_PCT = 0.5;

/** 입력 중 값이 바뀔 때: 수량·단가를 고치면 직접 고치지 않은 금액은 자동으로 따라간다 */
export function syncAmount(f: ManualForm): ManualForm {
  if (f.amountTouched) return f;
  const a = autoAmount(f.qty, f.unitPrice);
  return { ...f, amount: Number.isNaN(a) ? "" : String(a) };
}

export interface ManualCtx {
  asOf: string;
  items: Map<string, Pick<Item, "itemCode" | "name">>;
  supplierIds: Set<string>;
  currencies: string[];
  poNos: Set<string>; // 이미 있는 발주번호(기본 데이터 + 수기 입력)
  contractIds: Set<string>;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** 검사: 칸 키 → 오류 문구(무엇이 잘못됐고 어떻게 고치는지). 비어 있으면 저장 가능 */
export function validateManual(f: ManualForm, ctx: ManualCtx): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  if (!f.supplierId || !ctx.supplierIds.has(f.supplierId)) e.supplierId = "공급사를 목록에서 선택하세요.";
  if (!f.itemSel) e.itemSel = "품목을 선택하거나 ‘직접입력’을 고르세요.";
  else if (f.itemSel === DIRECT) {
    const n = f.itemName.trim();
    if (!n) e.itemName = "품목명을 입력하세요 (1~60자).";
    else if (n.length > MAX.name) e.itemName = `품목명은 ${MAX.name}자 이내로 줄여 주세요 (지금 ${n.length}자).`;
  } else if (!ctx.items.has(f.itemSel)) e.itemSel = "목록에 없는 품목입니다. 다시 선택하세요.";
  if (f.spec.length > MAX.text * 2) e.spec = `규격은 ${MAX.text * 2}자 이내로 입력하세요.`;
  if (!f.unit) e.unit = "단위를 선택하세요.";
  const q = parseNum(f.qty);
  if (f.qty.trim() === "") e.qty = "수량을 입력하세요 (0보다 큰 숫자).";
  else if (Number.isNaN(q) || q <= 0) e.qty = "수량은 0보다 큰 숫자로 입력하세요 (예: 12 또는 2.5).";
  else if (q > MAX.qty) e.qty = `수량이 너무 큽니다. ${MAX.qty.toLocaleString("ko-KR")} 이하로 입력하세요.`;
  const p = parseNum(f.unitPrice);
  if (f.unitPrice.trim() === "") e.unitPrice = "단가를 입력하세요 (0보다 큰 숫자).";
  else if (Number.isNaN(p) || p <= 0) e.unitPrice = "단가는 0보다 큰 숫자로 입력하세요 (예: 1250000).";
  else if (p > MAX.price) e.unitPrice = `단가가 너무 큽니다. ${MAX.price.toLocaleString("ko-KR")} 이하로 입력하세요.`;
  if (!ctx.currencies.includes(f.currency)) e.currency = "통화를 선택하세요.";
  const a = parseNum(f.amount);
  if (f.amount.trim() === "") e.amount = "금액을 입력하세요. 수량과 단가를 넣으면 자동으로 채워집니다.";
  else if (Number.isNaN(a) || a <= 0) e.amount = "금액은 0보다 큰 숫자로 입력하세요.";
  else if (a > MAX.amount) e.amount = `금액이 너무 큽니다. ${MAX.amount.toLocaleString("ko-KR")} 이하로 입력하세요.`;

  const need = (k: FieldKey, msg: string) => {
    const v = String(f[k]).trim();
    if (!v) e[k] = msg;
    else if (!isDate(v)) e[k] = "날짜 형식이 올바르지 않습니다. 달력에서 고르거나 YYYY-MM-DD로 입력하세요.";
  };
  const optDate = (k: FieldKey) => {
    const v = String(f[k]).trim();
    if (v && !isDate(v)) e[k] = "날짜 형식이 올바르지 않습니다. 달력에서 고르거나 YYYY-MM-DD로 입력하세요.";
  };
  const docNo = f.docNo.trim();
  const checkNo = (label: string, used: Set<string>) => {
    if (!docNo) e.docNo = `${label}를 입력하세요 (예: ${label === "발주번호" ? "PO-2026-0100" : "CT-2026-100"}).`;
    else if (docNo.length > MAX.no) e.docNo = `${label}는 ${MAX.no}자 이내로 입력하세요.`;
    else if (!/^[A-Za-z0-9가-힣._\-/]+$/.test(docNo)) e.docNo = `${label}에는 글자·숫자와 - _ . / 만 쓸 수 있습니다 (공백 없음).`;
    else if (used.has(docNo)) e.docNo = `이미 있는 ${label}입니다. 다른 번호로 바꿔 주세요.`;
  };

  if (f.docType === "견적서") {
    need("docDate", "견적일을 입력하세요.");
    need("validUntil", "견적 유효기한을 입력하세요.");
    optDate("dueDate");
    if (!e.validUntil && !e.docDate && f.validUntil < f.docDate) e.validUntil = "견적 유효기한은 견적일보다 빠를 수 없습니다. 날짜를 확인하세요.";
    if (f.dueDate && !e.dueDate && !e.docDate && f.dueDate < f.docDate) e.dueDate = "희망 납기일은 견적일보다 빠를 수 없습니다. 날짜를 확인하세요.";
  } else if (f.docType === "납기보고서") {
    checkNo("발주번호", ctx.poNos);
    need("docDate", "발주일을 입력하세요.");
    need("dueDate", "납기 예정일을 입력하세요.");
    optDate("receivedDate");
    if (!e.dueDate && !e.docDate && f.dueDate < f.docDate) e.dueDate = "납기 예정일은 발주일보다 빠를 수 없습니다. 날짜를 확인하세요.";
    if (f.receivedDate && !e.receivedDate && !e.docDate && f.receivedDate < f.docDate) e.receivedDate = "실제 입고일은 발주일보다 빠를 수 없습니다. 날짜를 확인하세요.";
    if (f.receivedQty.trim()) {
      const rq = parseNum(f.receivedQty);
      if (Number.isNaN(rq) || rq <= 0) e.receivedQty = "입고 수량은 0보다 큰 숫자로 입력하세요.";
      else if (rq > MAX.qty) e.receivedQty = `입고 수량이 너무 큽니다. ${MAX.qty.toLocaleString("ko-KR")} 이하로 입력하세요.`;
      else if (!f.receivedDate) e.receivedQty = "입고 수량을 넣으려면 실제 입고일도 입력하세요. (입고 전이면 수량을 비워 두세요)";
    }
    if (f.delayReason.length > MAX.note) e.delayReason = `지연 사유는 ${MAX.note}자 이내로 입력하세요.`;
  } else {
    checkNo("계약번호", ctx.contractIds);
    need("docDate", "계약 시작일을 입력하세요.");
    need("validUntil", "계약 종료일을 입력하세요.");
    if (!e.validUntil && !e.docDate && f.validUntil <= f.docDate) e.validUntil = "계약 종료일은 시작일보다 늦어야 합니다. 날짜를 확인하세요.";
    if (f.paymentTerms.length > MAX.text) e.paymentTerms = `결제 조건은 ${MAX.text}자 이내로 입력하세요.`;
  }
  if (f.deliveryTerms.length > MAX.text) e.deliveryTerms = `인도 조건은 ${MAX.text}자 이내로 입력하세요.`;
  if (f.note.length > MAX.note) e.note = `비고는 ${MAX.note}자 이내로 입력하세요.`;
  return e;
}

const pad3 = (n: number) => String(n).padStart(3, "0");
const maxSeq = (codes: string[], re: RegExp) => codes.reduce((m, c) => Math.max(m, Number(re.exec(c)?.[1] ?? 0)), 0);

/** 검사를 통과한 입력 → 저장할 ManualEntry. 새 품목은 MANUAL-001…을 자동 부여(같은 이름이면 같은 코드 재사용), 견적번호도 자동 */
export function buildEntry(f: ManualForm, ctx: { id: string; now: string; items: Map<string, Pick<Item, "itemCode" | "name">>; manual: ManualEntry[] }): ManualEntry {
  let itemCode = f.itemSel;
  let itemName = ctx.items.get(f.itemSel)?.name ?? "";
  let newItem = false;
  if (f.itemSel === DIRECT) {
    newItem = true;
    itemName = f.itemName.trim();
    const same = ctx.manual.find((m) => m.newItem && m.itemName.toLowerCase() === itemName.toLowerCase());
    itemCode = same ? same.itemCode : `MANUAL-${pad3(maxSeq(ctx.manual.map((m) => m.itemCode), /^MANUAL-(\d+)$/) + 1)}`;
  }
  const docNo = f.docType === "견적서" ? `QT-M${pad3(maxSeq(ctx.manual.map((m) => m.docNo), /^QT-M(\d+)$/) + 1)}` : f.docNo.trim();
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);
  const e: ManualEntry = {
    id: ctx.id,
    docType: f.docType,
    createdAt: ctx.now,
    supplierId: f.supplierId,
    itemCode,
    itemName,
    newItem,
    spec: opt(f.spec),
    unit: f.unit,
    qty: parseNum(f.qty),
    unitPrice: parseNum(f.unitPrice),
    amount: parseNum(f.amount),
    currency: f.currency,
    docNo,
    docDate: opt(f.docDate),
    note: opt(f.note),
  };
  if (f.docType === "견적서") Object.assign(e, { validUntil: opt(f.validUntil), dueDate: opt(f.dueDate), deliveryTerms: opt(f.deliveryTerms) });
  else if (f.docType === "납기보고서") Object.assign(e, { dueDate: opt(f.dueDate), receivedDate: opt(f.receivedDate), receivedQty: f.receivedQty.trim() ? parseNum(f.receivedQty) : undefined, delayReason: opt(f.delayReason) });
  else Object.assign(e, { validUntil: opt(f.validUntil), paymentTerms: opt(f.paymentTerms), deliveryTerms: opt(f.deliveryTerms) });
  return e;
}

/** ManualEntry → 기존 데이터 행. 납기보고서 = 발주 행, 견적서·계약서 = 계약 행(견적은 docType '견적') */
export function entryRow(e: ManualEntry): { po?: PurchaseOrder; contract?: Contract } {
  const common = { source: "manual" as const, manualId: e.id, unit: e.unit, amount: e.amount, note: e.note ?? null };
  if (e.docType === "납기보고서")
    return {
      po: {
        poNo: e.docNo,
        itemCode: e.itemCode,
        supplierId: e.supplierId,
        qty: e.qty,
        unitPrice: e.unitPrice,
        currency: e.currency,
        orderDate: e.docDate ?? "",
        dueDate: e.dueDate ?? "",
        receivedDate: e.receivedDate ?? null,
        canceled: false,
        receivedQty: e.receivedQty ?? null,
        delayReason: e.delayReason ?? null,
        ...common,
      },
    };
  return {
    contract: {
      contractId: e.docNo,
      itemCode: e.itemCode,
      supplierId: e.supplierId,
      spec: e.spec,
      unitPrice: e.unitPrice,
      prevUnitPrice: null,
      currency: e.currency,
      deliveryTerms: e.deliveryTerms,
      paymentTerms: e.paymentTerms,
      startDate: e.docDate ?? null,
      endDate: e.validUntil ?? null,
      docType: e.docType === "견적서" ? "견적" : "계약",
      docDate: e.docDate ?? null,
      desiredDueDate: e.dueDate ?? null,
      qty: e.qty,
      ...common,
    },
  };
}

/** 기본 데이터(샘플·업로드) + 수기 입력 → 화면에 쓰는 데이터. 번호가 겹치는 수기 행은 기존 행을 지키기 위해 건너뛴다 */
export function mergeManual(base: DataSet, manual: ManualEntry[]): DataSet {
  if (!manual.length) return base;
  const items = [...base.items];
  const itemCodes = new Set(items.map((i) => i.itemCode));
  const pos = [...base.purchaseOrders];
  const poNos = new Set(pos.map((p) => p.poNo));
  const contracts = [...base.contracts];
  const cIds = new Set(contracts.map((c) => c.contractId));
  for (const m of manual) {
    if (m.newItem && !itemCodes.has(m.itemCode)) {
      itemCodes.add(m.itemCode);
      items.push({ itemCode: m.itemCode, name: m.itemName, spec: m.spec, unit: m.unit, category: "수기 입력", source: "manual" });
    }
    const { po, contract } = entryRow(m);
    if (po && !poNos.has(po.poNo)) {
      poNos.add(po.poNo);
      pos.push(po);
    }
    if (contract && !cIds.has(contract.contractId)) {
      cIds.add(contract.contractId);
      contracts.push(contract);
    }
  }
  return { ...base, items, purchaseOrders: pos, contracts };
}

/** 데이터 상태·표 아래 안내에 쓰는 건수 */
export function manualCounts(manual: ManualEntry[]) {
  const po = manual.filter((m) => m.docType === "납기보고서").length;
  return { total: manual.length, po, contract: manual.length - po };
}

/** 분석 결과의 '데이터 묶음' 식별값에 붙여, 수기 입력이 바뀌면 이전 답변에 '다시 분석' 안내가 뜨게 한다 */
export const manualSig = (manual: ManualEntry[]) => (manual.length ? `+m:${manual.map((m) => m.id).join(",")}` : "");

/** 저장본 검사: 깨진 값은 버린다(브라우저 저장소는 믿지 않는다) */
export function sanitizeManual(raw: unknown): ManualEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is ManualEntry => !!m && typeof m === "object" && typeof m.id === "string" && DOC_TYPES.includes(m.docType) && typeof m.supplierId === "string" && typeof m.itemCode === "string" && typeof m.docNo === "string" && Number.isFinite(m.qty) && Number.isFinite(m.unitPrice));
}
