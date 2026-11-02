// 2단계 수기입력 연동: 입고 기록(발주번호 FK + 입고 ID)을 발주·현재재고에 합치는 순수 함수들 (화면 없음 → tests/logic-receipts.ts)
// 원본은 Receipt 목록. 화면 데이터는 mergeReceipts(데이터, 목록)로 매번 만든다 → 기록을 지우면 곧바로 원래 값으로 돌아온다.
//  · 같은 입고 ID는 한 번만 반영(upsertReceipt) — 같은 폼 재제출·수정이 이중 가산되지 않는다
//  · 누적 입고수량 = 그 발주의 입고 기록 합, 발주잔량 = max(발주수량 − 누적, 0), 전량 입고(누적 ≥ 발주수량)가 되면 그때부터 receivedDate(입고완료·지연입고 판정)
//  · 현재재고 = 원자료 재고 + 수기·입고 기록으로 받은 수량 (기존 SAMPLE 발주의 입고분은 원자료 재고에 이미 들어 있어 더하지 않음)
import type { DataSet, PurchaseOrder, Receipt, ReceiptLogItem } from "../data/types";

export const MAX_RECEIPT_QTY = 1e9;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** 저장본 검사: 깨진 값은 버린다 */
export function sanitizeReceipts(raw: unknown): Receipt[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Receipt[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = r as Receipt;
    if (typeof x.id !== "string" || typeof x.poNo !== "string" || typeof x.date !== "string" || !isDate(x.date) || !Number.isFinite(x.qty) || x.qty <= 0 || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({ id: x.id, poNo: x.poNo, date: x.date, qty: x.qty, createdAt: typeof x.createdAt === "string" ? x.createdAt : "", note: typeof x.note === "string" ? x.note : undefined });
  }
  return out;
}

/** 같은 입고 ID면 덮어쓰고(수정·재제출), 없으면 추가 — 같은 입고가 두 번 더해지지 않는다 */
export function upsertReceipt(list: Receipt[], r: Receipt): Receipt[] {
  return list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r];
}

export interface ReceiptInput {
  date: string;
  qty: string;
}

/** 입력 검사. po = 대상 발주(합쳐진 데이터의 발주 행), editId = 수정 중인 입고 ID(그 입고 수량은 잔량 계산에서 뺀다) */
export function validateReceipt(input: ReceiptInput, po: Pick<PurchaseOrder, "qty" | "orderDate" | "canceled" | "receiptLog" | "receivedQty">, editId?: string): Partial<Record<keyof ReceiptInput, string>> {
  const e: Partial<Record<keyof ReceiptInput, string>> = {};
  if (po.canceled) {
    e.qty = "취소된 발주에는 입고를 기록할 수 없습니다.";
    return e;
  }
  const d = input.date.trim();
  if (!d) e.date = "입고일을 입력하세요.";
  else if (!isDate(d)) e.date = "날짜 형식이 올바르지 않습니다. 달력에서 고르거나 YYYY-MM-DD로 입력하세요.";
  else if (po.orderDate && d < po.orderDate) e.date = "입고일은 발주일보다 빠를 수 없습니다. 날짜를 확인하세요.";
  const t = input.qty.replace(/[,\s]/g, "");
  const q = /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  const others = (po.receiptLog ?? []).filter((x) => x.id !== editId).reduce((a, x) => a + x.qty, 0);
  const remain = Math.max(po.qty - others, 0);
  if (input.qty.trim() === "") e.qty = "이번 입고수량을 입력하세요 (0보다 큰 숫자).";
  else if (Number.isNaN(q) || q <= 0) e.qty = "입고수량은 0보다 큰 숫자로 입력하세요 (예: 5).";
  else if (q > MAX_RECEIPT_QTY) e.qty = `입고수량이 너무 큽니다. ${MAX_RECEIPT_QTY.toLocaleString("ko-KR")} 이하로 입력하세요.`;
  else if (q > remain) e.qty = remain === 0 ? "이 발주는 이미 전량 입고되었습니다." : `발주잔량(${remain.toLocaleString("ko-KR")})보다 많이 입력할 수 없습니다.`;
  return e;
}

export const parseQty = (s: string) => Number(s.replace(/[,\s]/g, ""));

/** 발주 입고 기록 + 재고 반영. 입고 기록이 하나도 없으면 원본 그대로 돌려준다 */
export function mergeReceipts(data: DataSet, receipts: Receipt[]): DataSet {
  const byPo = new Map<string, Receipt[]>();
  for (const r of receipts) {
    if (!byPo.has(r.poNo)) byPo.set(r.poNo, []);
    byPo.get(r.poNo)!.push(r);
  }
  const manualFull = data.purchaseOrders.some((p) => p.source === "manual" && p.receivedDate);
  if (!byPo.size && !manualFull) return data;
  const stockDelta = new Map<string, number>();
  const pos = data.purchaseOrders.map((po) => {
    const explicit = po.canceled ? [] : byPo.get(po.poNo) ?? [];
    const implicit = !po.canceled && po.receivedDate && (explicit.length > 0 || po.source === "manual");
    if (!explicit.length && !implicit) return po;
    const log: ReceiptLogItem[] = [];
    if (po.receivedDate)
      log.push({ id: `${po.poNo}#po`, date: po.receivedDate, qty: po.receivedQty ?? po.qty, source: po.source === "manual" ? "수기 발주" : "기존 자료" }); // 입고일만 있고 수량이 없으면 전량
    for (const r of [...explicit].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) log.push({ id: r.id, date: r.date, qty: r.qty, source: "입고 기록" });
    const total = log.reduce((a, x) => a + x.qty, 0);
    const last = log.map((x) => x.date).sort().pop() ?? null;
    for (const x of log) if (x.source !== "기존 자료") stockDelta.set(po.itemCode, (stockDelta.get(po.itemCode) ?? 0) + x.qty);
    return { ...po, receivedQty: total, receivedDate: total >= po.qty ? last : null, lastReceivedDate: last, receiptLog: log };
  });
  const inventory = data.inventory.map((inv) => {
    const adj = stockDelta.get(inv.itemCode);
    return adj ? { ...inv, stockQty: inv.stockQty + adj, stockAdj: adj } : inv;
  });
  return { ...data, purchaseOrders: pos, inventory };
}
