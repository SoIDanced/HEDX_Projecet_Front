// 헤더 브랜드: [공식 한화엔진 로고(SVG, 흰 판 위)] │ RAG 기반 협력사 평가 AI 에이전트
// 로고 SVG는 한글 상호가 채움 없는 검정이라 어두운 테마에서 안 보임 → 파일은 그대로 두고 두 테마 모두 흰 판(.brand-plate)을 깐다.
import { BRAND } from "../brand";

export function BrandBlock({ as: Tag = "h1" }: { as?: "h1" | "div" }) {
  if (BRAND.kind === "hanwha" && BRAND.wordmark) {
    return (
      <div className="brand brand-hanwha">
        <span className="brand-plate">
          <img className="brand-logo" src={BRAND.wordmark} alt={BRAND.company ?? ""} width={1602} height={542} draggable={false} />
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
