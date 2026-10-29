# 인수인계 문서 — Claude Code에서 이어서 개발하기

> 이 문서는 claude.ai에서 v0.1.0 ~ v0.4.0까지 진행한 내용 전체를 Claude Code가 빠짐없이 이어받기 위한 것입니다.
> **Claude Code 첫 작업 지시(사용자가 붙여 넣을 프롬프트)는 맨 아래 §12에 있습니다.**

---

## 1. 프로젝트 배경
- **누가:** 대학생 DX팀(한화엔진 DX 과제). 사용자는 팀원이며 한국어로 소통한다. GitHub는 GitHub Desktop으로도 다룬다.
- **무엇:** "RAG 기반 협력사 평가 AI 에이전트" 시연판. 한화엔진 구매팀 실무자(협력사 관리·구매조달·원가-계약·자재-공급)를 위한 웹앱.
- **출발점:** 실무자 면담에서 나온 요구 — 흩어진 협력사·발주·계약·재고 데이터를 한 화면에서 보고, 품목별 후보 업체를 등급·납기 실적·최근 단가와 함께 비교하고, 근거가 "기록된 데이터 그대로" 보이길 원함. 정성 평가를 AI가 지어내면 안 된다는 원칙이 여기서 나왔다.
- **면담 기록은 저장소에 없다.** 면담에 담당자의 보안 우회 관련 발언이 있으니 어떤 자료에도 넣지 않는다.
- **저장소:** `SoIDanced/Hanwha_DX_Claude` (현재 Public — 로고 공개 범위는 사용자가 판단하도록 안내함). 이전 저장소 `knewyouknownewidea-lab/Hanwha_DX_Claude`(v0.1~v0.2)는 이 세션에서 쓰기 권한이 없었다.
- **시연 링크:** claude.ai 공유 아티팩트(비공개, 중립 브랜드 빌드 `dist/artifact.html`). 로고·회사명은 넣을 수 없다 — 사용자가 "로고가 안 나온다"고 두 번 물었고, 원인은 공유 링크가 중립 빌드이기 때문이라고 설명했다. 로고는 `dist/index.html`(로컬·GitHub)에서만 보인다.

## 2. 버전 이력 요약
| 버전 | 핵심 |
|---|---|
| v0.1.0 | 첫 시연판: A/B/C 3분할(데이터·챗봇·결과), 결과 템플릿 4종, SAMPLE 데이터, 규칙 기반 질문 해석, LLM 연결 준비 |
| v0.2.0 | UI 개편: 2분할(데이터 45 : 결과 55, 경계선 조절), 떠 있는 챗봇 창(이동·크기·투명도), 결과 형식 상단 고정·추천 형식 자동 표시, 보기 설정·프리셋 4종+내 프리셋, 필터 세분화, 대화·결과 저장 유지, E2E 85개 |
| v0.3.0 | 브랜드 헤더, 정렬 두 방향, 스크롤 1개+페이지 나누기, 근거 팝오버, 탭 4등분, 챗봇 왼쪽 아래·새 디자인, 샘플 버튼 정리, 간이 로그인·사용자별 저장, 업로드 IndexedDB 저장, 관심 목록, 분석 이력, 엑셀, 요약 지표 4개, 부품 분류 필터, 등급 이력, 대금 결제 일정·알림, 원자재 시세, 인건비, 경쟁사·업계 동향, 첫 사용 안내, 처음 사용자 점검 |
| v0.3.1 | 사용자 요청: 요약 지표 버튼 4개 **삭제**, 협력사·부품 상세를 **오른쪽 분석 결과창**으로 이동(챗봇 결과가 나오면 자동 접힘, 결과창 머리 아이콘으로 열고 닫기). (채점 카드를 작은 위젯으로 줄였는데 이는 오해였음 → v0.3.2에서 되돌림) |
| v0.3.2 | 채점 카드 원래 모양 복원, **카드 아래 처리 단계 영역만 잘라 카드 오른쪽 위 구석에 작은 아이콘 줄로** 이동 |
| v0.4.0 | 사용자 요청: 2분할 **70:30**, 오른쪽을 **고정 AI 에이전트 패널**로(떠 있는 챗봇 삭제), 답변은 **글로만**(4형식·보기 설정·프리셋 삭제), 선택 정보는 대화 패널 위 접이식, 분석 이력 → 대화 이력, 답변별 엑셀·CSV 유지 |

자세한 항목은 `CHANGELOG.md`.

## 3. 현재 화면 (v0.4.0) — 기능 전체 목록

### 3-1. 로그인·사용자
- 첫 화면은 간이 로그인: 이름 필수, 사번·부서 선택, **비밀번호 없음**(보안 인증 아님을 안내), "시연 계정으로 바로 시작", 최근 사용자 칩.
- 이름 오류는 이름 칸 바로 아래에 표시하고 이름 칸으로 초점.
- 사용자별 저장(키 `procure-ai:u:{id}:…`), v0.2.0 저장 내용(`session.v2`, `view-settings.v2`)은 첫 로그인 사용자에게 이전.
- 로그아웃 확인 창에 "이 브라우저에 저장된 내 데이터도 지우기"(공용 PC).
- 처음 로그인하면 3단계 사용 안내(건너뛰기·이전·다음, 사용자 메뉴 "사용 안내 다시 보기").

