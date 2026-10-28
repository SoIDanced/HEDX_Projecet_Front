// v0.5.2 진입 동작 제어기 — "처음 열 때"와 "탭·화면을 바꿀 때"만 .is-entering 을 붙여 CSS 진입 동작을 재생한다.
// 필터·정렬·페이지·데이터 편집으로 다시 그려질 때는 클래스가 없으므로 동작 없이 바로 최종 모습이다.
// 타이밍 전체는 styles/motion.css 의 --k (동작 배율) 하나로 조절한다.
import { useLayoutEffect, useRef, type RefObject } from "react";

export const ENTER_CLASS = "is-entering";
/** 진입 동작 중 가장 늦게 끝나는 것이 약 1.3초(--k .5) — 여유를 두고 클래스를 뗀다 */
export const ENTER_MS = 1700;

const timers = new WeakMap<Element, number>();

export const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
  } catch {
    return false;
  }
};

/** CSS 의 --k (동작 배율). CountUp 의 길이도 여기에 맞춘다 */
export const motionScale = () => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--k"));
  return Number.isFinite(v) && v > 0 ? v : 0.5;
};

/** 선택 바꿈 이어서 움직이기(도넛·막대·숫자·꺾은선)의 배율 --k-tween. 처음 열 때의 --k 와 따로라서 v0.5.6에서 --k 를 올려도 약 600ms 그대로 */
export const tweenScale = () => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--k-tween"));
  return Number.isFinite(v) && v > 0 ? v : 0.38;
};

/** 클래스를 떼었다 다시 붙여 CSS 동작을 처음부터 재생. 끝나면 스스로 뗀다 */
export function replay(el: Element | null | undefined, ms = ENTER_MS) {
  if (!el) return;
  window.clearTimeout(timers.get(el));
  el.classList.remove(ENTER_CLASS);
  void (el as HTMLElement).offsetWidth; // 강제 리플로: 같은 이름의 동작을 다시 시작시킨다
  el.classList.add(ENTER_CLASS);
  window.dispatchEvent(new CustomEvent("motion-replay", { detail: el }));
  timers.set(el, window.setTimeout(() => el.classList.remove(ENTER_CLASS), ms));
}

/** ref 콜백: className 에 처음부터 is-entering 이 들어 있는 요소의 종료 시계를 건다 */
export function armEnter(el: Element | null) {
  if (el) timers.set(el, window.setTimeout(() => el.classList.remove(ENTER_CLASS), ENTER_MS));
}

/** key 가 바뀔 때(탭·하위 보기·화면 전환)만 다시 재생. 첫 그림은 건너뛴다(처음 열기는 .app 이 맡는다) */
export function useReplayOn(ref: RefObject<Element | null>, key: string, enabled = true) {
  const prev = useRef(key);
  useLayoutEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    if (enabled) replay(ref.current);
  }, [ref, key, enabled]);
}
