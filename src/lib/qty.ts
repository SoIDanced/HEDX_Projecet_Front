// 구매조달 수량 열: 누적 입고수량·발주잔량 (2단계: 입고 기록으로 부분입고를 실제 수량으로 계산)
import type { POStatus } from "./metrics";

export interface PoQty {
  received: number | null; // 누적 입고수량
  remain: number | null; // 발주잔량 = max(발주수량 − 누적 입고수량, 0)
  assumed: boolean; // 입고일만 있고 수량 기록이 없어 '전량 입고'로 본 값(기존 샘플·업로드 자료)
  partial: boolean; // 일부만 입고되고 잔량이 남음
}

/** 누적 입고수량·발주잔량.
 *  - 입고 수량 기록이 있으면(수기 입력·입고 기록의 합): 누적 = 그 합, 잔량 = max(발주수량 − 누적, 0), 잔량이 남으면 부분입고
 *  - 수량 기록은 없고 입고일만 있는 발주(기존 샘플·업로드): 입고가 끝난 건이라 누적 = 발주수량, 잔량 0 — `assumed`로 구분해 표시
 *  - 입고일도 수량도 없으면 아직 받은 것이 없음: 누적 0, 잔량 = 발주수량
 *  - 취소: 둘 다 null */
export function poQty(p: { status: POStatus; qty: number; receivedQty?: number | null; receivedDate?: string | null }): PoQty {
  if (p.status === "취소") return { received: null, remain: null, assumed: false, partial: false };
  const rq = p.receivedQty ?? 0;
  if (rq > 0) {
    const remain = Math.max(p.qty - rq, 0);
    return { received: rq, remain, assumed: false, partial: remain > 0 };
  }
  if (p.receivedDate) return { received: p.qty, remain: 0, assumed: true, partial: false };
  return { received: 0, remain: p.qty, assumed: false, partial: false };
}
