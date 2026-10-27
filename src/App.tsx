// MainDashboard: 간이 로그인 → 상단 바 + 데이터 관리(왼쪽 65) · AI 대화(오른쪽 35) 2분할
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { LuCheck, LuDatabase, LuMessagesSquare, LuTriangleAlert } from "react-icons/lu";
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
import { KeywordSearch } from "./components/KeywordSearch";
import { LoginScreen } from "./components/LoginScreen";
import { BRAND } from "./brand";

const PANEL_TABS: { id: Panel; label: string; icon: ReactNode }[] = [
  { id: "A", label: "데이터 관리", icon: <LuDatabase aria-hidden /> },
  { id: "C", label: "AI 대화", icon: <LuMessagesSquare aria-hidden /> },
];

/** 알림 영역은 항상 그려 두고 안의 글만 바꾼다(그래야 스크린리더가 읽는다). 마우스를 올리거나 초점이 있으면 사라지는 시계를 멈춘다 */
function Toast() {
  const { state, dispatch } = useStore();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!state.toast) {
      setPaused(false);
      return;
    }
    if (paused) return;
    const t = setTimeout(() => dispatch({ type: "clearToast" }), 3600);
    return () => clearTimeout(t);
  }, [state.toast, paused, dispatch]);
  return (
    <div className="toast-region" role="status" aria-live="polite" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {state.toast && (
        <div className={`toast toast-${state.toast.tone}`} key={state.toast.id}>
          <span className="toast-icon" aria-hidden>{state.toast.tone === "warn" ? <LuTriangleAlert /> : <LuCheck />}</span>
          <span>{state.toast.text}</span>
        </div>
      )}
    </div>
  );
}

/** 키보드 사용자가 머리글·표를 건너뛰고 대화 입력으로 바로 가는 링크 */
function SkipLink() {
  const { dispatch } = useStore();
  return (
    <a
      className="skip-link"
      href="#chat-input"
      onClick={(e) => {
        e.preventDefault();
        dispatch({ type: "panel", panel: "C" }); // 좁은 화면에서는 AI 대화 탭을 먼저 연다
        setTimeout(() => document.getElementById("chat-input")?.focus(), 50);
      }}
    >
      대화 입력으로 건너뛰기
    </a>
  );
}

const SPLIT_KEY = "split.v3"; // v0.4.4: 기본 비율이 65:35로 바뀌어 예전 저장값(70)이 덮어쓰지 않게 키를 올림
const SPLIT_DEFAULT = 65;
const SPLIT_MIN = 40;
const SPLIT_MAX = 80;
const CHAT_MIN_PX = 320; // styles.css 의 .workspace 와 같은 값: 대화 패널 최소 너비
const SPLITTER_PX = 20; // styles/v14.css 의 --split-gap 과 같은 값

/** 데이터 관리(왼쪽) : AI 대화(오른쪽) = 65 : 35, 가운데 경계선을 끌거나 화살표 키로 조절 */
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
  const [contentW, setContentW] = useState(0);

  // 화면 폭이 좁으면 CSS가 데이터 관리 칸을 (폭 - 332px)로 줄이므로, 화면에 실제로 보이는 값을 따로 계산한다
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const measure = () => {
      const cs = getComputedStyle(main);
      setContentW(main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    return () => ro.disconnect();
  }, []);
  const effMax = contentW > CHAT_MIN_PX + SPLITTER_PX ? Math.min(SPLIT_MAX, ((contentW - CHAT_MIN_PX - SPLITTER_PX) / contentW) * 100) : SPLIT_MAX;
  const eff = Math.min(left, effMax);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const main = mainRef.current;
    if (!main) return;
    e.preventDefault();
    const el = e.currentTarget;
    const id = e.pointerId;
    try {
      el.setPointerCapture(id);
    } catch {
      /* 포인터 캡처를 못 써도 끌기는 동작 */
    }
    setDragging(true);
    const rect = main.getBoundingClientRect();
    const padL = parseFloat(getComputedStyle(main).paddingLeft);
    const move = (ev: PointerEvent) => setLeft(Math.min(effMax, ((ev.clientX - rect.left - padL) / contentW) * 100));
    const end = () => {
      setDragging(false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end); // 터치가 시스템에 가로채여도 끌기 상태가 남지 않게
      el.removeEventListener("lostpointercapture", end);
      try {
        el.releasePointerCapture(id);
      } catch {
        /* 이미 놓음 */
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  };

  return (
    <>
      <nav className="panel-tabs" aria-label="화면 전환">
        {PANEL_TABS.map((p) => (
          <button key={p.id} type="button" className={state.panel === p.id ? "is-active" : ""} aria-pressed={state.panel === p.id} onClick={() => dispatch({ type: "panel", panel: p.id })}>
            {p.icon}
            {p.label}
            {p.id === "C" && state.panel !== "C" && (state.chatUnread || (state.detailOpen && !!state.selection.rowKey)) && (
              <>
                <i className="tab-dot" aria-hidden />
                <span className="sr-only">{state.chatUnread ? "· 새 답변" : "· 선택 정보"}</span>
              </>
            )}
          </button>
        ))}
      </nav>
      <main className={`workspace ${dragging ? "is-dragging" : ""}`} ref={mainRef} style={{ "--split": `${left}%` } as CSSProperties}>
        <section className={`panel panel-a ${state.panel === "A" ? "is-active" : ""}`} aria-label="데이터 관리">
          <div className="panel-head">
            <div className="panel-title-row">
              <h2 className="panel-title">데이터 관리</h2>
              <span className="panel-sub">협력사 평가 요약 · 협력업체·구매조달·원가-계약·자재-공급 데이터</span>
              <KeywordSearch />
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
          aria-valuemax={Math.round(effMax)}
          aria-valuenow={Math.round(eff)}
          aria-valuetext={`데이터 관리 ${Math.round(eff)}%`}
          tabIndex={0}
          onPointerDown={startDrag}
          onDoubleClick={() => setLeft(SPLIT_DEFAULT)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setLeft(eff - 2);
            else if (e.key === "ArrowRight") setLeft(Math.min(effMax, eff + 2));
            else if (e.key === "Home") setLeft(SPLIT_DEFAULT);
            else return;
            e.preventDefault();
          }}
          title="끌어서 너비 조절 · 두 번 누르면 65:35로"
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
          <SkipLink />
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
