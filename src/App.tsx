// MainDashboard: 간이 로그인 → 상단 바 + 데이터 관리(왼쪽 70) · AI 대화(오른쪽 30) 2분할
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { LuDatabase, LuMessagesSquare } from "react-icons/lu";
import { StoreProvider, useStore, type Panel } from "./store/store";
import { AgentProvider } from "./store/agent";
import { SupplierEvaluationCard } from "./components/SupplierEvaluationCard";
import { DataManagementTabs } from "./components/DataManagementTabs";
import { ChatPanel } from "./components/ChatPanel";
import { readStore, writeStore } from "./platform/storage";
import { currentUser, logout, type User } from "./platform/users";
import { ImportDialog } from "./components/ImportDialog";
import { Topbar } from "./components/Topbar";
import { Onboarding } from "./components/Onboarding";
import { LoginScreen } from "./components/LoginScreen";
import { BRAND } from "./brand";

const PANEL_TABS: { id: Panel; label: string; icon: ReactNode }[] = [
  { id: "A", label: "데이터 관리", icon: <LuDatabase aria-hidden /> },
  { id: "C", label: "AI 대화", icon: <LuMessagesSquare aria-hidden /> },
];

function Toast() {
  const { state, dispatch } = useStore();
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "clearToast" }), 3600);
    return () => clearTimeout(t);
  }, [state.toast, dispatch]);
  if (!state.toast) return null;
  return (
    <div className={`toast toast-${state.toast.tone}`} role="status" key={state.toast.id}>
      {state.toast.text}
    </div>
  );
}

const SPLIT_KEY = "split.v2"; // v0.4.0: 기본 비율이 70:30으로 바뀌어 예전 저장값(45)이 덮어쓰지 않게 키를 올림
const SPLIT_DEFAULT = 70;
const SPLIT_MIN = 40;
const SPLIT_MAX = 80;

/** 데이터 관리(왼쪽) : AI 대화(오른쪽) = 70 : 30, 가운데 경계선을 끌거나 화살표 키로 조절 */
function useSplit() {
  const [left, setLeft] = useState<number>(() => {
    const v = readStore<number>(SPLIT_KEY);
    return typeof v === "number" && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : SPLIT_DEFAULT;
  });
  const set = (v: number) => {
    const c = Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, v)) * 10) / 10;
    setLeft(c);
    writeStore(SPLIT_KEY, c);
  };
  return [left, set] as const;
}

function Workspace() {
  const { state, dispatch } = useStore();
  const [left, setLeft] = useSplit();
  const mainRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const main = mainRef.current;
    if (!main) return;
    e.preventDefault();
    setDragging(true);
    const rect = main.getBoundingClientRect();
    const move = (ev: PointerEvent) => setLeft(((ev.clientX - rect.left) / rect.width) * 100);
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  return (
    <>
      <nav className="panel-tabs" aria-label="화면 전환">
        {PANEL_TABS.map((p) => (
          <button key={p.id} type="button" className={state.panel === p.id ? "is-active" : ""} aria-pressed={state.panel === p.id} onClick={() => dispatch({ type: "panel", panel: p.id })}>
            {p.icon}
            {p.label}
            {p.id === "C" && state.panel !== "C" && (state.chatUnread || (state.detailOpen && !!state.selection.rowKey)) && <i className="tab-dot" aria-label="새 답변 또는 선택 정보" />}
          </button>
        ))}
      </nav>
      <main className={`workspace ${dragging ? "is-dragging" : ""}`} ref={mainRef} style={{ "--split": `${left}%` } as CSSProperties}>
        <section className={`panel panel-a ${state.panel === "A" ? "is-active" : ""}`} aria-label="데이터 관리">
          <div className="panel-head">
            <div className="panel-title-row">
              <h2 className="panel-title">데이터 관리</h2>
              <span className="panel-sub">협력사 평가 요약 · 협력업체·구매조달·원가-계약·자재-공급 데이터</span>
            </div>
          </div>
          <div className="panel-body panel-body-a">
            <SupplierEvaluationCard />
            <DataManagementTabs />
          </div>
        </section>
        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="데이터 관리와 AI 대화 너비 조절"
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          aria-valuenow={Math.round(left)}
          tabIndex={0}
          onPointerDown={startDrag}
          onDoubleClick={() => setLeft(SPLIT_DEFAULT)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setLeft(left - 2);
            else if (e.key === "ArrowRight") setLeft(left + 2);
            else if (e.key === "Home") setLeft(SPLIT_DEFAULT);
            else return;
            e.preventDefault();
          }}
          title="끌어서 너비 조절 · 두 번 누르면 70:30으로"
        >
          <span className="splitter-grip" aria-hidden />
        </div>
        <section className={`panel panel-c ${state.panel === "C" ? "is-active" : ""}`} aria-label="AI 대화">
          <ChatPanel />
        </section>
      </main>
    </>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(() => currentUser());
  useEffect(() => {
    document.title = BRAND.docTitle;
  }, []);
  if (!user) return <LoginScreen onLogin={setUser} />;
  return (
    <StoreProvider key={user.id} user={user}>
      <AgentProvider>
        <div className="app">
          <Topbar
            onLogout={async (wipe) => {
              await logout(user.id, wipe);
              setUser(null);
            }}
          />
          <Workspace />
          <ImportDialog />
          <Onboarding />
          <Toast />
        </div>
      </AgentProvider>
    </StoreProvider>
  );
}
