// 원가-계약 '변동률' 값 위의 상세 팝업. 숫자·비교기간·출처는 모두 src/lib/priceChange.ts(explainPriceChange)의 결과 — AI 에이전트 답변과 같은 함수를 쓴다.
import { useMemo } from "react";
import { HoverPop } from "./HoverPop";
import { SAMPLE_DOCS } from "../data/sample/documents";
import { useStore } from "../store/store";
import { fmtMoney, fmtSignedPct } from "../lib/format";
import { NO_DATA, NO_REASON, explainPriceChange, signedMoney, type PriceChangeCtx, type PriceChangeExplain, type RateRow } from "../lib/priceChange";
import type { ContractView } from "../lib/metrics";

/** 지금 데이터(수기 입력 포함)로 만든 계산 문맥 — 팝업·AI 답변 공통 */
export function usePriceCtx(): PriceChangeCtx {
  const { data, state } = useStore();
  return useMemo(
    () => ({ asOf: state.meta.asOf, items: data.items, suppliers: data.suppliers, contracts: data.contracts, materialPrices: data.materialPrices, fxRates: data.fxRates, laborWages: data.laborWages, docs: SAMPLE_DOCS, isSample: state.meta.isSample }),
    [data, state.meta.asOf, state.meta.isSample],
  );
}

const Rate = ({ r, show }: { r: RateRow | null; show?: string }) =>
  r && r.rate !== null ? (
    <span className={r.rate > 0 ? "pp-up" : r.rate < 0 ? "pp-down" : ""}>
      {r.rate > 0 ? "▲ " : r.rate < 0 ? "▼ " : "– "}
      {fmtSignedPct(r.rate)}
      {show ? <span className="muted"> {show}</span> : null}
    </span>
  ) : (
    <span className="muted">{NO_DATA}</span>
  );

function Body({ e }: { e: PriceChangeExplain }) {
  return (
    <div className="pp" data-price-pop>
      <p className="pp-title">
        <b>{e.itemName}</b> · {e.supplierName} <span className="code">{e.contractId}</span>
      </p>
      <dl>
        <dt>이전 확정단가 → 현재 확정단가</dt>
        <dd>{e.status === "quote" ? `견적 ${fmtMoney(e.curr, e.currency)} (확정 아님)` : e.prev ? `${fmtMoney(e.prev, e.currency)} → ${fmtMoney(e.curr, e.currency)}` : `이전 단가 없음 → ${fmtMoney(e.curr, e.currency)}`}</dd>
        <dt>증감액 · 변동률</dt>
        <dd>
          {e.status === "ok" ? (
            <>
              <b className={(e.delta as number) > 0 ? "pp-up" : (e.delta as number) < 0 ? "pp-down" : ""}>{signedMoney(e.delta as number, e.currency)}</b> · <b className={(e.rate ?? 0) > 0 ? "pp-up" : (e.rate ?? 0) < 0 ? "pp-down" : ""}>{fmtSignedPct(e.rate)}</b>
              {e.currency !== "KRW" && <span className="muted"> (계약통화 {e.currency} 기준)</span>}
            </>
          ) : (
            <span className="muted">{e.whyNot}</span>
          )}
        </dd>
        <dt>비교기간</dt>
        <dd>
          <span className="pp-block">단가: {e.priceBasis}</span>
          <span className="pp-block">참고 지표: {e.period.label}</span>
          <span className="muted pp-block">{e.period.mixed ? "지표마다 기간이 달라 실제 쓴 기간을 각각 표시했습니다." : e.period.basis}</span>
        </dd>
        <dt>관련 원자재 시세 변동률</dt>
        <dd>
          {e.materials.length ? (
            <ul className="pp-list">
              {e.materials.map((m) => (
                <li key={m.material}>
                  {m.material}: 국내 <Rate r={m.domestic} /> · 국제(원화 환산) <Rate r={m.intl} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">{e.materialNote}</span>
          )}
        </dd>
        <dt>관련 직종 인건비 동향 변동률</dt>
        <dd>
          {e.jobs.length ? (
            <ul className="pp-list">
              {e.jobs.map((j) => (
                <li key={j.job}>
                  {j.job}: <Rate r={j.row} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">{e.jobNote}</span>
          )}
          <span className="muted pp-block">연결 근거: {e.jobBasis}</span>
        </dd>
        {e.fx && (
          <>
            <dt>환율 변동 ({e.fx.unit})</dt>
            <dd>
              <Rate r={e.fx} /> <span className="muted">— 계약통화 단가 변동과 구분되는 별도 지표</span>
            </dd>
          </>
        )}
        <dt>① 확인된 사유</dt>
        <dd>
          {e.confirmedReasons.length ? (
            <ul className="pp-list">
              {e.confirmedReasons.map((r) => (
                <li key={r.docId}>
                  {r.direction ? `${r.direction}: ` : ""}
                  {r.text} <span className="muted">(문서 {r.docId} · {r.date})</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">문서 근거가 있는 사유 없음</span>
          )}
          {e.relatedDocs.length > 0 && <span className="muted pp-block">관련 문서(사유 명시 없음): {e.relatedDocs.map((d) => `${d.title} (${d.docId})`).join(", ")}</span>}
        </dd>
        <dt>② 관련 동향 (참고)</dt>
        <dd>
          {!e.confirmedReasons.length && <b className="pp-block">{NO_REASON}</b>}
          {e.interpretation.map((t, i) => (
            <span key={i} className="pp-block">
              {t}
            </span>
          ))}
        </dd>
        {e.caveats.length > 0 && (
          <>
            <dt>비교 시 유의</dt>
            <dd>
              {e.caveats.map((t, i) => (
                <span key={i} className="pp-block">
                  {t}
                </span>
              ))}
            </dd>
          </>
        )}
        <dt>자료 기준일 · 출처</dt>
        <dd>
          {e.asOf}
          {e.isSample && <span className="pill pill-muted pp-sample">SAMPLE · 실제 자료 아님</span>}
          <span className="muted pp-block">{e.sources.join(" · ")}</span>
        </dd>
      </dl>
    </div>
  );
}

function PriceBody({ c }: { c: ContractView }) {
  const ctx = usePriceCtx();
  return <Body e={explainPriceChange(c, ctx)} />;
}

/** up = 표의 기존 '기준 이상 상승' 강조(delta-up) 여부 */
export function PriceChangePop({ c, up }: { c: ContractView; up?: boolean }) {
  const text = c.docType === "견적" ? "–" : fmtSignedPct(c.changeRate);
  return (
    <HoverPop label={`변동률 ${text} 상세 보기`} className={up ? "delta-up" : ""} data="price" trigger={<span>{text}</span>}>
      <PriceBody c={c} />
    </HoverPop>
  );
}
