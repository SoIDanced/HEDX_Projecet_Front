// 2단계 입고 기록 창: 기존 발주번호에 '이번 입고수량'을 연결한다(부분입고 지원).
// 입고 건마다 고유 입고 ID — 창을 열 때 한 번 만들고, 같은 폼을 다시 제출하거나 수정해도 같은 ID라 이중 가산되지 않는다. 규칙·합산은 src/lib/receipts.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { LuCircleAlert, LuPackageCheck, LuPencilLine, LuTrash2, LuX } from "react-icons/lu";
import { fmtInt } from "../lib/format";
import { parseQty, validateReceipt } from "../lib/receipts";
import { shortageOf } from "../lib/stockPolicy";
import { useStore } from "../store/store";
import { trapTab, useReturnFocus } from "./focus";

export function ReceiptDialog() {
  const { state } = useStore();
  return state.receiptOpen ? <Dialog poNo={state.receiptOpen.poNo} editId={state.receiptOpen.editId} /> : null;
}

const newId = () => `RC-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Dialog({ poNo, editId }: { poNo: string; editId?: string }) {
  const { state, dispatch, derived } = useStore();
  const asOf = state.meta.asOf;
  const boxRef = useRef<HTMLDivElement>(null);
  useReturnFocus();
  const po = derived.poViews.find((p) => p.poNo === poNo);
  const inv = po ? derived.inventoryViews.find((v) => v.itemCode === po.itemCode) : undefined;
  const log = po?.receiptLog ?? [];
  const [id, setId] = useState(() => editId ?? newId()); // 이 입고 건의 고유 ID(멱등 키)
  const cur = state.receipts.find((r) => r.id === id);
  const [date, setDate] = useState(() => cur?.date ?? asOf);
  const [qty, setQty] = useState(() => (cur ? String(cur.qty) : ""));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>("#rc-qty")?.focus();
  }, []);

  const close = () => dispatch({ type: "receiptOpen", open: false });
  const errors = useMemo(() => (po ? validateReceipt({ date, qty }, po, cur?.id) : {}), [po, date, qty, cur]);
  const hasErr = Object.keys(errors).length > 0;

  if (!po) return null;
  const others = log.filter((x) => x.id !== cur?.id).reduce((a, x) => a + x.qty, 0);
  const q = parseQty(qty);
  const valid = !hasErr && Number.isFinite(q);
  const afterTotal = others + (valid ? q : 0);
  const afterRemain = Math.max(po.qty - afterTotal, 0);
  const stockBefore = inv ? inv.stockQty - (cur ? cur.qty : 0) : null; // 지금 저장된 이 입고분을 뺀 재고(수정 미리보기)
  const stockAfter = inv && stockBefore !== null && valid ? stockBefore + q : null;

  const save = () => {
    setSubmitted(true);
    if (hasErr || !Number.isFinite(q)) {
      setTimeout(() => boxRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 30);
      return;
    }
    const total = afterTotal;
    const remain = afterRemain;
    const stockPart = inv ? ` · 현재재고 ${fmtInt(stockBefore)} → ${fmtInt(stockAfter)}${stockAfter !== null && inv ? ` · 부족수량 ${fmtInt(shortageOf(inv.safetyStock, stockAfter))}` : ""}` : "";
    dispatch({
      type: "saveReceipt",
      receipt: { id, poNo: po.poNo, date, qty: q, createdAt: cur?.createdAt ?? new Date().toISOString() },
      itemCode: po.itemCode,
      toastText: `${po.poNo} 입고 ${cur ? "수정" : "기록"}: 누적 입고 ${fmtInt(total)}/${fmtInt(po.qty)} · 발주잔량 ${fmtInt(remain)}${stockPart}`,
    });
  };
  const startEdit = (rid: string) => {
    const r = state.receipts.find((x) => x.id === rid);
    if (!r) return;
    setId(r.id);
    setDate(r.date);
    setQty(String(r.qty));
    setSubmitted(false);
    setTimeout(() => boxRef.current?.querySelector<HTMLElement>("#rc-qty")?.focus(), 0);
  };
  const del = (rid: string) => {
    const r = state.receipts.find((x) => x.id === rid);
    if (!r) return;
    dispatch({ type: "deleteReceipt", id: rid, toastText: `${po.poNo} 입고 ${fmtInt(r.qty)} 기록을 지웠습니다. 누적 입고수량·발주잔량·현재재고가 원래대로 돌아왔습니다.` });
    close();
  };
  const showErr = (k: "date" | "qty") => (submitted || (k === "qty" ? qty !== "" : false)) && errors[k];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal receipt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        ref={boxRef}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
          trapTab(e, boxRef.current);
        }}
        data-receipt-dialog
      >
        <div className="modal-head">
          <h2 id="receipt-title">
            <LuPackageCheck aria-hidden /> 입고 기록 · {po.poNo}
          </h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="닫기">
            <LuX aria-hidden />
          </button>
        </div>
        <form
          className="manual-form"
          autoComplete="off"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="modal-body">
            <p className="small muted manual-intro">
              {po.itemName} · {po.supplierName}. 입력한 입고는 이 발주번호의 누적 입고수량·발주잔량과 현재재고·부족수량에 함께 반영됩니다. 나눠서 입고되면 여러 번 기록할 수 있고, 같은 입고는 한 번만 반영됩니다.
              {po.source === "manual" ? " (수기 입력 발주)" : state.meta.isSample ? " (SAMPLE 발주에 사용자가 입력한 입고 기록)" : ""}
            </p>
            <dl className="rc-sum" data-rc-sum>
              <div><dt>발주수량</dt><dd>{fmtInt(po.qty)}</dd></div>
              <div><dt>누적 입고수량</dt><dd>{fmtInt(po.rcvQty)}</dd></div>
              <div><dt>발주잔량</dt><dd>{fmtInt(po.remainQty)}</dd></div>
              <div><dt>납기 예정일</dt><dd>{po.dueDate}</dd></div>
            </dl>
            <div className="mf-grid">
              <div className={`mf-field ${showErr("date") ? "has-err" : ""}`}>
                <label htmlFor="rc-date">입고일<span className="mf-req" aria-hidden>*</span><span className="sr-only"> (필수)</span></label>
                <input id="rc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={showErr("date") ? true : undefined} aria-describedby={showErr("date") ? "rc-date-err" : undefined} />
                {showErr("date") && (
                  <p className="mf-err" id="rc-date-err" role="alert">
                    <LuCircleAlert aria-hidden /> {errors.date}
                  </p>
                )}
              </div>
              <div className={`mf-field ${showErr("qty") ? "has-err" : ""}`}>
                <label htmlFor="rc-qty">이번 입고수량<span className="mf-req" aria-hidden>*</span><span className="sr-only"> (필수)</span></label>
                <input id="rc-qty" type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={showErr("qty") ? true : undefined} aria-describedby={showErr("qty") ? "rc-qty-err" : "rc-qty-hint"} />
                {showErr("qty") ? (
                  <p className="mf-err" id="rc-qty-err" role="alert">
                    <LuCircleAlert aria-hidden /> {errors.qty}
                  </p>
                ) : (
                  <p className="mf-hint" id="rc-qty-hint">
                    발주잔량 {fmtInt(Math.max(po.qty - others, 0))}까지 입력할 수 있습니다.
                  </p>
                )}
              </div>
            </div>
            {valid && (
              <p className="rc-preview" role="status" data-rc-preview>
                저장하면: 누적 입고수량 {fmtInt(afterTotal)} / 발주수량 {fmtInt(po.qty)} · 발주잔량 {fmtInt(afterRemain)}{afterRemain === 0 ? " (전량 입고)" : " (부분입고)"}
                {inv && stockAfter !== null ? ` · 현재재고 ${fmtInt(stockBefore)} → ${fmtInt(stockAfter)} · 부족수량 ${fmtInt(shortageOf(inv.safetyStock, stockAfter))}` : " · 이 품목은 재고 기록이 없어 현재재고는 바뀌지 않습니다"}
              </p>
            )}
            <h3 className="rc-h">입고 이력 {log.length}건</h3>
            {log.length === 0 ? (
              <p className="small muted">아직 입고 기록이 없습니다.</p>
            ) : (
              <ul className="mf-list" data-rc-log>
                {log.map((x) => (
                  <li key={x.id} data-receipt-id={x.id}>
                    <span className="pill pill-muted">{x.source}</span>
                    <span className="mf-list-text">
                      {x.date} · {fmtInt(x.qty)}
                      {x.source === "기존 자료" && state.meta.isSample ? " (수량 기록이 없어 입고일 기준 전량)" : ""}
                    </span>
                    {x.source === "입고 기록" && (
                      <>
                        <button type="button" className="icon-btn" aria-label={`${x.date} 입고 ${fmtInt(x.qty)} 수정`} title="수정" onClick={() => startEdit(x.id)}>
                          <LuPencilLine aria-hidden />
                        </button>
                        <button type="button" className="icon-btn" aria-label={`${x.date} 입고 ${fmtInt(x.qty)} 삭제`} title="삭제" onClick={() => del(x.id)}>
                          <LuTrash2 aria-hidden />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-foot">
            <span className="spacer" />
            <button type="button" className="btn btn-quiet" onClick={close}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" data-receipt-save>
              {cur ? "수정 저장" : "입고 기록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
