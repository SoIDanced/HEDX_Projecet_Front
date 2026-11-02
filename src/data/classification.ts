// 프로젝트용 분류 — 엔진 속도 구분과 부품군. 제조사 공식 BOM·공식 제원이 아니다(화면 조회용으로 우리 팀이 정한 값).
// 속도 구분(speedClass)은 엔진 모델명·모델 ID와 별도 필드로 둔다. 품목명으로 속도를 추정하지 않는다.

export type SpeedClass = "고속" | "중속" | "저속";
export const SPEED_CLASSES: SpeedClass[] = ["고속", "중속", "저속"];

export interface EngineMaster {
  engineId: string; // 엔진 모델 ID (내부용)
  engineModel: string; // 실제(또는 가상) 엔진 모델명 — BomRow.engineModel 과 같은 값
  speedClass: SpeedClass | null; // 속도 구분. 확인된 제원이 없으면 null
  basis: "verified" | "sample"; // verified = 확인된 제원·엔진 마스터 / sample = 시연용 설정(SAMPLE)
}

/** 현재 데이터의 엔진 모델은 가상(SAMPLE 엔진 X형·Y형)뿐이고 확인된 제원이 없다 → 속도는 시연용 설정이다 */
export const ENGINE_MASTER: EngineMaster[] = [
  { engineId: "ENG-SAMPLE-X", engineModel: "SAMPLE 엔진 X형", speedClass: "중속", basis: "sample" },
  { engineId: "ENG-SAMPLE-Y", engineModel: "SAMPLE 엔진 Y형", speedClass: "저속", basis: "sample" },
];

export const SPEED_NOTE = "엔진 속도 구분은 시연용 설정(SAMPLE)입니다. 가상 엔진에 임의로 지정한 값이며 실제 엔진 제원이 아닙니다.";

export const PART_GROUPS = ["구조", "연소", "구동", "소-배기"] as const;
export type PartGroup = (typeof PART_GROUPS)[number];

/** 품목코드 → 부품군(주분류 하나). 목록에 없는 품목은 분류 없음 */
export const PART_GROUP_OF: Record<string, PartGroup> = {
  "ITM-1001": "구조",
  "ITM-1007": "구조",
  "ITM-1004": "연소",
  "ITM-1009": "연소",
  "ITM-1002": "구동",
  "ITM-1005": "구동",
  "ITM-1006": "구동",
  "ITM-1003": "소-배기",
  "ITM-1010": "소-배기",
};

/** 네 부품군에 임의로 넣지 않고 사람이 확인해야 하는 품목 → 추정 계통 */
export const PART_REVIEW: Record<string, string> = { "ITM-1008": "냉각계통" };

export const PART_NOTE = "부품군은 이 화면을 위한 프로젝트용 분류이며 제조사 공식 BOM과 같지 않습니다.";

/** 상세 화면 문구: '구조' / '분류 확인 필요: 냉각계통' / '분류 없음' */
export function partGroupText(itemCode: string): string {
  const g = PART_GROUP_OF[itemCode];
  if (g) return g;
  return PART_REVIEW[itemCode] ? `분류 확인 필요: ${PART_REVIEW[itemCode]}` : "분류 없음";
}
