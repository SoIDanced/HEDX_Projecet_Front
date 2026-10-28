// AI 에이전트 아이콘: 한화엔진 빌드는 공식 로고 파일(src/assets/brand/logo.png, 160×145 전체가 오렌지 궤도 심볼)을
// 그대로 둥근 원판 안에 CSS로만 맞춰 넣는다(그리거나 새 이미지를 만들지 않음). 중립 빌드(공유 링크)는 로고가 없으므로 중립 말풍선 아이콘.
import { BRAND } from "../brand";

/** 중립 아이콘: 말풍선 + 반짝임 */
export function AiChatIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="ai-chat-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h8A2.5 2.5 0 0 1 17 5.5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M3 9.5A2.5 2.5 0 0 1 5.5 7h11A2.5 2.5 0 0 1 19 9.5v6a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3h-.5A2.5 2.5 0 0 1 3 15.5z"
        fill="currentColor"
        fillOpacity=".16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M11 9.6l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" />
      <path d="M19.6 2.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor" />
    </svg>
  );
}

/** 장식용 둥근 아이콘(이름은 옆 글자가 말해 준다) */
export function AiAvatar({ size = 32 }: { size?: number }) {
  const logo = BRAND.kind === "hanwha" ? BRAND.logo : null;
  return (
    <span className={`ai-avatar ${logo ? "ai-avatar-logo" : "ai-avatar-neutral"}`} style={{ width: size, height: size }} aria-hidden>
      {logo ? <img src={logo} alt="" width={160} height={145} draggable={false} /> : <AiChatIcon size={Math.round(size * 0.58)} />}
    </span>
  );
}
