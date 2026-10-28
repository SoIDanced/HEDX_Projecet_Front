// v0.6.0 문서 검색(의미 검색 시연)·문서 등록 스텁 검사: npx tsx tests/logic-docs.ts
import { readFileSync } from "node:fs";
import { loadSample } from "../src/data/sampleData";
import { derive } from "../src/lib/metrics";
import { answer } from "../src/ai/agent";
import { parseQuestion } from "../src/ai/intent";
import { sanitizeLLM } from "../src/ai/llm";
import { SAMPLE_DOCS } from "../src/data/sample/documents";
import { extractDate, extractType, MIN_SCORE, searchDocuments } from "../src/lib/documentSearch";
import { DOC_MAX_BYTES, registerDocument, validateDocumentFile } from "../src/lib/documents";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const { data, meta } = loadSample();
const d = derive(data, meta.asOf);
const ctx: any = { data, derived: d, meta, selection: { supplierId: null, itemCode: null }, lastResult: null, pending: null };
const AS_OF = meta.asOf;
const top = (q: string) => searchDocuments(q, AS_OF);
const catalog = { items: data.items.map((i) => ({ itemCode: i.itemCode, name: i.name })), suppliers: data.suppliers.map((s) => ({ supplierId: s.supplierId, name: s.name })) };

