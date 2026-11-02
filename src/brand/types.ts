export interface Brand {
  kind: "hanwha" | "neutral";
  logo: string | null; // 이미지 주소(data URL)
  company: string | null;
  wordmarkDark?: string | null; // 다크 테마 전용 파생 변형(글자 fill 만 #F2F2F2, 사용자 승인 v0.7.4)
  wordmark: string | null; // 공식 한화엔진 로고(SVG, 심볼+한글 상호) data URL — 상단 바 전용
  product: string;
  docTitle: string;
}
