// 계약 조건 '조건 보기' 버튼 + 작은 팝업(인도조건·결제조건을 나눠 표시). 표의 가로 스크롤에 잘리지 않도록 body에 띄운다.
// 버튼을 누르면 열고 다시 누르거나 Esc·바깥을 누르면 닫힌다(마우스·키보드·터치 공통).
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuListTree } from "react-icons/lu";

const NONE = "연결된 자료 없음";

export function TermsPop({ delivery, payment, title }: { delivery?: string | null; payment?: string | null; title: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(300, window.innerWidth - 16);
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: r.bottom + 6 });
    };
    place();
    const down = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!pop.current?.contains(n) && !btn.current?.contains(n)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className="btn btn-quiet terms-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} data-terms-btn>
        <LuListTree aria-hidden /> 조건 보기
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={pop} id={id} role="dialog" aria-label={`${title} 계약조건`} className="terms-pop" style={{ left: pos.left, top: pos.top }} data-terms-pop>
            <dl>
              <dt>인도조건</dt>
              <dd>{delivery || NONE}</dd>
              <dt>결제조건</dt>
              <dd>{payment || NONE}</dd>
            </dl>
          </div>,
          document.body,
        )}
    </>
  );
}
