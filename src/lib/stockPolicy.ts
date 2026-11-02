// 2단계 적정재고 관리: 품목(재고 고유 ID = itemCode)별 '적용값'과 '고정 여부'를 따로 둔다 (화면 없음 → tests/logic-stock.ts)
//  · 자동(고정 아님): 연결된 최신 계획값이 있으면 그 값, 없으면 임의의 추천 수치를 만들지 않고 현재 설정값(처음엔 원자료의 값) 유지
//  · 고정: 사용자가 정한 수량을 계획이 바뀌어도 유지 (현재재고·부족수량은 계속 갱신 — 부족수량 = max(적용 적정재고 − 현재재고, 0))
//  · 잠금은 행 번호가 아니라 itemCode 에 연결 → 정렬·필터·탭 전환·새로고침(브라우저 저장)에도 유지
import type { InventoryRecord, StockPolicyEntry } from "../data/types";

export type StockPolicyMap = Record<string, StockPolicyEntry>;
/** 연결된 최신 계획: 품목코드 → 적정재고 계획값. 현재 자료에는 계획 데이터가 없어 비어 있다(NO_PLANS) */
export type StockPlans = Record<string, number>;
export const NO_PLANS: StockPlans = {};
export const MAX_STOCK = 1e9;

export const shortageOf = (applied: number, stock: number) => Math.max(applied - stock, 0);

export function sanitizeStockPolicy(raw: unknown): StockPolicyMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StockPolicyMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = v as StockPolicyEntry;
    if (v && typeof v === "object" && Number.isFinite(e.value) && e.value >= 0 && typeof e.locked === "boolean" && Number.isFinite(e.base)) out[k] = { value: e.value, locked: e.locked, base: e.base, at: typeof e.at === "string" ? e.at : "" };
  }
  return out;
}

/** 적용 적정재고와 그 출처 */
export function appliedStock(inv: Pick<InventoryRecord, "itemCode" | "safetyStock">, policy: StockPolicyMap, plans: StockPlans = NO_PLANS): { value: number; locked: boolean; source: NonNullable<InventoryRecord["safetySource"]> } {
  const e = policy[inv.itemCode];
  if (e?.locked) return { value: e.value, locked: true, source: "고정" };
  const plan = plans[inv.itemCode];
  if (plan !== undefined && Number.isFinite(plan)) return { value: plan, locked: false, source: "계획" };
  if (e && e.base === inv.safetyStock) return { value: e.value, locked: false, source: "설정값" }; // 고정을 풀었지만 계획이 없어 그때 값을 유지
  return { value: inv.safetyStock, locked: false, source: "초기값" };
}

/** 재고 행에 적용값을 입힌다. safetyStock = 적용 적정재고, safetyInitial = 원자료 값 */
export function applyStockPolicy(inv: InventoryRecord[], policy: StockPolicyMap, plans: StockPlans = NO_PLANS): InventoryRecord[] {
  return inv.map((r) => {
    const a = appliedStock(r, policy, plans);
    return { ...r, safetyInitial: r.safetyStock, safetyStock: a.value, safetyLocked: a.locked, safetySource: a.source };
  });
}

export function validateStockQty(s: string): string | null {
  const t = s.replace(/[,\s]/g, "");
  if (!t) return "고정할 수량을 입력하세요.";
  if (!/^\d+$/.test(t)) return "0 이상의 정수로 입력하세요 (예: 40).";
  if (Number(t) > MAX_STOCK) return `${MAX_STOCK.toLocaleString("ko-KR")} 이하로 입력하세요.`;
  return null;
}

/** 수량을 정해 고정(이미 고정이면 수량만 바꿔 다시 고정) */
export function lockStock(policy: StockPolicyMap, itemCode: string, qty: number, base: number, now: string): StockPolicyMap {
  return { ...policy, [itemCode]: { value: qty, locked: true, base, at: now } };
}

/** 고정 해제: 계획값이 있으면 그 값을 적용, 없으면 현재 설정값을 유지하고 안내 문구를 돌려준다 */
export function unlockStock(policy: StockPolicyMap, itemCode: string, base: number, plans: StockPlans = NO_PLANS, now = ""): { policy: StockPolicyMap; message: string } {
  const e = policy[itemCode];
  if (!e) return { policy, message: "" };
  const plan = plans[itemCode];
  if (plan !== undefined && Number.isFinite(plan)) {
    const { [itemCode]: _drop, ...rest } = policy;
    return { policy: rest, message: `고정을 해제했습니다. 최신 계획 기준 적정재고 ${plan.toLocaleString("ko-KR")}를 적용합니다.` };
  }
  return { policy: { ...policy, [itemCode]: { value: e.value, locked: false, base, at: now } }, message: `고정을 해제했습니다. 연결된 계획이 없어 현재 설정값 ${e.value.toLocaleString("ko-KR")}을(를) 유지합니다.` };
}
