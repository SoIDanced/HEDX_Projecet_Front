// 값에 마우스를 올리면(키보드 초점·터치로도) 근처에 뜨는 작은 설명 팝업 — 변동률 상세·납기 상세에 쓴다.
//  · 마우스: 올리면 열리고 벗어나면 닫힘(팝업 위로 옮겨도 유지) · 키보드: 초점이 오면 열림, Enter·Space로 열고 닫기 · 터치: 눌러서 열고 다시 눌러서 닫기
//  · Esc·바깥 누르기로 닫힘, 트리거에 aria-expanded·aria-controls, 팝업은 role="dialog"(비모달)
//  · 표의 가로 스크롤에 잘리지 않도록 body에 띄우고, 아래 공간이 모자라면 위로 뒤집는다
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function HoverPop({ label, trigger, className, popClass, children, data }: { label: string; trigger: ReactNode; className?: string; popClass?: string; children: ReactNode; data?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const ptype = useRef("");
  const id = useId();

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(true);
  }, []);
  const hideSoon = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 140);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(360, window.innerWidth - 16); // CSS .hover-pop 너비와 같아야 화면 밖으로 안 나간다
    const h = pop.current?.offsetHeight ?? 0;
    const below = r.bottom + 6;
    const top = h && below + h > window.innerHeight - 8 && r.top - 6 - h >= 8 ? r.top - 6 - h : below;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top });
  }, []);
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, children]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!pop.current?.contains(n) && !btn.current?.contains(n)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false); // 초점은 트리거에 그대로 두므로 따로 옮기지 않는다(다시 열리지 않게)
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
  }, [open, place]);

  const hoverable = () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`hover-pop-btn ${className ?? ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        data-pop={data}
        onPointerDown={(e) => (ptype.current = e.pointerType)}
        onMouseEnter={() => hoverable() && show()}
        onMouseLeave={() => hoverable() && hideSoon()}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show()}
        onClick={() => {
          // 마우스: 이미 올려서 열렸으면 그대로 두고(누르면 고정), 키보드·터치: 열고 닫기
          if (ptype.current === "mouse") show();
          else setOpen((o) => !o);
          ptype.current = "";
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div ref={pop} id={id} role="dialog" aria-label={label} className={`terms-pop hover-pop ${popClass ?? ""}`} style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }} onMouseEnter={() => hoverable() && show()} onMouseLeave={() => hoverable() && hideSoon()} data-hover-pop={data}>
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
