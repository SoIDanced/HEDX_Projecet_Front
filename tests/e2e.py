"""브라우저 E2E 테스트 (v0.5.0)
간이 로그인·사용자별 저장, 브랜드 헤더, 작은 채점 위젯, 2분할 65:35·스크롤 1개·페이지 나누기, 평가 근거 팝오버, 오른쪽 고정 AI 대화 패널(글 답변만),
선택 정보(대화 패널 위 접이식)·대화 이력·답변별 엑셀/CSV 내보내기, 필터(부품 분류)·정렬·관심 목록, 새 하위 보기(결제 일정·원자재·인건비·경쟁사·업계 동향),
업로드 저장 유지, 해상도별 화면을 확인한다.
실행: (서버 실행 후) python3 tests/e2e.py [http://localhost:5173] [스크린샷 폴더]
"""
import sys, os, json, tempfile
from playwright.sync_api import sync_playwright, Page

# v0.5.2: 첫 화면 진입 동작이 약 1초라, 로그인·새로고침 직후(.eval-card 대기)에는 .is-entering 이 끝날 때까지 기다린다
_orig_wfs = Page.wait_for_selector


def _wfs(self, selector, **kw):
    r = _orig_wfs(self, selector, **kw)
    if selector == ".eval-card":
        self.wait_for_function("() => !document.querySelector('.is-entering')", timeout=4000)
    return r


Page.wait_for_selector = _wfs


def settled(pg):
    """탭·하위 보기 전환 재생(.is-entering)이 끝나고 숫자 올라가기가 최종 값에 닿을 때까지"""
    pg.wait_for_function("() => !document.querySelector('.is-entering')", timeout=4000)
    pg.wait_for_timeout(350)  # 강조색·테마 바꾼 뒤 색 전환(0.2~0.3초)도 끝나게

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp()
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))


def open_chat(page):
    """오른쪽 대화 패널은 항상 열려 있다. 좁은 화면에서만 'AI 대화' 탭으로 전환한다."""
    if not page.locator("#chat-input").is_visible():
        page.locator(".panel-tabs button", has_text="AI 대화").click()
        page.wait_for_selector("#chat-input")


def ask(page, text):
    open_chat(page)
    page.fill("#chat-input", text)
    page.press("#chat-input", "Enter")
    page.wait_for_function("() => !document.querySelector('.progress')", timeout=8000)


def close_chat(page):
    """대화 패널은 닫히지 않는다 (예전 떠 있는 창의 닫기 동작 대신 아무것도 하지 않음)."""
    return None


def last_ai(page):
    return page.locator(".msg-ai").last


def rows(page, sel=".data-table tbody tr"):
    return page.locator(sel).count()


def count_text(page):
    return page.locator(".filter-count b").inner_text()


def demo_login(page):
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector("#login-demo")
    page.click("#login-demo")
    page.wait_for_selector(".eval-card")  # 저장된 업로드를 읽은 뒤 화면과 첫 사용 안내가 함께 뜬다
    if page.locator("#ob-skip").count():
        page.click("#ob-skip")


def small_fonts(page):
    return page.evaluate(
        """() => { const out=[]; for (const el of document.querySelectorAll('body *')) { if (!el.childNodes.length) continue; const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()); if(!hasText) continue; const r=el.getBoundingClientRect(); if(!r.width) continue; const fs=parseFloat(getComputedStyle(el).fontSize); if (fs<12) out.push(el.tagName+'.'+el.className+':'+fs); } return out.slice(0,5); }"""
    )


def v_scrollers(page, root=".panel-a"):
    return page.evaluate(
        """(root) => [...document.querySelectorAll(root+' *')].filter(e=>{const s=getComputedStyle(e);return /(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1}).map(e=>e.className)""",
        root,
    )


def sort_all(page, table_sel, cycle_none=True):
    """정렬할 수 있는 모든 열을 눌러 첫 방향 → 반대 방향 → (해제 또는 기본 순서)를 확인한다."""
    ths = page.locator(f"{table_sel} thead th:has(button.th-sort)")
    n = ths.count()
    bad = []
    for i in range(n):
        th = ths.nth(i)
        btn = th.locator("button.th-sort")
        name = btn.inner_text().strip()
        btn.click()
        a = th.get_attribute("aria-sort")
        up_on = th.locator(".sort-ic.is-asc").count() if a == "ascending" else th.locator(".sort-ic.is-desc").count()
        btn.click()
        b = th.get_attribute("aria-sort")
        btn.click()
        c = th.get_attribute("aria-sort")
        ok = {a, b} == {"ascending", "descending"} and up_on == 1 and th.locator(".sort-up").count() == 1 and th.locator(".sort-down").count() == 1
        if cycle_none:
            ok = ok and c == "none"
        if not ok:
            bad.append(f"{name}:{a}/{b}/{c}")
    return n, bad


