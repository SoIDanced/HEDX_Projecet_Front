// AI 에이전트 패널: 오른쪽에 고정된 대화창 — 글 답변만 보여 준다 (표·차트 없음)
// 위쪽: 선택 정보(접이식) · 대화 이력 · 대화 지우기 / 가운데: 대화 / 아래: 추천 질문 · 입력창
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuArrowDown, LuArrowUp, LuDatabase, LuDownload, LuEraser, LuFileUp, LuHistory, LuInfo, LuRefreshCw, LuSquare, LuTriangleAlert } from "react-icons/lu";
import { STEPS } from "../ai/agent";
import { resultName, SUGGESTED, useStore, type ChatMessage } from "../store/store";
import { useAgent } from "../store/agent";
import { answerSections } from "../lib/answerText";
import { DOC_ACCEPT, DOC_OK_TEXT, registerDocument, validateDocumentFile } from "../lib/documents";
import { buildXlsx, exportFileName, XLSX_MIME } from "../lib/xlsx";
import { resultCsv, resultSheets } from "../lib/exporters";
import { saveFile, saveMessage } from "../platform/runtime";
import type { AnalysisResult } from "../lib/analysisTypes";
import { AiAvatar } from "./AiAvatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { HistoryPanel } from "./HistoryPanel";
import { SelectionDetail, useSelectionTitle } from "./SelectionDetail";
import { Chip, Words } from "./ui";

