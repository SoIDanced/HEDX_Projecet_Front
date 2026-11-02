// 자재-공급관리 '적정재고' 칸: 숫자 옆에 고정·해제 버튼과 상태 표시. 규칙은 src/lib/stockPolicy.ts(품목 고유 ID = itemCode 단위).
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuLock, LuLockOpen, LuPencilLine } from "react-icons/lu";
import { fmtInt } from "../lib/format";
import { validateStockQty } from "../lib/stockPolicy";
import type { InventoryView } from "../lib/metrics";
import { useStore } from "../store/store";

export function StockPolicyCell({ v }: { v: InventoryView }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();
  const locked = !!v.safetyLocked;
  const base = v.safetyInitial ?? v.safetyStock;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(300, window.innerWidth - 16);
      const h = pop.current?.offsetHeight ?? 0;
      const top = h && r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h >= 8 ? r.top - 6 - h : r.bottom + 6;
      setPos({ left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top });
    };
    place();
    const t = setTimeout(place, 0);
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
    pop.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open, pos === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = () => {
    setVal(String(v.safetyStock));
    setErr(null);
    setOpen((o) => !o);
  };
  const submit = () => {
    const e = validateStockQty(val);
    if (e) return setErr(e);
    dispatch({ type: "stockLock", itemCode: v.itemCode, qty: Number(val.replace(/[,\s]/g, "")), base, name: v.itemName });
    setOpen(false);
    btn.current?.focus();
  };
  const note = locked ? "계획이 바뀌어도 유지" : v.safetySource === "계획" ? "최신 계획 반영" : "계획 없음, 현재 설정값 유지";

  return (
    <span className="safe-cell stock-cell" data-stock-cell={v.itemCode}>
      <span className="stock-top">
        <span className={locked ? "stock-num is-locked" : "stock-num"}>{fmtInt(v.safetyStock)}</span>
        {locked ? (
          <span className="lock-pill" data-lock-state="locked" title="이 품목의 적정재고는 사용자가 고정했습니다">
            <LuLock aria-hidden /> 고정
          </span>
        ) : (
          <span className="lock-pill is-auto" data-lock-state="auto">
            자동
          </span>
        )}
      </span>
      <span className="stock-btns">
        <button ref={btn} type="button" className="btn btn-quiet stock-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={openForm} data-stock-fix aria-label={`${v.itemName} 적정재고 ${locked ? "수량 바꾸기" : "고정"}`}>
          {locked ? <LuPencilLine aria-hidden /> : <LuLock aria-hidden />} {locked ? "수정" : "고정"}
        </button>
        {locked && (
          <button type="button" className="btn btn-quiet stock-btn" onClick={() => dispatch({ type: "stockUnlock", itemCode: v.itemCode, base, name: v.itemName })} data-stock-unlock aria-label={`${v.itemName} 적정재고 고정 해제`}>
            <LuLockOpen aria-hidden /> 해제
          </button>
        )}
      </span>
      <small className="muted stock-note">{note}</small>
      {open &&
        createPortal(
          <div ref={pop} id={id} role="dialog" aria-label={`${v.itemName} 적정재고 고정`} className="terms-pop stock-pop" style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }} data-stock-pop>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              noValidate
            >
              <label htmlFor={`${id}-q`} className="stock-pop-l">
                고정할 적정재고 수량
              </label>
              <input id={`${id}-q`} type="text" inputMode="numeric" value={val} onChange={(e) => (setVal(e.target.value), setErr(null))} aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-e` : `${id}-h`} />
              {err ? (
                <p className="mf-err" id={`${id}-e`} role="alert">
                  {err}
                </p>
              ) : (
                <p className="small muted" id={`${id}-h`}>
                  고정하면 계획이 바뀌어도 이 수량을 유지합니다. 현재재고는 입고·출고에 따라 계속 바뀌고 부족수량도 함께 갱신됩니다. 연결된 계획 데이터가 없어 자동 추천값은 만들지 않습니다.
                </p>
              )}
              <span className="stock-pop-btns">
                <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" data-stock-save>
                  <LuLock aria-hidden /> 고정
                </button>
              </span>
            </form>
          </div>,
          document.body,
        )}
    </span>
  );
}
