// 공통 조회 범위(엔진모델 → 부품 → 품목 → 협력업체). 값이 ""이면 '전체'. 모든 데이터 탭이 같은 선택을 쓴다.
import { ENGINE_MASTER, PART_GROUPS, PART_GROUP_OF, SPEED_CLASSES } from "../data/classification";
import type { BomRow } from "../data/types";
import type { Derived } from "./metrics";
import type { Option } from "./filters";

export interface Scope {
  speed: string;
  group: string;
  item: string;
  supplier: string;
}
export const EMPTY_SCOPE: Scope = { speed: "", group: "", item: "", supplier: "" };
export const scopeActive = (s: Scope) => !!(s.speed || s.group || s.item || s.supplier);

const speedOfEngine = new Map(ENGINE_MASTER.map((e) => [e.engineModel, e.speedClass]));

/** 속도 구분에 속한 품목코드 — 엔진 마스터에 속도가 지정된 엔진의 BOM 행에서만 연결한다(품목명으로 추정하지 않음) */
export function itemsOfSpeed(bom: BomRow[], speed: string): Set<string> {
  return new Set(bom.filter((r) => speedOfEngine.get(r.engineModel) === speed).map((r) => r.itemCode));
}

/** 속도·부품군 선택에 맞는 품목코드 */
function itemsInScope(d: Derived, speed: string, group: string): string[] {
  const sp = speed ? itemsOfSpeed(d.bomIndex.rows, speed) : null;
  return [...d.itemsByCode.keys()].filter((c) => (!sp || sp.has(c)) && (!group || PART_GROUP_OF[c] === group));
}

/** 협력업체 → 거래·공급 품목 (공급 가능 품목 + 발주·계약 이력) */
export function supplierItems(d: Derived): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (sid: string, code: string) => {
    if (!m.has(sid)) m.set(sid, new Set());
    m.get(sid)!.add(code);
  };
  for (const s of d.supplierViews) s.items.forEach((c) => add(s.supplierId, c));
  for (const p of d.poViews) add(p.supplierId, p.itemCode);
  for (const c of d.contractViews) add(c.supplierId, c.itemCode);
  return m;
}

export interface ScopeOptions {
  speed: Option[];
  group: Option[];
  item: Option[];
  supplier: Option[];
}

/** 상위 선택에 따라 하위 선택지를 좁힌다. '전체'로 두면 건너뛰고 품목을 바로 고를 수 있다 */
export function scopeOptions(d: Derived, s: Scope): ScopeOptions {
  const sp = s.speed ? itemsOfSpeed(d.bomIndex.rows, s.speed) : null;
  const inSpeed = [...d.itemsByCode.keys()].filter((c) => !sp || sp.has(c));
  const items = itemsInScope(d, s.speed, s.group);
  const si = supplierItems(d);
  const pool = new Set(s.item ? [s.item] : items);
  return {
    speed: SPEED_CLASSES.map((v) => ({ value: v, label: v })),
    group: PART_GROUPS.filter((g) => inSpeed.some((c) => PART_GROUP_OF[c] === g)).map((v) => ({ value: v, label: v })),
    item: items.map((c) => ({ value: c, label: `${d.itemsByCode.get(c)?.name ?? c} (${c})` })),
    supplier: d.supplierViews.filter((x) => [...(si.get(x.supplierId) ?? [])].some((c) => pool.has(c))).map((x) => ({ value: x.supplierId, label: `${x.name} (${x.supplierId})` })),
  };
}

/** 선택이 위쪽 선택과 맞지 않으면(데이터가 바뀌었거나 상위를 바꿨을 때) 그 아래부터 '전체'로 되돌린다 */
export function normalizeScope(d: Derived, s: Scope): Scope {
  let n = { ...s };
  const has = (o: Option[], v: string) => !v || o.some((x) => x.value === v);
  if (!has(scopeOptions(d, { ...n, group: "", item: "", supplier: "" }).speed, n.speed)) n = { ...n, speed: "" };
  if (!has(scopeOptions(d, { ...n, item: "", supplier: "" }).group, n.group)) n = { ...n, group: "" };
  if (!has(scopeOptions(d, { ...n, supplier: "" }).item, n.item)) n = { ...n, item: "" };
  if (!has(scopeOptions(d, n).supplier, n.supplier)) n = { ...n, supplier: "" };
  return n;
}

/** 표 행 판정용: 선택한 범위에 드는 품목코드(null = 제한 없음)와 협력업체 */
export function scopeFilter(d: Derived, s: Scope) {
  const codes = s.item ? new Set([s.item]) : s.speed || s.group ? new Set(itemsInScope(d, s.speed, s.group)) : null;
  const all = supplierItems(d);
  return {
    /** 품목 코드 하나가 범위에 드는가 (협력업체 선택은 따지지 않음) */
    item: (code: string) => !codes || codes.has(code),
    /** 협력업체 한 곳이 범위에 드는가: 선택한 업체이면서 범위 품목을 다루는 업체 */
    supplier: (sid: string) => (!s.supplier || sid === s.supplier) && (!codes || [...(all.get(sid) ?? [])].some((c) => codes.has(c))),
    /** 품목 단위 행(재고)에서: 선택한 업체가 다루는 품목인가 */
    supplierHasItem: (code: string) => !s.supplier || !!all.get(s.supplier)?.has(code),
  };
}