def no_hscroll(page):
    return page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # 샌드박스는 외부 글꼴(Google Fonts)을 받을 수 없어 그 연결 실패는 제외한다
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_TUNNEL_CONNECTION_FAILED" not in m.text else None)

    # 0. v0.2.0 때 저장된 내용(사용자 구분 없음)을 넣어 두고 첫 로그인 사용자에게 옮겨지는지 본다
    page.goto(URL, wait_until="domcontentloaded")
    legacy = {"messages": [{"id": "old1", "role": "user", "text": "예전 버전에서 한 질문", "at": "2026-10-10T09:00:00.000Z"}], "results": {}, "view": {"resultId": None, "template": None}, "lastResultId": None, "pending": None}
    page.evaluate("(v) => localStorage.setItem('procure-ai:session.v2', JSON.stringify(v))", legacy)
    page.reload(wait_until="domcontentloaded")

    # 1. 간이 로그인
    page.wait_for_selector("#login-name")
    check("처음 열면 로그인 화면", page.locator(".login-card").is_visible() and page.locator(".eval-card").count() == 0)
    check("로그인 화면 안내: 시연용·보안 인증 아님", "보안 인증이 아닙니다" in page.locator(".login-note").inner_text())
    # v0.5.4: 제품 이름 변경 "구매·협력사 AI 분석 플랫폼" → "RAG 기반 협력사 평가 AI 에이전트"
    lt = page.locator(".login-card").inner_text()
    check("제품 이름: 로그인 화면에 새 이름, 옛 이름 없음 · 한화엔진 / HANWHA ENGINE 유지", "RAG 기반 협력사 평가 AI 에이전트" in lt and "구매·협력사 AI 분석 플랫폼" not in lt and page.locator(".login-card .brand-ko").inner_text() == "한화엔진" and page.locator(".login-card .brand-en").inner_text() == "HANWHA ENGINE")
    check("제품 이름: 문서 제목(document.title)에 새 이름", page.title() == "한화엔진 RAG 기반 협력사 평가 AI 에이전트", page.title())
    page.click("#login-submit")
    check("이름 없이 들어가기 → 안내 문구", page.locator("#login-err").count() == 1)
    check("안내 문구는 이름 칸 바로 아래 + 이름 칸에 초점", page.locator("label:has(#login-name) #login-err").count() == 1 and page.evaluate("() => document.activeElement && document.activeElement.id === 'login-name'"))
    page.fill("#login-name", "홍길동")
    page.fill("#login-dept", "구매팀")
    page.click("#login-submit")
    page.wait_for_selector(".onboarding")
    check("처음 로그인하면 사용 안내 3단계", page.locator(".ob-dots span").count() == 3)
    page.click("#ob-next")
    page.click("#ob-next")
    page.click("#ob-done")
    page.wait_for_selector(".eval-card")
    check("사용 안내 닫힘", page.locator(".onboarding").count() == 0)
    check("헤더에 사용자 이름", "홍길동" in page.locator(".user-btn").inner_text())
    check("v0.2.0 저장 내용 이전 후 예전 키 삭제", page.evaluate("() => localStorage.getItem('procure-ai:session.v2') === null"))

    # 2. 헤더 브랜드
    ko = page.locator(".brand-ko").bounding_box()
    en = page.locator(".brand-en").bounding_box()
    check("로고 표시", page.locator(".brand-logo").count() == 1 and page.locator(".brand-logo").evaluate("e => e.naturalWidth > 0"))
    # v0.5.3: 예전(글자 사이를 벌려 'HANWHA ENGINE' 너비에 맞춘) 너비 일치 검사는 사용자 요청(글자 간격 없이 한 낱말로)으로 아래 검사들로 바뀜
    bk = page.evaluate("""() => { const k = document.querySelector('.brand-ko'), e = document.querySelector('.brand-en'), cs = getComputedStyle(k), ce = getComputedStyle(e), lg = document.querySelector('.brand-logo');
      return {txt: k.textContent, nodes: k.childNodes.length, ls: cs.letterSpacing, ws: cs.wordSpacing, ta: cs.textAlign, disp: cs.display, fs: parseFloat(cs.fontSize), ff: cs.fontFamily, fw: cs.fontWeight, bodyFf: getComputedStyle(document.body).fontFamily, w: k.getBoundingClientRect().width,
        enLs: ce.letterSpacing, enTa: ce.textAlign, enDisp: ce.display, logoH: lg.getBoundingClientRect().height, logoW: lg.getBoundingClientRect().width, nw: lg.naturalWidth, nh: lg.naturalHeight}; }""")
    check("브랜드 글자: '한화엔진'이 끊김 없는 한 덩어리 (글자 간격·낱말 간격·양끝 맞춤 없음)", bk["txt"] == "한화엔진" and bk["nodes"] == 1 and bk["ls"] in ("normal", "0px") and bk["ws"] in ("normal", "0px") and bk["ta"] != "justify" and "flex" not in bk["disp"], json.dumps(bk, ensure_ascii=False))
    check("브랜드 글자: 4글자 너비가 글자 크기의 4.6배 이하 (벌어진 틈 없음)", bk["w"] <= bk["fs"] * 4.6, f"{round(bk['w'], 1)}px / {bk['fs']}px")
    check("브랜드 글자: 'HANWHA ENGINE'도 양끝 맞춤·flex 아님", bk["enTa"] != "justify" and "flex" not in bk["enDisp"])
    check("브랜드 글자 크기: v0.5.2의 22px 보다 큼", bk["fs"] > 22, f"22px → {bk['fs']}px")
    check("브랜드 글자 서체: 본문(IBM Plex Sans KR)과 다른 목록, 굵기 700 이상", bk["ff"] != bk["bodyFf"] and int(bk["fw"]) >= 700, f"{bk['ff']} / {bk['fw']}")
    check("로고: 표시 높이가 v0.5.2의 32px 보다 +20~30% (38~42px), 가로세로 비율 유지", 38 <= bk["logoH"] <= 42 and abs(bk["logoW"] / bk["logoH"] - bk["nw"] / bk["nh"]) < 0.02, f"32px → {bk['logoH']}px, 비율 {round(bk['logoW'] / bk['logoH'], 3)} / 원본 {round(bk['nw'] / bk['nh'], 3)}")
    ml = page.evaluate("() => { const a = document.querySelector('.app').getBoundingClientRect(); return [a.left, innerWidth - a.right]; }")
    check("쪽 좌우 여백: 1920에서 v0.5.2의 32px 보다 +12~20px", all(44 <= m <= 52.5 for m in ml), f"32px → {ml}")
    pn = page.evaluate("() => { const p = document.querySelector('.topbar .brand-product'), r = p.getBoundingClientRect(); return {t: p.textContent, title: p.title, tag: p.tagName, h: r.height, fs: parseFloat(getComputedStyle(p).fontSize), clip: p.scrollWidth > p.clientWidth + 1, hdr: document.querySelector('.topbar').innerText}; }")
    check("제품 이름: 상단 바에 새 이름(h1, title 속성 포함), 옛 이름 없음 · 한 줄 · 안 잘림 · 12px 이상", pn["t"] == "RAG 기반 협력사 평가 AI 에이전트" and pn["title"] == pn["t"] and pn["tag"] == "H1" and "구매·협력사 AI 분석 플랫폼" not in pn["hdr"] and pn["h"] < 32 and not pn["clip"] and pn["fs"] >= 12, json.dumps(pn, ensure_ascii=False))
    DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")
    for fn in ("index.html", "artifact.html"):
        src = open(os.path.join(DIST, fn), encoding="utf-8").read()
        check(f"제품 이름: dist/{fn} 에 옛 이름 없음 · 새 이름 있음", "구매·협력사 AI 분석 플랫폼" not in src and "RAG 기반 협력사 평가 AI 에이전트" in src)
    art = open(os.path.join(DIST, "artifact.html"), encoding="utf-8").read()
    check("제품 이름: dist/artifact.html(중립)에는 '한화엔진' 없음 · 제목은 새 이름만", "한화엔진" not in art and "<title>RAG 기반 협력사 평가 AI 에이전트</title>" in art)
    check("한화엔진이 플랫폼 이름보다 큰 글자", page.locator(".brand-ko").evaluate("e => parseFloat(getComputedStyle(e).fontSize)") > page.locator(".brand-product").evaluate("e => parseFloat(getComputedStyle(e).fontSize)"))
    check("헤더 흐름 문구 삭제", "AI 분석 요청 → 결과 형식 선택" not in page.locator(".topbar").inner_text())
    check("1920: 헤더 한 줄", page.locator(".topbar").bounding_box()["height"] < 72, str(round(page.locator(".topbar").bounding_box()["height"])))

    # 3. 2분할·글자 크기·스크롤
    a = page.locator(".panel-a").bounding_box()
    c = page.locator(".panel-c").bounding_box()
    ratio = round(a["width"] / (a["width"] + c["width"]) * 100)
    check("1920: 데이터 관리 : AI 대화 = 65:35", abs(ratio - 65) <= 2, f"{ratio}:{100 - ratio}")
    check("1920: 가로 스크롤 없음", no_hscroll(page))
    check("가운데 챗봇 패널 없음(2분할)", page.locator(".panel-b").count() == 0 and page.locator(".splitter").count() == 1)
    sf = small_fonts(page)
    check("모든 글자 12px 이상", not sf, ", ".join(sf))
    vs = v_scrollers(page)
    check("왼쪽 패널 세로 스크롤 영역 1개", len(vs) == 1, ", ".join(vs))
    # 70%로 넓어져 표가 넘치지 않을 수 있으므로, 최소 40%까지 줄여 가장자리 그림자를 확인한다
    page.locator(".splitter").focus()
    [page.keyboard.press("ArrowLeft") for _ in range(16)]
    page.wait_for_timeout(150)
    check("표가 옆으로 넘치면 오른쪽 가장자리 그림자", page.locator(".panel-a .scroll-shell.can-r").count() >= 1)
    page.locator(".panel-a .scroll-shell.can-r .table-scroll").first.evaluate("e => { e.scrollLeft = e.scrollWidth; e.dispatchEvent(new Event('scroll')); }")
    page.wait_for_timeout(100)
    check("끝까지 밀면 오른쪽 그림자 대신 고정 열 그림자", page.locator(".panel-a .scroll-shell.can-l").count() >= 1 and page.locator(".panel-a .data-table").first.evaluate("t => !t.closest('.scroll-shell').classList.contains('can-r')"))
    page.locator(".panel-a .scroll-shell.can-l .table-scroll").first.evaluate("e => { e.scrollLeft = 0; e.dispatchEvent(new Event('scroll')); }")
    page.keyboard.press("Home")
    page.wait_for_timeout(100)
    page.screenshot(path=f"{SHOTS}/01_1920_initial.png")

    # 4. 요약 지표 버튼 제거 · 채점 카드는 그대로, 처리 단계만 오른쪽 위 구석에 작게
    check("요약 지표 버튼 없음", page.locator(".kpi").count() == 0 and page.locator(".kpi-strip").count() == 0)
    card = page.locator(".eval-card")
    check("채점 카드 유지 (도넛·항목 막대 5개)", card.locator(".donut").count() == 1 and card.locator(".eval-bars li").count() == 5)
    check("카드 아래 처리 단계 영역 없음", page.locator(".eval-progress").count() == 0)
    sm = card.locator(".eval-steps-mini")
    cb = card.bounding_box(); sb = sm.bounding_box()
    check("처리 단계 5개는 카드 오른쪽 위 구석에 작게", sm.locator(".step-mini").count() == 5 and sb["y"] < cb["y"] + 90 and sb["x"] + sb["width"] > cb["x"] + cb["width"] - 40 and sb["height"] <= 32, f"{round(sb['height'])}px")
    sm.locator(".step-mini").first.hover()
    page.wait_for_selector("#steps-tip", timeout=1000)
    tip = page.locator("#steps-tip")
    tb = tip.bounding_box()
    vp = page.viewport_size
    check("처리 단계: 마우스를 올리면 즉시 설명 팝오버(5단계 이름·상태·상세, 화면 안, 12px 이상)", tip.locator(".steps-tip-row").count() == 5 and "자료 업로드" in tip.inner_text() and "완료" in tip.inner_text() and tb["x"] >= 0 and tb["x"] + tb["width"] <= vp["width"] and tb["y"] + tb["height"] <= vp["height"] and page.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.steps-tip-detail')||document.querySelector('.steps-tip-row')).fontSize) >= 12"), tip.inner_text()[:80])
    check("처리 단계 팝오버: role=tooltip, 아이콘에 aria-describedby", tip.get_attribute("role") == "tooltip" and sm.locator(".step-mini").first.get_attribute("aria-describedby") == "steps-tip")
    page.screenshot(path=f"{SHOTS}/04_steps_hover.png")
    page.mouse.move(5, 5)
    check("처리 단계 팝오버: 마우스를 치우면 닫힘", page.locator("#steps-tip").count() == 0)
    sm.locator(".step-mini").nth(1).focus()
    check("처리 단계: 키보드 초점으로도 팝오버가 열림, Esc로 닫힘", page.locator("#steps-tip").count() == 1 and page.locator("#steps-tip .is-active").count() == 1)
    page.keyboard.press("Escape")
    check("처리 단계 팝오버 Esc 닫힘", page.locator("#steps-tip").count() == 0)
    page.locator("body").click(position={"x": 5, "y": 5})
    page.locator(".chip-btn[data-filter='gradeCD']").click()
    check("C·D등급 빠른 필터는 그대로 (2곳)", count_text(page) == "2")
    page.locator(".chip-btn[data-filter='gradeCD']").click()

    # 5. 데이터 탭 4등분
    widths = [page.locator(".tab").nth(i).bounding_box()["width"] for i in range(4)]
    check("데이터 탭 4등분", max(widths) - min(widths) < 2, ", ".join(str(round(w)) for w in widths))

    # 6. 경계선
    sp = page.locator(".splitter").bounding_box()
    page.mouse.move(sp["x"] + sp["width"] / 2, sp["y"] + sp["height"] / 2)
    page.mouse.down()
    page.mouse.move(sp["x"] - 200, sp["y"] + sp["height"] / 2, steps=5)
    page.mouse.up()
    a2 = page.locator(".panel-a").bounding_box()["width"]
    check("경계선 끌어서 너비 조절", a2 < a["width"] - 150, f"{round(a['width'])} → {round(a2)}px")
    check("경계선 접근성: 이름·값 범위(40~80)", "AI 대화" in page.locator(".splitter").get_attribute("aria-label") and page.locator(".splitter").get_attribute("aria-valuemin") == "40" and page.locator(".splitter").get_attribute("aria-valuemax") == "80")
    page.locator(".splitter").focus()
    page.keyboard.press("ArrowRight")
    check("경계선 키보드(→)로 조절", page.locator(".panel-a").bounding_box()["width"] > a2 + 10)
    page.keyboard.press("Home")
    check("경계선 Home 키 → 65:35 복귀", abs(page.locator(".panel-a").bounding_box()["width"] - a["width"]) < 4)
    page.mouse.move(sp["x"] + sp["width"] / 2, sp["y"] + sp["height"] / 2)
    page.mouse.down()
    page.mouse.move(sp["x"] - 200, sp["y"] + sp["height"] / 2, steps=5)
    page.mouse.up()
    a2 = page.locator(".panel-a").bounding_box()["width"]
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".eval-card")
    check("새로고침해도 로그인 유지", page.locator(".login-card").count() == 0)
    page.wait_for_timeout(450)  # v0.5: 진입 동작(<=300ms) 중에는 상자가 살짝 작게 측정된다
    a3 = page.locator(".panel-a").bounding_box()["width"]
    check("조절한 너비 새로고침 후 유지", abs(a3 - a2) < 4)
    page.locator(".splitter").dblclick()
    check("경계선 두 번 누르면 65:35 복귀", abs(page.locator(".panel-a").bounding_box()["width"] - a["width"]) < 4)

    # 7. 평가 근거 팝오버
    btn = page.locator(".eval-head .eval-basis-btn")
    check("카드 오른쪽 위 '근거' 버튼", btn.count() == 1 and "근거" in btn.inner_text())
    btn.click()
    page.wait_for_selector("#basis-popover")
    pop = page.locator("#basis-popover")
    check("팝오버: 항목별 계산 근거 5개·데이터 출처", pop.locator(".basis-list li").count() == 5 and "데이터 출처" in pop.inner_text())
    check("팝오버: 항목별 점수 막대와 등급·종합 점수", pop.locator(".basis-bar").count() == 5 and "A등급" in pop.locator("h3").inner_text())
    check("팝오버: 챗봇 리포트 버튼", pop.locator(".pop-foot button").count() == 1)
    check("팝오버 열면 안으로 초점", page.evaluate("() => document.activeElement && document.activeElement.id === 'basis-popover'"))
    page.keyboard.press("Escape")
    check("Esc로 닫히고 버튼으로 초점", page.locator("#basis-popover").count() == 0 and page.evaluate("() => document.activeElement && document.activeElement.classList.contains('eval-basis-btn')"))
    btn.click()
    page.mouse.click(1400, 700)
    check("바깥을 누르면 닫힘", page.locator("#basis-popover").count() == 0)

    # 8. 결과 형식·보기 설정은 없어지고 글 답변만
    check("템플릿 바·보기 설정·분석 결과 패널 없음", page.locator(".tpl-btn").count() == 0 and page.locator(".vs-toggle").count() == 0 and page.locator(".result-titles").count() == 0 and page.locator("section[aria-label='분석 결과']").count() == 0)

    # 9. 챗봇: 오른쪽에 고정된 대화 패널 (떠 있는 창·버튼 없음)
    check("떠 있는 챗봇 버튼·창 없음", page.locator(".chat-launcher").count() == 0 and page.locator("#chat-window").count() == 0 and page.locator(".chat-nudge").count() == 0)
    pc = page.locator(".panel-c").bounding_box()
    check("대화 패널은 오른쪽 고정 영역 안에 입력창 표시", page.locator(".panel-c #chat-input").is_visible() and pc["x"] > a["width"] and "AI 대화" in page.locator(".panel-c .panel-title").inner_text(), f"x={round(pc['x'])}")
    check("패널 이름 'AI 대화' + 대화 영역 aria-live", page.locator(".panel-c section").count() == 0 and page.locator(".chat-list").get_attribute("aria-live") == "off" and page.locator("label[for='chat-input']").count() == 1)
    check("v0.4.2 알림: 목록 밖에 한 줄 알림 영역(status)·진행 상태는 목록 밖", page.locator(".panel-c > .sr-only[role='status']").count() == 1 and page.locator(".chat-list [role='status']:not(.stale)").count() == 0)
    geo = page.evaluate("() => { const i=document.querySelector('.chat-title-icon').getBoundingClientRect(); const s=document.querySelector('.chat-title-icon svg').getBoundingClientRect(); return {dx: Math.abs((i.x+i.width/2)-(s.x+s.width/2)), dy: Math.abs((i.y+i.height/2)-(s.y+s.height/2)), w: s.width} }")
    check("패널 머리 아이콘이 상자 가운데", geo["dx"] < 1.5 and geo["dy"] < 1.5 and geo["w"] >= 16, json.dumps({k: round(v, 1) for k, v in geo.items()}))
    check("패널 머리 아이콘: 한화 오렌지 바탕·#1B1B1B 글자", page.locator(".chat-title-icon").evaluate("e => getComputedStyle(e).color") == "rgb(27, 27, 27)" and page.locator(".chat-title-icon").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(243, 115, 33)")
    check("말풍선 구분: 내 질문은 어두운(solid) 바탕·흰 글자", page.locator(".msg-user p").first.evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(27, 27, 27)")  # v0.5: 검정(--solid) 바탕
    check("보내기 버튼이 유일한 채운 주황 버튼(주 동작)", page.locator(".panel-c .btn-primary").count() == 0 and page.locator(".panel-c .send-btn").count() == 1)

    # 10. ⋯ 메뉴 · 대화 지우기 · 이전 대화
    check("머리에는 제목·대화 이력·⋯ 메뉴, 투명도·크기 조절 없음", page.locator("#chat-opacity").count() == 0 and page.locator(".chat-menu-btn").count() == 1 and page.locator(".rz").count() == 0)
    page.click(".chat-menu-btn")
    check("⋯ 메뉴: 대화 지우기", page.locator(".chat-menu button[aria-label='대화 지우기']").count() == 1)
    check("⋯ 메뉴는 role=menu가 아닌 일반 팝오버, 열면 첫 항목으로 초점", page.locator("[role='menu'], [role='menuitem']").count() == 0 and page.locator(".chat-menu-btn").get_attribute("aria-haspopup") is None and page.evaluate("() => document.activeElement && document.activeElement.classList.contains('menu-item')"))
    page.keyboard.press("Escape")
    check("Esc는 메뉴를 닫음", page.locator(".chat-menu").count() == 0)
    check("Esc 뒤 ⋯ 버튼으로 초점 복귀", page.evaluate("() => document.activeElement && document.activeElement.classList.contains('chat-menu-btn')"))
    check("이전 사용자 대화 이전됨(예전 버전 질문)", "예전 버전에서 한 질문" in page.locator(".chat-list").inner_text())
    check("대화가 시작된 뒤에는 추천 질문이 완전히 숨음(칩·'추천 질문' 버튼 없음)", page.locator(".suggest-row").count() == 0 and page.locator(".sug-toggle").count() == 0 and page.locator(".composer .suggest-chip").count() == 0)
    check("입력 안내(Enter·Shift+Enter)", "Shift+Enter" in page.locator(".composer-hint").inner_text())

    # 11. 대표 시나리오
    q = "해당 품목의 과거 거래 업체를 등급, 납기 실적, 최근 단가와 함께 보여주어 품목별 후보 업체 표시해줘."
    page.click(".chat-menu-btn")
    page.locator(".chat-menu button[aria-label='대화 지우기']").click()
    check("대화 지우기 전 확인 창", page.locator("[role='alertdialog']").count() == 1 and "대화 이력" in page.locator("[role='alertdialog']").inner_text())
    page.keyboard.press("Escape")
    st = (page.locator("[role='alertdialog']").count(), page.locator(".panel-c #chat-input").count(), "예전 버전에서 한 질문" in page.locator(".chat-list").inner_text())
    check("확인 창 Esc → 취소 (대화 패널·대화 그대로)", st == (0, 1, True), str(st))
    page.click(".chat-menu-btn")
    page.locator(".chat-menu button[aria-label='대화 지우기']").click()
    page.locator("[role='alertdialog'] [data-confirm]").click()
    check("대화 지우기 → 입력칸으로 초점", page.evaluate("() => new Promise(r => setTimeout(() => r(document.activeElement && document.activeElement.id === 'chat-input'), 50))"))
    page.locator(".ctx-chips .chip-x").first.click() if page.locator(".ctx-chips .chip-accent").count() else None
    check("환영 메시지만 있을 때는 추천 질문 칩이 바로 보이고 토글은 없음, '질문 대상' 라벨 줄 없음", page.locator(".suggest-row .suggest-chip").count() >= 4 and page.locator(".sug-toggle").count() == 0 and page.locator(".ctx-label").count() == 0)
    wel = page.locator(".msg-ai").first.inner_text()
    check("환영 메시지: '답은 글로만 정리해 드립니다.' 문장 없음, 나머지 문장은 유지", "글로만" not in wel and "납기 실적 등을 질문해 주세요." in wel and "안녕하세요" in wel and "추천 질문" in wel, wel[:90])
    # 추천 칩 → 진행 상태는 목록 밖, 중단 버튼, 중단하면 오류 안내 + 다시 시도
    page.locator(".suggest-row .suggest-chip", has_text="납기 준수율").click()
    page.wait_for_selector(".progress")
    check("첫 질문을 보내자마자 추천 질문이 사라짐", page.locator(".suggest-row").count() == 0 and page.locator(".sug-toggle").count() == 0)
    check("진행 상태(role=status)는 대화 목록(role=log) 밖에 있고 '중단' 버튼이 보임", page.evaluate("() => !document.querySelector('.progress').closest('[role=log]')") and page.locator(".stop-btn").is_visible())
    check("칩을 눌러 비활성이 되어도 초점은 입력칸으로", page.evaluate("() => document.activeElement && document.activeElement.id === 'chat-input'"))
    page.locator(".stop-btn").click()
    page.wait_for_function("() => !document.querySelector('.progress')", timeout=8000)
    err = last_ai(page)
    check("중단 → 경고 스타일 오류 안내(배지 '오류')와 '다시 시도' 버튼", err.locator(".msg-body.is-error").count() == 1 and err.locator(".engine-error").inner_text() == "오류" and err.locator("button", has_text="다시 시도").count() == 1, err.inner_text()[:60])
    err.locator("button", has_text="다시 시도").click()
    page.wait_for_selector(".ans-sec", timeout=8000)
    page.wait_for_function("() => !document.querySelector('.progress')", timeout=8000)
    check("다시 시도 → 같은 질문으로 답변이 나옴", last_ai(page).locator(".ans-sec").count() >= 1)
    check("답변 구역 제목은 h3", page.locator(".ans-sec h3").count() >= 1 and page.locator(".ans-sec h4").count() == 0)
    check("새 답변을 한 줄로 알리는 영역", page.locator(".panel-c > .sr-only[role='status']").inner_text().startswith("새 답변:"), page.locator(".panel-c > .sr-only[role='status']").inner_text()[:40])
    check("질문 뒤 초점은 입력칸에 남음", page.evaluate("() => document.activeElement && document.activeElement.id === 'chat-input'"))
    ask(page, q)
    last = last_ai(page)
    check("품목 미선택 → 품목 되묻기", last.locator(".opt-chip").count() >= 5)
    check("되묻는 단계에서는 답변 본문 미생성", last.locator(".ans-sec").count() == 0)
    last.locator(".opt-chip", has_text="실린더 라이너").click()
    page.wait_for_function("() => !document.querySelector('.progress')")
    page.wait_for_selector(".ans-sec")
    ans = last_ai(page)
    check("분석 후 글 답변이 대화에 바로 붙음", ans.locator(".ans-sec[data-section='rows']").count() == 1)
    check("답변은 글만: 표·차트·카드·형식 버튼 없음", page.locator(".panel-c table").count() == 0 and page.locator(".panel-c svg.chart, .panel-c .chart-card, .panel-c .score-card, .panel-c .report-doc").count() == 0 and page.locator(".tpl-card").count() == 0)
    rowlines = ans.locator(".ans-sec[data-section='rows'] li")
    check("C 비교 결과 글 4줄 · 순위 제외(조건 상이) 1줄", rowlines.count() == 4 and sum(1 for t in rowlines.all_inner_texts() if "순위 제외" in t) == 1, str(rowlines.count()))
    body = ans.inner_text()
    for label in ["단가 경쟁력", "납기 실적", "추가 검토가 필요한 위험 요소", "비교에 사용된 데이터와 평가 근거", "자동 확정되지 않습니다", "기준일"]:
        check(f"답변에 '{label}'", label in body)
    check("SAMPLE 표시 유지", "SAMPLE" in ans.locator(".msg-sources").inner_text() and "실제 자료 아님" in ans.locator(".msg-sources").inner_text())
    check("새 답변은 그 답변의 시작 위치로 스크롤", page.evaluate("() => { const l=document.querySelector('.chat-list'); const m=[...document.querySelectorAll('.msg-ai')].pop(); const a=l.getBoundingClientRect(), b=m.getBoundingClientRect(); return b.top >= a.top - 2 && b.top < a.top + 80 }"))
    page.screenshot(path=f"{SHOTS}/02_1920_answer.png")

    # 12~14. 예전 비교표 정렬·템플릿 전환·보기 설정은 없어짐 → 없음을 확인하고, 같은 내용이 글로 나오는지 확인
    check("비교표 정렬 UI 없음 (결과 표 대신 글 순서)", page.locator(".result-table").count() == 0 and page.locator(".panel-c button.th-sort").count() == 0)
    check("글 답변 순서 = 검토 순서 (1) 로 시작", rowlines.first.inner_text().startswith("1)"))
    check("템플릿 전환·보기 설정·프리셋·차트 숨기기 UI 없음", page.locator("[data-template]").count() == 0 and page.locator(".preset").count() == 0 and page.locator(".vs-panel").count() == 0)

    # 15. 후속 질문
    ask(page, "여기서 단가보다 납기를 우선하면 어떤 업체가 적합해?")
    fu = last_ai(page)
    check("후속 질문: 같은 품목·납기 우선으로 바로 답함", "직전 분석 대상" in fu.inner_text() and "납기" in fu.inner_text() and "실린더 라이너" in fu.inner_text())
    check("후속 질문: 글 답변 + 내보내기", fu.locator("button[data-export='xlsx']").count() == 1 and "분석 결과창" not in fu.inner_text())

    # 16. 새로고침해도 대화·답변 유지
    n_msgs = page.locator(".msg").count()
    n_sec = page.locator(".ans-sec").count()
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".ans-sec")
    check("새로고침 후 답변 유지", page.locator(".ans-sec").count() == n_sec)
    open_chat(page)
    check("새로고침 후 대화 내역 유지", page.locator(".msg").count() == n_msgs, f"{n_msgs}개")

    # 17. 다른 질문
    for qq, sec in [("납기 준수율이 낮은 협력사를 찾아줘.", "rows"), ("최근 단가가 상승한 품목을 보여줘.", "rows"), ("A등급 협력사의 품질 실적을 정리해 줘.", "rows")]:
        ask(page, qq)
        check(f"질문 → 글 답변: {qq}", last_ai(page).locator(f".ans-sec[data-section='{sec}']").count() == 1)
    ask(page, "오늘 점심 메뉴 추천해줘")
    check("범위 밖 질문은 추측하지 않음", "추측해서 답하지 않습니다" in last_ai(page).inner_text())

    # 18. 키워드 검색 → 데이터 관리 선택 (다른 쪽에 있어도 그 쪽으로)
    check("키워드 검색은 데이터 관리 패널 머리로 이동(대화 쪽에는 텍스트 입력이 입력창 하나)", page.locator(".panel-a .panel-head #keyword-search").count() == 1 and page.locator(".panel-c #keyword-search").count() == 0 and page.locator(".panel-c input[type='search']:not(#history-q)").count() == 0)
    page.fill("#keyword-search", "PO-2024-0003")
    page.wait_for_selector(".kw-hit")
    page.locator(".kw-hit").first.click()
    check("키워드 검색 → 데이터 관리에서 선택 (페이지 이동)", page.locator(".data-table tr.is-selected").count() == 1)
    close_chat(page)

    # 19. 대화 이력 (예전 분석 이력)
    page.click(".history-toggle")
    page.wait_for_selector("#history-panel")
    check("대화 이력이 대화 패널 안에서 열림", page.locator(".panel-c #history-panel").count() == 1)
    for _ in range(40):
        page.keyboard.press("Tab")
    check("대화 이력: Tab을 40번 눌러도 초점이 대화상자 밖으로 나가지 않음", page.evaluate("() => document.querySelector('#history-panel').contains(document.activeElement)"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)  # 초점 복귀는 setTimeout(0)으로 이뤄진다 (v0.5: 경합 방지로 잠깐 기다림)
    check("대화 이력: Esc로 닫고 '대화 이력' 버튼으로 초점 복귀", page.locator("#history-panel").count() == 0 and page.evaluate("() => document.activeElement && document.activeElement.classList.contains('history-toggle')"))
    page.click(".history-toggle")
    page.wait_for_selector("#history-panel")
    n_hist = page.locator(".history-item").count()
    check("대화 이력 목록 (이번 세션 답변들)", n_hist >= 5, str(n_hist))
    page.fill("#history-q", "납기 우선")
    check("이력 검색", page.locator(".history-item").count() == 1)
    page.locator(".history-item").first.locator("button[title='이름 바꾸기']").click()
    page.fill("#history-rename-input", "라이너 납기 우선 검토")
    page.press("#history-rename-input", "Enter")
    check("이름 바꾸기", "라이너 납기 우선 검토" in page.locator(".history-item").first.inner_text())
    page.locator(".history-item").first.locator("button[title='고정 (자동 삭제에서 제외)']").click()
    check("고정", page.locator(".history-item").first.locator("svg[aria-label='고정됨']").count() == 1)
    page.locator(".history-item .history-open").first.click()
    page.wait_for_selector(".msg-ai.is-flash")
    check("이력에서 누르면 대화의 그 답변으로 이동·강조", page.locator("#history-panel").count() == 0 and page.locator(".msg-ai.is-flash").count() == 1)
    page.click(".history-toggle")
    page.fill("#history-q", "점심")
    check("없는 검색어 안내", page.locator(".history-item").count() == 0)
    page.fill("#history-q", "")
    before = page.locator(".history-item").count()
    page.locator(".history-item").last.locator("button[title='삭제']").click()
    check("이력 삭제 전 한 번 더 묻기", page.locator(".history-confirm").count() == 1 and page.locator(".history-item").count() == before)
    page.locator(".history-confirm .history-del-yes").click()
    check("이력 삭제", page.locator(".history-item").count() == before - 1)
    page.keyboard.press("Escape")
    check("Esc로 이력 닫힘", page.locator("#history-panel").count() == 0)

    # 20. 엑셀(.xlsx) 내보내기
    import openpyxl
    with page.expect_download() as dl:
        page.locator(".msg-ai button[data-export='xlsx']").last.click()
    d1 = dl.value
    x1 = os.path.join(SHOTS, d1.suggested_filename)
    d1.save_as(x1)
    wb = openpyxl.load_workbook(x1)
    check("결과 엑셀: 파일 이름 분석결과_…_YYYYMMDD.xlsx", d1.suggested_filename.startswith("분석결과_") and d1.suggested_filename.endswith(".xlsx"), d1.suggested_filename)
    check("결과 엑셀: 시트 '결과 표'·'조건·근거'", wb.sheetnames == ["결과 표", "조건·근거"], ",".join(wb.sheetnames))
    ws = wb["결과 표"]
    hdr = [c.value for c in ws[1]]
    check("결과 엑셀: 머리글 굵게·틀 고정·숫자 칸", ws["A1"].font.b and ws.freeze_panes == "A2" and any(isinstance(c.value, (int, float)) for c in ws[2]), str(hdr[:4]))
    with page.expect_download() as dlc:
        page.locator(".msg-ai button[data-export='csv']").last.click()
    check("결과 CSV: 답변별 내보내기 (표를 화면에 그리지 않아도 파일로 저장)", dlc.value.suggested_filename.endswith(".csv"), dlc.value.suggested_filename)
    check("결과 엑셀: SAMPLE 표기", any("SAMPLE" in str(r[1].value) for r in wb["조건·근거"].iter_rows()))
    page.locator(".tab", has_text="협력업체").click()
    page.locator(".active-chips .link-btn").click() if page.locator(".active-chips .link-btn").count() else None
    with page.expect_download() as dl:
        page.locator(".filter-row button[data-export='xlsx']").click()
    d2 = dl.value
    x2 = os.path.join(SHOTS, d2.suggested_filename)
    d2.save_as(x2)
    wb2 = openpyxl.load_workbook(x2)
    check("데이터 탭 엑셀: 지금 조건의 행 (협력업체 12행)", wb2.sheetnames[0] == "협력업체" and wb2["협력업체"].max_row == 13, f"{wb2.sheetnames} {wb2[wb2.sheetnames[0]].max_row}")

    # 21. 표 정렬 두 방향 + 페이지 나누기
    hdr_on = page.locator(".data-table thead th[data-col='ontime']")
    hdr_on.locator("button").click()
    s1 = hdr_on.get_attribute("aria-sort")
    top1 = page.locator(".data-table tbody tr").first.locator(".name").inner_text()
    hdr_on.locator("button").click()
    s2 = hdr_on.get_attribute("aria-sort")
    top2 = page.locator(".data-table tbody tr").first.locator(".name").inner_text()
    hdr_on.locator("button").click()
    s3 = hdr_on.get_attribute("aria-sort")
    check("숫자 열: 내림 → 오름 → 해제", (s1, s2, s3) == ("descending", "ascending", "none"), f"{s1}/{s2}/{s3} · {top1} → {top2}")
    check("숫자 열: 오름차순이면 가장 낮은 값이 먼저", top2 in ("업체 J", "업체 D"), top2)
    hdr_name = page.locator(".data-table thead th[data-col='name']")
    hdr_name.locator("button").click()
    check("글자 열: 첫 클릭 오름차순", hdr_name.get_attribute("aria-sort") == "ascending")
    hdr_name.locator("button").click()
    check("글자 열: 두 번째 내림차순", hdr_name.get_attribute("aria-sort") == "descending" and page.locator(".data-table tbody tr").first.locator(".name").inner_text() == "업체 L")
    check("정렬 아이콘: 위·아래 화살표 함께", page.locator(".data-table thead .sort-ic .sort-up").count() > 0 and page.locator(".data-table thead .sort-ic .sort-down").count() > 0)
    page.locator(".tab", has_text="구매조달").click()
    page.locator(".subtab[data-sub='list']").click()
    page.locator(".active-chips .link-btn").click() if page.locator(".active-chips .link-btn").count() else None
    check("선택한 행이 있는 쪽을 그대로 보여 줌 (검색으로 고른 PO-2024-0003)", page.locator(".data-table tr.is-selected", has_text="PO-2024-0003").count() == 1, page.locator(".pager-range").inner_text())
    page.locator(".chat-detail .detail-clear").click()
    page.locator(".chip-btn[data-filter='thisMonth']").click()
    page.locator(".chip-btn[data-filter='thisMonth']").click()
    check("페이지 나누기: 기본 20행", rows(page) == 20 and "1–20 / 346행" in page.locator(".pager-range").inner_text(), page.locator(".pager-range").inner_text())
    page.locator(".pager button[aria-label='다음 쪽']").click()
    check("다음 쪽", "21–40" in page.locator(".pager-range").inner_text())
    page.select_option(".pager-size select", "50")
    check("한 쪽 50행", rows(page) == 50)
    vs2 = v_scrollers(page)
    check("구매조달 50행에서도 세로 스크롤 1개", len(vs2) == 1, ", ".join(vs2))
    hdr_due = page.locator(".data-table thead th[data-col='due']")
    hdr_due.locator("button").click()
    check("날짜 열: 첫 클릭 최근 순(내림차순)", hdr_due.get_attribute("aria-sort") == "descending")
    hdr_due.locator("button").click()
    hdr_due.locator("button").click()
    for tab_name in ["협력업체", "구매조달", "원가-계약", "자재-공급관리"]:
        page.locator(".tab", has_text=tab_name).click()
        if page.locator(".subtab[data-sub='list']").count():
            page.locator(".subtab[data-sub='list']").click()
        n_s, bad_s = sort_all(page, ".data-table:not(.mat-table):not(.link-table)")
        check(f"{tab_name}: 정렬할 수 있는 모든 열({n_s}개) 두 방향 → 해제", n_s >= 5 and not bad_s, ", ".join(bad_s))

    # 22. 필터 세분화 + 부품 분류
    page.locator(".tab", has_text="협력업체").click()
    page.locator(".chip-btn[data-filter='lowDelivery']").click()
    check("빠른 필터: 납기 90% 미만", count_text(page) == "4" and rows(page) == 4)
    check("적용 조건 칩 표시", page.locator(".fchip").count() == 1)
    page.locator(".filter-toggle").click()
    page.locator(".fd-multi .chip-btn", has_text="B등급").click()
    check("상세 필터(등급 다중 선택) 조합", int(count_text(page)) < 4 and page.locator(".fchip").count() == 2, count_text(page))
    page.locator("#f-suppliers-quality-min").fill("82")
    check("범위 필터(품질 점수)", page.locator(".fchip", has_text="품질 점수").count() == 1)
    page.locator(".fchip").first.locator("button").click()
    check("칩 × 로 조건 해제", page.locator(".fchip").count() == 2)
    page.locator(".active-chips .link-btn", has_text="전체 초기화").click()
    check("전체 초기화", count_text(page) == "12" and page.locator(".fchip").count() == 0)
    check("부품 분류: 앞 단계 전에는 다음 단계 비활성", page.locator("#f-suppliers-bom-1").is_disabled())
    page.select_option("#f-suppliers-bom-0", "SAMPLE 엔진 X형")
    page.select_option("#f-suppliers-bom-1", "실린더부 (라이너·커버·배기밸브)")
    opts = page.locator("#f-suppliers-bom-2 option").all_inner_texts()
    check("부품 분류: 위 단계를 고르면 아래 목록이 좁혀짐", "배기밸브 어셈블리" in opts and not any("피스톤" in o for o in opts), ", ".join(opts))
    page.select_option("#f-suppliers-bom-2", "배기밸브 어셈블리")
    names = sorted(page.locator(".data-table tbody .name").all_inner_texts())
    check("부품 분류: 배기밸브 스핀들 공급 협력사만 (업체 G·L)", names == ["업체 G", "업체 L"], ", ".join(names))
    check("부품 분류 조건 칩 (경로 ›)", page.locator(".fchip", has_text="›").count() == 1)
    page.screenshot(path=f"{SHOTS}/04_1920_filters.png")
    page.locator(".active-chips .link-btn").click()
    page.locator(".tab", has_text="구매조달").click()
    page.locator(".filter-toggle").click()
    page.select_option("#f-purchaseOrders-bom-0", "SAMPLE 엔진 Y형")
    page.select_option("#f-purchaseOrders-bom-1", "연료·유압 공급부")
    page.select_option("#f-purchaseOrders-bom-2", "고압 연료 배관")
    check("구매조달에도 부품 분류 필터 (고압 연료관 발주만)", set(page.locator(".data-table tbody .name-cell .name").all_inner_texts()) == {"고압 연료관"})
    page.locator(".active-chips .link-btn").click()
    page.locator(".chip-btn[data-filter='overdue']").click()
    n_over = int(count_text(page))
    check("구매조달: 납기 지연(미입고)", n_over == 3, str(n_over))
    page.locator(".chip-btn[data-filter='overdue']").click()
    page.locator("#f-purchaseOrders-due-from").fill("2026-10-01")
    page.locator("#f-purchaseOrders-due-to").fill("2026-10-31")
    n_month = int(count_text(page))
    page.locator(".active-chips .link-btn").click()
    page.locator(".chip-btn[data-filter='thisMonth']").click()
    check("기간 필터 = 이번 달 납기 빠른 필터", n_month == int(count_text(page)) and n_month > 0, str(n_month))
    page.locator(".active-chips .link-btn").click()
    page.locator(".tab", has_text="원가-계약").click()
    page.locator(".subtab[data-sub='list']").click()
    page.locator(".chip-btn[data-filter='up']").click()
    check("원가-계약: 5% 이상 상승", count_text(page) == "4")
    page.locator(".tab", has_text="자재-공급관리").click()
    page.locator(".subtab[data-sub='list']").click()
    page.locator(".active-chips .link-btn").click() if page.locator(".active-chips .link-btn").count() else None
    page.locator(".chip-btn[data-filter='below']").click()
    check("자재-공급: 안전재고 미달", count_text(page) == "3")
    page.locator(".tab", has_text="원가-계약").click()
    check("탭별 필터 따로 유지", count_text(page) == "4")
    page.locator(".active-chips .link-btn").click()
    page.locator(".tab", has_text="자재-공급관리").click()
    page.locator(".active-chips .link-btn").click()

    # 23. 관심 협력사·부품
    page.locator(".tab", has_text="협력업체").click()
    page.locator(".data-table tbody tr", has_text="업체 F").locator(".fav-star").click()
    check("별표로 관심 협력사 고정", page.locator(".data-table tbody tr", has_text="업체 F").locator(".fav-star").get_attribute("aria-pressed") == "true")
    page.locator(".chip-btn[data-filter='fav']").click()
    check("빠른 필터 '★ 관심만'", count_text(page) == "1")
    page.locator(".chip-btn[data-filter='fav']").click()
    page.check("#pin-fav")
    check("관심 항목 맨 위 고정", page.locator(".data-table tbody tr").first.locator(".name").inner_text() == "업체 F")
    page.locator(".tab", has_text="자재-공급관리").click()
    page.locator(".data-table tbody tr", has_text="터보차저 노즐링").locator(".fav-star").click()
    check("관심 부품 고정", page.locator(".data-table tbody tr", has_text="터보차저 노즐링").locator(".fav-star").get_attribute("aria-pressed") == "true")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".eval-card")
    check("평가 대상 목록 맨 위에 관심 협력사", page.locator("#eval-supplier optgroup").first.get_attribute("label") == "★ 관심 협력사")
    open_chat(page)
    # 추천 질문은 환영 상태에서만 보이므로 대화를 지워 환영 상태로 만든 뒤 확인
    page.click(".chat-menu-btn")
    page.locator(".chat-menu button[aria-label='대화 지우기']").click()
    page.locator("[role='alertdialog'] [data-confirm]").click()
    page.wait_for_selector(".suggest-row")
    sugg = page.locator(".suggest-row .suggest-chip").all_inner_texts()
    check("추천 질문에 관심 협력사·부품", any("업체 F" in s for s in sugg) and any("터보차저 노즐링" in s for s in sugg), " | ".join(sugg[:2]))
    close_chat(page)
    page.click(".user-btn")
    check("사용자 메뉴에 관심 목록", "업체 F" in page.locator(".user-pop").inner_text() and "터보차저 노즐링" in page.locator(".user-pop").inner_text())
    page.keyboard.press("Escape")

    # 24. 협력사 상세: 공급 부품 분류 경로 · 등급 변동 이력 · 관련 직종 임금
    page.locator(".tab", has_text="협력업체").click()
    page.locator(".data-table tbody tr", has_text="업체 F").locator(".name").click()
    det = page.locator(".row-detail")
    check("행을 누르면 상세는 오른쪽 AI 대화 패널 위쪽에", page.locator(".panel-c #selection-detail").count() == 1 and page.evaluate("() => document.querySelector('.chat-detail').getBoundingClientRect().bottom <= document.querySelector('.chat-list').getBoundingClientRect().top + 1") and page.locator(".panel-a .row-detail").count() == 0)
    check("대화 패널 머리에 선택 정보 아이콘(펼침)", page.locator(".detail-toggle").get_attribute("aria-expanded") == "true" and "업체 F" in page.locator(".detail-toggle").get_attribute("aria-label") and page.locator(".detail-toggle").inner_text().strip() == "")
    check("선택 정보 아이콘은 글자 없이 aria-label만(세 번 반복 제거), 두 '선택 해제'는 이름이 서로 다름", page.locator(".detail-toggle").evaluate("e => e.getBoundingClientRect().width <= 48") and page.locator(".detail-clear").get_attribute("aria-label") != "선택 해제")
    check("상세: 등급 타임라인 (평가 5회 + 현재)", det.locator(".tl-item").count() == 6, str(det.locator(".tl-item").count()))
    check("상세: 하락 표시와 변동 사유", "하락" in det.inner_text() and "납기 지연 증가" in det.inner_text())
    check("상세: 마지막 점은 '현재 · 시스템 계산'", "현재 · 시스템 계산" in det.locator(".tl-item").last.inner_text())
    check("상세: 공급 부품 분류 경로", "›" in det.locator(".supply-parts").inner_text())
    check("상세: 관련 직종 임금 상승률", "CNC 공작기계 조작원" in det.inner_text())
    page.screenshot(path=f"{SHOTS}/05_1920_detail.png")
    chk_h = page.evaluate("() => { const d = document.querySelector('.chat-detail').getBoundingClientRect(), l = document.querySelector('.chat-list').getBoundingClientRect(); return [d.height, l.height, innerHeight]; }")
    check("펼친 상세는 높이 제한(35vh 이하) + 대화 영역 최소 96px", chk_h[0] <= chk_h[2] * 0.35 + 2 and chk_h[1] >= 96, str(chk_h))
    check("펼친 상세는 2열 격자", page.evaluate("() => getComputedStyle(document.querySelector('.chat-detail .kv')).gridTemplateColumns.split(' ').length") == 2)
    page.locator(".detail-toggle").click()
    check("아이콘으로 접으면 한 줄 요약만 남음", page.locator("#selection-detail").count() == 0 and page.locator(".detail-toggle").get_attribute("aria-expanded") == "false" and page.locator(".row-summary").count() == 1)
    sm = page.evaluate("() => { const t = document.querySelector('.row-summary-text'); return [t.scrollHeight <= t.clientHeight + 1, t.innerText]; }")
    check("요약은 한 줄이며 이름과 핵심 값(등급·납기)을 보여 줌", sm[0] and "업체 F" in sm[1] and "등급" in sm[1] and "납기" in sm[1], sm[1])
    page.screenshot(path=f"{SHOTS}/05_1920_detail_collapsed.png")
    page.locator(".row-summary .icon-btn").click()
    check("요약의 펼치기 버튼(aria-expanded)으로 다시 펼치기", page.locator("#selection-detail").count() == 1 and page.locator(".row-detail .icon-btn[aria-expanded='true']").count() == 1)
    page.fill("#chat-input", "업체 F의 평가 근거를 정리해 줘")
    page.press("#chat-input", "Enter")
    page.wait_for_selector(".row-summary", timeout=3000)
    check("질문을 보내면 바로 한 줄 요약으로 접힘", page.locator("#selection-detail").count() == 0 and page.locator(".row-summary").count() == 1)
    page.wait_for_function("() => !document.querySelector('.progress')", timeout=8000)
    page.locator(".row-summary .icon-btn").click()
    check("새 답변 뒤 선택 정보를 다시 펼치면 대화는 그대로", page.locator("#selection-detail").count() == 1 and page.locator(".ans-sec").count() >= 1)
    ask(page, "업체 F의 평가 근거를 정리해 줘")
    check("새 답변이 나오면 선택 정보는 접힘", page.locator("#selection-detail").count() == 0 and page.locator(".row-summary").count() == 1 and last_ai(page).locator(".ans-sec").count() >= 1)
    page.locator(".detail-toggle").click()
    check("대화 위로 선택 정보 다시 열기", page.locator("#selection-detail").count() == 1 and page.locator(".ans-sec").count() >= 1)
    page.locator(".detail-clear").click()
    check("선택 해제 버튼 → 선택 정보 닫힘", page.locator("#selection-detail").count() == 0 and page.locator(".detail-toggle").count() == 0)
    close_chat(page)

    # 25. 대금 결제 일정 + 알림
    bell = page.locator(".bell-badge").inner_text()
    check("헤더 알림 6건 (임박 5 + 지급 확인 필요 1)", bell == "6", bell)
    page.click(".bell")
    settled(page)
    check("알림 → 구매조달 › 대금 결제 일정", page.locator(".subtab[data-sub='payments']").get_attribute("aria-selected") == "true")
    pv = page.locator(".subview")
    check("결제 일정: SAMPLE·기준일·출처 표시", "SAMPLE" in pv.locator(".sv-head").inner_text() and "기준일 2026-10-15" in pv.locator(".sv-head").inner_text())
    check("결제 일정: 임박 5건·예정 10건", pv.locator(".pay-card[data-pay='임박'] .pay-card-count").inner_text().startswith("5") and pv.locator(".pay-card[data-pay='예정'] .pay-card-count").inner_text().startswith("10"))
    check("결제 일정: 주별 그래프", pv.locator(".chart-card").count() == 1)
    row59 = pv.locator("#pay-table tbody tr", has_text="PO-2026-0059")
    check("PO-2026-0059: 월말 마감 익월 20일 → 2026-10-20 D-5 임박", "2026-10-20" in row59.inner_text() and "D-5" in row59.inner_text() and "임박" in row59.inner_text())
    pv.locator(".pay-card[data-pay='조건 확인 필요']").click()
    check("결제조건을 해석 못 하면 날짜를 추정하지 않음", pv.locator("#pay-table tbody tr").count() == 3 and "선적일" in pv.locator("#pay-table").inner_text())
    pv.locator(".pay-card[data-pay='임박']").click()
    check("상태 카드로 목록 거르기 (임박 5건)", pv.locator("#pay-table tbody tr").count() == 5)
    pv.locator("#pay-table tbody tr", has_text="PO-2026-0059").locator("input[type='checkbox']").check()
    check("'확인함' 표시하면 알림 건수 감소", page.locator(".bell-badge").inner_text() == "5")
    pv.locator(".pay-card[data-pay='임박']").click()
    n_s, bad_s = sort_all(page, "#pay-table")
    check(f"결제 일정 표: 정렬할 수 있는 모든 열({n_s}개) 두 방향 → 해제", n_s >= 8 and not bad_s, ", ".join(bad_s))
    page.screenshot(path=f"{SHOTS}/06_1920_payments.png")

    # 26. 원자재 시세
    page.locator(".tab", has_text="원가-계약").click()
    page.locator(".subtab[data-sub='materials']").click()
    mv = page.locator(".subview")
    check("원자재 시세: SAMPLE 표시·원/kg", "SAMPLE" in mv.locator(".sv-head").inner_text() and "원/kg" in mv.inner_text())
    check("원자재 시세: 7종 표", mv.locator(".mat-table tbody tr").count() == 7)
    mv.locator(".mat-chips .chip-btn", has_text="니켈").click()
    check("원자재 선택 → 국제·국내 추이 그래프", "니켈" in mv.locator(".chart-title").inner_text() and mv.locator(".legend-item").count() == 2)
    check("품목별 소재 ↔ 계약 단가 변동률", mv.locator(".link-table tbody tr").count() == 10 and "업체" in mv.locator(".link-table").inner_text())
    page.screenshot(path=f"{SHOTS}/07_1920_materials.png")

    # 27. 인건비 동향
    page.locator(".subtab[data-sub='wages']").click()
    wv = page.locator(".subview")
    check("인건비: 대분류 3개 트리", wv.locator(".wt-node.lv-0").count() == 3)
    wv.locator(".wt-fold[aria-label='금속 성형 기능직 펼치기']").click()
    check("중분류 펼치면 소분류 표시", wv.locator(".wt-name", has_text="주조원").count() == 1)
    wv.locator(".wt-name", has_text="주조원").click()
    check("소분류 선택 → 임금 추이·전년 대비", "주조원" in wv.locator(".chart-title").inner_text() and "전년 같은 달 대비" in wv.inner_text())
    check("인건비: 관련 협력사 표시", "업체 A" in wv.inner_text())

    # 28. 경쟁사 공급 동향 · 업계 동향
    page.locator(".tab", has_text="자재-공급관리").click()
    page.locator(".subtab[data-sub='competitors']").click()
    cv = page.locator(".subview")
    check("경쟁사: 가상 회사명·공급 경쟁 표시", cv.locator(".rel").count() == 7 and "(가상)" in cv.inner_text() and cv.locator(".rel.is-contested").count() == 4)
    check("경쟁사: 출처 링크 없음 경고", cv.locator(".src-missing").count() == 7)
    check("경쟁사: 기준일(가장 최근 확인일) 표시", "기준일 2026-" in cv.locator(".sv-head").inner_text() and "가장 최근 확인일" in cv.locator(".sv-head").inner_text())
    page.select_option("#comp-item", "ITM-1003")
    check("경쟁사: 부품으로 거르기", cv.locator(".rel").count() == 1)
    page.locator(".subtab[data-sub='news']").click()
    nv = page.locator(".subview")
    check("업계 동향: 기사 8건 (SAMPLE)", nv.locator(".news").count() == 8 and "SAMPLE" in nv.inner_text())
    page.select_option("#news-mat", "니켈")
    check("업계 동향: 원자재로 거르기 (니켈 2건)", nv.locator(".news").count() == 2)
    sf2 = small_fonts(page)
    check("새 화면도 글자 12px 이상", not sf2, ", ".join(sf2))
    page.locator(".subtab[data-sub='list']").click()

    # 29. 샘플 버튼 정리
    check("탭의 '샘플' 버튼 없음 (헤더 한 곳)", page.locator(".filter-row button", has_text="샘플").count() == 0 and page.locator(".topbar .sample-reset").count() == 1)
    page.click(".topbar .sample-reset")
    check("샘플로 되돌리기 → 확인 창", page.locator("[role='alertdialog']").count() == 1)
    inside = []
    for _ in range(4):
        page.keyboard.press("Tab")
        inside.append(page.evaluate("() => !!document.activeElement.closest('[role=alertdialog]')"))
    check("확인 창 안에서 Tab이 밖으로 나가지 않음", all(inside), str(inside))
    page.locator("[role='alertdialog'] .btn-quiet", has_text="취소").click()
    check("확인 창 닫으면 누른 버튼으로 초점", page.evaluate("() => new Promise(r => setTimeout(() => r(document.activeElement && document.activeElement.classList.contains('sample-reset')), 50))"))

    # 30. 업로드 → 저장 → 새로고침 유지 → 다시 분석 안내
    ask(page, "노즐 후보 업체 비교해 줘")
    close_chat(page)
    csv = "업체ID,협력사명,품질 평가 점수,불량률(%),기술·대응력 점수,경영·ESG 점수\nSUP-011,업체 K,60,4.5,50,40\n"
    path = os.path.join(SHOTS, "upload.csv")
    open(path, "w", encoding="utf-8").write(csv)
    page.locator(".topbar .btn-primary").click()
    page.select_option("#import-dataset", "suppliers")
    page.set_input_files("#import-file", path)
    page.wait_for_selector(".validation")
    page.locator(".modal-foot .btn-primary").click()
    page.wait_for_selector(".stale")
    check("데이터 변경 → 다시 분석 안내 (가장 최근 답변에)", page.locator(".stale").count() == 1)
    page.wait_for_selector(".ds-saved")
    page.wait_for_function("() => document.querySelector('.ds-saved').textContent.includes('저장됨')")
    check("헤더: 업로드 데이터 · 브라우저에 저장됨", "브라우저에 저장됨" in page.locator(".ds-saved").inner_text() and page.locator(".badge-demo").inner_text() == "업로드 포함")
    tb_h = page.locator(".topbar").bounding_box()["height"]
    check("업로드 상태에서도 1920 헤더 한 줄·가로 스크롤 없음", tb_h < 72 and no_hscroll(page) and page.locator(".ai-status-text").evaluate("e => e.getClientRects().length === 1"), str(round(tb_h)))
    page.locator(".stale button").click()
    page.wait_for_timeout(300)
    check("다시 분석 후 안내 해제", page.locator(".stale").count() == 0)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".eval-card")
    check("새로고침 후 업로드 데이터 유지", page.locator(".badge-demo").inner_text() == "업로드 포함" and page.locator(".data-table tbody tr", has_text="업체 K").count() == 1)
    page.wait_for_selector(".ans-sec")
    check("새로고침 후 '다시 분석' 안내가 잘못 뜨지 않음", page.locator(".stale").count() == 0)
    page.click(".user-btn")
    del_item = page.locator(".user-pop .menu-item", has_text="저장된 업로드 데이터 삭제")
    check("사용자 메뉴: 저장된 업로드 데이터 삭제 (업로드 상태에서 사용 가능)", del_item.is_enabled())
    del_item.click()
    check("저장된 업로드 데이터 삭제 → 확인 창", page.locator("[role='alertdialog']").count() == 1 and "업로드" in page.locator("[role='alertdialog']").inner_text())
    page.locator("[role='alertdialog'] [data-confirm]").click()
    check("샘플로 되돌리기 → SAMPLE", page.locator(".badge-demo").inner_text() == "SAMPLE")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".eval-card")
    check("새로고침해도 샘플 유지 (저장본 삭제됨)", page.locator(".badge-demo").inner_text() == "SAMPLE", repr(page.locator(".badge-demo").inner_text()))
    page.click(".user-btn")
    check("SAMPLE 상태에서는 '저장된 업로드 데이터 삭제' 비활성", page.locator(".user-pop .menu-item", has_text="저장된 업로드 데이터 삭제").is_disabled())
    page.keyboard.press("Escape")
    check("콘솔 오류 없음", not errors, "; ".join(errors[:3]))

    # 31. 로그아웃 · 사용자별 저장 분리
    n_hist_hong = int(page.locator(".history-toggle .count-badge").inner_text())
    page.click(".user-btn")
    page.locator(".user-pop .menu-item", has_text="로그아웃").click()
    page.locator("[role='alertdialog'] [data-confirm]").click()
    page.wait_for_selector("#login-name")
    check("로그아웃 → 로그인 화면 (최근 사용자 표시)", "홍길동" in page.locator(".login-recent").inner_text())
    page.fill("#login-name", "김철수")
    page.click("#login-submit")
    page.click("#ob-skip")
    page.wait_for_selector(".eval-card")
    check("다른 사용자: 분석 이력·관심 목록 따로", page.locator(".history-toggle .count-badge").inner_text() == "0" and page.locator(".fav-star.is-on").count() == 0)
    page.click(".user-btn")
    page.locator(".user-pop .menu-item", has_text="로그아웃").click()
    page.locator("[role='alertdialog'] [data-confirm]").click()
    page.locator(".login-recent .chip-btn", has_text="홍길동").click()
    page.wait_for_selector(".eval-card")
    check("원래 사용자로 돌아오면 이력·관심 목록 그대로", int(page.locator(".history-toggle .count-badge").inner_text()) == n_hist_hong and page.locator(".fav-star.is-on").count() >= 1)
    hong_id = page.evaluate("() => (JSON.parse(localStorage.getItem('procure-ai:users.v1')) || []).find(u => u.name === '홍길동').id")
    check("홍길동 기록이 이 브라우저에 있음", page.evaluate("(id) => Object.keys(localStorage).some(k => k.includes(':u:' + id + ':'))", hong_id))
    page.click(".user-btn")
    page.locator(".user-pop .menu-item", has_text="로그아웃").click()
    page.check("#logout-wipe")
    page.locator("[role='alertdialog'] [data-confirm]").click()
    page.wait_for_selector("#login-name")
    page.wait_for_timeout(800)  # 늦게 도는 저장이 지운 기록을 되살리지 않는지 확인
    left = page.evaluate("(id) => Object.keys(localStorage).filter(k => k.includes(':u:' + id + ':'))", hong_id)
    check("로그아웃 시 내 데이터 지우기 (최근 사용자 목록·저장 기록 삭제, 다른 사용자 기록은 남음)", "홍길동" not in (page.locator(".login-recent").inner_text() if page.locator(".login-recent").count() else "") and not left and "김철수" in page.locator(".login-recent").inner_text(), ", ".join(left))
    page.screenshot(path=f"{SHOTS}/08_1920_login.png")

    # 32. 1366×768
    lap = browser.new_page(viewport={"width": 1366, "height": 768})
    demo_login(lap)
    check("1366: 가로 스크롤 없음", no_hscroll(lap))
    check("1366: 상단 바 한 줄", lap.locator(".topbar").bounding_box()["height"] < 72, str(round(lap.locator(".topbar").bounding_box()["height"])))
    check("1366: 채점 카드 높이 줄어듦 (처리 단계 영역 없음)", lap.locator(".eval-card").bounding_box()["height"] < 360, str(round(lap.locator(".eval-card").bounding_box()["height"])))
    cb2 = lap.locator(".panel-c").bounding_box()
    check("1366: 대화 패널 오른쪽 고정·입력창 보임·너비 320 이상", lap.locator("#chat-input").is_visible() and cb2["width"] >= 320 and cb2["x"] > 800, f"{round(cb2['width'])}px")
    ab2 = lap.locator(".panel-a").bounding_box()
    check("1366: 데이터 관리 : AI 대화 약 65:35", abs(ab2["width"] / (ab2["width"] + cb2["width"]) * 100 - 65) <= 3)
    sf3 = small_fonts(lap)
    check("1366: 글자 12px 이상", not sf3, ", ".join(sf3))

    # ── v0.4.2: 1366×768 세로 공간 · 접근성 · 키보드 ──
    lap.screenshot(path=f"{SHOTS}/09_1366_welcome.png")
    lap.get_by_role("tab", name="구매조달").click()
    lap.wait_for_selector(".pager-nav")
    lap.evaluate("() => document.querySelector('.panel-body-a').scrollTo(0, 99999)")
    pg = lap.evaluate("() => { const p=document.querySelector('.pager'), a=document.querySelector('.panel-a').getBoundingClientRect(), r=p.getBoundingClientRect(), b=p.querySelector('.icon-btn').getBoundingClientRect(), sel=p.querySelector('select').getBoundingClientRect(); return {top:r.top, bottom:r.bottom, pb:a.bottom, bh:b.height, bw:b.width, sh:sel.height, bt:getComputedStyle(p).borderTopWidth, bg:getComputedStyle(p).backgroundColor, fs:Math.min(...[...p.querySelectorAll('*')].filter(e=>e.childElementCount==0 && e.textContent.trim()).map(e=>parseFloat(getComputedStyle(e).fontSize)))}; }")
    check("1366×768 데이터 관리 아래쪽 페이지 바: 잘리지 않고 보임, 버튼·선택 36px 이상, 12px 이상, 위쪽 경계선·단색 배경", pg["bottom"] <= pg["pb"] + 1 and pg["top"] >= 0 and pg["bh"] >= 36 and pg["bw"] >= 36 and pg["sh"] >= 36 and pg["fs"] >= 12 and pg["bt"] != "0px" and "0, 0, 0, 0" not in pg["bg"], json.dumps(pg))
    lap.evaluate("() => document.querySelector('.panel-body-a').scrollTo(0, 0)")
    lap.evaluate("() => document.querySelector('.panel-body-a').scrollTo(0, 99999)")
    lap.screenshot(path=f"{SHOTS}/09_1366_pager.png")
    pe = lap.evaluate("() => { const c=document.querySelector('.panel-body-a').getBoundingClientRect(), p=document.querySelector('.pager').getBoundingClientRect(), rs=[...document.querySelectorAll('.data-table tbody tr')], l=rs[rs.length-1].getBoundingClientRect(), el=document.elementFromPoint(p.left+p.width/2, Math.min(p.bottom+2, c.bottom-1)); return {cb:c.bottom, pb:p.bottom, pt:p.top, lb:l.bottom, row:!!(el && el.closest('.data-table tbody tr')), gap:c.bottom-p.bottom}; }")
    check("v0.4.4 페이지 바: 스크롤 끝에서 영역 맨 아래에 붙음(틈 없음) · 바로 아래에 표 행이 비치지 않음 · 마지막 행이 바 위에 완전히 보임", pe["gap"] <= 1 and not pe["row"] and pe["lb"] <= pe["pt"] + 1, json.dumps(pe))
    lap.evaluate("() => { const e=document.querySelector('.panel-body-a'); e.scrollTo(0, e.scrollHeight/2) }")
    pm = lap.evaluate("() => { const c=document.querySelector('.panel-body-a').getBoundingClientRect(), p=document.querySelector('.pager').getBoundingClientRect(), el=document.elementFromPoint(p.left+p.width/2, Math.min(p.bottom+2, c.bottom-1)); return {gap:c.bottom-p.bottom, row:!!(el && el.closest('.data-table tbody tr'))}; }")
    check("v0.4.4 페이지 바: 스크롤 중간에서도 아래에 틈 없음 · 행이 바 아래로 비치지 않음", pm["gap"] <= 1 and not pm["row"], json.dumps(pm))
    lap.evaluate("() => document.querySelector('.panel-body-a').scrollTo(0, 99999)")
    nxt = lap.locator(".pager .icon-btn[aria-label='다음 쪽']")
    nxt.focus()
    lap.keyboard.press("Shift+Tab")
    lap.keyboard.press("Tab")  # 키보드로 이동해야 :focus-visible이 적용됨
    fo = lap.evaluate("() => getComputedStyle(document.activeElement).outlineStyle")
    prv = lap.evaluate("() => { const b=document.querySelector(\".pager .icon-btn[aria-label='이전 쪽']\"); return b.disabled && getComputedStyle(b).opacity < 1; }")
    check("페이지 바: 다음 쪽 초점 링 표시 · 비활성(이전 쪽)은 흐리게 구분", fo != "none" and prv, fo)
    nxt.click()
    check("페이지 바: 다음 쪽 동작 유지", lap.locator(".pager-page").inner_text().startswith("2"))
    lap.locator(".pager .icon-btn[aria-label='이전 쪽']").click()
    lap.evaluate("() => document.querySelector('.panel-body-a').scrollTo(0, 0)")
    lap.get_by_role("tab", name="협력업체").click()
    g = lap.evaluate("() => { const l=document.querySelector('.chat-list').getBoundingClientRect(), c=document.querySelector('.composer').getBoundingClientRect(), p=document.querySelector('.panel-c').getBoundingClientRect(), t=document.querySelector('#chat-input').getBoundingClientRect(), r=document.querySelector('.suggest-row'); return {list:l.height, cb:c.bottom, pb:p.bottom, tb:t.bottom, th:t.height, rowFits: r.scrollHeight <= r.clientHeight + 1, hint:getComputedStyle(document.querySelector('.composer-hint')).display}; }")
    check("1366×768 환영 상태: 대화 영역 96px 이상, 입력창이 잘리지 않음", g["list"] >= 96 and g["cb"] <= g["pb"] + 1 and g["tb"] <= g["pb"] and g["th"] >= 40, json.dumps({k: (round(v) if isinstance(v, float) else v) for k, v in g.items()}))
    check("1366×768: 입력 안내 숨김 · 추천 질문은 한 줄(가로 스크롤)", g["hint"] == "none" and g["rowFits"])
    lap.locator(".data-table tbody tr", has_text="업체 B").locator(".name").click()
    g2 = lap.evaluate("() => { const l=document.querySelector('.chat-list').getBoundingClientRect(), c=document.querySelector('.composer').getBoundingClientRect(), p=document.querySelector('.panel-c').getBoundingClientRect(), h=document.querySelector('.chat-head').getBoundingClientRect(); return {list:l.height, cb:c.bottom, pb:p.bottom, head:h.height}; }")
    check("1366×768 행 선택 후: 머리 한 줄 · 대화 영역 96px 이상 · 입력창 보임", g2["head"] < 80 and g2["list"] >= 96 and g2["cb"] <= g2["pb"] + 1, json.dumps({k: round(v) for k, v in g2.items()}))
    lap.screenshot(path=f"{SHOTS}/09_1366_selected.png")
    ask(lap, "납기 준수율이 낮은 협력사를 찾아줘.")
    lap.screenshot(path=f"{SHOTS}/09_1366_after_q.png")
    g3 = lap.evaluate("() => { const l=document.querySelector('.chat-list').getBoundingClientRect(), c=document.querySelector('.composer').getBoundingClientRect(), p=document.querySelector('.panel-c').getBoundingClientRect(); return {list:l.height, cb:c.bottom, pb:p.bottom}; }")
    check("1366×768 질문 뒤: 대화 영역 96px 이상 · 입력창 보임", g3["list"] >= 96 and g3["cb"] <= g3["pb"] + 1, json.dumps({k: round(v) for k, v in g3.items()}))
    lap.screenshot(path=f"{SHOTS}/09_1366_answer.png")
    # 위를 읽는 중 새 답변 → 자동으로 끌고 가지 않고 '새 답변 ↓' 버튼
    ask(lap, "최근 단가가 상승한 품목을 보여줘.")
    lap.fill("#chat-input", "A등급 협력사의 품질 실적을 정리해 줘.")
    lap.press("#chat-input", "Enter")
    lap.wait_for_selector(".progress")
    lap.locator(".chat-list").evaluate("e => { e.scrollTop = 0; }")
    lap.wait_for_timeout(120)
    lap.wait_for_function("() => !document.querySelector('.progress')", timeout=8000)
    st = lap.locator(".chat-list").evaluate("e => e.scrollTop")
    check("위쪽을 읽는 중 새 답변: 자동 이동 없이 '새 답변' 버튼", lap.locator(".new-below").is_visible() and st < 40, f"scrollTop={round(st)}")
    lap.locator(".new-below").click()
    check("'새 답변' 버튼 → 그 답변으로 이동 후 버튼 사라짐", lap.locator(".new-below").count() == 0 and lap.locator(".chat-list").evaluate("e => e.scrollTop") > 40)
    # 알림 영역(토스트)은 항상 있고, 마우스를 올리면 멈춘다
    check("토스트 알림 영역은 항상 그려져 있음(role=status, 비어 있음)", lap.locator(".toast-region[role='status']").count() == 1 and lap.locator(".toast").count() == 0)
    lap.fill("#keyword-search", "PO-2024-0003")
    lap.wait_for_selector(".kw-hit")
    lap.locator(".kw-hit").first.click()
    lap.wait_for_selector(".toast")
    lap.locator(".toast").hover()
    lap.wait_for_timeout(4200)
    still = lap.locator(".toast").count() == 1
    lap.mouse.move(10, 400)
    lap.wait_for_timeout(4200)
    check("토스트: 마우스를 올리면 사라지지 않고, 벗어나면 사라짐", still and lap.locator(".toast").count() == 0)
    # 경계선: 실제로 보이는 너비와 aria 값이 같음
    lap.locator(".splitter").focus()
    [lap.keyboard.press("ArrowRight") for _ in range(12)]
    lap.wait_for_timeout(100)
    sp = lap.evaluate("() => { const m=document.querySelector('.workspace'), cs=getComputedStyle(m), cw=m.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight), s=document.querySelector('.splitter'), a=document.querySelector('.panel-a').getBoundingClientRect().width; return {now:+s.getAttribute('aria-valuenow'), max:+s.getAttribute('aria-valuemax'), text:s.getAttribute('aria-valuetext'), actual:a/cw*100}; }")
    check("경계선 aria-valuenow = 실제 데이터 관리 너비(%), 최대값 이내, aria-valuetext", abs(sp["now"] - sp["actual"]) <= 1.5 and sp["now"] <= sp["max"] and sp["text"] == f"데이터 관리 {sp['now']}%", json.dumps(sp, ensure_ascii=False))
    lap.locator(".splitter").dispatch_event("pointerdown", {"clientX": 900, "clientY": 400, "pointerId": 7, "pointerType": "touch", "isPrimary": True, "bubbles": True})
    d1 = lap.locator(".workspace.is-dragging").count() == 1
    lap.locator(".splitter").dispatch_event("pointercancel", {"pointerId": 7, "bubbles": True})
    check("경계선: pointercancel도 끌기를 끝냄", d1 and lap.locator(".workspace.is-dragging").count() == 0)
    lap.locator(".splitter").focus()
    lap.keyboard.press("Home")
    # 탭 목록 키보드
    lap.locator("#tab-suppliers").click()
    lap.locator("#tab-suppliers").focus()
    lap.keyboard.press("ArrowRight")
    tabs_ok = lap.locator("#tab-purchaseOrders").get_attribute("aria-selected") == "true" and lap.evaluate("() => document.activeElement.id") == "tab-purchaseOrders"
    ti = [lap.locator(f"#tab-{t}").get_attribute("tabindex") for t in ["suppliers", "purchaseOrders", "contracts", "inventory"]]
    lap.keyboard.press("End")
    end_ok = lap.locator("#tab-inventory").get_attribute("aria-selected") == "true"
    lap.keyboard.press("Home")
    check("데이터 탭: 좌우 화살표·Home·End로 이동·선택, 선택한 탭만 tabindex 0", tabs_ok and end_ok and lap.locator("#tab-suppliers").get_attribute("aria-selected") == "true" and ti == ["-1", "0", "-1", "-1"], str(ti))
    lap.locator("#tab-purchaseOrders").click()
    lap.locator(".subtab").first.focus()
    lap.keyboard.press("ArrowRight")
    check("하위 보기: 좌우 화살표 이동·aria-controls가 실제 패널을 가리킴", lap.locator(".subtab[aria-selected='true']").count() == 1 and lap.locator(".subtab").nth(1).get_attribute("aria-selected") == "true" and lap.evaluate("() => { const b=document.querySelector('.subtab'); return !!document.getElementById(b.getAttribute('aria-controls')); }"))
    lap.locator(".subtab[data-sub='list']").click()
    check("필터 표시줄: aria-live는 건수 문구에만", lap.locator(".filter-status").get_attribute("aria-live") is None and lap.locator(".filter-count").get_attribute("aria-live") == "polite")
    sk = browser.new_page(viewport={"width": 1366, "height": 768})
    sk.goto(URL, wait_until="domcontentloaded")
    sk.wait_for_selector("#login-demo")
    sk.click("#login-demo")
    sk.wait_for_selector(".eval-card")
    if sk.locator("#ob-skip").count():
        sk.click("#ob-skip")
    sk.reload(wait_until="domcontentloaded")
    sk.wait_for_selector(".eval-card")
    sk.keyboard.press("Tab")
    first_skip = sk.evaluate("() => document.activeElement.classList.contains('skip-link')")
    sk.keyboard.press("Enter")
    sk.wait_for_timeout(200)
    check("건너뛰기 링크: 첫 Tab에 나타나고 Enter로 대화 입력에 초점", first_skip and sk.evaluate("() => document.activeElement.id") == "chat-input")
    sk.close()
    check("h1(브랜드 제품명)이 한 개 있음", lap.locator("h1").count() == 1)
    lap.screenshot(path=f"{SHOTS}/09_1366.png")

    # 33. 태블릿 900
    tab = browser.new_page(viewport={"width": 900, "height": 1180})
    demo_login(tab)
    check("태블릿: 데이터 관리/AI 대화 탭 2개", [t.strip() for t in tab.locator(".panel-tabs button").all_inner_texts()] == ["데이터 관리", "AI 대화"] and tab.locator(".panel-a").is_visible() and not tab.locator(".panel-c").is_visible())
    tab.locator(".panel-tabs button", has_text="AI 대화").click()
    check("태블릿: AI 대화 탭에서 대화 패널 전체 표시", tab.locator(".panel-c").is_visible() and tab.locator("#chat-input").is_visible() and tab.locator(".chat-launcher").count() == 0)
    check("태블릿: 보내기·메뉴·추천 질문 44px 이상", tab.locator(".send-btn").bounding_box()["height"] >= 44 and tab.locator(".chat-menu-btn").bounding_box()["height"] >= 44 and tab.locator(".suggest-chip").first.bounding_box()["height"] >= 44)
    tab.fill("#chat-input", "노즐 후보 업체 비교해 줘")
    tab.press("#chat-input", "Enter")
    tab.wait_for_selector(".ans-sec")
    check("태블릿: 글 답변 표시 (표 없음)", tab.locator(".panel-c").is_visible() and tab.locator(".panel-c table").count() == 0)
    tab.screenshot(path=f"{SHOTS}/10_tablet.png")
    check("태블릿: 가로 스크롤 없음", no_hscroll(tab))
    sf5 = small_fonts(tab)
    check("태블릿: 글자 12px 이상", not sf5, ", ".join(sf5))
    tab.locator(".panel-tabs button", has_text="데이터 관리").click()
    tab.locator(".data-table tbody tr", has_text="업체 B").locator(".name").click()
    check("태블릿: 행을 눌러도 탭이 저절로 바뀌지 않고, AI 대화 탭에 점 표시", tab.locator(".panel-a").is_visible() and tab.locator(".panel-tabs .tab-dot").count() == 1)
    tab.locator(".panel-tabs button", has_text="AI 대화").click()
    check("태블릿: AI 대화 탭 위쪽에 선택 정보 표시", tab.locator("#selection-detail").count() == 1)
    tab.locator(".panel-tabs button", has_text="데이터 관리").click()
    tab.locator(".data-table tbody tr", has_text="업체 C").locator(".name").click()
    tab.wait_for_selector(".toast")
    check("태블릿: 행을 고르면 '상세는 AI 대화 탭에서 볼 수 있어요' 토스트(탭은 그대로)", "AI 대화 탭에서 볼 수 있어요" in tab.locator(".toast").inner_text() and tab.locator(".panel-a").is_visible())
    check("태블릿: 안내 문구에 '오른쪽' 없음", "오른쪽" not in tab.locator(".data-source").inner_text() and "AI 대화" in tab.locator(".data-source").inner_text())
    check("태블릿: 탭 점은 장식, 이름에 '· 선택 정보'/'· 새 답변'이 들어감", tab.locator(".tab-dot").get_attribute("aria-hidden") == "true" and any(k in tab.locator(".panel-tabs button", has_text="AI 대화").text_content() for k in ["· 선택 정보", "· 새 답변"]))
    check("태블릿: 점 크기 10px 이상", tab.locator(".tab-dot").evaluate("e => e.getBoundingClientRect().width >= 10"))
    tab.set_viewport_size({"width": 900, "height": 1024})
    tab.locator(".panel-tabs button", has_text="AI 대화").click()
    tab.screenshot(path=f"{SHOTS}/10_900x1024.png")
    check("900×1024: 가로 스크롤 없음·입력창 보임", no_hscroll(tab) and tab.locator("#chat-input").is_visible())

    # 34. 휴대폰 400
    ph = browser.new_page(viewport={"width": 400, "height": 820})
    demo_login(ph)
    check("휴대폰: 가로 스크롤 없음", no_hscroll(ph))
    check("휴대폰: SAMPLE 표시 유지", ph.locator(".badge-demo").is_visible())
    check("휴대폰: 탭 이름 데이터 관리 / AI 대화", [t.strip() for t in ph.locator(".panel-tabs button").all_inner_texts()] == ["데이터 관리", "AI 대화"])
    ph.locator(".panel-tabs button", has_text="AI 대화").click()
    check("휴대폰: 대화 패널·입력창 보임, 가로 스크롤 없음, 보내기 버튼 44px", ph.locator("#chat-input").is_visible() and no_hscroll(ph) and ph.locator(".send-btn").bounding_box()["width"] >= 44)
    ph.locator(".panel-tabs button", has_text="데이터 관리").click()
    check("휴대폰: 상단 바 두 줄 (브랜드·알림·사용자 / 데이터 상태·불러오기)", ph.locator(".user-btn").bounding_box()["y"] < ph.locator(".topbar .btn-primary").bounding_box()["y"])
    sf4 = small_fonts(ph)
    check("휴대폰: 글자 12px 이상", not sf4, ", ".join(sf4))
    ph.set_viewport_size({"width": 400, "height": 800})
    ph.screenshot(path=f"{SHOTS}/11_phone.png")
    ph.locator(".panel-tabs button", has_text="AI 대화").click()
    ph.screenshot(path=f"{SHOTS}/11_phone_chat.png")
    check("400×800: 채팅 가로 스크롤 없음 · 입력창이 패널 안에 있음", no_hscroll(ph) and ph.evaluate("() => document.querySelector('#chat-input').getBoundingClientRect().bottom <= document.querySelector('.panel-c').getBoundingClientRect().bottom"))
    # 터치(거친 포인터)에서는 눈에 보이는 크기는 그대로, 누르는 영역만 44px
    tctx = browser.new_context(viewport={"width": 400, "height": 800}, is_mobile=True, has_touch=True)
    tp = tctx.new_page()
    demo_login(tp)
    check("터치 화면: 매체 쿼리 (pointer: coarse) 적용", tp.evaluate("() => matchMedia('(pointer: coarse)').matches"))
    hit = tp.evaluate("() => { const e=document.querySelector('.fav-star'); const r=e.getBoundingClientRect(), a=getComputedStyle(e,'::after'); return {vis:r.width, hit:parseFloat(a.width)}; }")
    check("터치 화면: 별표는 보이는 크기 그대로, 누르는 영역은 44px 이상", hit["vis"] < 44 and hit["hit"] >= 44, json.dumps(hit))
    # 35. v0.5.0 v14 디자인: 어두운 테마 · 강조색 · 진입 동작 · 대비/12px 점검
    SWEEP = r"""() => {
  const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null;
    if (c.startsWith('color(')) { const v=m.slice(0,3).map(x=>Math.round(parseFloat(x)*255)); return [...v, m[3]!==undefined?parseFloat(m[3]):1]; }
    if (c.startsWith('oklab')||c.startsWith('oklch')||c.startsWith('lab')||c.startsWith('lch')) return null;
    return [parseFloat(m[0]),parseFloat(m[1]),parseFloat(m[2]), m[3]!==undefined?parseFloat(m[3]):1]; };
  const lin = v => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  const L = c => 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
  const blend = (f,b) => [0,1,2].map(i=>f[i]*f[3]+b[i]*(1-f[3])).concat([1]);
  const bgOf = (el) => { // 합성 배경색, 그라데이션·이미지가 끼면 null
    const stack=[]; for (let e=el; e; e=e.parentElement) { const cs=getComputedStyle(e); if (cs.backgroundImage!=='none') return null; const c=parse(cs.backgroundColor); if (c===null) return null; stack.push(c); if (c[3]>=1) break; }
    let acc=[255,255,255,1]; if (getComputedStyle(document.documentElement).colorScheme.includes('dark')) acc=[16,16,16,1];
    for (let i=stack.length-1;i>=0;i--) acc=blend(stack[i],acc); return acc; };
  const small=[], low=[]; let n=0;
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const t=w.currentNode; if(!t.textContent.trim()) continue; const el=t.parentElement; if(!el) continue;
    const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue; const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') continue;
    if (el.closest('.sr-only,.step-mini-label,[aria-hidden="true"]')) continue; if (el.closest('option,optgroup,script,style,title')) continue;
    const fs=parseFloat(cs.fontSize); n++;
    const id=(el.tagName+'.'+(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className)).slice(0,50);
    if (fs<12 && !el.closest('.brand')) small.push(id+':'+fs);
    if (el.closest(':disabled,[disabled]')) continue;
    let fg=parse(cs.color||cs.fill); if(!fg) continue; const bg=bgOf(el); if(!bg) continue;
    let op=1; for (let e=el;e;e=e.parentElement) op*=parseFloat(getComputedStyle(e).opacity);
    fg=blend([fg[0],fg[1],fg[2],fg[3]*op],bg);
    const a=L(fg),b=L(bg); const ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    const large = fs>=24 || (fs>=18.66 && parseInt(cs.fontWeight)>=700);
    if (ratio < (large?3:4.5)) low.push(id+' '+ratio.toFixed(2)+' "'+t.textContent.trim().slice(0,18)+'"');
  }
  return {n, small:[...new Set(small)].slice(0,8), low:[...new Set(low)].slice(0,25)};
}
"""
    def sweep(pg, label):
        settled(pg)
        r = pg.evaluate(SWEEP)
        check(f"{label}: 12px 미만 글자 없음", not r["small"], ", ".join(r["small"]))
        check(f"{label}: 글자 대비 4.5:1 이상 (그라데이션·이미지 바탕 제외, 검사 {r['n']}개)", not r["low"], "; ".join(r["low"][:6]))
    dctx = browser.new_context(viewport={"width": 1920, "height": 1080}, color_scheme="light")
    # v0.5.2: 로드 직후 1.6초 동안 30ms마다 document.getAnimations() 를 기록 → 이름별 시작·끝(앱 시작 기준)
    dctx.add_init_script("""window.__tl = {}; window.__t0 = null;
addEventListener('DOMContentLoaded', () => { const iv = setInterval(() => {
  for (const a of document.getAnimations()) { const tm = a.effect.getComputedTiming(); const n = a.animationName || a.transitionProperty || '?'; if (a.transitionProperty) continue;
    const st = a.startTime; if (st == null) continue; if (window.__t0 === null || st < window.__t0) window.__t0 = st;
    const inf = tm.iterations === Infinity; const e = window.__tl[n] || (window.__tl[n] = {s: 1e9, e: 0, n: 0, inf});
    e.s = Math.min(e.s, st + (tm.delay || 0)); e.e = Math.max(e.e, inf ? 0 : st + tm.endTime); e.n++; }
  if (performance.now() > 2200) clearInterval(iv); }, 30); })""")
    dp = dctx.new_page()
    dp.goto(URL, wait_until="domcontentloaded")
    dp.wait_for_selector("#login-demo")
    dp.click("#login-demo")
    dp.wait_for_selector(".eval-card")
    if dp.locator("#ob-skip").count():
        dp.click("#ob-skip")
    check("테마: 기본은 운영체제 설정(밝게) · color-scheme 적용", dp.evaluate("() => document.documentElement.dataset.theme") == "light" and dp.evaluate("() => getComputedStyle(document.documentElement).colorScheme") == "light")
    cv = lambda n: dp.evaluate("n => { const d=document.createElement('i'); d.style.color='var('+n+')'; document.body.appendChild(d); const c=getComputedStyle(d).color; d.remove(); return c; }", n)
    check("브랜드 팔레트(밝은 테마): --accent #F37321 · 70% #F89B6C · 50% #FBB584", cv("--accent") == "rgb(243, 115, 33)" and cv("--accent-2") == "rgb(248, 155, 108)" and cv("--accent-3") == "rgb(251, 181, 132)", f"{cv('--accent')} {cv('--accent-2')} {cv('--accent-3')}")
    check("브랜드 검정(밝은 테마): --solid·--ink = #1B1B1B", cv("--solid") == "rgb(27, 27, 27)" and cv("--ink") == "rgb(27, 27, 27)")
    check("주 버튼: 오렌지 채움 + #1B1B1B 글자 (흰 글자 아님)", dp.evaluate("() => { const b=getComputedStyle(document.querySelector('.topbar .btn-primary')); return b.backgroundColor+'|'+b.color; }") == "rgb(243, 115, 33)|rgb(27, 27, 27)")
    check("테마 전환: 해/달 선택 상자 (라디오 2개, 접근 이름)", dp.locator(".theme-seg [role='radio']").count() == 2 and dp.locator(".theme-seg").get_attribute("aria-label") == "화면 테마")
    dp.wait_for_timeout(500)
    sweep(dp, "밝은 테마")
    dp.screenshot(path=f"{SHOTS}/v5_light.png")
    import time as _t
    t0 = _t.time()
    dp.locator(".theme-seg button[aria-label='어둡게']").click()
    dp.wait_for_function("() => document.documentElement.dataset.theme === 'dark'", timeout=3000)
    dt = (_t.time() - t0) * 1000
    check("어두운 테마: data-theme가 1.5초 안에 바뀜", dt < 1500, f"{round(dt)}ms")
    dp.wait_for_timeout(900)
    check("어두운 테마: 색 구성표·바탕 (page #101010)", dp.evaluate("() => getComputedStyle(document.documentElement).colorScheme") == "dark" and dp.evaluate("() => getComputedStyle(document.body).backgroundColor") == "rgb(16, 16, 16)")
    check("어두운 테마: 저장됨 (localStorage)", dp.evaluate("() => localStorage.getItem('procure-ai:theme')") == '"dark"')
    check("전환 뒤 liquid-switching 등 임시 클래스가 남지 않음", dp.evaluate("() => !document.documentElement.classList.contains('liquid-switching') && !document.documentElement.classList.contains('theme-fade')"))
    dp.locator(".data-table tbody tr").nth(1).click()
    dp.fill("#chat-input", "납기 준수율이 낮은 협력사를 찾아줘")
    dp.press("#chat-input", "Enter")
    dp.wait_for_function("() => !document.querySelector('.progress')", timeout=8000)
    dp.wait_for_timeout(500)  # 말풍선 진입 동작이 끝난 뒤 측정
    sweep(dp, "어두운 테마(답변·선택)")
    dp.screenshot(path=f"{SHOTS}/v5_dark.png")
    for tname in ("구매조달", "원가-계약", "자재-공급관리"):
        dp.locator(".tab", has_text=tname).click()
        for i in range(dp.locator(".subtab").count()):
            dp.locator(".subtab").nth(i).click()
            dp.wait_for_timeout(250)
            sweep(dp, f"어두운 테마 {tname} 보기{i+1}")
    # 새로고침: 첫 그림 전에 이미 어둡게 (인라인 스크립트)
    dp.reload(wait_until="commit")
    dp.wait_for_function("() => !!document.documentElement.dataset.theme")
    first_theme = dp.evaluate("() => document.documentElement.dataset.theme")
    check("새로고침: 첫 그림 전에 data-theme=dark 적용 (흰 화면 깜빡임 없음)", first_theme == "dark")
    dp.wait_for_selector(".eval-card")
    check("새로고침 후 어두운 테마 유지", dp.evaluate("() => document.documentElement.dataset.theme") == "dark" and dp.locator(".theme-seg button[aria-checked='true']").get_attribute("aria-label") == "어둡게")
    dp.locator(".user-btn").click()
    check("강조색 선택: 5개 라디오 (색 이름 접근 이름)", dp.locator(".accent-pick [role='radio']").count() == 5 and dp.locator(".accent-pick [aria-label='강조색 파랑']").count() == 1)
    base_fill = dp.evaluate("() => getComputedStyle(document.querySelector('.topbar .btn-primary')).backgroundColor")
    dp.locator(".accent-pick [aria-label='강조색 파랑']").click()
    dp.keyboard.press("Escape")
    dp.wait_for_timeout(400)
    check("강조색 파랑: data-accent·주 버튼 색 변경", dp.evaluate("() => document.documentElement.dataset.accent") == "blue" and dp.evaluate("() => getComputedStyle(document.querySelector('.topbar .btn-primary')).backgroundColor") != base_fill)
    check("강조색 파랑: 70%·50% 색이 따로 계산됨", cv("--accent-2") != "rgb(248, 155, 108)" and cv("--accent-3") != cv("--accent-2"))
    check("강조색 저장됨", dp.evaluate("() => localStorage.getItem('procure-ai:accent')") == '"blue"')
    for lab in ("파랑", "초록", "보라", "분홍", "한화 오렌지"):
        dp.locator(".user-btn").click()
        dp.locator(f".accent-pick [aria-label='강조색 {lab}']").click()
        dp.keyboard.press("Escape")
        sweep(dp, f"강조색 {lab} · 어두운 테마")
    dp.locator(".theme-seg button[aria-label='밝게']").click()
    dp.wait_for_function("() => document.documentElement.dataset.theme === 'light'", timeout=3000)
    dp.wait_for_timeout(900)
    for lab in ("파랑", "초록", "보라", "분홍", "한화 오렌지"):
        dp.locator(".user-btn").click()
        dp.locator(f".accent-pick [aria-label='강조색 {lab}']").click()
        dp.keyboard.press("Escape")
        sweep(dp, f"강조색 {lab} · 밝은 테마")
    # v0.5.2: 진입 동작 예산 — 첫 화면 전체 ≤ 1100ms (이전 v0.5.1의 '모두 300ms 이하'를 사용자 결정으로 대체), 핵심 숫자·표 첫 행은 400ms 안에 시작
    dp.reload(wait_until="domcontentloaded")
    dp.wait_for_selector(".eval-card")
    tl = dp.evaluate("() => ({tl: window.__tl, t0: window.__t0})")
    names = tl["tl"]; t0 = tl["t0"] or 0
    ends = {n: round(v["e"] - t0) for n, v in names.items() if not v["inf"] and v["e"] > 0}
    starts = {n: round(v["s"] - t0) for n, v in names.items()}
    mx = max(ends.values()) if ends else 9999
    check("진입 동작: 첫 화면 전체가 1100ms 안에 끝남 (지연 포함)", bool(ends) and mx <= 1100, f"최대 {mx}ms · {len(names)}종 · " + json.dumps(ends, ensure_ascii=False))
    check("진입 동작: 핵심 숫자(막대·도넛)와 표 첫 행이 400ms 안에 시작", starts.get("rowIn", 9999) <= 400 and starts.get("fillIn", 9999) <= 400 and starts.get("dash", 9999) <= 400, f"rowIn {starts.get('rowIn')} · fillIn {starts.get('fillIn')} · dash {starts.get('dash')}")
    need = ["shellIn", "popPill", "logoIn", "wipeIn", "rise", "wordIn", "cardIn", "tileIn", "glowIn", "indIn", "fillIn", "dash", "rowIn"]
    miss = [n for n in need if n not in names]
    check("v14 모션 세트: 로드 때 실제로 실행되는 동작 이름 13종 (getAnimations)", not miss, "없음: " + ", ".join(miss))
    check("반복 장식(알림 점 pulse·상태 점 livePulse)이 무한 반복으로 돈다", names.get("pulse", {}).get("inf") and names.get("livePulse", {}).get("inf"))
    kf = dp.evaluate("() => { const o = new Set(); for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.type === CSSRule.KEYFRAMES_RULE) o.add(r.name); } catch (e) {} } return [...o]; }")
    kmiss = [n for n in ["popPill", "logoIn", "wipeIn", "rise", "wordIn", "cardIn", "barGrow", "lineDraw", "rowIn", "panelIn", "fillIn", "dash", "pulse"] if n not in kf]
    check("v14 모션 세트: 키프레임 13종 정의됨", not kmiss, "없음: " + ", ".join(kmiss))
    # 제목 낱말: 접근 가능한 글자는 그대로
    tp = dp.evaluate("() => [...document.querySelectorAll('.panel-title, #eval-title')].map(h => ({al: h.getAttribute('aria-label'), tx: h.textContent.replace(/\s+/g,' ').trim(), words: h.querySelectorAll('.word[aria-hidden=true]').length, vis: [...h.querySelectorAll('.word')].every(w => w.getAttribute('aria-hidden') === 'true')}))")
    check("제목 낱말 분리: aria-label 과 보이는 글자가 같고 낱말 조각은 aria-hidden", len(tp) == 3 and all(t["al"] == t["tx"] and t["words"] >= 2 and t["vis"] for t in tp), json.dumps(tp, ensure_ascii=False))
    dp.wait_for_function("() => !document.querySelector('.is-entering')", timeout=4000)
    fin = dp.evaluate("() => [...document.querySelectorAll('[data-final]')].filter(e => e.textContent !== e.dataset.final).length")
    check("숫자 올라가기: 끝나면 모든 값이 data-final 과 같음", fin == 0 and dp.locator("[data-final]").count() >= 8, f"불일치 {fin}")
    # 재생 규칙: 탭 전환은 재생, 필터·정렬·페이지는 재생 안 함
    live = "() => document.getAnimations().filter(a => a.animationName && a.effect.getComputedTiming().iterations !== Infinity && !/^(popOpen|tipIn|modalIn|toastIn|bubbleIn|fadeIn)$/.test(a.animationName)).map(a => a.animationName)"
    dp.get_by_role("tab", name="구매조달").click()
    got = set(dp.evaluate(live))
    check("탭 전환(구매조달): 표 행 rowIn·panelIn 이 다시 재생됨", {"rowIn", "panelIn"} <= got, str(sorted(got)))
    settled(dp)
    dp.locator(".pager-size select").select_option("50")
    dp.wait_for_timeout(60)
    check("한 쪽 행 수·페이지 변경: 진입 동작 재생 없음", dp.evaluate(live) == [])
    dp.locator(".filters .chip-btn").nth(1).click()
    dp.wait_for_timeout(60)
    check("필터 변경: 진입 동작 재생 없음 (바로 최종 모습)", dp.evaluate(live) == [] and dp.locator(".is-entering").count() == 0, str(dp.evaluate(live)))
    dp.locator(".th-sort").first.click()
    dp.wait_for_timeout(60)
    check("정렬 변경: 진입 동작 재생 없음", dp.evaluate(live) == [])
    dp.locator(".subtab[data-sub='payments']").click()
    got = set(dp.evaluate(live))
    check("하위 보기 전환(결제 일정): 재생됨 (표 행·막대 barGrow)", {"rowIn", "barGrow"} <= got, str(sorted(got)))
    settled(dp)
    dp.get_by_role("tab", name="원가-계약").click()
    dp.locator(".subtab[data-sub='materials']").click()
    got = set(dp.evaluate(live))
    check("하위 보기 전환(원자재 시세): 꺾은선 lineDraw 재생됨", "lineDraw" in got, str(sorted(got)))
    settled(dp)
    dp.get_by_role("tab", name="협력업체").click()
    settled(dp)
    # v0.5.3: 폭별 좌우 여백·가로 스크롤·헤더 (400 / 900 / 1366 / 1920) — v0.5.2 여백: 1920=32px, 1366=30.0px, 900=10px, 400=6px
    for w, h, lo, hi in ((1920, 1080, 44, 52.5), (1366, 768, 42, 50), (900, 800, 9.5, 12), (400, 800, 5.5, 8)):
        wp = dctx.new_page()
        wp.set_viewport_size({"width": w, "height": h})
        wp.goto(URL, wait_until="domcontentloaded")
        wp.wait_for_selector(".eval-card")
        if wp.locator("#ob-skip").count():
            wp.click("#ob-skip")
        wp.wait_for_function("() => !document.querySelector('.is-entering')", timeout=4000)
        m = wp.evaluate("() => { const a = document.querySelector('.app').getBoundingClientRect(), lg = document.querySelector('.brand-logo').getBoundingClientRect(), t = document.querySelector('.topbar').getBoundingClientRect(); return {l: a.left, r: innerWidth - a.right, hs: document.documentElement.scrollWidth <= innerWidth, logoH: lg.height, logoR: lg.right, tbR: t.right, tbH: t.height}; }")
        check(f"{w}px: 좌우 여백 {lo}~{hi}px · 가로 스크롤 없음 · 로고가 상단 바 안", lo <= m["l"] <= hi and lo <= m["r"] <= hi and m["hs"] and m["logoH"] >= 34 and m["logoR"] <= m["tbR"], json.dumps(m))
        if w >= 1366:
            ds = wp.evaluate("() => { const d = document.querySelector('.data-status'); return [d.scrollWidth, d.clientWidth]; }")
            check(f"{w}px: 상태 알약 안 SAMPLE·데이터 상태가 잘리지 않음 (로고·여백이 커져도)", ds[0] <= ds[1] + 1, str(ds))
            pa = wp.locator(".panel-a").bounding_box()
            pc = wp.locator(".panel-c").bounding_box()
            check(f"{w}px: 데이터 관리 : AI 대화 ≈ 65:35 (여백이 늘어도 유지)", abs(round(pa["width"] / (pa["width"] + pc["width"]) * 100) - 65) <= 2)
            check(f"{w}px: 상단 바 높이 72px 미만(한 줄)", m["tbH"] < 72, str(round(m["tbH"])))
            pj = wp.evaluate("() => { const p = document.querySelector('.topbar .brand-product'), r = p.getBoundingClientRect(), lh = parseFloat(getComputedStyle(p).lineHeight) || parseFloat(getComputedStyle(p).fontSize) * 1.2; return {lines: Math.round(r.height / lh), fs: parseFloat(getComputedStyle(p).fontSize), clip: p.scrollWidth > p.clientWidth + 1, inside: r.right <= document.querySelector('.tb-brand').getBoundingClientRect().right + 0.5}; }")
            check(f"{w}px: 새 제품 이름이 상단 바 안에서 안 잘림 (한 줄 또는 두 줄, 13px 이상)", pj["lines"] <= 2 and not pj["clip"] and pj["inside"] and pj["fs"] >= 13, json.dumps(pj))
        ac = wp.evaluate("() => { const p = document.querySelector('.topbar .brand-product'); return {t: p.textContent, title: p.title, tag: p.tagName}; }")
        check(f"{w}px: 제품 이름이 접근 가능한 이름(h1 글자·title)으로 남음 (좁은 폭에서 눈에 안 보여도 제거되지 않음)", ac["t"] == "RAG 기반 협력사 평가 AI 에이전트" and ac["title"] == ac["t"] and ac["tag"] == "H1", json.dumps(ac, ensure_ascii=False))
        wp.close()
    # v0.5.4: 선택 바꿈 = '이어서 움직이기' (v0.5.3의 '0에서 다시 올라가기' 검사를 이 검사들로 바꿈)
    # 평가 대상·소재·직종·기간을 바꿔도 0으로 돌아가지 않고 지금 보이는 값 → 새 값으로 키우거나 줄인다.
    import math, re
    TRANS_JS = "() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.matches && a.effect.target.matches('.donut-arc, .eval-bar-fill')).map(a => a.animationName || a.transitionProperty)"
    ENTER_NAMES = {"dash", "fillIn", "popIn", "lineDraw", "barGrow"}
    names_js = "() => [...new Set(document.getAnimations().map(a => a.animationName).filter(Boolean))]"
    opts = dp.evaluate("() => [...document.querySelectorAll('#eval-supplier option')].map(o => o.value)")
    EVAL_STATE = """() => ({tot: parseFloat((document.querySelector('.donut-sub [data-final]') || {dataset: {final: 'NaN'}}).dataset.final), arc: parseFloat(getComputedStyle(document.querySelector('.donut-arc')).strokeDasharray),
        sc: [...document.querySelectorAll('.eval-bars li')].map(li => { const v = li.querySelector('[data-final]'); return v ? parseFloat(v.dataset.final) : 0; })})"""
    SAMPLER = """() => { window.__s = []; const t0 = performance.now(); window.__iv = setInterval(() => {
        const sub = document.querySelector('.donut-sub [data-final]'), arc = document.querySelector('.donut-arc');
        window.__s.push({t: Math.round(performance.now() - t0), n: sub ? parseFloat(sub.textContent) : null, d: parseFloat(getComputedStyle(arc).strokeDasharray), op: getComputedStyle(arc).opacity,
          bars: [...document.querySelectorAll('.eval-bar-fill')].map(f => f.getBoundingClientRect().width / f.parentElement.getBoundingClientRect().width * 100)}); }, 30); }"""
    STOP = "() => { clearInterval(window.__iv); return window.__s; }"
    ARC = lambda tot: 2 * math.pi * 44 * tot / 100

    def mono(seq, a, b, tol):
        """seq 가 a 에서 출발해 b 로 한 방향으로만 움직여 닿는가 (a·b 범위 밖으로 나가지 않음 = 0 근처로 떨어지지 않음)"""
        sg = 1 if b >= a else -1
        return (min(a, b) - tol <= min(seq) and max(seq) <= max(a, b) + tol and abs(seq[0] - a) <= tol and abs(seq[-1] - b) <= tol
                and all(sg * (y - x) >= -1e-6 for x, y in zip(seq, seq[1:])))

    tots = {}
    for v in opts[:8]:
        dp.select_option("#eval-supplier", v)
        dp.wait_for_timeout(800)
        st = dp.evaluate(EVAL_STATE)
        if st["tot"] == st["tot"]:
            tots[v] = st
    hi_v = max(tots, key=lambda k: tots[k]["tot"])
    lo_v = min(tots, key=lambda k: tots[k]["tot"])
    check("평가 대상 바꿈 준비: 점수가 다른 협력사 둘(높은 쪽·낮은 쪽)", tots[hi_v]["tot"] - tots[lo_v]["tot"] >= 5, f"낮음 {tots[lo_v]['tot']} · 높음 {tots[hi_v]['tot']}")
    for label, v_from, v_to in (("높은 점수로 (값이 올라감)", lo_v, hi_v), ("낮은 점수로 (값이 내려감)", hi_v, lo_v)):
        dp.select_option("#eval-supplier", v_from)
        dp.wait_for_timeout(900)
        a, b = tots[v_from], tots[v_to]
        dp.evaluate(SAMPLER)
        dp.wait_for_timeout(90)
        dp.select_option("#eval-supplier", v_to)
        got = set(dp.evaluate(names_js))
        dp.wait_for_timeout(900)
        sm = dp.evaluate(STOP)
        ns = [x["n"] for x in sm]
        check(f"평가 대상 바꿈 {label}: 종합 점수 숫자가 이전 값에서 새 값으로 한 방향으로만 이어서 셈 (0 근처로 안 떨어짐)", mono(ns, a["tot"], b["tot"], 0.06) and len(set(ns)) >= 4 and any(min(a["tot"], b["tot"]) + 0.5 < v < max(a["tot"], b["tot"]) - 0.5 for v in ns), f"{a['tot']} → {b['tot']} · {ns[::3]}")
        ds = [x["d"] for x in sm]
        check(f"평가 대상 바꿈 {label}: 도넛 호 길이(stroke-dasharray)가 이전 길이에서 새 길이로 이어서 변함", mono(ds, ARC(a["tot"]), ARC(b["tot"]), 0.6) and len(set(round(d, 1) for d in ds)) >= 4, f"{[round(d) for d in ds[::3]]}")
        okb = all(mono([x["bars"][i] for x in sm], a["sc"][i], b["sc"][i], 0.8) for i in range(5))
        check(f"평가 대상 바꿈 {label}: 점수 막대 5개가 각자 이전 길이에서 새 길이로 이어서 자라거나 줄어듦", okb, f"{a['sc']} → {b['sc']}")
        check(f"평가 대상 바꿈 {label}: 진입 동작(dash·fillIn·popIn) 재생 없음 · 도넛 항상 보임 · .is-entering 없음", not (ENTER_NAMES & got) and all(x["op"] == "1" for x in sm) and dp.locator(".eval-body.is-entering").count() == 0, str(sorted(got)))
        mism = dp.evaluate("() => [...document.querySelectorAll('.eval-card [data-final]')].filter(e => e.textContent !== e.dataset.final).length")
        check(f"평가 대상 바꿈 {label}: 끝나면 모든 숫자가 data-final 과 같고 남은 전환 없음", mism == 0 and not dp.evaluate(TRANS_JS), f"불일치 {mism}")
    # 빠르게 두 번 바꿈: 낮음 → 높음으로 가다가 150ms 뒤 다시 낮음 — 그 순간 값에서 되돌아가고(점프·겹침 없음) 최종 값에 안착
    dp.select_option("#eval-supplier", lo_v)
    dp.wait_for_timeout(900)
    dp.evaluate(SAMPLER)
    dp.wait_for_timeout(60)
    dp.select_option("#eval-supplier", hi_v)
    dp.wait_for_timeout(150)
    dp.select_option("#eval-supplier", lo_v)
    dp.wait_for_timeout(950)
    sm = dp.evaluate(STOP)
    ns = [x["n"] for x in sm]
    rng = tots[hi_v]["tot"] - tots[lo_v]["tot"]
    peak = max(ns)
    ip = ns.index(peak)
    check("평가 대상을 빠르게 두 번 바꿈: 중간 값에서 다시 출발(되돌아감) · 점프 없음 · 범위 밖(0 근처) 없음 · 최종 값 안착",
          peak > tots[lo_v]["tot"] + 0.5 and peak < tots[hi_v]["tot"] - 0.5 and abs(ns[-1] - tots[lo_v]["tot"]) <= 0.06 and min(ns) >= tots[lo_v]["tot"] - 0.06
          and all(abs(y - x) <= 0.4 * rng + 0.06 for x, y in zip(ns, ns[1:])) and all(b >= a - 1e-6 for a, b in zip(ns[:ip], ns[1:ip + 1])) and all(b <= a + 1e-6 for a, b in zip(ns[ip:], ns[ip + 1:])),
          f"낮음 {tots[lo_v]['tot']} · 높음 {tots[hi_v]['tot']} · 정점 {peak} · {ns[::3]}")
    q = dp.evaluate("() => ({mism: [...document.querySelectorAll('.eval-card [data-final]')].filter(e => e.textContent !== e.dataset.final).length, op: getComputedStyle(document.querySelector('.donut-arc')).opacity, act: document.querySelectorAll('.eval-body.is-entering').length})")
    check("빠르게 두 번 바꾼 뒤: 최종 값 일치 · 도넛 보임 · 재생 클래스 없음 · 남은 전환 없음", q["mism"] == 0 and q["op"] == "1" and q["act"] == 0 and not dp.evaluate(TRANS_JS), json.dumps(q))
    fin = dp.evaluate(EVAL_STATE)
    check("빠르게 두 번 바꾼 뒤: 도넛 호·막대가 마지막 선택의 값과 일치", abs(fin["arc"] - ARC(tots[lo_v]["tot"])) < 0.6 and fin["sc"] == tots[lo_v]["sc"], f"{fin['arc']} / {ARC(tots[lo_v]['tot'])}")
    # 테마·호버·필터는 전환을 일으키지 않음
    dp.locator(".theme-seg button[aria-label='어둡게']").click()
    dp.wait_for_timeout(80)
    check("테마 전환: 평가 카드 재생·전환 없음", not (ENTER_NAMES & set(dp.evaluate(names_js))) and not dp.evaluate(TRANS_JS) and dp.locator(".eval-body.is-entering").count() == 0)
    dp.locator(".theme-seg button[aria-label='밝게']").click()
    dp.wait_for_function("() => document.documentElement.dataset.theme === 'light'", timeout=3000)
    dp.wait_for_timeout(500)
    dp.locator(".donut").hover()
    dp.locator(".eval-bars li").first.hover()
    dp.wait_for_timeout(80)
    check("호버: 평가 카드 재생·전환 없음", not (ENTER_NAMES & set(dp.evaluate(names_js))) and not dp.evaluate(TRANS_JS) and dp.locator(".eval-body.is-entering").count() == 0)
    dp.locator(".filters .chip-btn").nth(1).click()
    dp.wait_for_timeout(80)
    check("필터 변경: 평가 카드 재생·전환 없음", not (ENTER_NAMES & set(dp.evaluate(names_js))) and not dp.evaluate(TRANS_JS) and dp.locator(".eval-body.is-entering").count() == 0)
    dp.locator(".filters .chip-btn").nth(0).click()
    # 원가-계약: 소재·기간·직종을 바꾸면 꺾은선이 이전 모양에서 새 모양으로 섞이며 옮겨 감 (0에서 다시 그리지 않음)
    PATH_SAMPLER = """() => { window.__p = []; window.__ivp = setInterval(() => { const c = document.querySelector('.chart-canvas'), p = document.querySelector('.line-path');
        window.__p.push({m: !!(c && c.dataset.morphing === '1'), d: p ? p.getAttribute('d') : '', dash: p ? getComputedStyle(p).strokeDasharray : ''}); }, 30); }"""
    PATH_STOP = "() => { clearInterval(window.__ivp); return window.__p; }"
    pts = lambda d: [(float(x), float(y)) for x, y in re.findall(r"[ML]\s*(-?[\d.]+),(-?[\d.]+)", d)]

    def path_check(name, old_d, trigger):
        dp.evaluate(PATH_SAMPLER)
        dp.wait_for_timeout(90)
        trigger()
        got_ = set(dp.evaluate(names_js))
        dp.wait_for_timeout(1000)
        ps = dp.evaluate(PATH_STOP)
        fin_d = dp.evaluate("() => document.querySelector('.line-path').getAttribute('d')")
        mid = [pts(x["d"]) for x in ps if x["m"]]
        spans = [(max(y for _, y in p) - min(y for _, y in p)) for p in (pts(x["d"]) for x in ps) if p]
        check(f"{name}: 0에서 다시 그리지 않고 이어서 섞임 (lineDraw 없음 · 섞이는 모양 4종 이상 · 선이 사라지거나 납작해지지 않음 · 처음 모양 = 이전 선 · 끝 = 새 선)",
              "lineDraw" not in got_ and len({tuple(p) for p in mid}) >= 4 and all(len(pts(x["d"])) >= 5 for x in ps) and min(spans) >= 8 and all(x["dash"] == "none" for x in ps) and ps[0]["d"] == old_d and ps[-1]["d"] == fin_d and not ps[-1]["m"] and fin_d != old_d,
              f"섞인 프레임 {len(mid)} · 점 개수 {sorted({len(p) for p in mid})} · 최소 높이 {round(min(spans), 1)}")
        return ps, fin_d

    dp.get_by_role("tab", name="원가-계약").click()
    dp.locator(".subtab[data-sub='materials']").click()
    settled(dp)
    old_d = dp.evaluate("() => document.querySelector('.line-path').getAttribute('d')")
    path_check("원자재 소재 바꿈", old_d, lambda: dp.locator(".mat-chips .chip-btn").nth(1).click())
    got = set(dp.evaluate(names_js))
    check("원자재 소재 바꿈: 표 행 rowIn·카드 tileIn 재생 없음", "rowIn" not in got and "tileIn" not in got, str(sorted(got)))
    settled(dp)
    old_d = dp.evaluate("() => document.querySelector('.line-path').getAttribute('d')")
    ps, fin_d = path_check("원자재 기간 바꿈 12→6개월 (점 개수가 다름)", old_d, lambda: dp.locator(".seg-ctl button").nth(0).click())
    check("원자재 기간 바꿈 12→6: 처음 12점 → 끝 6점", len(pts(ps[0]["d"])) == 12 and len(pts(fin_d)) == 6)
    settled(dp)
    dp.locator(".theme-seg button[aria-label='어둡게']").click()
    dp.wait_for_timeout(80)
    check("원자재: 테마 전환 섞임 없음", dp.locator(".chart-canvas[data-morphing]").count() == 0 and "lineDraw" not in set(dp.evaluate(names_js)))
    dp.locator(".theme-seg button[aria-label='밝게']").click()
    dp.wait_for_function("() => document.documentElement.dataset.theme === 'light'", timeout=3000)
    dp.wait_for_timeout(500)
    dp.locator(".mat-table tbody tr").nth(2).hover()
    dp.locator(".chart-canvas svg rect").first.hover()
    dp.wait_for_timeout(80)
    check("원자재: 호버 섞임·재생 없음", dp.locator(".chart-canvas[data-morphing]").count() == 0 and "lineDraw" not in set(dp.evaluate(names_js)))
    dp.locator(".subtab[data-sub='wages']").click()
    settled(dp)
    NUM_SAMPLER = "() => { window.__w = []; window.__ivw = setInterval(() => { const v = document.querySelector('.hl-value [data-final]'); window.__w.push(v ? parseFloat(v.textContent.replace(/,/g, '')) : null); }, 30); }"
    wage_old = dp.evaluate("() => parseFloat(document.querySelector('.hl-value [data-final]').dataset.final.replace(/,/g, ''))")
    dp.evaluate(NUM_SAMPLER)
    old_d = dp.evaluate("() => document.querySelector('.line-path').getAttribute('d')")
    dp.evaluate(PATH_SAMPLER)
    dp.wait_for_timeout(90)
    dp.locator(".wt-name").nth(1).click()
    got = set(dp.evaluate(names_js))
    dp.wait_for_timeout(1000)
    ws = dp.evaluate("() => { clearInterval(window.__ivw); return window.__w; }")
    ps = dp.evaluate(PATH_STOP)
    wf = dp.evaluate("() => parseFloat(document.querySelector('.hl-value [data-final]').dataset.final.replace(/,/g, ''))")
    check("인건비 직종 바꿈: 최근 임금 숫자가 이전 값에서 새 값으로 한 방향으로만 이어서 셈 (0 근처로 안 떨어짐)", wf != wage_old and mono(ws, wage_old, wf, 1) and len(set(ws)) >= 4, f"{wage_old} → {wf} · {ws[::4]}")
    mid = [pts(x["d"]) for x in ps if x["m"]]
    check("인건비 직종 바꿈: 꺾은선이 0에서 다시 그리지 않고 이전 모양에서 새 모양으로 섞임 (lineDraw 없음 · 선이 사라지지 않음 · 처음 = 이전 선)", "lineDraw" not in got and len({tuple(p) for p in mid}) >= 4 and all(len(pts(x["d"])) >= 5 for x in ps) and ps[0]["d"] == old_d and not ps[-1]["m"] and all(x["dash"] == "none" for x in ps), f"섞인 프레임 {len(mid)}")
    check("인건비: 끝나면 모든 값이 data-final 과 같음", dp.evaluate("() => [...document.querySelectorAll('.wage-main [data-final]')].filter(e => e.textContent !== e.dataset.final).length") == 0 and dp.locator(".wage-main[data-tween]").count() == 1)
    settled(dp)
    old_d = dp.evaluate("() => document.querySelector('.line-path').getAttribute('d')")
    ps, fin_d = path_check("인건비 기간 바꿈 24→12개월 (점 개수가 다름)", old_d, lambda: dp.locator(".seg-ctl button").nth(0).click())
    check("인건비 기간 바꿈 24→12: 처음 24점 → 끝 12점", len(pts(ps[0]["d"])) == 24 and len(pts(fin_d)) == 12)
    dp.get_by_role("tab", name="협력업체").click()
    settled(dp)
    # 손잡이 위 올림은 1px 이하
    hb = dp.locator(".tb-actions .btn-primary")
    hb.hover()
    dp.wait_for_timeout(450)
    ty = dp.evaluate("() => { const m = new DOMMatrix(getComputedStyle(document.querySelector('.tb-actions .btn-primary')).transform); return m.m42; }")
    check("호버 올림 1px 이하 유지", ty >= -1.01, f"translateY {ty}")
    # 동작 줄이기
    rctx = browser.new_context(viewport={"width": 1366, "height": 768}, reduced_motion="reduce")
    rp = rctx.new_page()
    rp.goto(URL, wait_until="domcontentloaded")
    rp.wait_for_selector("#login-demo")
    rp.click("#login-demo")
    rp.wait_for_selector(".eval-card")
    if rp.locator("#ob-skip").count():
        rp.click("#ob-skip")
    check("동작 줄이기: 진입 애니메이션 길이 0.01ms", rp.evaluate("() => parseFloat(getComputedStyle(document.querySelector('.app')).animationDuration) < 0.001"))
    rinf = rp.evaluate("() => document.getAnimations().filter(a => a.effect.getComputedTiming().iterations === Infinity && a.animationName && a.animationName !== 'spin').map(a => a.animationName)")
    check("동작 줄이기: 반복 장식(pulse·livePulse) 멈춤", rinf == [], str(rinf))
    rmax = rp.evaluate("() => Math.max(0, ...document.getAnimations().filter(a => a.animationName).map(a => { const t = a.effect.getComputedTiming(); return (t.delay || 0) + (t.duration || 0); }))")
    check("동작 줄이기: 모든 CSS 동작의 지연+길이 ≈ 0", rmax <= 1, f"{rmax}ms")
    rcnt = rp.evaluate("() => [...document.querySelectorAll('[data-final]')].every(e => e.textContent === e.dataset.final)")
    check("동작 줄이기: 숫자 올라가기 없이 바로 최종 값", rcnt and rp.locator("[data-final]").count() >= 8)
    rp.locator(".theme-seg button[aria-label='어둡게']").click()
    rp.wait_for_function("() => document.documentElement.dataset.theme === 'dark'", timeout=1500)
    check("동작 줄이기: 테마가 바로 바뀜(색 페이드)", True)
    rp.get_by_role("tab", name="원가-계약").click()
    rp.locator(".subtab[data-sub='wages']").click()
    rp.wait_for_timeout(100)
    rp.locator(".wt-name").nth(1).click()
    rp.wait_for_timeout(60)
    check("동작 줄이기: 인건비 직종 바꿈도 꺾은선이 섞이는 중이 아님(즉시)", rp.locator(".chart-canvas[data-morphing]").count() == 0)
    rr = rp.evaluate("() => ({mism: [...document.querySelectorAll('.wage-main [data-final]')].filter(e => e.textContent !== e.dataset.final).length, n: document.querySelectorAll('.wage-main [data-final]').length, mx: Math.max(0, ...document.getAnimations().filter(a => a.animationName).map(a => { const t = a.effect.getComputedTiming(); return (t.delay || 0) + (t.duration || 0); }))})")
    check("동작 줄이기: 인건비 직종 바꿈도 숫자는 바로 최종 값, 동작 길이 ≈ 0", rr["mism"] == 0 and rr["n"] >= 2 and rr["mx"] <= 1, json.dumps(rr))
    rp.get_by_role("tab", name="협력업체").click()
    rp.wait_for_timeout(100)
    rp.select_option("#eval-supplier", index=3)
    rp.wait_for_timeout(60)
    rr = rp.evaluate("() => ({mism: [...document.querySelectorAll('.eval-card [data-final]')].filter(e => e.textContent !== e.dataset.final).length, mx: Math.max(0, ...document.getAnimations().filter(a => a.animationName).map(a => { const t = a.effect.getComputedTiming(); return (t.delay || 0) + (t.duration || 0); }))})")
    check("동작 줄이기: 평가 대상 바꿈도 숫자는 바로 최종 값, 동작 길이 ≈ 0", rr["mism"] == 0 and rr["mx"] <= 1, json.dumps(rr))
    rv = rp.evaluate("() => { const t = parseFloat(document.querySelector('.donut-sub [data-final]').dataset.final), arc = parseFloat(getComputedStyle(document.querySelector('.donut-arc')).strokeDasharray), bars = [...document.querySelectorAll('.eval-bar-fill')].map(f => f.getBoundingClientRect().width / f.parentElement.getBoundingClientRect().width * 100), sc = [...document.querySelectorAll('.eval-bars li')].map(li => { const v = li.querySelector('[data-final]'); return v ? parseFloat(v.dataset.final) : 0; }); return {arcOk: Math.abs(arc - 2 * Math.PI * 44 * t / 100) < 0.6, barsOk: bars.every((b, i) => Math.abs(b - sc[i]) < 0.8)}; }")
    check("동작 줄이기: 평가 대상 바꿈 60ms 뒤 도넛 호·점수 막대도 이미 최종 길이 (전환 없이 즉시)", rv["arcOk"] and rv["barsOk"], json.dumps(rv))
    rctx.close()
    # 운영체제 설정이 어두우면 처음부터 어둡게
    sctx = browser.new_context(viewport={"width": 1366, "height": 768}, color_scheme="dark")
    sp = sctx.new_page()
    sp.goto(URL, wait_until="domcontentloaded")
    check("처음 방문: 운영체제 어두운 설정을 따름", sp.evaluate("() => document.documentElement.dataset.theme") == "dark")
    sp.wait_for_selector("#login-demo")
    sweep(sp, "로그인 화면 · 어두운 테마")
    sctx.close()
    dctx.close()
    sf = lap.evaluate(SWEEP)
    check("1366 밝은 테마: 12px 미만 글자 없음", not sf["small"], ", ".join(sf["small"]))
    # ── v0.5.5 ① 채점 평가 카드 스크롤 도킹 ② 선택 정보 머리 줄 고정 ──
    DOCK_JS = "() => { const d = document.querySelector('.eval-dock'), b = document.querySelector('.eval-dock-bar'), cs = getComputedStyle(b), br = b.getBoundingClientRect(), pr = document.querySelector('.panel-body-a').getBoundingClientRect(), cr = document.querySelector('.eval-card').getBoundingClientRect(); return {on: d.classList.contains('is-on'), vis: cs.visibility, op: parseFloat(cs.opacity), top: br.top - pr.top, h: br.height, cardBottom: cr.bottom - pr.top, inert: d.inert, pb: getComputedStyle(document.querySelector('.panel-body-a')).scrollPaddingTop}; }"
    CONTRAST_JS = """() => { const lum = (c) => { const m = c.match(/[\\d.]+/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
      const bg = getComputedStyle(document.querySelector('.eval-dock-bar')).backgroundColor; const out = [];
      for (const s of ['.dock-name', '.dock-total', '.dock-bar-head span', '.dock-bar-head b', '.dock-ring b']) { const fg = getComputedStyle(document.querySelector(s)).color; const a = lum(fg), b = lum(bg); out.push([s, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)]); }
      return out; }"""

    def dock_login(vw, vh, br=None, **kw):
        c = (br or browser).new_context(viewport={"width": vw, "height": vh}, **kw)
        pg = c.new_page()
        demo_login(pg)
        pg.wait_for_function("() => !document.querySelector('.is-entering')", timeout=4000)
        pg.wait_for_timeout(300)
        return c, pg

    def scroll_a(pg, y):
        pg.evaluate("(y) => { document.querySelector('.panel-body-a').scrollTop = y; }", y)
        pg.wait_for_timeout(500)

    for vw, vh in [(1366, 768), (900, 800)]:
        dctx2, dp = dock_login(vw, vh)
        tag = f"{vw}x{vh}"
        scroll_a(dp, 0)
        s0 = dp.evaluate(DOCK_JS)
        sh0 = dp.evaluate("() => document.querySelector('.panel-body-a').scrollHeight")
        check(f"도킹 {tag}: 맨 위에서는 압축 막대가 숨겨짐(visibility hidden·inert) · 원래 카드가 보임", (not s0["on"]) and s0["vis"] == "hidden" and s0["inert"] and s0["cardBottom"] > 100, json.dumps(s0))
        check(f"도킹 {tag}: scroll-padding-top 64px (막대 뒤로 초점이 가리지 않음)", s0["pb"] == "64px", s0["pb"])
        scroll_a(dp, 700)
        s1 = dp.evaluate(DOCK_JS)
        sh1 = dp.evaluate("() => document.querySelector('.panel-body-a').scrollHeight")
        check(f"도킹 {tag}: 카드가 사라지면 막대가 맨 위에 붙어 보임(불투명·높이 56·위쪽 0)", s1["on"] and s1["vis"] == "visible" and s1["op"] == 1 and abs(s1["top"]) <= 1 and abs(s1["h"] - 56) <= 1 and s1["cardBottom"] < 0 and not s1["inert"], json.dumps(s1))
        check(f"도킹 {tag}: 막대가 있어도 내용 높이(scrollHeight) 변화 없음 → 스크롤 위치 점프 없음", sh0 == sh1, f"{sh0} → {sh1}")
        check(f"도킹 {tag}: '채점 요약' 영역(region) 하나 · 링 · 종합 점수 · 5개 점수 막대 · 평가 대상 선택", dp.get_by_role("region", name="채점 요약").count() == 1 and dp.locator(".eval-dock-bar .dock-arc").count() == 1 and dp.locator(".dock-total [data-final]").count() == 1 and dp.locator(".dock-bars li").count() == 5 and dp.locator(".dock-select").is_visible())
        dfont = dp.evaluate("() => [...document.querySelectorAll('.eval-dock-bar, .eval-dock-bar *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).length")
        check(f"도킹 {tag}: 막대 안 12px 미만 글자 없음", dfont == 0)
        if vw == 1366:
            # 평가 대상 바꿈: 높은 점수/낮은 점수 모두 이어서 움직이는지
            vals = list(dict.fromkeys(dp.eval_on_selector_all("#eval-supplier option", "els => els.map(e => e.value)")))[:5]
            tot = {}
            for v in vals:
                dp.select_option(".dock-select", v)
                dp.wait_for_timeout(900)
                tot[v] = float(dp.evaluate("() => document.querySelector('.dock-total [data-final]').dataset.final"))
            lo, hi = min(tot, key=tot.get), max(tot, key=tot.get)
            check("도킹 1366: 평가 대상 점수가 서로 다른 협력사가 있음", tot[lo] < tot[hi], json.dumps(tot))
            SAMPLER = "() => { window.__s = []; const t0 = performance.now(); const f = () => { const n = parseFloat(document.querySelector('.dock-total [data-final]').textContent), a = parseFloat(getComputedStyle(document.querySelector('.dock-arc')).strokeDasharray), w = [...document.querySelectorAll('.dock-fill')].map(e => e.getBoundingClientRect().width); window.__s.push([n, a, w[0] || 0]); if (performance.now() - t0 < 1500) requestAnimationFrame(f); }; requestAnimationFrame(f); }"
            for label, src, dst in [("높은 점수로", lo, hi), ("낮은 점수로", hi, lo)]:
                dp.select_option(".dock-select", src)
                dp.wait_for_timeout(1000)
                dp.evaluate(SAMPLER)
                dp.select_option(".dock-select", dst)
                dp.wait_for_timeout(1700)
                sm = dp.evaluate("() => window.__s")
                up = tot[dst] > tot[src]
                nums = [x[0] for x in sm]
                arcs = [x[1] for x in sm]
                mono = lambda xs: all((b >= a - 0.01) if up else (b <= a + 0.01) for a, b in zip(xs, xs[1:]))
                mid = [n for n in nums if min(tot[src], tot[dst]) + 0.05 < n < max(tot[src], tot[dst]) - 0.05]
                end_arc = 2 * 3.141592653589793 * 44 * tot[dst] / 100
                check(f"도킹 1366: 평가 대상을 {label} 바꾸면 압축 숫자·호가 이어서 단조롭게 움직임", mono(nums) and mono(arcs) and len(mid) >= 2 and abs(nums[-1] - tot[dst]) < 0.06 and abs(arcs[-1] - end_arc) < 0.6 and abs(nums[0] - tot[src]) < max(1.5, abs(tot[dst] - tot[src]) * 0.5), f"{tot[src]}→{tot[dst]} 중간 {len(mid)}개 표본 {len(nums)}개, 호 {round(arcs[0], 1)}→{round(arcs[-1], 1)}")
        pg_pager = dp.evaluate("() => { const m = document.querySelector('.panel-body-a'); m.scrollTop = m.scrollHeight; const p = document.querySelector('.pager'); return new Promise(r => setTimeout(() => r(p ? [Math.abs(p.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom), m.scrollTop > 0] : null), 400)); }")
        check(f"도킹 {tag}: 맨 아래에서 페이지 바가 영역 맨 아래에 틈 없이 붙음(막대와 겹치지 않음)", pg_pager is not None and pg_pager[0] <= 1.5, str(pg_pager))
        # 천천히 문턱을 지나며 왕복해도 깜빡이지 않음
        dp.evaluate("() => { window.__tog = 0; new MutationObserver(() => window.__tog++).observe(document.querySelector('.eval-dock'), {attributes: true, attributeFilter: ['class']}); }")
        dp.evaluate("() => new Promise(async r => { const m = document.querySelector('.panel-body-a'); m.scrollTop = 0; await new Promise(z => setTimeout(z, 300)); window.__tog = 0; const lim = document.querySelector('.eval-card').offsetHeight + 150; for (let y = 0; y <= lim; y += 3) { m.scrollTop = y; await new Promise(z => requestAnimationFrame(z)); } for (let y = lim; y >= 0; y -= 3) { m.scrollTop = y; await new Promise(z => requestAnimationFrame(z)); } r(); })")
        dp.wait_for_timeout(500)
        tg = dp.evaluate("() => window.__tog")
        s2 = dp.evaluate(DOCK_JS)
        check(f"도킹 {tag}: 위로 올리면 막대가 사라지고 원래 카드가 다시 보임", (not s2["on"]) and s2["vis"] == "hidden" and s2["cardBottom"] > 100, json.dumps(s2))
        check(f"도킹 {tag}: 3px씩 천천히 왕복해도 상태 전환은 2번(나타남·사라짐) — 깜빡임 없음", tg == 2, f"전환 {tg}회")
        if vw == 900:
            check("도킹 900(탭 배치): 데이터 탭에서도 같은 막대 동작(위 검사 통과) · 가로 스크롤 없음", no_hscroll(dp))
        dctx2.close()
    for vw, vh in [(400, 800), (900, 800), (1366, 768), (1920, 1080)]:
        dctx2, dp = dock_login(vw, vh)
        scroll_a(dp, 700)
        sx = dp.evaluate(DOCK_JS)
        check(f"도킹 {vw}: 막대가 떠 있어도 가로 스크롤 없음", sx["on"] and no_hscroll(dp), json.dumps(sx))
        if vw in (400, 1920):
            dp.screenshot(path=f"{SHOTS}/dock_{vw}.png")
        dctx2.close()
    # 동작 줄이기: 즉시 나타남
    dctx2, dp = dock_login(1366, 768, reduced_motion="reduce")
    dp.evaluate("() => { document.querySelector('.panel-body-a').scrollTop = 700; }")
    dp.wait_for_timeout(120)
    rs = dp.evaluate("() => { const b = document.querySelector('.eval-dock-bar'), cs = getComputedStyle(b); return {op: cs.opacity, vis: cs.visibility, td: parseFloat(cs.transitionDuration) * 1000, tr: cs.transform}; }")
    check("도킹: 동작 줄이기에서는 전환 없이 즉시 나타남(전환 길이 ≈ 0, 120ms 뒤 완전히 보임)", rs["op"] == "1" and rs["vis"] == "visible" and rs["td"] <= 1 and rs["tr"] == "none", json.dumps(rs))
    dctx2.close()
    for scheme in ("dark", "light"):
        dctx2, dp = dock_login(1366, 768, color_scheme=scheme)
        scroll_a(dp, 700)
        ct = dp.evaluate(CONTRAST_JS)
        check(f"도킹: {scheme} 테마에서 막대 글자 대비 4.5:1 이상", all(c >= 4.5 for _, c in ct), json.dumps(ct))
        if scheme == "light":
            dp.locator(".dock-select").focus()
            dp.keyboard.press("Tab")
            dp.wait_for_timeout(300)
            kf = dp.evaluate("() => { const a = document.activeElement.getBoundingClientRect(), b = document.querySelector('.eval-dock-bar').getBoundingClientRect(); return [!document.querySelector('.eval-dock').classList.contains('is-on') || a.top >= b.bottom - 1 || a.bottom <= b.top, document.activeElement.className]; }")
            check("도킹: 막대 선택기에서 Tab 하면 초점이 막대 뒤에 가려지지 않음(카드로 돌아오면 막대는 사라짐)", kf[0], str(kf))
        dctx2.close()

    # ② 선택 정보 머리 줄: 접힘·펼침에서 [선택 해제]·[접기/펼치기] 위치·크기 동일
    def rect_pair(pg, root_sel):
        return pg.evaluate("(r) => { const g = (s) => { const b = document.querySelector(r + ' ' + s).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }; return {clear: g('.detail-clear'), tog: g('.row-detail-head > .icon-btn')}; }", root_sel)

    cbrowser = p.chromium.launch(ignore_default_args=["--hide-scrollbars"])  # 클래식(공간을 차지하는) 스크롤바: Windows 기본 모양
    for vw, vh in [(1366, 768), (1920, 1080), (900, 800)]:
        dctx2, dp = dock_login(vw, vh, br=cbrowser)
        dp.locator(".tab", has_text="협력업체").click()
        dp.locator(".data-table tbody tr", has_text="업체 F").locator(".name").click()
        dp.wait_for_timeout(500)
        open_chat(dp)
        dp.wait_for_selector("#selection-detail")
        dp.wait_for_timeout(300)
        ex = rect_pair(dp, ".chat-detail .row-detail")
        tx, ty = ex["tog"][0] + ex["tog"][2] / 2, ex["tog"][1] + ex["tog"][3] / 2
        if vw == 1366:
            dp.screenshot(path=f"{SHOTS}/detail_1366_open.png")
        dp.mouse.click(tx, ty)
        dp.wait_for_selector(".row-summary", timeout=2000)
        dp.wait_for_timeout(300)
        co = rect_pair(dp, ".chat-detail .row-summary")
        same = all(abs(ex[k][i] - co[k][i]) <= 1 for k in ("clear", "tog") for i in range(4))
        rr = lambda d: json.dumps({k: [round(x, 1) for x in v] for k, v in d.items()})
        check(f"선택 정보 {vw}x{vh}: 선택 해제·접기/펼치기 버튼의 x·y·너비·높이가 펼침/접힘에서 1px 이내로 같음", same, f"펼침 {rr(ex)} / 접힘 {rr(co)}")
        check(f"선택 정보 {vw}x{vh}: 오른쪽 끝이 토글, 그 바로 왼쪽이 선택 해제 (순서·간격 동일)", co["tog"][0] >= co["clear"][0] + co["clear"][2] - 1 and co["tog"][0] - (co["clear"][0] + co["clear"][2]) < 12)
        check(f"선택 정보 {vw}x{vh}: 접힌 뒤 같은 지점은 토글 버튼(aria-expanded=false)", dp.locator(".row-summary .icon-btn").get_attribute("aria-expanded") == "false")
        if vw == 1366:
            dp.screenshot(path=f"{SHOTS}/detail_1366_collapsed.png")
        dp.mouse.click(tx, ty)
        dp.wait_for_selector("#selection-detail", timeout=2000)
        dp.wait_for_timeout(250)
        check(f"선택 정보 {vw}x{vh}: 같은 지점을 두 번 누르면 접기→펼치기로 두 번 토글, aria-expanded 갱신", dp.locator(".row-detail .icon-btn").first.get_attribute("aria-expanded") == "true" and dp.locator("#selection-detail").count() == 1)
        dctx2.close()

    cbrowser.close()
    tctx.close()
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} 통과 · 스크린샷: {SHOTS}")
sys.exit(1 if failed else 0)