### 3-2. 상단 바 (`Topbar.tsx`, `Brand.tsx`)
- 왼쪽: [로고 34px] **한화엔진**(26px 굵게, 지시서는 24px였으나 HANWHA ENGINE 12px보다 좁아 글자가 벌어져 26px로 함) / **HANWHA ENGINE**(12px, 글자 단위 양끝 맞춤으로 두 줄 너비 동일) │ RAG 기반 협력사 평가 AI 에이전트(18px).
- 오른쪽: 데이터 상태(SAMPLE/업로드 포함 배지·건수·기준일·"이 브라우저에 저장됨 시각"), 질문 해석 방식(규칙 기반/LLM 해석), 결제 알림 종(임박+지급 확인 필요 중 확인 안 한 건수, 누르면 대금 결제 일정), 샘플 데이터로 되돌리기(아이콘만, 확인 창; v0.7.1에서 상단 바 '데이터 불러오기' 삭제 — 불러오기는 필터 줄·하위 보기 머리), 사용자 메뉴(관심 협력사·부품 목록, 사용 안내 다시 보기, 저장된 업로드 데이터 삭제, 로그아웃).
- 1920·1366에서 한 줄. 1024px 이하 두 줄(1줄 브랜드·알림·사용자 / 2줄 데이터 상태·해석 방식·불러오기·되돌리기). 업로드 상태에서는 건수 대신 저장 상태 표시.
- 헤더의 흐름 문구("데이터 관리 → AI 분석 요청 → …")는 v0.3.0에서 삭제.
- **요약 지표 4개 버튼은 v0.3.1에서 사용자 요청으로 삭제**(같은 조건은 탭 빠른 필터로 남음, 정의는 `src/lib/kpi.ts`의 `QUICK`).

### 3-3. 왼쪽 데이터 관리 (`App.tsx`, `SupplierEvaluationCard.tsx`, `DataManagementTabs.tsx`)
- **채점 카드(다크):** "AI 에이전트 자동 채점·평가", 평가 대상 선택(★ 관심 협력사가 맨 위), ☆, 도넛(등급·종합 점수), 5개 항목 막대(품질·납기·원가·기술·대응력·경영·ESG). 오른쪽 위에 SAMPLE 표시, **'근거' 버튼**(팝오버: 항목별 점수 막대·계산 근거·데이터 출처·누락 항목·"챗봇에서 근거 리포트 만들기", Esc/바깥 클릭 닫힘, 초점 이동), 그 아래 **처리 단계 5개 작은 아이콘 줄**(자료 업로드→항목 추출→AI 채점→등급 분류→근거 리포트, 마우스를 올리면 단계·상태). 평가 기준은 `EVAL_CONFIG`(내부 평가 기준 예시 v0.1 DEMO, ISO 9001 공식 점수 아님, A≥85·B≥75·C≥65).
- **4개 데이터 탭(4등분):** 협력업체 / 구매조달 / 원가-계약 / 자재-공급관리, 탭마다 하위 보기:
  - 협력업체: 목록
  - 구매조달: 발주 목록 · **대금 결제 일정**
  - 원가-계약: 계약 단가 · **원자재 시세** · **인건비 동향**
  - 자재-공급관리: 재고·공급 · **경쟁사 공급 동향** · **업계 동향**
- 목록 공통: 검색, 빠른 필터(★ 관심만 포함), 상세 필터(다중 선택·범위·기간·**부품 분류 4단계 엔진›대부품›중부품›소부품**), 조건 칩·전체 초기화, "관심 항목 맨 위", 불러오기, 엑셀 내보내기(지금 조건의 행).
- 표: 모든 정렬 열이 첫 방향(숫자 큰 값·날짜 최근·글자 가나다) → 반대 → 해제, 위·아래 화살표, 20/50/100행 페이지 나누기("1–20 / 346행"), 선택 행이 있는 쪽 자동 이동, 왼쪽 패널 세로 스크롤 1개, 가로로 넘치면 가장자리 그림자(`ScrollX.tsx`).
- 행을 누르면 **상세는 오른쪽 AI 에이전트 패널 위쪽**에 표시(태블릿·휴대폰은 AI 에이전트 탭). AI 질문의 대상(문맥)도 된다.

### 3-4. 오른쪽 AI 에이전트 패널 (`ChatPanel.tsx`, `SelectionDetail.tsx`, `HistoryPanel.tsx`) — v0.4.0
- 머리: AI 에이전트 제목, **선택 정보 아이콘(ⓘ, 아이콘만·aria-label)**, 대화 이력(n), **대화 지우기(독립 버튼, v0.5.6: ⋯ 메뉴 삭제)**. 대화 이력 창 아래에 **대화 이력 전체 삭제**(확인 창·고정 포함, 삭제된 이력의 답변은 글만 남고 안내 줄 `[data-gone]`). 아이콘은 `AiAvatar.tsx`(공식 로고 PNG를 CSS로 원판에 맞춤, 중립 빌드는 말풍선 아이콘). 그 아래 선택 정보(접이식)+질문 대상 칩, 대화(위를 읽는 중 '새 답변 ↓'), 진행 중 '중단', 추천 질문(환영 메시지만 있을 때만 표시, 첫 질문 뒤에는 완전히 숨김 — v0.4.3)·입력창. (v0.4.2) 키워드 검색은 왼쪽 데이터 관리 패널 머리로 옮겼다.
- **선택 정보:** 협력사·발주·계약·부품 상세(등급·납기·공급 부품 분류 경로·등급 변동 이력 등). 새 답변이 오면 접힘, '선택 해제'.
- **답변은 글로만(표·차트·카드·보고서 없음).** `answerSections(result)`가 핵심 지표·비교 결과·위험 요소·검토할 사항·평가 근거를 글 목록으로 만든다. 계산과 문장은 코드(분석 결과 구조)에서 나온다. 답변마다 사용 데이터·기준일·SAMPLE·"최종 선정은 담당자" 문구, 다시 분석, 엑셀·CSV 내보내기(근거 표를 파일로만).
- 데이터가 바뀌면 가장 최근 답변에 "다시 분석" 안내(stale).
- 대화 이력: 최대 50건(넘으면 고정 안 한 오래된 것부터 삭제·알림), 이름·질문 검색, 최신순·이름순, 이름 바꾸기, 고정, 삭제(한 번 더 확인). 항목을 누르면 대화의 그 답변으로 이동·강조.
- 좁은 화면(1180px 이하): "데이터 관리"/"AI 에이전트" 탭. 행을 눌러도 탭은 저절로 바뀌지 않고 AI 에이전트 탭에 점이 뜬다.

