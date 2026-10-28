export interface Brand {
  kind: "hanwha" | "neutral";
  logo: string | null; // 이미지 주소(data URL)
  company: string | null;
  wordmark: string | null; // 공식 한화엔진 로고(SVG, 심볼+한글 상호) data URL — 상단 바 전용
  product: string;
  docTitle: string;
}
