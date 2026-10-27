// 질문 → 답변 → 템플릿 선택 흐름을 화면 어디서든 쓸 수 있게 묶는다
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { answer } from "../ai/agent";
import { detectProvider, type LLMProvider } from "../ai/llm";
import { runAnalysis } from "../lib/analysis";
import type { AnalysisResult, TemplateId } from "../lib/analysisTypes";
import { uid, useStore } from "./store";

interface AgentApi {
  ask: (question: string, opts?: { answeringId?: string }) => Promise<void>;
  choose: (resultId: string, template: TemplateId) => void;
  rerun: (result: AnalysisResult) => void;
  provider: LLMProvider | null;
  providerChecked: boolean;
}

const Ctx = createContext<AgentApi | null>(null);

export const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches;

export function AgentProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [checked, setChecked] = useState(false);

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
      const { state, dispatch, derived } = ref.current;
      const q = question.trim();
      if (!q || state.busy) return;
      if (opts?.answeringId) dispatch({ type: "patchMessage", id: opts.answeringId, patch: { answered: q } });
      dispatch({ type: "addMessage", message: { id: uid(), role: "user", text: q, at: new Date().toISOString() } });
      dispatch({ type: "busy", busy: true, progress: 0 });
      try {
        if (state.aiMode === "llm") {
          if (!provider) throw new Error("LLM API 제공자를 사용할 수 없습니다.");
          const text = await provider.generate(q);
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
        const reply = await answer(
          q,
          {
            data: state.data,
            derived,
            meta: state.meta,
            selection: state.selection,
            lastResult: state.lastResultId ? state.results[state.lastResultId] : null,
            pending: state.pending,
          },
          null,
          (i) => dispatch({ type: "busy", busy: true, progress: i }),
        );
        const base = { id: uid(), role: "assistant" as const, at: new Date().toISOString(), engine: reply.engine, engineNote: reply.engineNote, text: reply.text };
        if (reply.type === "analysis") {
          // b 방식: 분석이 끝나면 바로 결과창에 그린다. 후속 질문이면 보던 형식을 유지한다.
          const r = reply.result;
          const current = ref.current.state.view.template;
          const shownAs = reply.followup && current && r.templates.includes(current) ? current : r.recommended;
          dispatch({ type: "addResult", result: r });
          dispatch({ type: "pending", pending: null });
          dispatch({ type: "show", resultId: r.id, template: shownAs });
          dispatch({ type: "addMessage", message: { ...base, resultId: r.id, followup: reply.followup, shownAs } });
          if (isNarrow()) dispatch({ type: "panel", panel: "C" });
        } else if (reply.type === "clarify") {
          dispatch({ type: "pending", pending: reply.pending });
          dispatch({ type: "addMessage", message: { ...base, options: reply.options, need: reply.pending.need, answered: null } });
          if (!ref.current.state.chatOpen) dispatch({ type: "chat", open: true });
        } else {
          dispatch({ type: "addMessage", message: { ...base, suggestions: reply.suggestions } });
          if (!ref.current.state.chatOpen) dispatch({ type: "chat", open: true });
        }
      } catch (e) {
        dispatch({
          type: "addMessage",
          message: { id: uid(), role: "assistant", at: new Date().toISOString(), engine: "system", text: [`${state.aiMode === "llm" ? "LLM API 요청" : "분석"} 중 오류가 났습니다: ${(e as Error).message}`] },
        });
      } finally {
        dispatch({ type: "busy", busy: false });
      }
    },
    [provider],
  );

  const choose = useCallback((resultId: string, template: TemplateId) => {
    const { dispatch } = ref.current;
    dispatch({ type: "show", resultId, template });
    if (isNarrow()) dispatch({ type: "panel", panel: "C" });
  }, []);

  const rerun = useCallback((result: AnalysisResult) => {
    const { state, dispatch, derived } = ref.current;
    try {
      const next = runAnalysis(result.params, state.data, derived, state.meta, result.question);
      dispatch({ type: "addResult", result: next, asLast: state.lastResultId === result.id });
      dispatch({ type: "show", resultId: next.id, template: state.view.template ?? next.recommended });
      dispatch({ type: "toast", text: next.empty ? `다시 분석했지만 결과가 없습니다: ${next.empty}` : "현재 데이터로 다시 분석했습니다", tone: next.empty ? "warn" : "ok" });
    } catch (e) {
      dispatch({ type: "toast", text: `다시 분석하지 못했습니다: ${(e as Error).message}`, tone: "warn" });
    }
  }, []);

  const value = useMemo(() => ({ ask, choose, rerun, provider, providerChecked: checked }), [ask, choose, rerun, provider, checked]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgent(): AgentApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("AgentProvider가 없습니다");
  return v;
}