### 3-5. AI 질문 처리 (`src/ai/*`, `src/store/agent.tsx`, 답변 글 `src/lib/answerText.ts`)
- (v0.4.0) 떠 있는 챗봇 창·버튼·말풍선은 없어지고 같은 대화 기능이 오른쪽 패널에 고정되었다. 입력창 위 추천 질문 칩, 질문 대상 칩, Enter 전송.
- 질문 유형 7종: 품목별 후보 업체, 납기 준수율 저조, 단가 상승, 등급별 품질 실적, 협력사 평가 근거, 협력사 비교, 재고·공급 위험. 대상이 없으면 되묻기(품목 칩). 후속 질문은 직전 품목·업체와 보던 형식 유지(예: "납기 우선").
- 단가는 같은 품목·규격·통화·인도조건끼리만 비교, 조건이 다르면 순위 제외·사유 표시.
- **챗봇은 새 데이터(결제·시세·인건비·경쟁사·동향) 질문에는 아직 답하지 않는다**(범위 밖, 다음 후보).

### 3-6. 새 데이터 화면 계산 규칙
- **대금 결제 일정** (`src/lib/payments.ts`, `PAYMENT_RULE`, `SUPPORTED_TERMS` 한 곳 관리): 기준 = 입고일(입고 전이면 납기 예정일 "납기 예정"). 해석: `월말 마감 N일`(입고 달 말일+N), `월말 마감 익월 D일`, `입고 후 N일`·`검수 후 N일`. 선적 후 N일·분할 결제·계약 없음은 날짜 추정 없이 "결제조건 확인 필요"+이유 표시. 상태: 7일 이내 임박, 30일 이내 예정, 지난 14일 이내 지급 확인 필요(지급 실적 없음 → 완료·지연 판단 안 함), 납기 지났는데 미입고 = 입고 대기. 금액 = 수량×단가, 통화별 합계(환율로 합치지 않음). 요약 카드(누르면 목록 거름), 12주 주별 막대(첫 주 임박 강조, "오늘" 점선), 목록 D-day·'확인함'(사용자별 저장, 지급 완료 아님). 샘플: 임박 5·예정 10·지급 확인 필요 1 → 종 배지 6, PO-2026-0059 = 2026-10-20 D-5.
- **원자재 시세** (`src/lib/market.ts`): 7종(선철·철스크랩·니켈·크롬·몰리브덴·구리·주석), 국제 USD/톤 → `× 원/달러 ÷ 1000` = 원/kg로 국내와 같은 축 비교. 표: 최근·전월 대비·전년 같은 달 대비·3개월 추세. 품목별 주요 소재 ↔ 계약 단가 변동률을 수치만 나란히(원인 판단 문장 없음). 기간 6/12/24개월.
- **인건비 동향:** 직종 대·중·소(한국표준직업분류 대분류 명칭 참고, 대 3·중 5·소 12), 트리·월평균 임금 추이·전년 대비·상위 분류 비교·관련 협력사. 협력사 공정 → 직종 연결(`PROCESS_TO_JOBS`).
- **경쟁사 공급 동향:** 경쟁사(가상)→부품→공급처, 우리 협력사가 공급하면 "공급 경쟁", 출처 링크 없으면 경고, 기준일(가장 최근 확인일).
- **업계 동향:** 카드 목록(날짜·제목·요약·관련 부품·원자재·출처), 부품·원자재로 거르기.
- 하위 보기마다 SAMPLE 배지·기준일/기준월·출처·불러오기 버튼.

### 3-7. 업로드·저장
- CSV(첫 줄 열 이름)/JSON, 열 이름 자동 연결(한글·별칭), 빈 양식 받기, 필드 안내, 형식 검사(숫자·날짜·월·등급·필수·중복·참조). 오류 문구는 "무엇이 잘못 → 어떻게 고침", 행 번호는 엑셀 행 번호(1행=열 이름). 병합(같은 키면 새 값) / 교체. 여러 열 키 지원.
- 업로드 데이터는 IndexedDB(`procure-ai`/`uploads`, 키 `u:{id}:uploads`)에 사용자별 저장, 새로고침 유지, 저장 실패 안내.
- 데이터 종류 11가지: suppliers, purchaseOrders, contracts, inventory, items, bom, materialPrices, fxRates, laborWages, competitorSupply, industryNews.

### 3-8. 접근성·반응형
- 확인 창·업로드 창·첫 안내: Tab이 창 밖으로 나가지 않음, 닫으면 누른 버튼으로 초점 복귀(`focus.ts`). 한국어 낱말 단위 줄바꿈(keep-all). 용어 툴팁(SAMPLE·LLM·공급 경쟁·열 제목 hint).
- 1920 기준, 1366 보정, 1180 이하 탭 전환, 1024 이하 헤더 두 줄, 640 이하 휴대폰.

