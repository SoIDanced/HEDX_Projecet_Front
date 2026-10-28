// v0.7.0 수기입력 창: 견적서·납기보고서·계약서를 직접 입력해 대시보드에 바로 반영한다.
// 입력 규칙·변환·합치기는 src/lib/manual.ts(순수 함수), 이 파일은 화면만 맡는다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LuCircleAlert, LuPencilLine, LuTrash2, LuX } from "react-icons/lu";
import { DOC_TAB, DOC_TARGET, DOC_TYPES, DETAIL_FIELDS, DIRECT, MAX, UNITS, AMOUNT_WARN_PCT, amountGapPct, autoAmount, buildEntry, emptyForm, manualCounts, parseNum, syncAmount, validateManual, type FieldKey, type ManualForm } from "../lib/manual";
import type { ManualDocType } from "../data/types";
import { fmtInt, fmtMoney } from "../lib/format";
import { useStore } from "../store/store";
import { ConfirmDialog } from "./ConfirmDialog";
import { trapTab, useReturnFocus } from "./focus";

export function ManualEntryDialog() {
  const { state } = useStore();
  return state.manualOpen ? <Dialog /> : null;
}

const rid = () => `M-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function Field({ id, label, required, error, hint, children, wide }: { id: string; label: string; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mf-field ${wide ? "mf-wide" : ""} ${error ? "has-err" : ""}`} data-field={id}>
      <label htmlFor={`mf-${id}`}>
        {label}
        {required && (
          <>
            <span className="mf-req" aria-hidden>
              *
            </span>
            <span className="sr-only"> (필수)</span>
          </>
        )}
      </label>
      {children}
      {hint && !error && <p className="mf-hint">{hint}</p>}
      {error && (
        <p className="mf-err" id={`mf-${id}-err`} role="alert">
          <LuCircleAlert aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

function Dialog() {
  const { state, dispatch, data, derived } = useStore();
  const asOf = state.meta.asOf;
  const boxRef = useRef<HTMLDivElement>(null);
  useReturnFocus();

  const [form, setForm] = useState<ManualForm>(() => emptyForm("견적서", asOf));
  const [initial, setInitial] = useState(() => JSON.stringify(form));
  const [shown, setShown] = useState<Set<string>>(new Set()); // 한 번 벗어난 칸
  const [submitted, setSubmitted] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const catalog = state.data.items; // 직접 입력으로 만든 품목(MANUAL-…)은 목록에 넣지 않는다 — 같은 이름을 다시 쓰면 같은 코드가 재사용됨
  const catMap = useMemo(() => new Map(catalog.map((i) => [i.itemCode, i])), [catalog]);
  const currencies = useMemo(() => {
    const set = new Set<string>(["KRW"]);
    for (const c of data.contracts) set.add(c.currency);
    for (const p of data.purchaseOrders) set.add(p.currency);
    return [...set];
  }, [data.contracts, data.purchaseOrders]);
  const ctx = useMemo(
    () => ({ asOf, items: catMap, supplierIds: new Set(data.suppliers.map((s) => s.supplierId)), currencies, poNos: new Set(data.purchaseOrders.map((p) => p.poNo)), contractIds: new Set(data.contracts.map((c) => c.contractId)) }),
    [asOf, catMap, data, currencies],
  );
  const errors = validateManual(form, ctx);
  const dirty = JSON.stringify(form) !== initial;
  const err = (k: FieldKey) => (submitted || shown.has(k) ? errors[k] : undefined);
  const set = (patch: Partial<ManualForm>) => setForm((f) => syncAmount({ ...f, ...patch }));
  const blur = (k: FieldKey) => setShown((s) => new Set(s).add(k));
  const inv = (k: FieldKey) => ({ id: `mf-${k}`, "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `mf-${k}-err` : undefined, onBlur: () => blur(k) });

  // 처음 초점: 첫 칸(문서 종류)
  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>('input[name="mf-doc"]:checked')?.focus();
  }, []);

  const tryClose = () => (dirty ? setConfirmClose(true) : dispatch({ type: "manualOpen", open: false }));

  const pickDocType = (t: ManualDocType) =>
    setForm((f) => ({ ...f, docType: t, docNo: "", validUntil: "", receivedDate: "", receivedQty: "", delayReason: "", paymentTerms: "" }));

  const pickItem = (code: string) => {
    if (code === DIRECT) {
      set({ itemSel: code, spec: "", unit: "" });
      setLive("품목명 직접 입력 칸이 나타났습니다.");
      setTimeout(() => boxRef.current?.querySelector<HTMLElement>("#mf-itemName")?.focus(), 0);
    } else {
      const it = catMap.get(code);
      set({ itemSel: code, itemName: "", spec: it?.spec ?? "", unit: it?.unit && it.unit.trim() ? it.unit : "" });
      setLive(code ? "품목명 직접 입력 칸이 숨겨졌습니다." : "");
    }
  };

  const save = (keepGoing: boolean) => {
    setSubmitted(true);
    const e = validateManual(form, ctx);
    if (Object.keys(e).length) {
      setTimeout(() => boxRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 30);
      return;
    }
    const entry = buildEntry(form, { id: rid(), now: new Date().toISOString(), items: catMap, manual: state.manual });
    const tab = DOC_TAB[entry.docType];
    const supName = derived.suppliersById.get(entry.supplierId)?.name ?? entry.supplierId;
    dispatch({
      type: "addManual",
      entry,
      toastText: `${entry.docType} 1건을 저장했습니다 (${supName} · ${entry.itemName}). 대시보드에 반영했습니다.`,
      select: { label: "보기", tab, rowKey: entry.docNo, supplierId: entry.supplierId, itemCode: entry.itemCode },
      here: state.tab === tab && (state.subView[tab] ?? "list") === "list",
    });
    if (keepGoing) {
      const next = emptyForm(form.docType, asOf, { supplierId: form.supplierId });
      setForm(next);
      setInitial(JSON.stringify(next));
      setShown(new Set());
      setSubmitted(false);
      setSavedCount((n) => n + 1);
      setLive(`${entry.docType} 1건을 저장했습니다. 이어서 입력하세요.`);
      setTimeout(() => boxRef.current?.querySelector<HTMLElement>("#mf-itemSel")?.focus(), 0);
    } else dispatch({ type: "manualOpen", open: false });
  };

  const gap = form.amountTouched ? amountGapPct(form) : null;
  const auto = autoAmount(form.qty, form.unitPrice);
  const isDirect = form.itemSel === DIRECT;
  const nextCode = useMemo(() => {
    const same = state.manual.find((m) => m.newItem && m.itemName.toLowerCase() === form.itemName.trim().toLowerCase());
    if (same) return same.itemCode;
    const n = state.manual.reduce((m, x) => Math.max(m, Number(/^MANUAL-(\d+)$/.exec(x.itemCode)?.[1] ?? 0)), 0) + 1;
    return `MANUAL-${String(n).padStart(3, "0")}`;
  }, [state.manual, form.itemName]);
  const mc = manualCounts(state.manual);
  const unitOpts = form.unit && !UNITS.includes(form.unit) ? [...UNITS, form.unit] : UNITS;
  const supName = (id: string) => derived.suppliersById.get(id)?.name ?? id;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && tryClose()}>
      <div
        className="modal manual-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-title"
        ref={boxRef}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !confirmClose && !delId) {
            e.preventDefault();
            e.stopPropagation();
            tryClose();
          }
          trapTab(e, boxRef.current);
        }}
      >
        <div className="modal-head">
          <h2 id="manual-title">
            <LuPencilLine aria-hidden /> 수기 입력
          </h2>
          <button type="button" className="icon-btn" onClick={tryClose} aria-label="닫기">
            <LuX aria-hidden />
          </button>
        </div>
        <form
          className="manual-form"
          autoComplete="off"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          <div className="modal-body">
            <p className="small muted manual-intro">
              직접 입력한 값은 SAMPLE이 아닌 ‘수기 입력’으로 표시되며, 저장하면 표·평가·지표·AI 답변에 바로 반영됩니다. 이 브라우저에만 저장됩니다. <span aria-hidden>*</span> 표시는 필수 입력입니다.
            </p>
            <fieldset className="mf-doc">
              <legend>
                문서 종류<span className="mf-req" aria-hidden>*</span>
              </legend>
              <div className="mf-seg">
                {DOC_TYPES.map((t) => (
                  <label key={t} className={`mf-seg-opt ${form.docType === t ? "is-on" : ""}`}>
                    <input type="radio" name="mf-doc" value={t} checked={form.docType === t} onChange={() => pickDocType(t)} data-doc={t} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
              <p className="mf-hint" data-target>
                반영 위치: {DOC_TARGET[form.docType]}
              </p>
            </fieldset>

            <div className="mf-grid">
              <Field id="supplierId" label="공급사" required error={err("supplierId")}>
                <select {...inv("supplierId")} value={form.supplierId} onChange={(e) => set({ supplierId: e.target.value })}>
                  <option value="">공급사 선택</option>
                  {data.suppliers.map((s) => (
                    <option key={s.supplierId} value={s.supplierId}>
                      {s.name} ({s.supplierId})
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="itemSel" label="품목명" required error={err("itemSel")}>
                <select {...inv("itemSel")} value={form.itemSel} onChange={(e) => pickItem(e.target.value)}>
                  <option value="">품목 선택</option>
                  {catalog.map((i) => (
                    <option key={i.itemCode} value={i.itemCode}>
                      {i.name} ({i.itemCode})
                    </option>
                  ))}
                  <option value={DIRECT}>직접입력</option>
                </select>
              </Field>
              {isDirect && (
                <>
                  <Field id="itemName" label="품목명 직접 입력" required error={err("itemName")} hint="1~60자. 목록에 없는 품목은 코드가 자동으로 붙습니다.">
                    <input type="text" {...inv("itemName")} value={form.itemName} maxLength={MAX.name + 20} onChange={(e) => set({ itemName: e.target.value })} />
                  </Field>
                  <div className="mf-field" data-field="itemCode">
                    <span className="mf-label">품목코드</span>
                    <output className="mf-readonly" id="mf-itemCode">
                      {nextCode} <small>자동 부여</small>
                    </output>
                  </div>
                </>
              )}
              <Field id="spec" label="규격" error={err("spec")}>
                <input type="text" {...inv("spec")} value={form.spec} onChange={(e) => set({ spec: e.target.value })} />
              </Field>
              <Field id="qty" label="수량" required error={err("qty")}>
                <input type="text" inputMode="decimal" {...inv("qty")} value={form.qty} onChange={(e) => set({ qty: e.target.value })} />
              </Field>
              <Field id="unit" label="단위" required error={err("unit")}>
                <select {...inv("unit")} value={form.unit} onChange={(e) => set({ unit: e.target.value })}>
                  <option value="">단위 선택</option>
                  {unitOpts.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="unitPrice" label="단가" required error={err("unitPrice")}>
                <input type="text" inputMode="decimal" {...inv("unitPrice")} value={form.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} />
              </Field>
              <Field id="currency" label="통화" required error={err("currency")}>
                <select {...inv("currency")} value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="amount"
                label="금액"
                required
                error={err("amount")}
                wide
                hint={!form.amountTouched ? "수량 × 단가로 자동 계산됩니다. 직접 고칠 수도 있습니다." : undefined}
              >
                <input type="text" inputMode="decimal" {...inv("amount")} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value, amountTouched: e.target.value !== "" }))} />
                {!Number.isNaN(parseNum(form.amount)) && <p className="mf-hint mf-fmt">= {fmtMoney(parseNum(form.amount), form.currency)}</p>}
                {gap !== null && gap > AMOUNT_WARN_PCT && (
                  <p className="mf-warn" role="status" data-amount-warn>
                    <LuCircleAlert aria-hidden /> 수량 × 단가(= {fmtInt(auto)})와 {gap.toFixed(1)}% 다릅니다. 의도한 금액이면 그대로 저장해도 됩니다.{" "}
                    <button type="button" className="link-btn" onClick={() => setForm((f) => syncAmount({ ...f, amountTouched: false }))}>
                      자동 계산으로 되돌리기
                    </button>
                  </p>
                )}
              </Field>
            </div>

            <fieldset className="mf-details" data-details={form.docType}>
              <legend>{form.docType} 세부 사항</legend>
              <div className="mf-grid">
                {DETAIL_FIELDS[form.docType].map((d) => (
                  <Field key={d.key} id={d.key} label={d.label} required={d.required} error={err(d.key)} hint={d.hint} wide={d.key === "note" || d.key === "delayReason"}>
                    <input
                      type={d.kind === "date" ? "date" : "text"}
                      inputMode={d.kind === "num" ? "decimal" : undefined}
                      {...inv(d.key)}
                      value={String(form[d.key])}
                      onChange={(e) => set({ [d.key]: e.target.value } as Partial<ManualForm>)}
                    />
                  </Field>
                ))}
              </div>
            </fieldset>

            <details className="mf-manage" data-manage open={state.manual.length > 0 && savedCount === 0 ? undefined : undefined}>
              <summary>수기 입력 {mc.total}건 관리</summary>
              {state.manual.length === 0 ? (
                <p className="small muted">아직 직접 입력한 문서가 없습니다.</p>
              ) : (
                <ul className="mf-list">
                  {state.manual.map((m) => (
                    <li key={m.id} data-manual-id={m.id}>
                      <span className="pill pill-info">{m.docType}</span>
                      <span className="mf-list-text">
                        {supName(m.supplierId)} · {m.itemName} · {m.docDate ?? "–"} · <span className="code">{m.docNo}</span>
                      </span>
                      <button type="button" className="icon-btn" aria-label={`${m.docNo} 삭제`} onClick={() => setDelId(m.id)}>
                        <LuTrash2 aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small muted">지우면 대시보드가 바로 원래 값으로 돌아옵니다. 고치려면 지우고 다시 입력하세요(수정 기능은 없음).</p>
            </details>
            <p className="sr-only" role="status" aria-live="polite">
              {live}
            </p>
          </div>
          <div className="modal-foot">
            {savedCount > 0 && <span className="small muted mf-saved-note">이번 창에서 {savedCount}건 저장</span>}
            <span className="spacer" />
            <button type="button" className="btn btn-quiet" onClick={tryClose} data-manual-cancel>
              취소
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => save(true)} data-manual-continue>
              저장 후 계속 입력
            </button>
            <button type="submit" className="btn btn-primary" data-manual-save>
              저장
            </button>
          </div>
        </form>
      </div>
      {confirmClose && (
        <ConfirmDialog title="작성 중인 내용을 버릴까요?" confirmLabel="버리고 닫기" cancelLabel="계속 입력" onCancel={() => setConfirmClose(false)} onConfirm={() => dispatch({ type: "manualOpen", open: false })}>
          <p>저장하지 않은 입력 내용은 사라집니다.</p>
        </ConfirmDialog>
      )}
      {delId && (
        <ConfirmDialog
          title="수기 입력을 지울까요?"
          confirmLabel="지우기"
          onCancel={() => setDelId(null)}
          onConfirm={() => {
            dispatch({ type: "deleteManual", id: delId });
            setDelId(null);
            setTimeout(() => boxRef.current?.querySelector<HTMLElement>(".mf-manage summary")?.focus(), 40); // 지운 버튼이 사라지므로 초점을 관리 목록 제목으로
          }}
        >
          <p>이 문서를 지우면 표·평가·지표·AI 답변이 바로 원래 값으로 돌아옵니다.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
