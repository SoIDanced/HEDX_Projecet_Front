// 선택 정보: 데이터 관리 표에서 고른 협력업체·발주·계약·부품의 상세 — 오른쪽 AI 에이전트 패널 위쪽에 접이식으로 표시
// 기본은 한 줄 요약, 펼치면 2열 상세(높이 제한·내부 스크롤). 질문을 보내거나 새 답변이 나오면 접히고, 대화 패널 머리의 '선택 정보' 아이콘으로 다시 열고 닫는다
import { useMemo, type ReactNode } from "react";
import { LuChevronDown, LuChevronUp, LuMessageSquareText, LuPackageCheck, LuPencilLine, LuX } from "react-icons/lu";
import { TAB_LABEL } from "../data/types";
import { useStore } from "../store/store";
import { useAgent } from "../store/agent";
import { FavStar } from "./FavStar";
import { GradeTimeline } from "./GradeTimeline";
import { GradeBadge, StatusPill } from "./ui";
import { condText, fmtDate, fmtInt, fmtMoney, fmtNum, fmtPct, fmtSignedPct } from "../lib/format";
import { pathText } from "../lib/bom";
import { PART_NOTE, partGroupText } from "../data/classification";
import { buildWageTree, jobsForProcess } from "../lib/market";

/** 표에서 고른 행 선택을 풀고 선택 정보도 닫는다 (접힘·펼침 모두 같은 글자·같은 크기: 위치가 달라지면 잘못 누르기 쉽다) */
function ClearSelection() {
  const { dispatch } = useStore();
  return (
    <button type="button" className="link-btn detail-clear" onClick={() => dispatch({ type: "clearSelection", what: "row" })} title="표의 행 선택을 해제합니다" aria-label="표의 행 선택 해제">
      <LuX aria-hidden /> 선택 해제
    </button>
  );
}

function Detail({ title, summary, fields, actions, onClose, star, children }: { title: string; summary: string[]; fields: [string, ReactNode][]; actions?: ReactNode; onClose: () => void; star?: ReactNode; children?: ReactNode }) {
  const { state, dispatch } = useStore();
  const open = state.detailOpen;
  // 머리 줄(요소·CSS 상자)은 접힘·펼침이 같다: [왼쪽: 제목 또는 한 줄 요약] [선택 해제] [접기/펼치기] — 오른쪽 두 칸 위치 고정
  return (
    <section className={open ? "row-detail" : "row-summary"} aria-label={`${title} ${open ? "상세" : "요약"}`} id={open ? "selection-detail" : undefined}>
      <div className="row-detail-head">
        {open ? (
          <>
            {star}
            <h3>{title}</h3>
          </>
        ) : (
          <p className="row-summary-text" title={[title, ...summary].join(" · ")}>
            <b>{title}</b>
            {summary.map((t) => ` · ${t}`).join("")}
          </p>
        )}
        <span className="spacer" />
        <ClearSelection />
        <button
          type="button"
          className="icon-btn"
          onClick={() => (open ? onClose() : dispatch({ type: "detailOpen", open: true }))}
          aria-expanded={open}
          aria-controls="selection-detail"
          aria-label={open ? "선택 정보 접기" : "선택 정보 펼치기"}
          title={open ? "접기 (한 줄 요약으로)" : "펼치기"}
        >
          {open ? <LuChevronUp aria-hidden /> : <LuChevronDown aria-hidden />}
        </button>
      </div>
      {open && (
        <>
          <dl className="kv">
            {fields.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v ?? "–"}</dd>
              </div>
            ))}
          </dl>
          {children}
          {actions && <div className="row-detail-actions">{actions}</div>}
        </>
      )}
    </section>
  );
}

/** 지금 선택된 행의 제목 (대화 패널 머리 아이콘에 표시) */
export function useSelectionTitle(): string | null {
  const { state, derived } = useStore();
  const { rowTab, rowKey } = state.selection;
  if (!rowTab || !rowKey) return null;
  if (rowTab === "suppliers") return derived.suppliersById.get(rowKey)?.name ?? null;
  if (rowTab === "purchaseOrders") return derived.poViews.find((p) => p.poNo === rowKey)?.poNo ?? null;
  if (rowTab === "contracts") return derived.contractViews.find((c) => c.contractId === rowKey)?.contractId ?? null;
  return derived.itemsByCode.get(rowKey)?.name ?? null;
}