## 4. 파일 지도
| 영역 | 파일 |
|---|---|
| 뼈대·2분할·로그인 게이트 | `src/App.tsx`, `src/main.tsx` |
| 상단 바·브랜드 | `src/components/Topbar.tsx`, `Brand.tsx`, `src/brand/{hanwha,neutral,types,index}.ts`, `src/assets/brand/{hanwha-engine-logo.svg,logo.png}` |
| 로그인·첫 안내 | `LoginScreen.tsx`, `Onboarding.tsx`, `src/platform/users.ts` |
| 채점 카드·근거 팝오버 | `SupplierEvaluationCard.tsx`, `src/lib/evaluation.ts` |
| 데이터 탭·표·필터 | `DataManagementTabs.tsx`, `DataTable.tsx`, `FilterBar.tsx`, `ScrollX.tsx`, `src/lib/filters.ts`, `kpi.ts`(QUICK), `bom.ts` |
| 하위 보기 | `src/components/subviews/{SubViewHead,PaymentSchedule,MaterialPrices,LaborWages,CompetitorSupply,IndustryNews}.tsx` |
| 선택 정보 | `SelectionDetail.tsx`, `GradeTimeline.tsx`, `FavStar.tsx` |
| AI 에이전트·답변 | `ChatPanel.tsx`(대화·입력·내보내기 버튼), `HistoryPanel.tsx`, `src/lib/answerText.ts`, `charts/Chart.tsx`(왼쪽 하위 보기용) |
| AI | `KeywordSearch.tsx`, `src/ai/{intent,llm,agent}.ts`, `src/store/agent.tsx`, `server/index.mjs`(`/api/ai/interpret`, `/api/ai/status`) |
| 상태 | `src/store/store.tsx`(State·액션: selectRow·detailOpen·addResult·focusData·goPayments·favorites·payCheck·replaceData·resetSample 등) |
| 계산 | `src/lib/{metrics,analysis,payments,market,search}.ts` |
| 데이터 정의·검증 | `src/data/{types,schema,sampleData}.ts`, `src/lib/validate.ts`, `src/data/sample/*.json`, `scripts/generate-sample.mjs` |
| 내보내기 | `src/lib/{xlsx,exporters,csv}.ts`, `src/platform/runtime.ts`(saveFile: 로컬 다운로드 / claude.ai downloads) |
| 저장 | `src/platform/{storage,idb}.ts` |
| 대화상자·공통 | `ConfirmDialog.tsx`, `ImportDialog.tsx`, `ui.tsx`, `focus.ts` |
| 스타일 | `src/styles.css` (토큰, 버전별 블록 주석, 미디어·컨테이너 쿼리) |
| 빌드 | `scripts/build.mjs` (`virtual:brand` 플러그인으로 두 번 빌드) |
| 수기입력 | `src/lib/manual.ts`, `src/components/ManualEntryDialog.tsx`(+ 스토어 `manual*`, `FilterBar` `lead`), `tests/logic-manual.ts` |
| 테스트 | `tests/e2e.py`, `tests/logic-smoke.ts`, `tests/logic-v3.ts` |

`src/components/KpiStrip.tsx`는 v0.3.1에서 삭제됨(옛 저장소에서 수동 삭제 필요했음).

## 5. 저장 키 (`procure-ai:` 접두)
사용자별: `u:{id}:session.v3`(대화·결과·이력 메타), `u:{id}:view-settings.v2`, `u:{id}:prefs.v1`(관심·맨 위 고정·결제 확인), `u:{id}:onboarded.v1`, `u:{id}:manual.v1`(수기 입력, v0.7.0), IndexedDB `u:{id}:uploads`. 공용: `users.v1`, `current-user.v1`, `chat-window.v2`, `chat-nudge.v1`, `split.v1`. 키 구조를 바꾸면 버전을 올리고 이전 코드를 넣는다.

## 6. 샘플 데이터 결정 사항
- 기준일 2026-10-15. 협력업체 12, 품목 10, 발주 346, 계약 23, 재고 10, BOM 18행(SAMPLE 엔진 X형·Y형, 대부품: 기관 본체·실린더부·운동부·연료·유압 공급부·소기·과급부·배관·냉각부 — 2행정 선박 엔진 설명서 묶음 참고), 시세 336행, 환율 24, 임금 288, 경쟁사 7(가온중공업 엔진사업부(가상)·서진마린엔진(가상)·동해파워텍(가상)), 기사 8(SAMPLE 기사(가상)).
- 품목별 주요 소재 예: 실린더 라이너=선철·철스크랩·몰리브덴, 배기밸브 스핀들=니켈·크롬 등.
- 협력사 반기 평가 이력 4~6회, 일부만 변동 사유.
- 생성기는 새 데이터를 별도 시드(`mulberry32(20261016)`)로 만들어 기존 발주·재고가 바뀌지 않게 했다.

## 7. 사용자가 답한 확인 질문 (v0.3.0)
로고 사용 허락 받음 / 로그인은 임시로 간단히 / 엔진 분류표 없음 → 업계 분류 참고 / 원자재는 부품별 소재, KRW 표시 / 인건비 분류 알아서 / 경쟁사는 "실명(가상)" / 기준 미달 = C·D / 결제 7일 임박·30일 예정 / 실제 데이터 자동 연동 = 답 없음 → 하지 않음(연동 후보: 한국은행 ECOS 환율 API, 한국광해광업공단 광물 가격 공공데이터, 조달청 비축 원자재, 고용노동부 고용형태별 근로실태조사, OpenDART).

## 8. 테스트 현황 (v0.4.0)
- (v0.4.4) E2E 269개(268 통과, 1건 '대화 이력 Esc 초점 복귀'은 v0.4.3부터 있던 실패 — 헤드리스 초점 문제로 추정, 미조사), 로직 51/51. (v0.4.3) E2E 267/267, 로직 51/51 통과. (v0.4.2는 E2E 259) (v0.4.0은 E2E 215) 엑셀은 openpyxl·LibreOffice로 다시 읽어 확인.
- 확인 못 한 것: 실제 Microsoft Excel로 열기, claude.ai 공유 링크에서 엑셀 저장 클릭, 실제 웹 글꼴(IBM Plex Sans KR)로 캡처, 화면 코드 전체 strict 타입 검사(이전 환경에 @types/react 설치 불가) → **Claude Code 환경에서 `npm install && npm run typecheck` 먼저 실행해 볼 것.**

