// v0.9 좌측 데이터 관리 1단계 로직 검사: npx tsx tests/logic-scope.ts
// 공통 조회 범위(엔진모델 → 부품 → 품목 → 협력업체), 엔진 속도 구분(SAMPLE), 부품군 매핑, 구매조달 수량 열
import { loadSample } from "../src/data/sampleData";
import { derive } from "../src/lib/metrics";
import { ENGINE_MASTER, PART_GROUPS, PART_GROUP_OF, PART_REVIEW, partGroupText } from "../src/data/classification";
import { EMPTY_SCOPE, normalizeScope, scopeFilter, scopeOptions } from "../src/lib/scope";
import { poQty } from "../src/lib/qty";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const { data, meta } = loadSample();
const d = derive(data, meta.asOf);
const codes = (o: { value: string }[]) => o.map((x) => x.value);

// ── 부품군 매핑(문서 표) ──
const EXPECT: Record<string, string> = { "ITM-1001": "구조", "ITM-1007": "구조", "ITM-1004": "연소", "ITM-1009": "연소", "ITM-1002": "구동", "ITM-1005": "구동", "ITM-1006": "구동", "ITM-1003": "소-배기", "ITM-1010": "소-배기" };
check("부품군 매핑: 9개 품목이 문서 표와 같고 품목마다 주분류 하나", Object.entries(EXPECT).every(([k, v]) => PART_GROUP_OF[k] === v) && Object.keys(PART_GROUP_OF).length === 9);
check("부품군 선택지: 구조·연소·구동·소-배기", PART_GROUPS.join(",") === "구조,연소,구동,소-배기");
check("ITM-1008: 네 분류에 없고 '분류 확인 필요: 냉각계통'", !PART_GROUP_OF["ITM-1008"] && PART_REVIEW["ITM-1008"] === "냉각계통" && partGroupText("ITM-1008") === "분류 확인 필요: 냉각계통");
check("품목 마스터 10개 전부 분류 또는 확인 필요로 설명됨(복제 없음)", data.items.every((i) => !!PART_GROUP_OF[i.itemCode] !== !!PART_REVIEW[i.itemCode]));
check("전체(부품)에서는 ITM-1008 품목도 보임", codes(scopeOptions(d, EMPTY_SCOPE).item).includes("ITM-1008") && scopeFilter(d, EMPTY_SCOPE).item("ITM-1008"));
check("부품 '구조' 선택 시 ITM-1008 제외, 1001·1007만", codes(scopeOptions(d, { ...EMPTY_SCOPE, group: "구조" }).item).sort().join() === "ITM-1001,ITM-1007");

// ── 엔진 속도(시연용) ──
check("엔진 마스터: 속도는 엔진 모델명·ID와 별도 필드, 지금은 모두 시연용(sample)", ENGINE_MASTER.every((e) => e.basis === "sample" && !!e.engineId && !!e.engineModel && e.speedClass !== (e as unknown as { engineModel: string }).engineModel));
const bomEngines = new Set(data.bom.map((b) => b.engineModel));
check("엔진 마스터의 모델명이 BOM 엔진과 일치(연결 근거)", ENGINE_MASTER.every((e) => bomEngines.has(e.engineModel)));
check("엔진모델 선택지: 전체(빈 값) + 고속·중속·저속", codes(scopeOptions(d, EMPTY_SCOPE).speed).join() === "고속,중속,저속");
const mid = codes(scopeOptions(d, { ...EMPTY_SCOPE, speed: "중속" }).item).sort();
const low = codes(scopeOptions(d, { ...EMPTY_SCOPE, speed: "저속" }).item).sort();
check("중속(X형) 품목에 ITM-1008 있고 1009 없음 / 저속(Y형)은 반대", mid.includes("ITM-1008") && !mid.includes("ITM-1009") && low.includes("ITM-1009") && !low.includes("ITM-1008"), `${mid.length}/${low.length}`);
check("고속: 연결된 엔진이 없어 품목 0개·부품 선택지 없음(품목명으로 추정하지 않음)", codes(scopeOptions(d, { ...EMPTY_SCOPE, speed: "고속" }).item).length === 0 && scopeOptions(d, { ...EMPTY_SCOPE, speed: "고속" }).group.length === 0);

// ── 하위 선택지 좁힘 · 건너뛰기 · 정리 ──
const o1 = scopeOptions(d, { ...EMPTY_SCOPE, group: "연소" });
check("엔진 '전체'로 두고 부품 '연소'만 골라도 품목이 좁혀짐(건너뛰기)", codes(o1.item).sort().join() === "ITM-1004,ITM-1009");
const o2 = scopeOptions(d, { ...EMPTY_SCOPE, item: "ITM-1004" });
check("품목을 직접 고르면 협력업체가 그 품목을 다루는 업체로 좁혀짐(업체 F·H·K)", codes(o2.supplier).sort().join() === "SUP-006,SUP-008,SUP-011", codes(o2.supplier).join());
const n1 = normalizeScope(d, { speed: "저속", group: "", item: "ITM-1008", supplier: "SUP-001" });
const n2 = normalizeScope(d, { speed: "", group: "연소", item: "", supplier: "SUP-009" });
check("상위를 바꿔 맞지 않게 되면 그 아래 선택이 전체로 돌아감(품목 1008은 저속에 없음 / 업체 I는 연소 품목을 안 다룸)", n1.item === "" && n1.supplier === "SUP-001" && n2.supplier === "", JSON.stringify([n1, n2]));
check("맞는 선택은 그대로 유지", JSON.stringify(normalizeScope(d, { speed: "중속", group: "연소", item: "ITM-1004", supplier: "SUP-006" })) === JSON.stringify({ speed: "중속", group: "연소", item: "ITM-1004", supplier: "SUP-006" }));
const sf = scopeFilter(d, { ...EMPTY_SCOPE, supplier: "SUP-006" });
check("협력업체만 고르면 협력업체 표는 그 업체, 재고는 그 업체가 다루는 품목만", d.supplierViews.filter((s) => sf.supplier(s.supplierId)).map((s) => s.supplierId).join() === "SUP-006" && d.inventoryViews.filter((v) => sf.supplierHasItem(v.itemCode)).every((v) => ["ITM-1004", "ITM-1010"].includes(v.itemCode)));

// ── 구매조달 수량 열 ──
// 2단계(추가 사유: 부분입고·실제 수량 계산 — 1단계의 '입고일만 있으면 누적 –' 처리를 입고 기록 원칙에 맞게 정리)
check("진행 중: 누적 0 · 잔량 = 발주수량", JSON.stringify(poQty({ status: "진행 중", qty: 10, receivedQty: null })) === '{"received":0,"remain":10,"assumed":false,"partial":false}');
check("입고 수량 기록 있음: 잔량 = 발주수량 − 누적(0 아래로 안 내려감), 남으면 부분입고", poQty({ status: "납기 지연", qty: 10, receivedQty: 4 }).remain === 6 && poQty({ status: "납기 지연", qty: 10, receivedQty: 4 }).partial && poQty({ status: "입고완료", qty: 10, receivedQty: 12, receivedDate: "2026-01-01" }).remain === 0);
check("입고일만 있고 수량 기록 없음: 입고일 기준 전량(누적 = 발주수량, 잔량 0, assumed) · 취소는 둘 다 null", poQty({ status: "입고완료", qty: 10, receivedQty: null, receivedDate: "2026-01-01" }).received === 10 && poQty({ status: "입고완료", qty: 10, receivedQty: null, receivedDate: "2026-01-01" }).assumed && poQty({ status: "취소", qty: 10, receivedQty: null }).remain === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
