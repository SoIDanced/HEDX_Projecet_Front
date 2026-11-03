// 문서 등록 버튼 + 미리보기·확인 창 (선택 → 미리보기 → 예/아니오 → 스텁 저장). 챗봇(벡터 DB)과 데이터 관리(일반 DB)가 같이 쓴다.
// 파일 내용은 읽지 않는다(파싱·청킹·임베딩 없음) — src/lib/documents.ts 스텁.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuFilePlus2 } from "react-icons/lu";
import { useStore } from "../store/store";
import { DOC_ACCEPT, DOC_TARGETS, registerDocument, validateDocumentFile, type DocTarget } from "../lib/documents";
import { ConfirmDialog } from "./ConfirmDialog";

const docSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

export function DocRegister({ target, inputId, className = "btn btn-quiet doc-register-btn", labelClass = "tool-label", data }: { target: DocTarget; inputId: string; className?: string; labelClass?: string; data?: string }) {
  const { dispatch } = useStore();
  const t = DOC_TARGETS[target];
  const fileRef = useRef<HTMLInputElement>(null);
  const [registering, setRegistering] = useState(false);
  const [pending, setPending] = useState<File[] | null>(null); // 미리보기 후 '… 저장하시겠습니까?' 대기 중인 파일

  const onPick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = ""; // 같은 파일을 다시 골라도 반응하게
    if (!files.length || registering) return;
    for (const f of files) {
      const err = validateDocumentFile(f);
      if (err) return void dispatch({ type: "toast", text: files.length > 1 ? `${f.name}: ${err}` : err, tone: "warn" });
    }
    setPending(files);
  };
  const save = async (files: File[]) => {
    setPending(null);
    setRegistering(true);
    try {
      await Promise.all(files.map((f) => registerDocument(f, target)));
      dispatch({ type: "toast", text: files.length > 1 ? `${t.okText}\n(${files.length}건)` : t.okText, ms: 2000 });
    } catch {
      dispatch({ type: "toast", text: "문서 등록에 실패했습니다. 잠시 뒤 다시 시도해 주세요.", tone: "warn" });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <>
      <input ref={fileRef} id={inputId} type="file" hidden multiple accept={DOC_ACCEPT} onChange={(e) => onPick(e.target.files)} />
      <button type="button" className={className} onClick={() => fileRef.current?.click()} disabled={registering} aria-busy={registering} title="문서 등록 — PDF · DOCX, 파일당 20MB 이하" aria-description="PDF 또는 DOCX 파일, 파일당 20MB 이하" data-doc-register={data}>
        <LuFilePlus2 aria-hidden /> <span className={labelClass}>{registering ? "등록 중…" : "문서 등록"}</span>
      </button>
      {pending &&
        createPortal(
          <ConfirmDialog
            title={t.question}
            tone="normal"
            confirmLabel="예"
            cancelLabel="아니오"
            onCancel={() => {
              setPending(null);
              dispatch({ type: "toast", text: "문서를 추가하지 않았습니다.", ms: 2000 });
            }}
            onConfirm={() => void save(pending)}
          >
            <ul className="doc-preview" aria-label="등록할 문서 미리보기">
              {pending.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <b className="doc-prev-name">{f.name}</b>
                  <span className="muted">{f.name.toLowerCase().endsWith(".pdf") ? "PDF" : "DOCX"} · {docSize(f.size)}</span>
                </li>
              ))}
            </ul>
            <p className="muted">{t.note}</p>
          </ConfirmDialog>,
          document.body,
        )}
    </>
  );
}