## 9. 제안만 하고 아직 안 한 것 (우선순위)
- 높음: 지급 실적 데이터 연결(결제 완료·지연 판단).
- 중간: 챗봇이 결제·시세·인건비·경쟁사·동향 질문에 답하도록 질의 유형 추가 / 공공 데이터 연동 / 휴대폰에서 표 대신 카드 목록 / 팀 공유가 필요하면 서버 저장+실제 인증.
- 낮음: 표 열 제목 고정(세로 스크롤 시), 화면 위치를 짚는 안내(코치마크), 처리 단계 설명 보강.
- (예전 제안 "평가 카드 접기"는 사용자가 카드 유지를 원해 보류.)

## 10. 사용자 피드백에서 배운 점
- 요청을 넓게 해석하지 말 것: "처리 단계 부분만 잘라 구석에" → 카드 전체를 줄이면 안 됨.
- "지워"라고 한 것은 지운다(요약 지표 버튼). 지우지 말라는 규칙 6과 충돌하지 않음 — 사용자 명시 요청이 우선.
- 로고 문제는 대부분 "공유 링크(중립 빌드)를 보고 있어서"다. 먼저 어느 화면을 보는지 확인한다.
- 사용자는 결과를 화면 캡처로 확인한다. 변경 후 캡처를 함께 보여 주면 좋다.

## 11. 작업 절차 (매 버전)
1. 요청을 프롬프트/작업 목록으로 정리하고 모호한 점은 묻기 → 2. 구현 → 3. `npm run build` → 4. `npm run test:logic` → 5. 서버 띄우고 `python3 tests/e2e.py http://localhost:5173 <캡처폴더>` (화면 바꾼 곳은 테스트도 수정) → 6. 4개 해상도 캡처 확인 → 7. README·CHANGELOG·package.json 버전 → 8. 커밋(메시지 형식 `vX.Y.Z 업데이트: …`) → 9. 보고(CLAUDE.md의 결과 보고 형식).

## 12. Claude Code 첫 작업 지시 (사용자가 붙여 넣을 프롬프트)

```
이 저장소는 "RAG 기반 협력사 평가 AI 에이전트"(한화엔진 DX 과제 시연판) v0.4.0이야.
claude.ai에서 v0.1.0~v0.3.2까지(v0.4.0은 Claude Code) 만들어 왔고, 여기서 이어서 개발할 거야.

1. CLAUDE.md, docs/HANDOFF.md, README.md, CHANGELOG.md를 모두 읽고 규칙·화면·결정 사항을 파악해.
2. npm install → npm run typecheck → npm run build → npm run test:logic 순서로 실행하고,
   서버(npm start)를 띄운 뒤 python3 tests/e2e.py http://localhost:5173 로 E2E를 돌려서
   지금 상태가 v0.4.0 보고 내용(E2E 215개, 로직 51개 통과)과 같은지 확인해.
   typecheck에서 오류가 나면 기능을 바꾸지 말고 타입만 고쳐.
3. 확인 결과(통과 수, 실패 항목, 고친 타입 오류)를 한국어로 짧게 보고하고, 다음 작업 지시를 기다려.
   파악한 내용 중 모호하거나 문서끼리 맞지 않는 곳이 있으면 같이 알려 줘.
규칙: SAMPLE 데이터 외에 수치·업체명을 지어내지 말 것, 새 npm 패키지 추가 금지(필요하면 먼저 물어볼 것),
API 키·비밀번호·면담 기록은 커밋 금지, 기존 기능은 내가 지우라고 한 것만 지울 것.
```

## v0.7.2 메모 (환영 말풍선 스크롤 없음, 토스트 2초·나타남/사라짐)
- 휴대폰 규칙은 `src/styles/v14.css` 의 `@media (max-width: 640px)` 블록(머리 한 줄·`.tool-label` 시각적 숨김·칩 개수·여백) + `ChatPanel.tsx` 의 `useSyncExternalStore` 로 `(max-width: 640px)` 를 보고 환영 문구를 `WELCOME_SHORT`(store.tsx)로 바꿈. 긴 문구는 e2e 가 단정하므로 그대로.
- 토스트: `App.tsx` `Toast`(`TOAST_MS=3600`, `leavingId` 상태, `is-leaving`), 키프레임 `toastOut`(motion.css), store 의 `toast.ms`. 문서 등록 성공만 `ms: 2000`.
- e2e: 바뀐 기존 항목 — 실시간 재생 검사(live 정규식)의 허용 목록에 `toastOut` 추가. 그 밖의 기존 항목은 그대로 통과. 새 ⑭ 블록 추가. 앞쪽 시나리오가 많은 페이지를 열어 둔 채라 ⑬ 앞에서 브라우저를 새로 띄우고, `v71new`/`v72new` 는 Chromium 페이지가 죽으면(이 환경에서 간헐) 3번까지 다시 시도.

