// 실행 환경별 차이를 한곳에서 처리한다
// - 로컬 실행(npm run dev/start): 브라우저 다운로드를 그대로 사용
// - claude.ai 아티팩트: 파일 저장은 downloads 기능으로
import { isArtifactViewer } from "../ai/llm";

type DownloadsNS = { save: (req: { filename: string; data: string | Blob }) => Promise<{ status: string }> };
export type SaveResult = "saved" | "declined" | "unavailable";

export const inArtifact = () => isArtifactViewer();

/** 파일 저장: 글자(CSV·HTML)나 바이너리(xlsx)를 받는다 */
export async function saveFile(filename: string, content: string | Uint8Array, mime: string): Promise<SaveResult> {
  const asBlob = () => new Blob([typeof content === "string" ? content : (content.slice().buffer as ArrayBuffer)], { type: mime });
  if (inArtifact()) {
    try {
      const c = (window as unknown as { claude: { use: (n: string) => Promise<unknown> } }).claude;
      const dl = (await c.use("downloads")) as DownloadsNS | null;
      if (!dl) return "unavailable";
      await dl.save({ filename, data: typeof content === "string" ? content : asBlob() });
      return "saved";
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === "declined" ? "declined" : "unavailable";
    }
  }
  const blob = asBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "saved";
}

export const saveMessage = (r: SaveResult, what: string) =>
  r === "saved" ? `${what}을(를) 저장했습니다` : r === "declined" ? "저장을 취소했습니다" : "이 화면에서는 파일 저장을 쓸 수 없습니다";
