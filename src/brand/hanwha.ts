// 로컬·GitHub 빌드용 브랜드 (dist/index.html). 로고 파일은 작업자가 받은 공식 파일을 그대로 쓴다.
import logo from "../assets/brand/logo.png";
import type { Brand } from "./types";

export const BRAND: Brand = {
  kind: "hanwha",
  logo,
  company: "한화엔진",
  companyEn: "HANWHA ENGINE",
  product: "RAG 기반 협력사 평가 AI 에이전트",
  docTitle: "한화엔진 RAG 기반 협력사 평가 AI 에이전트",
};