## v0.7.1 메모 (사용자 요청 4가지)
- 문서 등록 버튼: 입력창 위(`.doc-row`·`.doc-hint` 삭제) → 대화 패널 머리 `.chat-tools` 안 '대화 이력' 바로 왼쪽. 형식·크기 안내는 title·`aria-description`(보이는 글자 아님). 아이콘 `LuFileUp` → `LuFilePlus2`(불러오기는 `LuFileUp` 그대로). 머리 버튼 3개가 좁은 패널(1366·400)에서도 한 줄이 되도록 `.chat-tools .btn` 가로 여백 14→10px(≤480px는 8px).
- 상단 바 '데이터 불러오기'(주황, `Topbar.tsx`) 삭제. 불러오기 입구: 4개 탭 필터 줄(협력업체·구매조달·원가-계약>계약 단가·자재-공급관리>재고·공급) + 하위 보기 머리 `SubViewHead`(결제 일정·원자재 시세·인건비·경쟁사·업계 동향, 데이터가 없는 상태 포함) — 창의 '데이터 종류' 목록으로 모든 데이터 종류를 고를 수 있어 기능 손실 없음. 샘플 되돌리기는 `.hide-lg` 글자를 없애 모든 폭에서 아이콘만(40px, 터치 44px), ≤1270px 두 번째 줄은 상태 알약+아이콘 한 줄.
- 추천 질문: `SUGGESTED` 7→5개(뺀 것: 'A등급 협력사의 품질 실적을 정리해 줘.', '업체 C 납기 지연 보고서 찾아줘'; 질문 자체는 직접 입력해도 그대로 동작), 관심 질문이 있으면 앞에 붙이고 총 5개로 자름. `.suggest-row` max-height·스크롤 삭제, ≤820px 높이에서 칩 30px·간격 5px, ≤640px는 앞 3개만 보임(터치 44px 칩 5개면 대화 영역이 96px로 줄어서). 칩 `max-width:100%`로 긴 글은 칩 안에서 줄바꿈.
- 바뀐 e2e(지우지 않고 바꿈): 상단 바 `.btn-primary` 를 쓰던 5곳(불러오기 시나리오→필터 줄 불러오기, 휴대폰 두 줄 순서→`.sample-reset`, 주 버튼 색·강조색 파랑→`probe_primary()`로 `.btn-primary` 클래스를 임시 버튼에 입혀 검사, 호버 올림→`.sample-reset`), 1366 '추천 질문 한 줄 가로 스크롤'→줄바꿈·스크롤 없음·대화 영역 ≥160, 문서 등록 위치 검사(입력창 바로 위 → 머리 '대화 이력' 왼쪽), 추천 질문 문서 3개→2개+5개 총수. 새 시나리오 ⑬ 추가.

## v0.7.0 메모 (수기입력)
- 요청: 견적서·납기보고서·계약서를 손으로 입력하는 팝업, 입력 즉시 대시보드 반영. 버튼 '수기입력'은 필터 줄에서 **상세 필터 바로 오른쪽**(`FilterBar`의 `lead` 슬롯, `DataManagementTabs`가 채움).
- 구조: `src/lib/manual.ts`(순수 함수: 칸 정의 `DETAIL_FIELDS`, 검증 `validateManual`, 금액 동기화 `syncAmount`, 변환 `buildEntry`/`entryRow`, 합치기 `mergeManual`) · `ManualEntryDialog.tsx`(화면) · 스토어 `state.manual`(원본 목록)·`manualOpen`·`flash` + Store 컨텍스트의 `data`·`meta`(= 기본 데이터+수기 입력). **계산·질문 답변은 `state.data`가 아니라 컨텍스트의 `data`/`meta`를 쓸 것.** `state.data`는 샘플/업로드 원본이며 업로드 저장·병합 대상.
- 데이터 종류 맞춤: 납기보고서 → `purchaseOrders`, 계약서 → `contracts`(`docType:'계약'`), 견적서 → `contracts`(`docType:'견적'`, 시작=견적일, 종료=유효기한, 견적번호 `QT-M001` 자동). **견적은 `derived.agreedContracts`에서 빠져** 원가 점수·최저가 비교·후보 업체 단가·결제조건·단가 상승 계산에 안 쓰임(표·검색·건수에는 나옴). 새 품목은 `MANUAL-001`… 로 품목 마스터에 합쳐짐(같은 이름 재사용).
- 날짜 기본값은 `meta.asOf`(샘플 2026-10-15)로 견적일·발주일·계약 시작일만. 번호가 겹치는 수기 행은 합칠 때 건너뜀.
- 저장: localStorage `u:{id}:manual.v1`. 되돌리기·업로드 삭제 메뉴·로그아웃 삭제와 함께 지워짐.
- 일부러 안 한 것: 수정(삭제 후 재입력), 공급사 직접 입력(공급사는 기존 목록에서만 선택), 문서 종류 '기타'(담을 데이터 종류 없음), 첨부 파일, 견적의 원가 비교 반영.
- 바뀐 e2e: 기존 항목은 지우지 않음. 수기입력 시나리오(⑫)를 `tests/e2e.py` 끝에 추가. 좁은 화면 스윕에서 `.panel-tabs .is-active`(움직이는 배경 표시자라 검사기가 1.1:1로 오독, 기존 동작)는 새 창 검사에서만 제외.

