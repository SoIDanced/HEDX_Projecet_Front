// 헤더 브랜드: [공식 한화엔진 로고(SVG, 흰 판 위)] │ RAG 기반 협력업체 평가 AI 에이전트
// 원본 SVG는 한글 상호가 검정이라 라이트에선 흰 판 위에 쓴다. 어두운 테마에서는 판 없이(투명) 글자만 #F2F2F2 로 바꾼 파생 파일(-dark.svg)을 쓴다(사용자 승인, 원본 해시 유지).
import { BRAND } from "../brand";
import { useTheme } from "../platform/theme";

export function BrandBlock({ as: Tag = "h1" }: { as?: "h1" | "div" }) {
  const dark = useTheme() === "dark";
  if (BRAND.kind === "hanwha" && BRAND.wordmark) {
    return (
      <div className="brand brand-hanwha">
        <span className="brand-plate">
          <img className="brand-logo" src={(dark && BRAND.wordmarkDark) || BRAND.wordmark} alt={BRAND.company ?? ""} width={1602} height={542} draggable={false} />
        </span>
        <span className="brand-divider" aria-hidden />
        <Tag className="brand-product" title={BRAND.product}>{BRAND.product}</Tag>
      </div>
    );
  }
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M4 17h3V9H4v8Zm6.5 0h3V5h-3v12Zm6.5 0h3v-6h-3v6Z" fill="currentColor" />
        </svg>
      </span>
      <Tag className="brand-product" title={BRAND.product}>{BRAND.product}</Tag>
    </div>
  );
}