function EngineBadge({ engine }: { engine: string }) {
  if (engine === "rule") return <span className="engine engine-rule">규칙 기반 데모 응답</span>;
  if (engine === "llm") return <span className="engine engine-llm">LLM 해석 · 계산은 코드</span>;
  if (engine === "error") return <span className="engine engine-error">오류</span>;
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
  const { state, meta } = useStore();
  const { ask, rerun } = useAgent();
  const result = m.resultId ? state.results[m.resultId] : undefined;
  const sections = useMemo(() => (result ? answerSections(result) : []), [result]);
  const stale = result && result.dataId !== meta.dataId && state.lastResultId === result.id; // 가장 최근 답변에만 안내
  const sample = result?.dataLabel.includes("SAMPLE");
  return (
    <div className="msg msg-ai" data-mid={m.id} data-result={m.resultId}>
      <div className="msg-avatar" aria-hidden>
        <AiAvatar size={32} />
      </div>
      <div className={`msg-body ${m.error ? "is-error" : ""}`}>
        <EngineBadge engine={m.error ? "error" : m.engine} />
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
                <h3>{s.title}</h3>
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
        {m.resultId && !result && (
          <p className="msg-gone" data-gone>
            <LuTriangleAlert aria-hidden />
            <span>이 답변의 분석 결과는 대화 이력에서 삭제되어 근거 자료·엑셀·CSV 내보내기와 다시 분석을 쓸 수 없습니다. 위의 글 내용은 그대로 남아 있습니다.</span>
          </p>
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
        {m.error && m.retryQ && (
          <div className="msg-actions">
            <button type="button" className="btn btn-small" onClick={() => ask(m.retryQ!)} disabled={state.busy}>
              <LuRefreshCw aria-hidden /> 다시 시도
            </button>
          </div>
        )}
        {m.engineNote && <p className="msg-note">{m.engineNote}</p>}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { state, derived, dispatch } = useStore();
  const { ask, abort, showAnswer } = useAgent();
  const [text, setText] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [newBelow, setNewBelow] = useState(false); // 위를 읽는 중 새 답변이 온 경우
  const [announce, setAnnounce] = useState(""); // 스크린리더용 한 줄 알림 (긴 답변 전체를 읽지 않게)
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [registering, setRegistering] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const seenCount = useRef(state.messages.length);
  const selTitle = useSelectionTitle();
  const showDetail = !!selTitle && state.detailOpen;
  const historyCount = Object.keys(state.results).length;
  const closeHistory = useCallback(() => setShowHistory(false), []);
  const onlyWelcome = state.messages.every((m) => m.id === "welcome");

  const toAnswerStart = (el: HTMLElement, id: string) => {
    const node = el.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    el.scrollTop = node ? node.offsetTop - el.offsetTop - 8 : el.scrollHeight;
  };

  // 새 메시지: 내 질문이거나 맨 아래 근처(80px)를 보는 중이면 따라가고, 위를 읽는 중이면 '새 답변 ↓' 버튼만 보여 준다
  useEffect(() => {
    const el = listRef.current;
    const last = state.messages[state.messages.length - 1];
    if (!el || !last) return;
    if (last.role === "user") nearBottom.current = true;
    if (!nearBottom.current) {
      if (last.role === "assistant" && last.id !== "welcome") setNewBelow(true);
      return;
    }
    if (last.role === "assistant" && last.id !== "welcome" && !state.busy) toAnswerStart(el, last.id);
    else el.scrollTop = el.scrollHeight;
    setNewBelow(false);
  }, [state.messages.length, state.busy]);

  // 새 답변이 오면 스크린리더에는 제목 한 줄만 알린다
  useEffect(() => {
    const n = state.messages.length;
    const last = state.messages[n - 1];
    if (n > seenCount.current && last?.role === "assistant") {
      const r = last.resultId ? state.results[last.resultId] : undefined;
      setAnnounce(`새 답변: ${(r?.title ?? last.text[0] ?? "").slice(0, 60)}`);
    }
    seenCount.current = n;
  }, [state.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 질문·칩·버튼을 눌러 비활성이 되면 초점이 사라지므로 입력칸으로 돌려준다
  useEffect(() => {
    if (!state.busy) return;
    const a = document.activeElement as HTMLButtonElement | null;
    if (!a || a === document.body || a.disabled || !a.isConnected) inputRef.current?.focus();
  }, [state.busy]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    if (nearBottom.current) setNewBelow(false);
  };

  const jumpNew = () => {
    const el = listRef.current;
    const last = [...state.messages].reverse().find((m) => m.role === "assistant");
    if (el && last) toAnswerStart(el, last.id);
    setNewBelow(false);
  };

  const send = () => {
    if (!text.trim() || state.busy) return;
    const q = text;
    setText("");
    ask(q);
    inputRef.current?.focus();
  };

  // 문서 등록: 형식·크기만 화면에서 검사하고, 실제 파싱·청킹·임베딩·벡터DB 저장은 백엔드 몫(src/lib/documents.ts 스텁)
  const onPickDocs = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = ""; // 같은 파일을 다시 골라도 반응하게
    if (!files.length || registering) return;
    for (const f of files) {
      const err = validateDocumentFile(f);
      if (err) return void dispatch({ type: "toast", text: files.length > 1 ? `${f.name}: ${err}` : err, tone: "warn" });
    }
    setRegistering(true);
    try {
      await Promise.all(files.map((f) => registerDocument(f)));
      dispatch({ type: "toast", text: files.length > 1 ? `${DOC_OK_TEXT}
(${files.length}건)` : DOC_OK_TEXT });
    } catch {
      dispatch({ type: "toast", text: "문서 등록에 실패했습니다. 잠시 뒤 다시 시도해 주세요.", tone: "warn" });
    } finally {
      setRegistering(false);
    }
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
  // 표에서 고른 행 자체(품목·협력사)는 한 줄 요약에 이미 있으므로 같은 칩은 다시 그리지 않는다
  const rowTab = state.selection.rowTab;
  const ctxItem = item && rowTab !== "inventory" ? item : null;
  const ctxSup = sup && rowTab !== "suppliers" ? sup : null;
  const ctxChips =
    ctxItem || ctxSup ? (
      <div className="ctx-chips" role="group" aria-label="질문 대상">
        {ctxItem && (
          <Chip tone="accent" removeLabel="품목 선택 해제" onRemove={() => dispatch({ type: "clearSelection", what: "item" })}>
            품목 · {ctxItem.name}
          </Chip>
        )}
        {ctxSup && (
          <Chip removeLabel="협력사 선택 해제" onRemove={() => dispatch({ type: "clearSelection", what: "supplier" })}>
            협력사 · {ctxSup.name}
          </Chip>
        )}
      </div>
    ) : null;

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

  const suggestRow = (
    <div className="suggest-row" id="suggest-row" role="group" aria-label="추천 질문">
      {suggestions.map((s) => (
        <button
          type="button"
          key={s}
          className="suggest-chip"
          onClick={() => ask(s)}
          disabled={state.busy}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const step = Math.min(state.progress, STEPS.length - 1);
  return (
    <>
      <div className="panel-head chat-head">
        <div className="panel-title-row">
          <div className="chat-title">
            <span className="chat-title-icon" aria-hidden>
              <AiAvatar size={36} />
            </span>
            <div className="chat-title-text">
              <Words as="h2" className="panel-title" text="AI 에이전트" />
              <span>{state.aiMode === "llm" ? "LLM 응답 모드" : "규칙 기반 분석 · 글 답변"}</span>
            </div>
          </div>
          <div className="chat-tools">
            {selTitle && (
              <button
                type="button"
                className={`icon-btn detail-toggle ${showDetail ? "is-on" : ""}`}
                onClick={() => dispatch({ type: "detailOpen", open: !state.detailOpen })}
                aria-expanded={showDetail}
                aria-controls="selection-detail"
                aria-label={`${showDetail ? "선택 정보 접기" : "선택 정보 펼치기"}: ${selTitle}`}
                title={`${showDetail ? "선택 정보 접기" : "선택한 협력사·부품 정보 펼치기"} · ${selTitle}`}
              >
                <LuInfo aria-hidden />
              </button>
            )}
            <button
              type="button"
              className={`btn btn-quiet history-toggle ${showHistory ? "is-on" : ""}`}
              onClick={(e) => {
                e.currentTarget.focus(); // 눌러도 초점이 안 옮겨지는 브라우저 대비 — 닫을 때 여기로 돌아온다
                setShowHistory((v) => !v);
              }}
              aria-expanded={showHistory}
              aria-controls="history-panel"
              title="지난 대화(답변)를 이름으로 찾아 다시 보기"
            >
              <LuHistory aria-hidden /> 대화 이력 <span className="count-badge">{historyCount}</span>
            </button>
            <button type="button" className="btn btn-quiet clear-chat-btn" onClick={() => setConfirmClear(true)} title="지금까지의 대화를 지웁니다 (대화 이력은 남김)">
              <LuEraser aria-hidden /> 대화 지우기
            </button>
          </div>
        </div>
        {showHistory && <HistoryPanel onClose={closeHistory} onOpen={openFromHistory} />}
      </div>
      {selTitle && (
        <div className="chat-detail">
          <SelectionDetail />
          {ctxChips}
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
      <div className="chat-list" ref={listRef} role="log" aria-live="off" aria-label="대화 내용" onScroll={onListScroll}>
        {state.messages.map((m) =>
          m.role === "user" ? (
            <div className="msg msg-user" key={m.id}>
              <p>{m.text}</p>
            </div>
          ) : (
            <Assistant key={m.id} m={m} />
          ),
        )}
      </div>
      {state.busy && (
        <div className="progress-row">
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
          <button type="button" className="btn btn-small stop-btn" onClick={abort} title="진행 중인 요청을 멈춥니다">
            <LuSquare aria-hidden /> 중단
          </button>
        </div>
      )}
      <div className="new-below-wrap">
        {newBelow && (
          <button type="button" className="new-below" onClick={jumpNew}>
            새 답변 <LuArrowDown aria-hidden />
          </button>
        )}
      </div>
      <div className="composer">
        {onlyWelcome && suggestRow}
        {!selTitle && ctxChips}
        <div className="doc-row">
          <input ref={fileRef} id="doc-file-input" type="file" hidden multiple accept={DOC_ACCEPT} onChange={(e) => onPickDocs(e.target.files)} />
          <button type="button" className="btn btn-quiet btn-small doc-register-btn" onClick={() => fileRef.current?.click()} disabled={registering} aria-busy={registering} title="PDF·DOCX 문서를 등록합니다 (파일당 최대 20MB)">
            <LuFileUp aria-hidden /> {registering ? "등록 중…" : "문서 등록"}
          </button>
          <span className="doc-hint">PDF · DOCX, 20MB 이하</span>
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
          onCancel={() => setConfirmClear(false)} /* 초점은 확인 창이 열릴 때 있던 '대화 지우기' 버튼으로 돌아간다 */
          onConfirm={() => {
            dispatch({ type: "clearChat" });
            dispatch({ type: "toast", text: "대화를 지웠습니다. 대화 이력은 그대로 남아 있습니다." });
            setConfirmClear(false);
            setTimeout(() => inputRef.current?.focus(), 30); // 확인 창의 초점 복귀(0ms)보다 뒤에 입력칸으로
          }}
        >
          <p>지금까지 주고받은 대화가 지워집니다. 분석한 답변은 ‘대화 이력’에 그대로 남아 있어 다시 볼 수 있습니다.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
