// 헤더 브랜드: [로고] 한화엔진 / HANWHA ENGINE │ RAG 기반 협력사 평가 AI 에이전트
import { BRAND } from "../brand";

export function BrandBlock({ as: Tag = "h1" }: { as?: "h1" | "div" }) {
  if (BRAND.kind === "hanwha" && BRAND.company) {
    return (
      <div className="brand brand-hanwha">
        {BRAND.logo && <img className="brand-logo" src={BRAND.logo} alt="" width={37} height={34} />}
        <span className="brand-co" role="img" aria-label={`${BRAND.company} ${BRAND.companyEn ?? ""}`}>
          <span className="brand-ko" aria-hidden>{BRAND.company}</span>
          {BRAND.companyEn && <span className="brand-en" aria-hidden>{BRAND.companyEn}</span>}
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