## v0.6.0 메모 (로고 SVG · 카드 폭 · 문서 등록 · 문서 검색)
- 브랜드: `Brand.tsx` = `.brand-plate`(흰 판) > `img.brand-logo`(alt 한화엔진) + 구분선 + 제품 이름. `Brand` 타입의 `companyEn` 삭제, `wordmark` 추가(`src/brand/*`). 로고 높이 44/38/34px. SVG 파일은 수정 금지. 파일 지도: `src/assets/brand/hanwha-engine-logo.svg`, `src/lib/documents.ts`, `src/lib/documentSearch.ts`, `src/data/sample/documents.ts`, `tests/logic-docs.ts`.
- 평가 카드 폭: 원인은 스크롤바 유무(`scrollbar-gutter: stable`로 해결). e2e는 클래식 스크롤바 브라우저(`cbrowser`)로 1366·1920(밝/어둠)·2560 모든 탭·하위 보기에서 폭·높이 ≤0.5px 확인.
- 문서 등록은 UI+스텁뿐: 실제 파싱→청킹→임베딩→벡터DB 는 백엔드(POST /api/documents, multipart "file" → {docId,name,size,registeredAt}) 담당이 만든다. `registerDocument` 한 곳만 fetch 로 바꾸면 됨. 파서 라이브러리·FileReader 금지(정적 검사 e2e·logic).
- 문서 검색은 시연용 규칙 코드. 백엔드 벡터DB 가 생기면 `searchDocuments` 결과 자리에 그 응답을 넣는다. 말뭉치는 전부 SAMPLE(가상).
- 바뀐 e2e 항목(지우지 않고 바꿈): ① 로그인 화면 '한화엔진/HANWHA ENGINE 유지'(.brand-ko/.brand-en) → 로고 alt·영문 글자 없음 ② '로고 표시' + 브랜드 글자 한 덩어리·4.6배·HANWHA ENGINE 양끝맞춤·글자 크기 22px↑·서체·'로고 높이 38~42px' 묶음 → SVG 로고 한 장·옛 글자칸 없음·높이 44~48px·흰 판 ④개 ③ '한화엔진이 플랫폼 이름보다 큰 글자' → 로고 높이가 제품 이름 글자보다 큼 ④ logo.png 해시 검사의 'src/assets 변경 없음' → 새 SVG 추가만 허용. 모션 목록의 logoIn 은 AI 아이콘으로 이전. 새 검사 46개.

## v0.5.6 메모 (사용자 요청 8가지)
- 모션: `--k` .5(진입), `--k-tween` .38(선택 바꿈 이어서 움직이기 약 600ms). 글자 토큰 `--fs-*` 값 13/14/15/17/21. 여백 `--frame-x` clamp(12px,4.8vw,78px)·≤1180 15px·≤640 9px.
- 상단 바 반응 규칙(v14.css): ≤2000 되돌리기 글자 접힘, ≤1900 질문 해석 글자 접힘+제품 이름 두 줄, ≤1700 기준일 접힘, ≤1500 제품 이름 15px, ≤1440 사용자 이름 접힘, ≤1270 상단 바 두 줄. 폭 바꿀 때 `.tb-status` 안 SAMPLE이 잘리는지 e2e('상태 알약 안 SAMPLE')가 1366·1920에서 확인한다.
- 검색·필터 입력 통일 토큰 `--field-*`(tokens.css), 적용은 v14.css '데이터 관리 패널' 블록(`.panel-a` 범위 + `.kw-field`·`.search-field`).
- 새 e2e는 e2e.py 'v0.5.6 새 검사' 블록(이력 전체 삭제·글자 +1px(v0.5.5 값 표 기록)·검색창 통일·AI 아이콘(로고 바이트 비교·git 해시)·중립 빌드·머리 버튼·여백 ×1.5). E2E 491개·로직 51개 통과.

## v0.5.5 메모 (채점 요약 막대 도킹, 선택 정보 머리 줄 고정)
- 왼쪽 `.panel-body-a` 맨 앞에 `.eval-dock`(높이 0 sticky 래퍼) + `.eval-dock-bar`(role=region '채점 요약'). `SupplierEvaluationCard.tsx` 의 `useDocked`(IntersectionObserver 2개: 나타남 56px, 사라짐 56+24px)가 `is-on` 을 켠다. 전체 카드는 건드리지 않는다. 막대는 항상 그려 두어 평가 대상이 바뀌면 숨어 있어도 값이 이어서 움직인다. CSS 는 `styles/v14.css` 끝(v0.5.5 블록): sticky `top: calc(-1 * var(--pb-pt))`(패널 안쪽 여백 12px/8px 만큼 올려 맨 위에 맞춤), 아래 여백 -18px(= `.panel-body-a` gap 18px; gap 을 바꾸면 같이 바꿀 것), 막대 높이 56px 는 JS `DOCK_H` 와 같은 값.
- 기존 e2e 선택자 충돌을 피하려고 막대는 `.donut-arc`/`.eval-bar-fill` 이 아닌 `.dock-arc`/`.dock-fill` 클래스를 쓴다(전역 `querySelector('.donut-arc')` 검사가 막대를 먼저 집지 않게).
- `SelectionDetail.tsx` `Detail`: 접힘 `section.row-summary`, 펼침 `section.row-detail`, 머리 줄 `.row-detail-head` 는 같은 요소. `#selection-detail` id 는 펼침에서만.
- E2E 449개 전부 통과(v0.5.5 시점). 새 검사는 e2e.py 맨 끝쪽 'v0.5.5' 블록(Windows 클래식 스크롤바 브라우저를 따로 띄워 버튼 위치도 확인).

## v0.5.4 메모 (선택 바꿈 = 이어서 움직이기, 제품 이름 변경)
- 제품 이름은 **"RAG 기반 협력사 평가 AI 에이전트"**. 한 곳에서 바꾼다: `src/brand/hanwha.ts`·`neutral.ts` 의 `product`·`docTitle`, `scripts/build.mjs` 의 빌드 `<title>`. 이 밖에 `src/lib/xlsx.ts`(엑셀 작성자·응용 프로그램). 일부러 남긴 것: 패키지 이름·저장 키(`procure-ai:*`, IndexedDB `procure-ai`), 옛 CHANGELOG 항목, 챗봇 첫 인사의 "구매·협력사 데이터 분석 도우미"(제품 이름이 아니라 역할 설명)·LLM 프롬프트(`src/ai/llm.ts`, `server/index.mjs`)의 설명 문구. 상단 바: 1700px 이하에서 이름이 두 줄(13~16px), 기준일(`.ds-asof`)도 1700px 이하에서 접힘, ≤640px 에서는 눈에 안 보이지만 h1 글자로 남음(접근 가능한 이름), `title` 속성으로 전체 이름. 로그인 화면은 구분선만 숨김.
- 선택 바꿈 이어서 움직이기(v0.5.3의 0에서 다시 재생을 번복): 평가 카드(`.eval-body[data-tween]`)·인건비(`.wage-main[data-tween]`)의 `CountUp` 은 `data-tween` 안에서 값이 바뀌면 `shown`(지금 보이는 값) → 새 값으로 약 600ms 센다. 도넛 호·점수 막대는 `motion.css`의 CSS 전환(`stroke-dasharray`·`width`, `--ease-q` = ease-out-quart) — 브라우저가 도중 변경을 현재 값에서 다시 출발시킨다. 꺾은선은 `Chart.tsx` 의 `useMorph`(`morph` 속성을 준 Chart 만, 점 y값·눈금 범위 보간, 점 개수가 다르면 많은 쪽으로 다시 뽑기, `data-morphing="1"` 표시). 처음 열기·탭/하위 보기 전환은 예전처럼 0에서(.is-entering). `replay-zone`·`useReplayOn`(선택 바꿈용) 은 제거, `useReplayOn` 은 탭 전환·좁은 화면용으로 남음.
- E2E 407개 전부 통과(v0.5.4 시점).

