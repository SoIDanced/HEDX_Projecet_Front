// v0.9.3 답변 맨 위 ‘근거’(쓴 문서·데이터 집합) 검사: npx tsx tests/logic-basis.ts
import { loadSample } from "../src/data/sampleData";
import { derive } from "../src/lib/metrics";
import { answer } from "../src/ai/agent";
import { basisLines } from "../src/lib/answerText";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const { data, meta } = loadSample();
const d = derive(data, meta.asOf);
const ctx: any = { data, derived: d, meta, selection: { supplierId: null, itemCode: "ITM-1001" }, lastResult: null, pending: null };

(async () => {
  // 후보 비교: 발주·계약·협력업체 데이터, 문서 없음, 기준일
  const a1: any = await answer("해당 품목의 과거 거래 협력업체를 비교해 줘.", ctx, null);
  const b1 = basisLines(a1.basis);
  check("후보 비교: 근거에 구매조달 발주·협력업체 데이터 집합과 기준일", a1.type === "analysis" && b1.data.includes("구매조달 발주") && b1.data.includes("협력업체") && b1.data.includes(`기준일 ${meta.asOf}`), b1.data);
  check("후보 비교: 근거 문서는 ‘없음(등록 데이터만 사용)’", b1.docs === "문서 없음(등록 데이터만 사용)", b1.docs);
  check("후보 비교: 데이터 집합 건수 = result.sources 의 건수(지어내지 않음)", a1.result.sources.filter((s: any) => s.ids.length).every((s: any) => b1.data.includes(`${s.label} ${s.ids.length}건`)));
  check("후보 비교: 조회 조건에 품목 표시, ‘기준일’ 항목은 중복 안 함", !!b1.scope && b1.scope.includes("품목") && !b1.scope.includes("기준일"), b1.scope);

  // 단가 상승: 원가-계약 + 상세 문단이 쓴 참고 지표(원자재 시세·인건비)
  const a2: any = await answer("최근 단가가 상승한 품목을 보여줘.", { ...ctx, selection: {} }, null);
  const b2 = basisLines(a2.basis);
  check("단가 상승: 원가-계약·구매조달 발주 + 상세가 쓴 원자재 시세/인건비 표기", a2.type === "analysis" && b2.data.includes("원가-계약") && b2.data.includes("구매조달 발주") && a2.basis.data.length >= 3, b2.data);
  check("단가 상승: 사유 문서가 없으므로 문서 ‘없음’(샘플 문서에 priceReason 없음)", a2.result.docRefs.length === 0 && b2.docs.includes("없음"), b2.docs);

  // 납기 저조
  const a3: any = await answer("납기 준수율이 낮은 협력업체를 찾아줘.", { ...ctx, selection: {} }, null);
  const b3 = basisLines(a3.basis);
  check("납기 저조: 구매조달 발주·협력업체 데이터 집합", a3.type === "analysis" && b3.data.includes("구매조달 발주") && b3.data.includes("협력업체"), b3.data);

  // 문서 검색: 실제 검색된 문서명·ID
  const a4: any = await answer("2026년 9월 18일자 실린더라이너 스크래치 민원 찾아줘", ctx, null);
  const b4 = basisLines(a4.basis);
  check("문서 검색: 근거 문서에 실제 검색된 문서 ID 표기", a4.type === "message" && b4.docs.includes("DOC-2026-0918-001") && a4.basis.docs.length >= 1, b4.docs);
  check("문서 검색: 데이터 줄은 문서 의미 검색 + 기준일", b4.data.includes("의미 검색") && b4.data.includes(meta.asOf), b4.data);
  const a5: any = await answer("2026년 3월 2일 터보차저 보증서 찾아줘", ctx, null);
  const b5 = basisLines(a5.basis);
  check("문서 검색 실패: 문서 ‘없음(관련 문서를 찾지 못함)’", a5.basis.docs.length === 0 && b5.docs === "문서 없음(관련 문서를 찾지 못함)", b5.docs);

  // 일반 질문 / 도움말
  const a6: any = await answer("오늘 날씨 어때", ctx, null);
  const b6 = basisLines(a6.basis);
  check("일반(분석 불가) 질문: 쓴 데이터 없음을 그대로 표기", a6.type === "message" && a6.basis.data.length === 0 && b6.data.startsWith("데이터 없음") && b6.docs === "문서 없음(등록 데이터만 사용)", b6.data);

  // 결과 없음(분석은 했지만 0건)
  const a7: any = await answer("최근 6개월 납기 준수율 1% 미만 업체", { ...ctx, selection: {} }, null);
  check("결과 없음 답변도 근거 보유(조회한 데이터 집합)", a7.type === "message" && !!a7.basis && a7.basis.data.length >= 1, JSON.stringify(a7.basis?.data));

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