(async () => {
  // ── 말뭉치 ──
  const ids = SAMPLE_DOCS.map((x) => x.id);
  check("말뭉치 10~14건, ID 중복 없음, DOC- 형식", SAMPLE_DOCS.length >= 10 && SAMPLE_DOCS.length <= 14 && new Set(ids).size === ids.length && ids.every((i) => /^DOC-2026-\d{4}-\d{3}$/.test(i)), `${SAMPLE_DOCS.length}건`);
  check("모든 문서: 기준일(2026-10-15) 이전 · 샘플 업체·품목 이름 사용", SAMPLE_DOCS.every((x) => x.date <= AS_OF && data.suppliers.some((s) => s.name === x.supplier) && data.items.some((i) => i.name === x.item)));
  check("모든 문서: 본문 2~5문장", SAMPLE_DOCS.every((x) => { const n = x.body.split(/(?<=[.!?])\s+/).length; return n >= 2 && n <= 5; }));

  // ── 예시 질문 ──
  const q1 = "2026년 9월 18일자 실린더라이너 스크래치 민원 찾아줘";
  check("예시 질문 → document_search 로 해석", parseQuestion(q1, catalog, AS_OF).kind === "document_search");
  const r1 = top(q1);
  check("예시 질문 → DOC-2026-0918-001", r1.found && r1.best!.doc.id === "DOC-2026-0918-001", JSON.stringify(r1.best && [r1.best.doc.id, r1.best.score]));
  const a1: any = await answer(q1, ctx, null);
  const t1 = a1.text.join("\n");
  check("답변 형식: '해당 민원 문서 원본 ID는 (DOC-…)입니다. 다음은 문서 내용입니다: …'", a1.type === "message" && /^해당 민원 문서 원본 ID는 \(DOC-2026-0918-001\)입니다\. 다음은 문서 내용입니다: /.test(a1.text[0]) && a1.text[0].includes("스크래치"), a1.text[0].slice(0, 80));
  check("답변: 유사도 줄(소수 2자리) + SAMPLE 안내", /\(의미 검색 결과: 유사도 \d\.\d\d\)/.test(t1) && t1.includes("※ SAMPLE 문서입니다(가상 데이터, 실제 자료 아님)"));
  check("답변: 글만(분석 결과·표 없음) · 최종 판단 안내 없음", a1.type === "message" && !("result" in a1) && !t1.includes("담당자"));

  // ── 띄어쓰기·동의어·날짜 표기 ──
  for (const q of ["2026년 9월 18일자 실린더 라이너 스크래치 민원 찾아줘", "9월 18일 실린더라이너 긁힘 클레임 찾아줘", "9/18 실린더 라이너 흠집 불만 문서 찾아줘", "2026-09-18 실린더라이너 스크래치 민원 보여줘", "2026.9.18 실린더 라이너 스크래치 민원을 찾아줘"])
    check(`표기 변형 → 09-18 민원: ${q}`, top(q).best?.doc.id === "DOC-2026-0918-001" && top(q).found);
  check("같은 날·같은 품목이라도 종류가 다르면 검사성적서(002)", top("2026-09-18 실린더라이너 검사성적서 보여줘").best?.doc.id === "DOC-2026-0918-002");
  const dt = (t: string) => extractDate(t, AS_OF).date;
  check(
    "날짜 추출: 연월일·ISO·점·월일·슬래시·월만",
    JSON.stringify([dt("2026년 9월 18일자"), dt("2026-09-18"), dt("2026.9.18"), dt("9월 18일"), dt("9/18"), dt("9월 민원")]) ===
      JSON.stringify([{ year: 2026, month: 9, day: 18 }, { year: 2026, month: 9, day: 18 }, { year: 2026, month: 9, day: 18 }, { year: 2026, month: 9, day: 18 }, { year: 2026, month: 9, day: 18 }, { year: 2026, month: 9, day: null }]),
  );
  check("문서 종류 추출", [extractType("민원 찾아줘"), extractType("클레임"), extractType("견적서"), extractType("계약서"), extractType("검사성적서"), extractType("납기 지연 보고서")].join() === "민원,민원,견적서,계약서,검사성적서,납기보고서");

  // ── 업체·품목·종류 ──
  const c = top("업체 C 납기 지연 보고서 찾아줘");
  check("업체 C 납기 지연 보고서 → 업체 C 납기보고서 · 비슷한 문서 1건", c.found && c.best!.doc.supplier === "업체 C" && c.best!.doc.type === "납기보고서" && c.similar.length === 1);
  const ac: any = await answer("업체 C 납기 지연 보고서 찾아줘", ctx, null);
  check("비슷한 문서 안내 문장: 'ID가 비슷한 문서 1건도 있습니다: DOC-…'", ac.text.some((t: string) => /^ID가 비슷한 문서 1건도 있습니다: DOC-2026-\d{4}-\d{3}$/.test(t)));
  const g = top("실린더 커버 가스켓 견적서 보여줘");
  check("실린더 커버 가스켓 견적서 → 견적서 2건(최신 우선)", g.found && g.best!.doc.type === "견적서" && g.best!.doc.date === "2026-10-06" && g.similar.length === 1);
  check("업체 H 누설 민원 → DOC-2026-1008-001", top("업체 H 누설 민원 찾아줘").best?.doc.id === "DOC-2026-1008-001");
  check("업체 J 흠집(동의어) 민원 → 고압 연료관 DOC-2026-0922-001", top("업체 J 흠집 민원 찾아줘").best?.doc.id === "DOC-2026-0922-001");

  // ── 못 찾는 경우(지어내지 않음) ──
  for (const q of ["2026년 3월 2일 터보차저 보증서 찾아줘", "업체 B 계약서 찾아줘", "9월 20일 실린더 라이너 스크래치 민원 찾아줘", "냉각수 펌프 임펠러 불만 찾아줘"])
    check(`기준(${MIN_SCORE}) 미만 → 못 찾음: ${q}`, !top(q).found, String(top(q).best?.score));
  const nf: any = await answer("2026년 3월 2일 터보차저 보증서 찾아줘", ctx, null);
  const tn = nf.text.join("\n");
  check("못 찾음 답변: 솔직한 안내 + 다시 질문 제안, 문서 ID·'원본 ID는' 없음", tn.includes("관련 문서를 찾지 못했습니다") && tn.includes("다시 질문") && !tn.includes("원본 ID는") && !/\(DOC-/.test(tn) && tn.includes("SAMPLE"));

  // ── 기존 질문은 그대로 ──
  const old: [string, string][] = [
    ["납기 준수율이 낮은 협력사를 찾아줘.", "low_delivery"],
    ["최근 단가가 상승한 품목을 보여줘.", "price_increase"],
    ["A등급 협력사의 품질 실적을 정리해 줘.", "grade_quality"],
    ["업체 D 평가 근거 알려줘", "supplier_profile"],
    ["업체 A랑 업체 C 비교해줘", "supplier_compare"],
    ["재고 부족한 품목 있어?", "stock_risk"],
    ["실린더 라이너 후보 업체 비교", "item_candidates"],
    ["오늘 날씨 어때", "unknown"],
  ];
  for (const [q, k] of old) check(`기존 질문 라우팅 유지: ${q} → ${k}`, parseQuestion(q, catalog, AS_OF).kind === k, parseQuestion(q, catalog, AS_OF).kind);

  // ── LLM 경로: 모르는 kind 는 unknown 으로 안전하게 ──
  check("LLM 응답 검증: document_search 허용, 엉뚱한 kind 는 unknown", sanitizeLLM({ intent: "document_search" }, catalog).kind === "document_search" && sanitizeLLM({ intent: "drop_tables" }, catalog).kind === "unknown" && sanitizeLLM(null, catalog).kind === "unknown");

  // ── 문서 등록 스텁 ──
  const f = (name: string, size = 10, type = "") => ({ name, size, type });
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  check("등록 검사: pdf·docx 통과(MIME 비어도 확장자만)", validateDocumentFile(f("a.pdf", 10, "application/pdf")) === null && validateDocumentFile(f("A.DOCX", 10, DOCX)) === null && validateDocumentFile(f("a.pdf")) === null);
  check(
    "등록 검사: txt·doc·확장자 없음·이중 확장자·MIME 불일치 거부(정해진 문구)",
    ["a.txt", "a.doc", "a", "a.pdf.exe"].every((n) => validateDocumentFile(f(n)) === "지원하지 않는 형식입니다. PDF 또는 DOCX 파일만 등록할 수 있습니다.") && validateDocumentFile(f("a.pdf", 10, "text/plain")) !== null,
  );
  check("등록 검사: 20MB 초과 거부", validateDocumentFile(f("a.pdf", DOC_MAX_BYTES + 1)) !== null && validateDocumentFile(f("a.pdf", DOC_MAX_BYTES)) === null);
  const t0 = Date.now();
  const reg = await registerDocument({ name: "x.pdf", size: 5 } as File);
  check("registerDocument: 약 0.6초 뒤 {docId,name,size,registeredAt}, 파일 내용 없이(메타데이터 객체만으로) 동작", Date.now() - t0 >= 550 && /^DOC-/.test(reg.docId) && reg.name === "x.pdf" && reg.size === 5 && !!reg.registeredAt);
  const src = readFileSync(new URL("../src/lib/documents.ts", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const chat = readFileSync(new URL("../src/components/ChatPanel.tsx", import.meta.url), "utf8");
  check(
    "정적 검사: 문서 등록 코드에 외부 import(파서·임베딩 라이브러리) 없음, FileReader·arrayBuffer·file.text()·stream()·slice() 호출 없음",
    !/import\s[^;]*from\s+["'](?!\.)/.test(src) && !/(FileReader|arrayBuffer|file\.(text|stream|slice)\(|pdfjs|mammoth)/i.test(src) && !/(FileReader|arrayBuffer\(|\bf\.text\(|file\.text\()/.test(chat),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
