// AI 대화 패널: 오른쪽에 고정된 대화창 — 글 답변만 보여 준다 (표·차트 없음)
// 위쪽: 선택 정보(접이식) · 대화 이력 · ⋯ 메뉴 / 가운데: 대화 / 아래: 추천 질문 · 입력창
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuArrowUp, LuChevronDown, LuChevronUp, LuDatabase, LuDownload, LuEllipsis, LuEraser, LuHistory, LuInfo, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { STEPS } from "../ai/agent";
import { resultName, SUGGESTED, useStore, type ChatMessage } from "../store/store";
import { useAgent } from "../store/agent";
import { answerSections } from "../lib/answerText";
import { buildXlsx, exportFileName, XLSX_MIME } from "../lib/xlsx";
import { resultCsv, resultSheets } from "../lib/exporters";
import { saveFile, saveMessage } from "../platform/runtime";
import type { AnalysisResult } from "../lib/analysisTypes";
import { KeywordSearch } from "./KeywordSearch";
import { ConfirmDialog } from "./ConfirmDialog";
import { HistoryPanel } from "./HistoryPanel";
import { SelectionDetail, useSelectionTitle } from "./SelectionDetail";
import { Chip } from "./ui";

/** 'AI와 대화'임이 바로 보이는 아이콘: 말풍선 + 반짝임 */
export function AiChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="ai-chat-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h8A2.5 2.5 0 0 1 17 5.5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M3 9.5A2.5 2.5 0 0 1 5.5 7h11A2.5 2.5 0 0 1 19 9.5v6a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3h-.5A2.5 2.5 0 0 1 3 15.5z"
        fill="currentColor"
        fillOpacity=".16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M11 9.6l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" />
      <path d="M19.6 2.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor" />
    </svg>
  );
}

function EngineBadge({ engine }: { engine: string }) {
  if (engine === "rule") return <span className="engine engine-rule">규칙 기반 데모 응답</span>;
  if (engine === "llm") return <span className="engine engine-llm">LLM 해석 · 계산은 코드</span>;
  return null;
}

/** 답변의 근거 표는 화면에 그리지 않고 파일로만 내보낸다 */
function ExportButtons({ result }: { result: AnalysisResult }) {
  const { state, dispatch } = useStore();
  const name = resultName(state, result);
  const fileBase = `${name.replace(/[\\/:*?"<>|\s]+/g, "_")}_${result.asOf}`;
  const done = (r: Awaited<ReturnType<typeof saveFile>>, what: string) => dispatch({ type: "toast", text: saveMessage(r, what), tone: r === "saved" ? "ok" : "warn" });
  return (
    <>
      <button type="button" className="btn btn-quiet btn-small" data-export="xlsx" title="근거 표 + 조건·근거 시트를 엑셀로 저장" onClick={async () => done(await saveFile(exportFileName("분석결과", name), buildXlsx(resultSheets(result, name), name), XLSX_MIME), "엑셀 파일")}>
        <LuDownload aria-hidden /> 엑셀 내보내기
      </button>
      <button type="button" className="btn btn-quiet btn-small" data-export="csv" title="근거 표를 CSV로 저장" onClick={async () => done(await saveFile(`${fileBase}.csv`, resultCsv(result), "text/csv;charset=utf-8"), "CSV 파일")}>
        <LuDownload aria-hidden /> CSV 내보내기
      </button>
    </>
  );
}

