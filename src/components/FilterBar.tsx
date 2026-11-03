// 데이터 탭 필터: 검색 + 빠른 필터 + 상세 필터(부품 분류 포함) + 적용 중인 조건 칩
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CountUp } from "./ui";
import { fmtInt } from "../lib/format";
import { LuChevronDown, LuChevronUp, LuListFilter, LuSearch, LuX, LuZap } from "react-icons/lu";
import { chipText, isActive, type DateRange, type FilterDef, type FilterValues, type Option, type Range } from "../lib/filters";
import { PART_NOTE, SPEED_NOTE } from "../data/classification";
import type { Scope, ScopeOptions } from "../lib/scope";

export function FilterBar<T>({
  id,
  defs,
  values,
  onChange,
  query,
  onQuery,
  placeholder,
  shown,
  total,
  lead,
  actions,
  extra,
  scopeRow,
  asOf,
  scopeCount,
  onClearScope,
}: {
  id: string;
  defs: FilterDef<T>[];
  values: FilterValues;
  onChange: (v: FilterValues) => void;
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  shown: number;
  total: number;
  lead?: ReactNode; // 상세 필터 버튼 바로 오른쪽에 놓는 버튼(수기입력)
  actions?: ReactNode;
  extra?: ReactNode;
  scopeRow?: ReactNode; // 첫째 줄: 엔진모델 → 부품 → 품목 → 협력업체
  asOf?: string; // 셋째 줄에 보일 데이터 기준일
  scopeCount?: number; // 공통 범위(첫째 줄)가 걸려 있으면 1 이상 — '전체 초기화'를 보이게 한다
  onClearScope?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  // 전체 건수가 바뀌었을 때(문서·수기 입력·입고 반영 등 데이터 변화)만 건수가 세어 올라간다. 필터·검색으로 바뀔 때는 바로 최종 값
  const prevTotal = useRef(total);
  const dataChanged = prevTotal.current !== total;
  useEffect(() => {
    prevTotal.current = total;
  }, [total]);
  const quick = defs.filter((d) => d.kind === "quick");
  const detail = defs.filter((d) => d.kind !== "quick");
  const active = defs.filter((d) => isActive(d, values[d.key]));
  const detailActive = active.filter((d) => d.kind !== "quick").length;
  const quickActive = active.length - detailActive;
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });
  const clearAll = () => {
    onChange({});
    onQuery("");
    onClearScope?.();
  };

  return (
    <div className="filters">
      {scopeRow}
      <div className="filter-row">
        {quick.length > 0 && (
          <button type="button" className={`btn btn-quiet quick-toggle ${qOpen || quickActive ? "is-on" : ""}`} onClick={() => setQOpen(!qOpen)} aria-expanded={qOpen} aria-controls={`filter-quick-${id}`} data-quick-toggle>
            <LuZap aria-hidden /> 빠른 필터{quickActive ? ` ${quickActive}` : ""}
            {qOpen ? <LuChevronUp aria-hidden /> : <LuChevronDown aria-hidden />}
          </button>
        )}
        <button type="button" className={`btn btn-quiet filter-toggle ${open || detailActive ? "is-on" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`filter-detail-${id}`}>
          <LuListFilter aria-hidden /> 상세 필터{detailActive ? ` ${detailActive}` : ""}
          {open ? <LuChevronUp aria-hidden /> : <LuChevronDown aria-hidden />}
        </button>
        {lead}
        <label className="search-field">
          <LuSearch aria-hidden />
          <span className="sr-only">검색</span>
          <input id={`filter-q-${id}`} type="search" placeholder={placeholder} value={query} onChange={(e) => onQuery(e.target.value)} />
        </label>
        {actions}
      </div>
      {qOpen && quick.length > 0 && (
        <div className="quick-row quick-panel" id={`filter-quick-${id}`} role="group" aria-label="빠른 필터">
          {quick.map((d) => {
            const on = values[d.key] === true;
            return (
              <button key={d.key} type="button" className={`chip-btn ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => set(d.key, on ? undefined : true)} data-filter={d.key} title={d.kind === "quick" ? d.hint : undefined}>
                {d.label}
              </button>
            );
          })}
        </div>
      )}
      {open && (
        <div className="filter-detail" id={`filter-detail-${id}`}>
          {detail.map((d) => (
            <div key={d.key} className={`fd-field ${d.kind === "cascade" ? "fd-wide" : ""}`}>
              <span className="fd-label" id={`fl-${id}-${d.key}`}>
                {d.label}
                {d.kind === "cascade" && d.hint && <small>{d.hint}</small>}
              </span>
              <FieldControl def={d} id={`f-${id}-${d.key}`} value={values[d.key]} onChange={(v) => set(d.key, v)} />
            </div>
          ))}
        </div>
      )}
      <div className="filter-status">
        <span className="filter-count" aria-live="polite">
          조회 <b><CountUp value={shown} format={fmtInt} live={dataChanged} still /></b>건 · 전체 <CountUp value={total} format={fmtInt} live still />건{asOf ? ` · 데이터 기준일 ${asOf}` : ""}
        </span>
        {(active.length > 0 || query || !!scopeCount) && (
          <div className="active-chips">
            {query && (
              <span className="fchip">
                검색: {query}
                <button type="button" onClick={() => onQuery("")} aria-label="검색어 해제">
                  <LuX aria-hidden />
                </button>
              </span>
            )}
            {active.map((d) => (
              <span key={d.key} className="fchip">
                {chipText(d, values[d.key])}
                <button type="button" onClick={() => set(d.key, undefined)} aria-label={`${d.label} 조건 해제`}>
                  <LuX aria-hidden />
                </button>
              </span>
            ))}
            <button type="button" className="link-btn" onClick={clearAll}>
              전체 초기화
            </button>
          </div>
        )}
        {extra && <span className="filter-extra">{extra}</span>}
      </div>
    </div>
  );
}