export function SelectionDetail() {
  const { state, derived, dispatch } = useStore();
  const { ask } = useAgent();
  const tab = state.selection.rowTab;
  const selectedKey = state.selection.rowKey;
  const itemName = (code: string) => derived.itemsByCode.get(code)?.name ?? code;
  const wageTree = useMemo(() => buildWageTree(state.data.laborWages), [state.data.laborWages]);
  const askItem = (code: string) => ask(`${itemName(code)}의 과거 거래 업체를 등급, 납기 실적, 최근 단가와 함께 비교해 줘`);
  const askSupplier = (name: string) => ask(`${name}의 평가 근거를 정리해 줘`);
  const close = () => dispatch({ type: "detailOpen", open: false });
  const goSub = (t: "contracts" | "inventory", view: string) => {
    dispatch({ type: "subView", tab: t, view });
    dispatch({ type: "focusData" });
  };

  let detail: ReactNode = null;
  if (selectedKey && tab) {
    if (tab === "suppliers") {
      const s = derived.supplierViews.find((x) => x.supplierId === selectedKey);
      const ev = s && derived.evaluations.get(s.supplierId);
      const del = s && derived.supplierDelivery.get(s.supplierId);
      if (s && ev) {
        const jobs = jobsForProcess(s.process);
        detail = (
          <Detail
            title={`${s.name} · ${s.supplierId}`}
            onClose={close}
            summary={[`등급 ${ev.grade}`, del ? `납기 ${fmtPct(del.rate)}` : "납기 –"]}
            star={<FavStar kind="suppliers" id={s.supplierId} name={s.name} size="md" />}
            fields={[
              ["평가등급(산정)", <><GradeBadge grade={ev.grade} /> {fmtNum(ev.total)}점</>],
              ["심사 등급(입력)", s.auditGrade ? `${s.auditGrade} · ${s.lastAuditDate ?? ""}` : "–"],
              ["공정 · 지역", `${s.process ?? "–"} · ${s.region ?? "–"}`],
              ["납기", del ? `마감 ${del.evaluated}건 중 기한 내 ${del.onTime}건 (${fmtPct(del.rate)})` : "–"],
              ["진행 중 발주", del ? `${del.open}건 · 납기 경과 ${del.overdueOpen}건` : "–"],
              [
                "관련 직종 임금 (전년 대비)",
                jobs.length ? (
                  <span className="job-wages">
                    {jobs.map((j) => {
                      const n = wageTree.byMinor.get(j);
                      return (
                        <span key={j} className="mat-tag" title="가공비·인건비 인상 요청 검토 참고 (원가-계약 › 인건비 동향)">
                          {j} {n?.yoy !== null && n?.yoy !== undefined ? <span className={n.yoy > 0 ? "delta-up" : "delta-down"}>{fmtSignedPct(n.yoy)}</span> : <span className="muted">자료 없음</span>}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  "–"
                ),
              ],
            ]}
            actions={
              <button type="button" className="btn btn-quiet" onClick={() => askSupplier(s.name)} disabled={state.busy}>
                <LuMessageSquareText aria-hidden /> 평가 근거 분석 요청
              </button>
            }
          >
            <div className="supply-parts">
              <p className="tl-head">
                <b>공급 부품과 분류 경로</b>
              </p>
              <ul>
                {s.items.map((c) => (
                  <li key={c}>
                    <FavStar kind="items" id={c} name={itemName(c)} />
                    <b>{itemName(c)}</b> <span className="code">{c}</span>
                    <span className="muted"> {partGroupText(c)} · {pathText(derived.bomIndex, c) ?? "분류 경로 없음"}</span>
                  </li>
                ))}
                {!s.items.length && <li className="muted">등록된 공급 품목이 없습니다</li>}
              </ul>
            </div>
            <GradeTimeline history={s.evalHistory} current={{ grade: ev.grade, score: ev.total }} />
          </Detail>
        );
      }
    } else if (tab === "purchaseOrders") {
      const p = derived.poViews.find((x) => x.poNo === selectedKey);
      const pay = p && derived.payments.rows.find((r) => r.poNo === p.poNo);
      if (p)
        detail = (
          <Detail
            title={`${p.poNo} · ${p.itemName}`}
            onClose={close}
            summary={[p.supplierName, p.status, `납기 ${p.dueDate}`]}
            fields={[
              ["발주 업체", `${p.supplierName} (${p.supplierId})`],
              ["수량 · 단가", `${fmtInt(p.qty)} × ${fmtMoney(p.unitPrice ?? null, p.currency)}`],
              ["발주 → 납기", `${p.orderDate} → ${p.dueDate}`],
              ["입고", p.receivedDate ? `${p.receivedDate}${p.delayDays ? ` (${p.delayDays}일 지연)` : " (기한 내)"}` : p.partial ? `부분입고 · 마지막 입고 ${p.lastReceivedDate ?? "–"} · 잔량 ${fmtInt(p.remainQty)} 남음${p.status === "납기 지연" ? ` · 납기 후 ${p.delayDays}일 경과` : ""}` : p.status === "납기 지연" ? `미입고 · 납기 후 ${p.delayDays}일 경과` : "미입고 (진행 중)"],
              ["누적 입고수량 · 발주잔량", p.status === "취소" ? "–" : `${fmtInt(p.rcvQty)} / ${fmtInt(p.qty)} · 잔량 ${fmtInt(p.remainQty)}${p.rcvAssumed ? " (수량 기록 없이 입고일만 있어 전량으로 봄)" : ""}`],
              ["상태", <StatusPill value={p.status} />],
              ["결제 예정", pay ? (pay.payDate ? `${pay.payDate} · ${pay.status} (${pay.terms})` : `${pay.status} · ${pay.note ?? pay.terms}`) : "과거 결제분 (표시 기간 밖)"],
              ["부품군", <span title={PART_NOTE}>{partGroupText(p.itemCode)} <span className="muted">(프로젝트용 분류)</span></span>],
              ["부품 분류 경로", pathText(derived.bomIndex, p.itemCode) ?? "–"],
              ...(p.source === "manual" ? ([["출처", "수기 입력 (납기보고서) — SAMPLE 아님, 사용자가 직접 입력한 값"], ...(p.receivedQty ? [["입고 수량", fmtInt(p.receivedQty)]] : []), ...(p.delayReason ? [["지연 사유", p.delayReason]] : []), ...(p.note ? [["비고", p.note]] : [])] as [string, string][]) : []),
            ]}
            actions={
              <>
                <button type="button" className="btn btn-quiet" onClick={() => askItem(p.itemCode)} disabled={state.busy}>
                  <LuMessageSquareText aria-hidden /> 이 품목 후보 업체 비교
                </button>
                {p.status !== "취소" && (p.remainQty ?? 0) > 0 && (
                  <button type="button" className="btn btn-quiet" data-po-receipt-detail onClick={() => dispatch({ type: "receiptOpen", open: true, poNo: p.poNo })}>
                    <LuPackageCheck aria-hidden /> 입고 기록 (부분입고)
                  </button>
                )}
                {p.source === "manual" && p.manualId && (
                  <>
                    <button type="button" className="btn btn-quiet" data-po-receive onClick={() => dispatch({ type: "manualOpen", open: true, edit: { id: p.manualId!, focus: "receivedDate" } })}>
                      <LuPackageCheck aria-hidden /> {p.receivedDate || p.lastReceivedDate ? "입고 내용 수정" : "입고 처리"}
                    </button>
                    <button type="button" className="btn btn-quiet" data-po-edit onClick={() => dispatch({ type: "manualOpen", open: true, edit: { id: p.manualId! } })}>
                      <LuPencilLine aria-hidden /> 수기 입력 수정
                    </button>
                  </>
                )}
              </>
            }
          />
        );
    } else if (tab === "contracts") {
      const c = derived.contractViews.find((x) => x.contractId === selectedKey);
      if (c)
        detail = (
          <Detail
            title={`${c.contractId} · ${c.itemName}`}
            onClose={close}
            summary={[c.supplierName, `단가 ${fmtSignedPct(c.changeRate)}`, c.expiresInDays !== null ? `종료까지 ${c.expiresInDays}일` : "종료일 –"]}
            fields={[
              ["거래 협력업체", `${c.supplierName} (${c.supplierId})`],
              ["규격", c.spec ?? "–"],
              ["단가", `${fmtMoney(c.prevUnitPrice ?? null, c.currency)} → ${fmtMoney(c.unitPrice, c.currency)} (${fmtSignedPct(c.changeRate)})`],
              ["계약 기간", `${c.startDate ?? "–"} ~ ${c.endDate ?? "–"}${c.expiresInDays !== null ? ` · 종료까지 ${c.expiresInDays}일` : ""}`],
              ["계약 조건", condText(c) || "–"],
              ["주요 소재", derived.itemsByCode.get(c.itemCode)?.materials?.join(", ") || "–"],
              ["부품군", <span title={PART_NOTE}>{partGroupText(c.itemCode)} <span className="muted">(프로젝트용 분류)</span></span>],
              ...(c.source === "manual" ? ([["출처", `수기 입력 (${c.docType === "견적" ? "견적서 — 확정된 계약이 아닌 견적 단가, 원가 점수·결제 일정에는 쓰지 않음" : "계약서"}) — SAMPLE 아님, 사용자가 직접 입력한 값`], ...(c.qty ? [["수량 · 금액", `${fmtInt(c.qty)} ${c.unit ?? ""} · ${fmtMoney(c.amount ?? null, c.currency)}`]] : []), ...(c.desiredDueDate ? [["희망 납기", c.desiredDueDate]] : []), ...(c.note ? [["비고", c.note]] : [])] as [string, string][]) : []),
            ]}
            actions={
              <>
                <button type="button" className="btn btn-quiet" onClick={() => askItem(c.itemCode)} disabled={state.busy}>
                  <LuMessageSquareText aria-hidden /> 이 품목 후보 업체 비교
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => goSub("contracts", "materials")}>
                  원자재 시세 보기
                </button>
              </>
            }
          />
        );
    } else {
      const v = derived.inventoryViews.find((x) => x.itemCode === selectedKey);
      if (v)
        detail = (
          <Detail
            title={`${v.itemName} · ${v.itemCode}`}
            onClose={close}
            summary={[`재고 ${fmtInt(v.stockQty)}/${fmtInt(v.safetyStock)} ${v.unit}`, v.shortage ? `부족 ${v.shortage}` : "충분", v.supplierName]}
            star={<FavStar kind="items" id={v.itemCode} name={v.itemName} size="md" />}
            fields={[
              ["재고 / 적정재고", `${fmtInt(v.stockQty)} / ${fmtInt(v.safetyStock)} ${v.unit}${v.shortage ? ` (부족 ${v.shortage})` : ""}`],
              ["적정재고 상태", v.safetyLocked ? `고정 ${fmtInt(v.safetyStock)} (초기값 ${fmtInt(v.safetyInitial ?? null)}) — 계획이 바뀌어도 유지` : `자동 · 연결된 계획 데이터가 없어 현재 설정값 ${fmtInt(v.safetyStock)} 유지`],
              ...(v.stockAdj ? ([["입고 기록 반영", `현재재고에 +${fmtInt(v.stockAdj)} 포함 (수기 입력·입고 기록)`]] as [string, string][]) : []),
              ["발주 잔량", `${fmtInt(v.openOrderQty)} ${v.unit}${v.overdueOpen ? ` · 납기 경과 ${v.overdueOpen}건` : ""}`],
              ["예상 입고일", fmtDate(v.expectedDate)],
              ["주 공급업체", v.supplierName],
              ["보관 위치", v.location ?? "–"],
              ["부품군", <span title={PART_NOTE}>{partGroupText(v.itemCode)} <span className="muted">(프로젝트용 분류)</span></span>],
              ["부품 분류 경로", pathText(derived.bomIndex, v.itemCode) ?? "–"],
            ]}
            actions={
              <>
                <button type="button" className="btn btn-quiet" onClick={() => askItem(v.itemCode)} disabled={state.busy}>
                  <LuMessageSquareText aria-hidden /> 이 품목 후보 업체 비교
                </button>
              </>
            }
          />
        );
    }
  }

  if (!detail) return null;
  return (
    <div className="selection-wrap">
      <p className="selection-eyebrow">선택 정보 · {tab ? TAB_LABEL[tab] : ""}</p>
      {detail}
    </div>
  );
}