function Assistant({ m }: { m: Extract<ChatMessage, { role: "assistant" }> }) {
  const { state } = useStore();
  const { ask, rerun } = useAgent();
  const result = m.resultId ? state.results[m.resultId] : undefined;
  const sections = useMemo(() => (result ? answerSections(result) : []), [result]);
  const stale = result && result.dataId !== state.meta.dataId && state.lastResultId === result.id; // 가장 최근 답변에만 안내
  const sample = result?.dataLabel.includes("SAMPLE");
  return (
    <div className="msg msg-ai" data-mid={m.id} data-result={m.resultId}>
      <div className="msg-avatar" aria-hidden>
        <AiChatIcon size={18} />
      </div>
      <div className="msg-body">
        <EngineBadge engine={m.engine} />
        {m.text.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
        {result && (
          <>
            {stale && (
              <div className="stale" role="status">
                <LuTriangleAlert aria-hidden />
                <span>분석한 뒤 데이터가 바뀌었습니다. 이 답변은 이전 데이터 기준입니다.</span>
                <button type="button" className="btn btn-small" onClick={() => rerun(result)}>
                  현재 데이터로 다시 분석
                </button>
              </div>
            )}
            {sections.map((s) => (
              <section key={s.id} className="ans-sec" data-section={s.id}>
                <h4>{s.title}</h4>
                <ul>
                  {s.items.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="msg-sources">
              <LuDatabase aria-hidden />
              <span>
                사용 데이터:{" "}
                {result.sources
                  .filter((s) => s.ids.length)
                  .map((s) => `${s.label} ${s.ids.length}건`)
                  .join(" · ")}{" "}
                · 기준일 {result.asOf} · {result.dataLabel}
                {sample ? " · 실제 자료 아님" : ""}
              </span>
            </p>
            <p className="msg-foot">최종 선정과 조치는 자동 확정되지 않습니다. 이 답변은 담당자 검토를 돕는 의사결정 지원 자료입니다.</p>
            <div className="msg-actions">
              <button type="button" className="btn btn-quiet btn-small" onClick={() => rerun(result)} title="현재 데이터로 다시 분석">
                <LuRefreshCw aria-hidden /> 다시 분석
              </button>
              <ExportButtons result={result} />
            </div>
          </>
        )}
        {m.options && (
          <div className="opt-chips" role="group" aria-label="선택지">
            {m.options.map((o) => (
              <button type="button" key={o.id} className={`opt-chip ${m.answered === o.label ? "is-chosen" : ""}`} onClick={() => ask(o.label, { answeringId: m.id })} disabled={state.busy || !!m.answered}>
                <span>{o.label}</span>
                {o.sub && <small>{o.sub}</small>}
              </button>
            ))}
          </div>
        )}
        {m.suggestions && m.id !== "welcome" && (
          <div className="suggest" role="group" aria-label="질문 예시">
            {m.suggestions.map((s) => (
              <button type="button" key={s} className="suggest-chip" onClick={() => ask(s)} disabled={state.busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        {m.engineNote && <p className="msg-note">{m.engineNote}</p>}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { state, derived, dispatch } = useStore();
  const { ask, showAnswer } = useAgent();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selTitle = useSelectionTitle();
  const showDetail = !!selTitle && state.detailOpen;
  const historyCount = Object.keys(state.results).length;
  const closeHistory = useCallback(() => setShowHistory(false), []);

  // 새 메시지: 내 질문·진행 중이면 맨 아래로, 답변이면 그 답변의 시작 위치로 (긴 글을 처음부터 읽게)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const last = state.messages[state.messages.length - 1];
    const node = last && last.role === "assistant" && last.id !== "welcome" && !state.busy ? el.querySelector<HTMLElement>(`[data-mid="${last.id}"]`) : null;
    el.scrollTop = node ? node.offsetTop - el.offsetTop - 8 : el.scrollHeight;
  }, [state.messages.length, state.busy]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (menuRef.current && !menuRef.current.contains(t) && !t.closest(".chat-menu-btn")) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const send = () => {
    if (!text.trim() || state.busy) return;
    const q = text;
    setText("");
    ask(q);
  };

  const openFromHistory = (id: string) => {
    showAnswer(id);
    setTimeout(() => {
      const list = listRef.current;
      const node = list?.querySelector<HTMLElement>(`[data-result="${id}"]`);
      if (!list || !node) return;
      list.scrollTop = node.offsetTop - list.offsetTop - 8;
      node.classList.add("is-flash");
      setTimeout(() => node.classList.remove("is-flash"), 1400);
    }, 60);
  };

  const item = state.selection.itemCode ? derived.itemsByCode.get(state.selection.itemCode) : null;
  const sup = state.selection.supplierId ? derived.suppliersById.get(state.selection.supplierId) : null;

  // 추천 질문: 기본 4개 + 관심 협력사·부품을 넣은 질문
  const suggestions = useMemo(() => {
    const out: string[] = [];
    const fs = state.favorites.suppliers.map((id) => derived.suppliersById.get(id)?.name).filter(Boolean) as string[];
    const fi = state.favorites.items.map((c) => derived.itemsByCode.get(c)?.name).filter(Boolean) as string[];
    if (fs[0]) out.push(`${fs[0]} 평가 근거 보여줘`);
    if (fi[0]) out.push(`${fi[0]} 후보 업체 비교해 줘`);
    else if (fs[1]) out.push(`${fs[0]}랑 ${fs[1]} 비교해줘`);
    return [...out, ...SUGGESTED];
  }, [state.favorites, derived]);

  const step = Math.min(state.progress, STEPS.length - 1);
  return (
    <>
      <div className="panel-head chat-head">
        <div className="panel-title-row">
          <div className="chat-title">
            <span className="chat-title-icon" aria-hidden>
              <AiChatIcon size={18} />
            </span>
            <div className="chat-title-text">
              <h2 className="panel-title">AI 대화</h2>
              <span>{state.aiMode === "llm" ? "LLM 응답 모드" : "규칙 기반 분석 · 글 답변"}</span>
            </div>
          </div>
          <div className="chat-tools">
            {selTitle && (
              <button
                type="button"
                className={`btn btn-quiet detail-toggle ${showDetail ? "is-on" : ""}`}
                onClick={() => dispatch({ type: "detailOpen", open: !state.detailOpen })}
                aria-expanded={showDetail}
                aria-controls="selection-detail"
                title={showDetail ? "선택 정보 접기" : "선택한 협력사·부품 정보 펼치기"}
              >
                <LuInfo aria-hidden /> <span className="detail-toggle-name">{selTitle}</span> {showDetail ? <LuChevronUp aria-hidden /> : <LuChevronDown aria-hidden />}
              </button>
            )}
            <button
              type="button"
              className={`btn btn-quiet history-toggle ${showHistory ? "is-on" : ""}`}
              onClick={() => {
                setShowHistory((v) => !v);
                setMenu(false);
              }}
              aria-expanded={showHistory}
              aria-controls="history-panel"
              title="지난 대화(답변)를 이름으로 찾아 다시 보기"
            >
              <LuHistory aria-hidden /> 대화 이력 <span className="count-badge">{historyCount}</span>
            </button>
            <button type="button" className={`icon-btn chat-menu-btn ${menu ? "is-on" : ""}`} onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" aria-label="대화 메뉴" title="대화 메뉴 (대화 지우기)">
              <LuEllipsis aria-hidden />
            </button>
          </div>
        </div>
        {menu && (
          <div className="chat-menu" ref={menuRef} role="menu" aria-label="대화 메뉴">
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setMenu(false);
                setConfirmClear(true);
              }}
              aria-label="대화 지우기"
            >
              <LuEraser aria-hidden /> 대화 지우기 <small>대화 이력은 남김</small>
            </button>
          </div>
        )}
        {showHistory && <HistoryPanel onClose={closeHistory} onOpen={openFromHistory} />}
      </div>
      {showDetail && (
        <div className="chat-detail">
          <SelectionDetail />
        </div>
      )}
      <div className="chat-search">
        <KeywordSearch />
      </div>
      <div className="chat-list" ref={listRef} role="log" aria-live="polite" aria-label="대화 내용">
        {state.messages.map((m) =>
          m.role === "user" ? (
            <div className="msg msg-user" key={m.id}>
              <p>{m.text}</p>
            </div>
          ) : (
            <Assistant key={m.id} m={m} />
          ),
        )}
        {state.busy && (
          <div className="msg msg-ai">
            <div className="msg-avatar" aria-hidden>
              <AiChatIcon size={18} />
            </div>
            <div className="progress" role="status" aria-label="분석 진행 상태">
              <span className="typing" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className="progress-step">
                {STEPS[step]} <small>({step + 1}/{STEPS.length}단계)</small>
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="composer">
        <div className="suggest-row" role="group" aria-label="추천 질문">
          {suggestions.map((s) => (
            <button type="button" key={s} className="suggest-chip" onClick={() => ask(s)} disabled={state.busy}>
              {s}
            </button>
          ))}
        </div>
        <div className="ctx-chips" aria-label="질문 문맥">
          <span className="ctx-label">질문 대상</span>
          {item ? (
            <Chip tone="accent" onRemove={() => dispatch({ type: "clearSelection", what: "item" })}>
              품목 · {item.name}
            </Chip>
          ) : (
            <span className="ctx-empty">선택한 품목 없음</span>
          )}
          {sup && <Chip onRemove={() => dispatch({ type: "clearSelection", what: "supplier" })}>협력사 · {sup.name}</Chip>}
        </div>
        <form
          className="composer-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            분석 질문
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={2}
            placeholder="분석할 내용을 질문하세요 · 예: 실린더 라이너 후보 업체를 비교해 줘"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="submit" className="send-btn" disabled={state.busy || !text.trim()} aria-label="질문 보내기" title="보내기 (Enter)">
            <LuArrowUp aria-hidden />
          </button>
        </form>
        <p className="composer-hint">Enter 보내기 · Shift+Enter 줄바꿈</p>
      </div>
      {confirmClear && (
        <ConfirmDialog
          title="대화를 지울까요?"
          confirmLabel="대화 지우기"
          onCancel={() => {
            setConfirmClear(false);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onConfirm={() => {
            dispatch({ type: "clearChat" });
            dispatch({ type: "toast", text: "대화를 지웠습니다. 대화 이력은 그대로 남아 있습니다." });
            setConfirmClear(false);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          <p>지금까지 주고받은 대화가 지워집니다. 분석한 답변은 ‘대화 이력’에 그대로 남아 있어 다시 볼 수 있습니다.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
