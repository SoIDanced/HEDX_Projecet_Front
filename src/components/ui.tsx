// 공통 UI 조각
import { createElement, Fragment, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motionScale, reducedMotion } from "../lib/motion";
import type { ColumnKind, ResultColumn } from "../lib/analysisTypes";
import { fmtDate, fmtInt, fmtMoney, fmtNum, fmtPct, fmtSignedPct } from "../lib/format";

export function GradeBadge({ grade, size = "sm" }: { grade: string | null | undefined; size?: "sm" | "md" }) {
  if (!grade) return <span className="grade grade-none">–</span>;
  return <span className={`grade grade-${grade} grade-${size}`} aria-label={`${grade}등급`}>{grade}</span>;
}

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  입고완료: "ok",
  지연입고: "warn",
  "납기 지연": "bad",
  "진행 중": "info",
  취소: "muted",
  정상: "ok",
  "안전재고 미달": "warn",
  "공급 지연": "warn",
  "미달·지연": "bad",
  확인: "ok",
  누락: "bad",
  "표본 적음": "warn",
  임박: "bad",
  예정: "info",
  이후: "muted",
  "지급 확인 필요": "warn",
  "조건 확인 필요": "warn",
  "입고 대기": "muted",
};

export function StatusPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">–</span>;
  const tone = STATUS_TONE[value] ?? "muted";
  return <span className={`pill pill-${tone}`}>{value}</span>;
}

export function Chip({ children, onRemove, removeLabel = "선택 해제", tone = "neutral" }: { children: ReactNode; onRemove?: () => void; removeLabel?: string; tone?: "neutral" | "accent" }) {
  return (
    <span className={`chip chip-${tone}`}>
      {children}
      {onRemove && (
        <button type="button" className="chip-x" onClick={onRemove} aria-label={removeLabel}>
          ×
        </button>
      )}
    </span>
  );
}

export function formatCell(kind: ColumnKind, v: unknown, currency = "KRW", digits?: number): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="muted">–</span>;
  switch (kind) {
    case "int":
      return fmtInt(Number(v));
    case "number":
      return fmtNum(Number(v), digits ?? 1);
    case "percent":
      return fmtPct(Number(v), digits ?? 1);
    case "signedPercent":
      return fmtSignedPct(Number(v), digits ?? 1);
    case "money":
      return fmtMoney(Number(v), currency);
    case "grade":
      return <GradeBadge grade={String(v)} />;
    case "date":
      return fmtDate(String(v));
    case "status":
      return <StatusPill value={String(v)} />;
    default:
      return String(v);
  }
}

export const isNumericKind = (c: Pick<ResultColumn, "kind">) => ["int", "number", "percent", "signedPercent", "money"].includes(c.kind);

/** 숫자 올라가기 (v14 CountUp: ease-out-quart). 처음 열 때·탭 전환 재생(.is-entering 안)에서만 0 → 값으로 센다.
 *  v0.5.4: data-tween 영역(평가 카드·인건비 숫자) 안에서 값이 바뀌면 0이 아니라 '지금 보이는 값'에서 새 값으로 센다(내려갈 수도 있음).
 *  도중에 또 바뀌면 그 순간의 값에서 다시 출발(끊김·겹침 없음). 다른 때(필터·데이터 편집)와 '동작 줄이기'에서는 바로 최종 값.
 *  최종 값은 항상 data-final 과 글자로 DOM에 있다. */
export function CountUp({ value, format = (n) => String(Math.round(n)), as = "span", duration = 1400, delay = 0, className }: { value: number; format?: (n: number) => string; as?: "span" | "tspan"; duration?: number; delay?: number; className?: string }) {
  const ref = useRef<Element>(null);
  const fmt = useRef(format);
  fmt.current = format;
  const shown = useRef<number | null>(null); // 지금 화면에 보이는 값 (다시 맞출 때의 출발점)
  const final = format(value);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const show = (n: number) => {
      shown.current = n;
      el.textContent = fmt.current(n);
    };
    const animate = (from: number, wait: number, dur: number) => {
      const t0 = performance.now();
      show(from);
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0 - wait) / dur);
        if (t >= 0) show(from + (value - from) * (1 - Math.pow(1 - t, 4)));
        if (t < 1) raf = requestAnimationFrame(tick);
        else show(value);
      };
      raf = requestAnimationFrame(tick);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      if (reducedMotion()) return show(value);
      const k = motionScale();
      const base = parseFloat(getComputedStyle(el).getPropertyValue("--base")) || 0; // 지금 재생 범위의 기준 지연(ms, 디자인 시간)
      animate(0, (base + delay) * k, duration * k);
    };
    if (shown.current !== null && shown.current !== value && el.closest("[data-tween]") && !reducedMotion()) animate(shown.current, 0, 1600 * motionScale()); // 약 600ms
    else if (el.closest(".is-entering")) run();
    else show(value);
    const onReplay = (e: Event) => {
      const root = (e as CustomEvent<Element>).detail;
      if (root && root.contains(el)) run();
    };
    window.addEventListener("motion-replay", onReplay);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("motion-replay", onReplay);
    };
  }, [value, duration, delay]);
  return createElement(as, { ref, className, "data-final": final }, final);
}

/** 제목을 낱말로 쪼개 하나씩 들어오게 한다(v14 PageHead). 접근 가능한 이름은 aria-label 로 그대로, 낱말 조각은 aria-hidden */
export function Words({ text, as: Tag = "h2", className, id }: { text: string; as?: "h1" | "h2" | "h3"; className?: string; id?: string }) {
  const words = text.split(" ");
  return (
    <Tag className={className} id={id} aria-label={text}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <i className="word" style={{ "--i": i } as CSSProperties} aria-hidden="true">
            {w}
          </i>
          {i < words.length - 1 ? " " : ""}
        </Fragment>
      ))}
    </Tag>
  );
}