function FieldControl<T>({ def, id, value, onChange }: { def: FilterDef<T>; id: string; value: unknown; onChange: (v: unknown) => void }) {
  switch (def.kind) {
    case "multi": {
      const sel = (Array.isArray(value) ? value : []) as string[];
      return (
        <div className="fd-multi" role="group" aria-label={def.label}>
          {def.options.map((o) => {
            const on = sel.includes(o.value);
            return (
              <button key={o.value} type="button" className={`chip-btn ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => onChange(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "range": {
      const r = (value || {}) as Range;
      return (
        <div className="fd-range">
          <input id={`${id}-min`} type="number" inputMode="decimal" placeholder="최소" value={r.min ?? ""} onChange={(e) => onChange({ ...r, min: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`${def.label} 최소`} />
          <span>~</span>
          <input id={`${id}-max`} type="number" inputMode="decimal" placeholder="최대" value={r.max ?? ""} onChange={(e) => onChange({ ...r, max: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`${def.label} 최대`} />
          {def.unit && <span className="fd-unit">{def.unit}</span>}
        </div>
      );
    }
    case "below":
    case "within":
      return (
        <div className="fd-range">
          <input id={id} type="number" inputMode="decimal" placeholder={def.kind === "below" ? def.placeholder ?? "기준값" : "일수"} value={(value as number | undefined) ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} aria-label={def.label} />
          <span className="fd-unit">
            {def.unit}
            {def.kind === "below" ? " 미만" : " 이내"}
          </span>
        </div>
      );
    case "select":
      return (
        <select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} aria-label={def.label}>
          <option value="">전체</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "dateRange": {
      const r = (value || {}) as DateRange;
      return (
        <div className="fd-range">
          <input id={`${id}-from`} type="date" value={r.from ?? ""} onChange={(e) => onChange({ ...r, from: e.target.value || undefined })} aria-label={`${def.label} 시작`} />
          <span>~</span>
          <input id={`${id}-to`} type="date" value={r.to ?? ""} onChange={(e) => onChange({ ...r, to: e.target.value || undefined })} aria-label={`${def.label} 끝`} />
        </div>
      );
    }
    case "cascade": {
      const path = (Array.isArray(value) ? value : []) as string[];
      return (
        <div className="fd-cascade" role="group" aria-label={def.label}>
          {def.levels.map((lv, i) => {
            const enabled = i === 0 || !!path[i - 1];
            const opts = enabled ? def.options(path, i) : [];
            return (
              <label key={lv} className="fd-cascade-step">
                <span>{lv}</span>
                <select
                  id={`${id}-${i}`}
                  value={path[i] ?? ""}
                  disabled={!enabled}
                  onChange={(e) => {
                    const next = [...path.slice(0, i), e.target.value].filter(Boolean);
                    onChange(next.length ? next : undefined);
                  }}
                >
                  <option value="">{enabled ? "전체" : "앞 단계를 먼저 고르세요"}</option>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}

/** 첫째 줄: 엔진모델 → 부품 → 품목 → 협력업체 드롭다운(기본 '전체'). 공통 선택이라 탭을 바꿔도 유지된다 */
export function ScopeRow({ scope, options, onChange }: { scope: Scope; options: ScopeOptions; onChange: (key: keyof Scope, value: string) => void }) {
  const fields: { key: keyof Scope; label: string; opts: Option[]; tip?: string }[] = [
    { key: "speed", label: "엔진모델", opts: options.speed, tip: SPEED_NOTE },
    { key: "group", label: "부품", opts: options.group, tip: PART_NOTE },
    { key: "item", label: "품목", opts: options.item },
    { key: "supplier", label: "협력업체", opts: options.supplier },
  ];
  return (
    <div className="scope-wrap">
      <div className="scope-row" role="group" aria-label="조회 대상 선택: 엔진모델, 부품, 품목, 협력업체 순서로 좁힙니다">
        {fields.map((f) => (
          <label key={f.key} className="scope-field" title={f.tip}>
            <span className="scope-label">
              {f.label}
              {f.key === "speed" && <em className="scope-sample">시연용</em>}
            </span>
            <select id={`scope-${f.key}`} value={scope[f.key]} onChange={(e) => onChange(f.key, e.target.value)} aria-describedby={f.tip ? `scope-note-${f.key}` : undefined} data-scope={f.key}>
              <option value="">전체</option>
              {f.opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {f.tip && (
              <span id={`scope-note-${f.key}`} className="sr-only">
                {f.tip}
              </span>
            )}
          </label>
        ))}
      </div>
      {(scope.speed || scope.group) && (
        <p className="scope-note">
          {scope.speed && `${SPEED_NOTE} `}
          {scope.group && PART_NOTE}
        </p>
      )}
    </div>
  );
}
