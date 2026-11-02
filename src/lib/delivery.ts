// 구매조달 납기 팝업 내용: 예정 납기일·데이터 기준일·남은/지연 일수를 계산한다 (예정 납기일과 실제 입고일은 구분, 부분입고면 잔량 표시)
import { daysBetween, fmtInt } from "./format";
import type { POView } from "./metrics";

export interface DeliveryLine {
  label: string;
  value: string;
  tone?: "late" | "ok" | "warn";
}

export function deliveryLines(p: Pick<POView, "status" | "dueDate" | "qty" | "receivedDate" | "lastReceivedDate" | "rcvQty" | "remainQty" | "partial" | "rcvAssumed" | "delayDays">, asOf: string): DeliveryLine[] {
  const left = daysBetween(asOf, p.dueDate); // 양수 = 남음, 음수 = 지남
  const lines: DeliveryLine[] = [
    { label: "예정 납기일", value: p.dueDate },
    { label: "데이터 기준일", value: asOf },
  ];
  if (p.status === "취소") {
    lines.push({ label: "상태", value: "취소된 발주 — 납기 계산 안 함" });
    return lines;
  }
  const done = !!p.receivedDate;
  if (!done) {
    const text = left > 0 ? `납기까지 ${left}일 남음` : left === 0 ? "오늘이 납기일" : `${-left}일 지연`;
    lines.push({ label: "납기", value: text, tone: left < 0 ? "late" : undefined });
  }
  if (p.partial) {
    lines.push({ label: "부분입고", value: `입고 ${fmtInt(p.rcvQty)} / 발주 ${fmtInt(p.qty)} · 잔량 ${fmtInt(p.remainQty)} 남음`, tone: "warn" });
    if (p.lastReceivedDate) lines.push({ label: "마지막 입고일", value: p.lastReceivedDate });
  } else if (done) {
    const d = p.delayDays ?? 0;
    lines.push({ label: "실제 입고일", value: `${p.receivedDate}${p.rcvAssumed ? " (수량 기록 없음 · 입고일 기준 전량)" : ""}` });
    lines.push({ label: "예정 대비", value: d > 0 ? `${d}일 지연 입고` : "기한 내 입고", tone: d > 0 ? "late" : "ok" });
  }
  return lines;
}