## v0.5.3 메모 (로고·브랜드 글자·여백·선택 바꿈 재생 — 선택 바꿈 재생 부분은 v0.5.4에서 이어서 움직이기로 바뀜)
- 로고 높이 32→40px(≤1320px은 28→35px), 브랜드 글자 22→26px(≤1320px 20→23px). `Brand.tsx`의 Spread(글자 사이 벌리기)를 없애 '한화엔진'이 한 덩어리 글자. 서체는 `styles.css`의 `--font-brand`(Apple SD Gothic Neo → Malgun Gothic → Noto Sans CJK KR 시스템 고딕, 굵기 800; 새 글꼴 파일·외부 요청 없음). 글꼴 파일을 새로 넣는 것은 하지 않았다(CHANGELOG 참고).
- 쪽 좌우 여백 `--frame-x`: clamp(8px, 3.4vw, 52px) (1920=52px, 1366≈46px). ≤1180px 10px·≤640px 6px 는 그대로. 스플리터 `SPLITTER_PX`·65:35 계산은 셸 안쪽 너비로 하므로 영향 없음.
- 선택 바꿈 재생: `useReplayOn(ref, key)` 를 평가 카드(`.eval-body`, key=supplierId)·원자재(`.replay-zone`, key=소재/기간)·인건비(`.wage-main.replay-zone`, key=직종 경로/기간)에 사용. CSS 는 motion.css 의 "2-2" 절(`.eval-body.is-entering …`, `.replay-zone.is-entering .chart-card {animation:none}`). 인건비 상단 숫자 3개는 `CountUp`. 테마·호버·필터·크기 변경은 key 가 같아 재생 안 함.

## v0.5.2 메모 (v14 모션 세트)
- 모션은 `src/styles/motion.css`(키프레임 전부 + 규칙, 배율 `--k:.38` 하나로 전체 속도 조절)와 `src/lib/motion.ts`(재생 제어기)로 끝. 시간은 "v14 디자인 시간(ms)"으로 적고 `calc(… * var(--k))`를 곱한다.
- 재생 범위: `.app.is-entering`(처음 열 때, JSX className에 처음부터 있고 `armEnter`가 1.4초 뒤 뗌) · `#tab-panel`(탭·하위 보기 변경, `useReplayOn`) · `.workspace`(좁은 화면 화면 전환). 필터·정렬·페이지는 클래스가 없어 동작 없음. 새 진입 동작은 반드시 `.is-entering` 아래 선택자로 쓸 것(안 그러면 필터 때도 재생됨).
- 순서 번호 `--r`는 CSS nth-child 목록(motion.css 중간)이 정함, 낱말 `--i`는 `Words`(ui.tsx), 차트 막대·선 `--i`는 Chart.tsx 인라인. CountUp(ui.tsx)은 `.is-entering` 안에서 마운트·재생 이벤트(`motion-replay`) 때만 센다; 값은 항상 `data-final`·글자로 DOM에 있음.
- 이 버전은 v0.5.0의 "진입 ≤300ms" 결정을 사용자 요청으로 번복한 것(CHANGELOG 참고). E2E의 로그인/새로고침 대기는 `.is-entering` 종료까지 기다린다(`tests/e2e.py` 맨 위 `_wfs`, `settled`).

## v0.5.1 메모 (한화 컬러웨이)
- 팔레트: 오렌지 `#F37321`/`#F89B6C`/`#FBB584`, 검정 `#1B1B1B`. 주황 채움 위 글자는 `--on-accent`(#1B1B1B). 주황 글자는 `--accent-ink`. 강조색 파랑 등은 브랜드 밖 선택지.

## v0.5.0 메모 (디자인)
- 스타일은 `src/styles.css`(기본 규칙) → `src/styles/v14.css`(v14 적용층, 같은 이름 규칙을 덮어씀) 순으로 번들되고 토큰은 `src/styles/tokens.css`. 테마·강조색은 `<html data-theme data-accent>`, 저장 키 `procure-ai:theme`·`procure-ai:accent`, 첫 그림 전 인라인 스크립트는 `scripts/build.mjs`의 PREPAINT.
- 글자가 들어가는 채움은 `--accent-fill`(오렌지는 --accent와 같고 위 글자는 --on-accent), 카드 위 강조 글자는 `--accent-ink`, 어두운 히어로 위 글자는 `--accent-text-dk`. 새 색을 쓸 때 `tests/e2e.py`의 대비 점검(4.5:1)을 통과해야 한다.
- E2E 382개 전부 통과(v0.5.3 시점). 스플리터 너비 상수는 App.tsx `SPLITTER_PX`와 v14.css `--split-gap`(20px)이 같아야 한다.
