// 로컬·GitHub 빌드용 브랜드 (dist/index.html). 로고 파일은 작업자가 받은 공식 파일을 그대로 쓴다.
import logo from "../assets/brand/logo.png"; // AI 아이콘용 심볼(PNG)
import wordmark from "../assets/brand/hanwha-engine-logo.svg"; // 상단 바 공식 로고(SVG, 수정 금지)
import wordmarkDark from "../assets/brand/hanwha-engine-logo-dark.svg"; // 다크 전용 파생 변형(원본 복사, 글자 fill 만 변경)
import type { Brand } from "./types";

export const BRAND: Brand = {
  kind: "hanwha",
  logo,
  company: "한화엔진",
  wordmark,
  wordmarkDark,
  product: "RAG 기반 협력사 평가 AI 에이전트",
  docTitle: "한화엔진 RAG 기반 협력사 평가 AI 에이전트",
};
