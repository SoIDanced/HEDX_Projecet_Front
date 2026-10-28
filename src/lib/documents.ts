// 문서 등록 (PLACEHOLDER 스텁) — 화면(UI)만 있고, 실제 처리는 아직 없다.
//
// ┌ 앞으로 백엔드가 맡을 일 (다른 담당자가 만든다) ─────────────────────────────────────────────┐
// │ 파일 → 문자열 파싱(String Parsing) → 청킹(Chunking) → 임베딩(Embedding) → 벡터DB 저장        │
// │ 계약(안):  POST /api/documents   (multipart/form-data, 필드명 "file")                        │
// │            200 → { "docId": string, "name": string, "size": number, "registeredAt": string } │
// │            4xx/5xx → { "error": string }                                                    │
// └──────────────────────────────────────────────────────────────────────────────────────────┘
// 이 파일은 파일 "내용"을 읽지 않는다(파싱·청킹·임베딩·텍스트 추출·FileReader·arrayBuffer 없음, 라이브러리 없음).
// 이름·크기·종류(메타데이터)만 보고, 잠깐 기다린 뒤 가짜 docId를 돌려준다. 백엔드가 생기면 registerDocument 안의 fetch 한 곳만 바꾼다.

export const DOC_ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const DOC_TYPE_ERROR = "지원하지 않는 형식입니다. PDF 또는 DOCX 파일만 등록할 수 있습니다.";
export const DOC_SIZE_ERROR = "파일이 너무 큽니다. 20MB 이하의 파일만 등록할 수 있습니다.";
export const DOC_OK_TEXT = "문서가 벡터DB에 저장되었습니다";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface RegisteredDocument {
  docId: string;
  name: string;
  size: number;
  registeredAt: string;
}

/** 확장자와 MIME 종류가 모두 맞는지, 크기가 한도 이내인지 본다 (MIME이 비어 있는 환경은 확장자만 본다). 문제 없으면 null */
export function validateDocumentFile(file: Pick<File, "name" | "size" | "type">): string | null {
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const mime = MIME_BY_EXT[ext];
  if (!mime || (file.type && file.type !== mime)) return DOC_TYPE_ERROR;
  if (file.size > DOC_MAX_BYTES) return DOC_SIZE_ERROR;
  return null;
}

/** PLACEHOLDER: 내용을 읽지 않고 메타데이터만 돌려준다 (약 0.6초 지연) */
export async function registerDocument(file: File): Promise<RegisteredDocument> {
  await new Promise((r) => setTimeout(r, 600));
  return {
    docId: `DOC-UPLOAD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
    name: file.name,
    size: file.size,
    registeredAt: new Date().toISOString(),
  };
}
