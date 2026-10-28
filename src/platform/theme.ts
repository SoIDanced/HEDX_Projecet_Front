// 테마(밝게/어둡게)·강조색: <html data-theme data-accent>. 첫 화면 전에 빌드 템플릿의 인라인 스크립트가 먼저 적용한다.
// 전환은 View Transitions API로 물방울처럼 번지게(900ms), 지원하지 않거나 '동작 줄이기'면 200ms 색 페이드. 어느 쪽이든 data-theme는 곧바로(≤900ms) 바뀐다.
import { useSyncExternalStore } from "react";
import { readStore, writeStore } from "./storage";

export type Theme = "light" | "dark";
export type Accent = "orange" | "blue" | "green" | "violet" | "rose";
export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "orange", label: "한화 오렌지", color: "#f37321" },
  { id: "blue", label: "파랑", color: "#3d6ef5" },
  { id: "green", label: "초록", color: "#14a06a" },
  { id: "violet", label: "보라", color: "#7c4fe0" },
  { id: "rose", label: "분홍", color: "#e5407a" },
];
const root = () => document.documentElement;
const systemTheme = (): Theme => {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
};
const stored = readStore<string>("theme");
let theme: Theme = stored === "light" || stored === "dark" ? stored : systemTheme();
const storedAccent = readStore<string>("accent");
let accent: Accent = ACCENTS.some((a) => a.id === storedAccent) ? (storedAccent as Accent) : "orange";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const paint = () => {
  root().dataset.theme = theme;
  if (accent === "orange") delete root().dataset.accent;
  else root().dataset.accent = accent;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#1b1b1b" : "#f4f4f4");
};
paint();
try {
  // 저장된 선택이 없을 때만 운영체제 설정 변화를 따라간다
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (readStore<string>("theme")) return;
    theme = systemTheme();
    paint();
    emit();
  });
} catch {
  /* 오래된 브라우저 */
}

const reduced = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || root().dataset.motion === "reduced";
  } catch {
    return false;
  }
};
const POINTS = 10;
const FRAMES = 20;
const WOBBLE = 0.24;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function smoothPath(pts: number[][]) {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d} Z`;
}
/** v14 themeTransition.js의 물방울 키프레임 (프레임 수만 줄임) */
function blobFrames(x: number, y: number, w: number, h: number) {
  const far = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
  const R = far / (1 - WOBBLE) + 60;
  const phase = Array.from({ length: POINTS }, () => Math.random() * Math.PI * 2);
  const spin = Math.random() * Math.PI * 2;
  const frames: Keyframe[] = [];
  for (let s = 0; s <= FRAMES; s++) {
    const p = s / FRAMES;
    const r = Math.max(2, R * ease(p));
    const t = p * Math.PI * 2.2;
    const pts: number[][] = [];
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2 + spin + p * 0.9;
      const k = 1 + WOBBLE * (0.55 * Math.sin(2 * a + phase[i] + t) + 0.3 * Math.sin(3 * a - t * 1.4 + phase[(i + 3) % POINTS]) + 0.15 * Math.sin(5 * a + t * 0.7));
      pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]);
    }
    frames.push({ clipPath: `path("${smoothPath(pts)}")` });
  }
  return frames;
}

export function setTheme(next: Theme, origin?: { x: number; y: number }) {
  if (next === theme && root().dataset.theme === next) return;
  const apply = () => {
    theme = next;
    writeStore("theme", next);
    paint();
    emit();
  };
  const r = root();
  const d = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (!d.startViewTransition || reduced()) {
    r.classList.add("theme-fade");
    apply();
    window.setTimeout(() => r.classList.remove("theme-fade"), 260);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  r.classList.add("liquid-switching");
  try {
    const vt = d.startViewTransition(apply);
    vt.ready.then(() => r.animate(blobFrames(x, y, window.innerWidth, window.innerHeight), { duration: 900, easing: "linear", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
    vt.finished.catch(() => {}).finally(() => r.classList.remove("liquid-switching"));
  } catch {
    apply();
  }
  // 백그라운드 탭 등에서 전환 콜백이 늦어도 화면이 반쯤 바뀐 채 멈추지 않게
  window.setTimeout(() => {
    if (theme !== next || r.dataset.theme !== next) apply();
    r.classList.remove("liquid-switching");
  }, 800);
}

export function setAccent(a: Accent) {
  accent = a;
  writeStore("accent", a);
  paint();
  emit();
}

const sub = (f: () => void) => (subs.add(f), () => subs.delete(f));
export const useTheme = () => useSyncExternalStore(sub, () => theme);
export const useAccent = () => useSyncExternalStore(sub, () => accent);
