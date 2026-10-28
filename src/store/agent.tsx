// 질문 → 글 답변 흐름을 화면 어디서든 쓸 수 있게 묶는다
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { answer } from "../ai/agent";
import { detectProvider, type LLMProvider } from "../ai/llm";
import { runAnalysis } from "../lib/analysis";
import type { AnalysisResult } from "../lib/analysisTypes";
import { uid, useStore } from "./store";

interface AgentApi {
  ask: (question: string, opts?: { answeringId?: string }) => Promise<void>;
  /** 진행 중인 요청 중단 */
  abort: () => void;
  showAnswer: (resultId: string) => void;
  rerun: (result: AnalysisResult) => void;
  provider: LLMProvider | null;
  providerChecked: boolean;
}

const Ctx = createContext<AgentApi | null>(null);

const TIMEOUT_MS = 30000; // 응답이 없으면 30초 뒤 요청을 끊는다

export const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches;

export function AgentProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [checked, setChecked] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const abort = useCallback(() => ctrlRef.current?.abort(), []);

  useEffect(() => {
    let alive = true;
    detectProvider().then((p) => {
      if (!alive) return;
      setProvider(p);
      setChecked(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const ask = useCallback(
    async (question: string, opts?: { answeringId?: string }) => {
      const { state, dispatch, derived, data, meta } = ref.current;
      const q = question.trim();
      if (!q || state.busy) return;
      if (opts?.answeringId) dispatch({ type: "patchMessage", id: opts.answeringId, patch: { answered: q } });
      dispatch({ type: "addMessage", message: { id: uid(), role: "user", text: q, at: new Date().toISOString() } });
      dispatch({ type: "busy", busy: true, progress: 0 });
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, TIMEOUT_MS);
      const abortMsg = () => (timedOut ? "응답 시간이 30초를 넘어 요청을 끊었습니다." : "요청을 중단했습니다.");
      const aborted = () => {
        if (ctrl.signal.aborted) throw new Error(abortMsg());
      };
      try {
        if (state.aiMode === "llm") {
          if (!provider) throw new Error("LLM API 제공자를 사용할 수 없습니다.");
          const text = await provider.generate(q, ctrl.signal);
          aborted();
          dispatch({
            type: "addMessage",
            message: {
              id: uid(),
              role: "assistant",
              at: new Date().toISOString(),
              engine: "llm",
              text: [text],
            },
          });
          return;
        }
        const reply = await Promise.race([
          answer(
          q,
          {
            data,
            derived,
            meta,
            selection: state.selection,
            lastResult: state.lastResultId ? state.results[state.lastResultId] : null,
            pending: state.pending,
          },
          null,
          (i) => !ctrl.signal.aborted && dispatch({ type: "busy", busy: true, progress: i }),
          ),
          // 규칙 기반 분석 자체는 끊을 수 없어, 중단하면 기다리지 않고 결과를 버린다
          new Promise<never>((_, reject) => ctrl.signal.addEventListener("abort", () => reject(new Error(abortMsg())), { once: true })),
        ]);
        const base = { id: uid(), role: "assistant" as const, at: new Date().toISOString(), engine: reply.engine, engineNote: reply.engineNote, text: reply.text };
        if (reply.type === "analysis") {
          // 분석이 끝나면 글 답변을 대화에 바로 붙인다 (표·차트 없음)
          const r = reply.result;
          dispatch({ type: "addResult", result: r });
          dispatch({ type: "pending", pending: null });
          dispatch({ type: "show", resultId: r.id });
          dispatch({ type: "addMessage", message: { ...base, resultId: r.id, followup: reply.followup } });
        } else if (reply.type === "clarify") {
          dispatch({ type: "pending", pending: reply.pending });
          dispatch({ type: "addMessage", message: { ...base, options: reply.options, need: reply.pending.need, answered: null } });
        } else {
          dispatch({ type: "addMessage", message: { ...base, suggestions: reply.suggestions } });
        }
      } catch (e) {
        dispatch({
          type: "addMessage",
          message: { id: uid(), role: "assistant", at: new Date().toISOString(), engine: "system", text: [`${state.aiMode === "llm" ? "LLM API 요청" : "분석"} 중 오류가 났습니다: ${ctrl.signal.aborted ? abortMsg() : (e as Error).message}`], error: true, retryQ: q },
        });
      } finally {
        clearTimeout(timer);
        if (ctrlRef.current === ctrl) ctrlRef.current = null;
        dispatch({ type: "busy", busy: false });
      }
    },
    [provider],
  );

  /** 이력에서 고른 지난 답변을 대화에 다시 보여 준다 (대화를 지운 뒤에도 가능) */
  const showAnswer = useCallback((resultId: string) => {
    const { state, dispatch } = ref.current;
    const r = state.results[resultId];
    if (!r) return;
    dispatch({ type: "show", resultId });
    if (!state.messages.some((m) => m.role === "assistant" && m.resultId === resultId))
      dispatch({ type: "addMessage", message: { id: uid(), role: "assistant", at: new Date().toISOString(), engine: "rule", text: [`지난 분석을 다시 보여 드립니다: ${r.title}`, ...r.summary.slice(0, 2)], resultId } });
  }, []);

  const rerun = useCallback((result: AnalysisResult) => {
    const { state, dispatch, derived, data, meta } = ref.current;
    try {
      const next = runAnalysis(result.params, data, derived, meta, result.question);
      dispatch({ type: "addResult", result: next, asLast: state.lastResultId === result.id });
      dispatch({ type: "show", resultId: next.id });
      dispatch({ type: "addMessage", message: { id: uid(), role: "assistant", at: new Date().toISOString(), engine: "rule", text: [`현재 데이터로 다시 분석했습니다: ${next.title}`, ...next.summary.slice(0, 2)], resultId: next.id } });
      dispatch({ type: "toast", text: next.empty ? `다시 분석했지만 결과가 없습니다: ${next.empty}` : "현재 데이터로 다시 분석했습니다", tone: next.empty ? "warn" : "ok" });
    } catch (e) {
      dispatch({ type: "toast", text: `다시 분석하지 못했습니다: ${(e as Error).message}`, tone: "warn" });
    }
  }, []);

  const value = useMemo(() => ({ ask, abort, showAnswer, rerun, provider, providerChecked: checked }), [ask, abort, showAnswer, rerun, provider, checked]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgent(): AgentApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("AgentProvider가 없습니다");
  return v;
}
