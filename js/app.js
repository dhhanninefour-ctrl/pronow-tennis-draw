/*
 * app.js — 진입점: 역할(관리자/회원) 분기, 탭 라우팅, PIN 게이트, 공유 모달
 * 전역: window.TennisUI.go(tab), UI.readonly
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const UI = (global.TennisUI = global.TennisUI || {});
  const Storage = global.TennisStorage;
  const Sync = global.TennisSync;

  let adminRole = true;
  let isSuper = false;          // 총괄관리자 여부
  let adminScope = "both";      // 'sat'|'sun'|'both' — 관리/조회 가능 클럽
  let current = null;
  let contentEl = null;
  let memberAuthId = null;
  let memberClub = null; // 회원이 고정된 클럽 ('sat'|'sun') — null이면 미정
  const MEMBER_KEY = "tennisDraw:member";
  const MEMBER_CLUB_KEY = "tennisDraw:club";
  const CLUB_LABEL = { sat: "토요일", sun: "일요일", both: "토·일" };

  function urlClubParam() {
    try { const c = new global.URLSearchParams(global.location.search).get("club"); return (c === "sat" || c === "sun") ? c : null; }
    catch (e) { return null; }
  }
  function storedClub() {
    try { const c = global.localStorage.getItem(MEMBER_CLUB_KEY); return (c === "sat" || c === "sun") ? c : null; }
    catch (e) { return null; }
  }
  function storeClub(c) { try { global.localStorage.setItem(MEMBER_CLUB_KEY, c); } catch (e) {} memberClub = c; }
  function loggedInMember() { return memberAuthId ? S.getMember(memberAuthId) : null; }

  // 현재 역할이 접근 가능한 클럽 목록
  function allowedClubs() {
    if (adminRole) return adminScope === "both" ? ["sat", "sun"] : [adminScope];
    if (memberClub) return [memberClub];            // 회원: 고정 클럽 (전환 불가)
    const m = loggedInMember();
    if (m && (m.club === "sat" || m.club === "sun")) return [m.club];
    if (m && m.club === "both") return ["sat", "sun"]; // 둘다 회원만 전환 가능
    return ["sat", "sun"];
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 회원 로그인 상태
  function memberLoggedIn() {
    if (!memberAuthId) return false;
    const m = S.getMember(memberAuthId);
    return !!(m && m.active && m.status !== "pending");
  }
  function setMemberAuth(id) {
    memberAuthId = id;
    try { global.localStorage.setItem(MEMBER_KEY, id); } catch (e) {}
  }
  function clearMemberAuth() {
    memberAuthId = null;
    try { global.localStorage.removeItem(MEMBER_KEY); } catch (e) {}
  }
  function loadMemberAuth() {
    try { memberAuthId = global.localStorage.getItem(MEMBER_KEY); } catch (e) { memberAuthId = null; }
  }

  // 관리자 세션 (로그아웃 전까지 유지)
  const ADMIN_KEY = "tennisDraw:adminAuth";
  function saveAdminAuth(a) { try { global.localStorage.setItem(ADMIN_KEY, JSON.stringify(a)); } catch (e) {} }
  function loadAdminAuth() { try { return JSON.parse(global.localStorage.getItem(ADMIN_KEY) || "null"); } catch (e) { return null; } }
  function clearAdminAuth() { try { global.localStorage.removeItem(ADMIN_KEY); } catch (e) {} }
  function validAdminAuth(a) {
    if (!a || !a.role) return false;
    if (a.role === "super") return true;
    if (a.role === "rep") return S.repAdmins().some(function (r) { return r.id === a.repId; });
    return false;
  }
  // 모두 대진/순위를 볼 수 있도록 게이트 사용 안 함 (로그인은 선택)
  function memberGated() {
    return false;
  }

  // NTRP 등급 안내 (공용) — 가입/회원 화면에서 펼쳐보기
  UI.ntrpGuideHtml = function () {
    const rows = [
      ["1.0~1.5", "입문", "라켓을 막 잡은 단계. 공을 코트에 넘기는 연습 중."],
      ["2.0", "초급", "느린 공으로 랠리 시도. 포핸드 위주, 백핸드·발리는 미숙."],
      ["2.5", "초중급", "짧은 랠리가 가능하고 코트 위치 감을 익히는 중."],
      ["3.0", "중급", "중간 속도 공은 안정적으로 받음. 방향은 되지만 일관성은 부족."],
      ["3.5", "중상급", "방향·깊이 조절이 좋아지고 발리·서브가 안정. 복식 포지션 이해."],
      ["4.0", "상급", "스핀·강약·깊이를 의도대로. 실수가 적고 랠리를 주도."],
      ["4.5", "준선수급", "파워·스핀을 무기로 전략적 플레이. 뚜렷한 약점이 적음."],
      ["5.0", "토너먼트급", "강한 무기와 풋워크, 경기 운영 능숙. 대회 입상권."],
      ["5.5~7.0", "선수·프로", "전국~국제 수준의 경쟁 선수."]
    ];
    const lis = rows.map(function (r) {
      return '<li><span class="ntrp-lv">' + r[0] + '</span>' +
        '<span class="ntrp-name">' + r[1] + '</span>' +
        '<span class="ntrp-desc">' + r[2] + '</span></li>';
    }).join("");
    return '<details class="ntrp-guide">' +
      '<summary>NTRP 등급이 뭔가요? (실력 기준)</summary>' +
      '<ul class="ntrp-list">' + lis + '</ul>' +
      '<p class="ntrp-tip">💡 동호회는 보통 3.0~4.0이 많아요. 헷갈리면 한 단계 낮춰 잡는 걸 추천합니다.</p>' +
      '</details>';
  };

  function tabs() {
    if (adminRole) {
      const list = [
        { id: "members", label: "회원" },
        { id: "attendance", label: "출석" },
        { id: "draw", label: "대진" }
      ];
      if (S.get().session.scoring) list.push({ id: "ranking", label: "순위" });
      return list;
    }
    // 회원(보기 전용) — 대진·기록/순위 (가입·로그인은 👤 계정 아이콘)
    const list = [{ id: "draw", label: "대진" }];
    if (S.get().session.scoring) list.push({ id: "ranking", label: "순위" });
    return list;
  }

  function go(tab) {
    if (!tabs().some(function (t) { return t.id === tab; })) tab = tabs()[0].id;
    current = tab;
    renderTabs();
    renderContent();
    if (global.scrollTo) global.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderTabs() {
    const nav = global.document.getElementById("tabbar");
    if (!nav) return;
    nav.innerHTML = tabs().map(function (t) {
      let badge = "";
      if (t.id === "attendance") badge = '<i class="tab-badge">' + S.presentMembers().length + '</i>';
      if (t.id === "members" && S.pendingMembers().length) badge = '<i class="tab-badge warn">' + S.pendingMembers().length + '</i>';
      return '<button class="tab' + (current === t.id ? " active" : "") + '" data-tab="' + t.id + '">' +
        t.label + badge + '</button>';
    }).join("");
    nav.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () { go(b.getAttribute("data-tab")); });
    });
  }

  function renderContent() {
    if (!contentEl || !current) return;
    const mod = UI[current];
    if (mod && mod.render) mod.render(contentEl);
  }

  function renderHeader() {
    const st = S.get();
    const titleEl = global.document.getElementById("room-name");
    if (!titleEl) return;
    let who = adminRole ? "관리자" : "회원";
    if (!adminRole && memberLoggedIn()) {
      const m = S.getMember(memberAuthId);
      if (m) who = m.name;
    }
    titleEl.textContent = who + " · " + st.session.date;
  }

  // 클럽 선택 바
  function renderClubBar() {
    const bar = global.document.getElementById("club-bar");
    if (!bar) return;
    if (memberGated()) { bar.style.display = "none"; bar.innerHTML = ""; return; }
    const clubs = allowedClubs();
    if (clubs.length < 2) {
      bar.style.display = "";
      bar.innerHTML = '<div class="club-single">' + CLUB_LABEL[clubs[0]] + ' 클럽</div>';
      return;
    }
    bar.style.display = "";
    const active = S.getActiveClub();
    bar.innerHTML = '<div class="club-seg">' + clubs.map(function (c) {
      return '<button data-club="' + c + '" class="' + (active === c ? "active" : "") + '">' +
        CLUB_LABEL[c] + ' 클럽</button>';
    }).join("") + '</div>';
    bar.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { S.setActiveClub(b.getAttribute("data-club")); });
    });
  }

  // 상태/원격 변경 시 화면 갱신 (게이트면 게이트 렌더)
  function refreshView() {
    // 활성 클럽이 권한 밖이면 보정
    if (!memberGated()) {
      const clubs = allowedClubs();
      if (clubs.indexOf(S.getActiveClub()) < 0) { S.setActiveClub(clubs[0]); return; }
    }
    renderHeader();
    renderClubBar();
    if (memberGated()) { renderAccountGate(); return; }
    renderTabs();
    renderContent();
  }

  function renderModeLabel() {
    const el = global.document.getElementById("mode-label");
    if (!el) return;
    const cloud = Sync.getMode() === "cloud";
    if (cloud && adminRole) el.innerHTML = '🟢 실시간 · <b>관리자</b> 모드';
    else if (cloud) el.innerHTML = '🟢 실시간 · <b>회원</b>(보기 전용) 모드';
    else el.textContent = "로컬 저장 모드 · 이 기기에만 저장됩니다";
  }

  // 역할에 따라 헤더 버튼 표시/숨김
  function applyRoleUI() {
    ["share-btn", "import-btn", "export-btn", "reset-btn"].forEach(function (id) {
      const b = global.document.getElementById(id);
      if (b) b.style.display = adminRole ? "" : "none";
    });
    // 계정 아이콘: 클라우드 모드면 관리자·회원 모두 노출(로그인/로그아웃)
    const acc = global.document.getElementById("account-btn");
    if (acc) {
      acc.style.display = (Sync.getMode() === "cloud") ? "" : "none";
      acc.title = adminRole ? "관리자 계정" : "로그인 / 회원가입";
    }
    UI.readonly = !adminRole;
    // 로그인한 회원이면 본인 id 노출(자기 경기 점수 입력용). 관리자는 null.
    UI.memberId = (!adminRole && memberLoggedIn()) ? memberAuthId : null;
    renderClubBar();
  }

  function init() {
    contentEl = global.document.getElementById("content");

    S.subscribe(refreshView);
    UI.onRemoteUpdate = refreshView;

    bindHeader();
    UI.go = go;

    // 페이지 떠나기/숨김 전에 대기 중인 저장을 즉시 반영 (수정 유실 방지)
    global.addEventListener("beforeunload", function () {
      if (Sync.getMode() === "cloud") S.flushPersist();
    });
    global.document.addEventListener("visibilitychange", function () {
      if (global.document.visibilityState === "hidden" && Sync.getMode() === "cloud") S.flushPersist();
    });

    Sync.init().then(function (info) {
      return resolveRole(info);
    }).then(function () {
      applyRoleUI();
      renderModeLabel();
      renderHeader();
      if (!adminRole && Sync.getMode() === "cloud") {
        loadMemberAuth(); // 로그인 상태 복원(있으면)
        memberClub = urlClubParam() || storedClub();
        if (!memberClub) {
          const m = loggedInMember();
          if (m && (m.club === "sat" || m.club === "sun")) memberClub = m.club;
        }
        if (memberClub) storeClub(memberClub);
        if (memberClub) S.setActiveClub(memberClub);
      }
      renderHeader();
      // 회원인데 클럽 미정(익명·미선택) → 클럽 선택 화면
      const m = loggedInMember();
      const needPick = !adminRole && Sync.getMode() === "cloud" && !memberClub && !(m && m.club === "both");
      if (needPick) { applyRoleUI(); renderClubPicker(); }
      else { go(adminRole ? "members" : "draw"); }
    });
  }

  // 역할 확정(필요 시 로그인 게이트)
  function resolveRole(info) {
    if (info.mode !== "cloud") { adminRole = true; isSuper = true; adminScope = "both"; Sync.setAdmin(true); return Promise.resolve(); }
    if (!info.adminPath) { adminRole = false; Sync.setAdmin(false); return Promise.resolve(); }

    // 저장된 관리자 세션이 있으면 자동 로그인(로그아웃 전까지 유지)
    const saved = loadAdminAuth();
    if (validAdminAuth(saved)) {
      adminRole = true; isSuper = saved.role === "super"; adminScope = saved.scope || "both";
      Sync.setAdmin(true);
      S.setActiveClub(allowedClubs()[0]);
      return Promise.resolve();
    }

    // /admin 경로 + 클라우드 → 로그인(ID/PW). 총괄/대표 구분.
    return loginModal().then(function (cred) {
      const res = cred ? S.adminLogin(cred.id, cred.pw) : { ok: false };
      if (res.ok) {
        adminRole = true; isSuper = res.role === "super"; adminScope = res.scope || "both";
        Sync.setAdmin(true);
        saveAdminAuth({ role: res.role, scope: res.scope, repId: res.repId || null });
        // 접근 가능한 첫 클럽으로 설정
        S.setActiveClub(allowedClubs()[0]);
        // 새 클럽(방)일 때만 최초 생성 — 기존 방을 옛 로컬 상태로 덮어쓰지 않음
        if (!Sync.roomExisted()) Sync.pushNow();
      } else {
        adminRole = false; isSuper = false; adminScope = "both"; Sync.setAdmin(false);
        if (cred) global.alert("아이디 또는 비밀번호가 올바르지 않습니다. 회원(보기) 모드로 표시됩니다.");
      }
    });
  }

  function bindHeader() {
    const exportBtn = global.document.getElementById("export-btn");
    if (exportBtn) exportBtn.addEventListener("click", function () {
      Storage.exportToFile(S.get(), "tennis-draw-" + S.get().session.date + ".json");
    });
    const importBtn = global.document.getElementById("import-btn");
    if (importBtn) importBtn.addEventListener("click", function () {
      Storage.importFromFile().then(function (state) {
        if (state) { S.replace(state); go("members"); }
      }).catch(function (e) { global.alert(e.message); });
    });
    const resetBtn = global.document.getElementById("reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", openSettingsModal);
    const shareBtn = global.document.getElementById("share-btn");
    if (shareBtn) shareBtn.addEventListener("click", openShareModal);
    const accBtn = global.document.getElementById("account-btn");
    if (accBtn) accBtn.addEventListener("click", function () {
      if (adminRole) openAdminAccountModal();
      else openAccountModal(memberLoggedIn() ? "loggedin" : "login");
    });
  }

  // 관리자 계정 모달 (역할 표시 + 로그아웃)
  function openAdminAccountModal() {
    const root = global.document.getElementById("modal-root");
    if (!root) return;
    const roleLabel = isSuper ? "총괄관리자" : ("대표관리자 · " + CLUB_LABEL[adminScope] + " 담당");
    root.innerHTML = '<div class="modal-backdrop"><div class="modal">' +
      '<h3>관리자 계정</h3>' +
      '<p class="muted">현재 <b>' + roleLabel + '</b>로 로그인되어 있습니다.<br>로그아웃 전까지 로그인이 유지됩니다.</p>' +
      '<button id="admin-logout" class="btn btn-danger">로그아웃</button>' +
      (isSuper ? '<button id="admin-settings" class="btn btn-ghost">설정 (비밀번호·대표관리자)</button>' : '') +
      '<button class="btn btn-ghost modal-close">닫기</button>' +
      '</div></div>';
    bindModalCommon(root);
    bindAdminLogout(root);
    const st = root.querySelector("#admin-settings");
    if (st) st.addEventListener("click", function () { openSettingsModal(); });
  }

  // ── 회원 로그인 게이트 (로그인 전 회원 화면) ──────────────────────────
  function renderAccountGate() {
    const nav = global.document.getElementById("tabbar");
    if (nav) nav.innerHTML = "";
    if (!contentEl) return;
    contentEl.innerHTML =
      '<div class="screen gate"><div class="gate-card">' +
        '<div class="gate-emoji">🎾</div>' +
        '<h2>회원 로그인</h2>' +
        '<p class="muted">회원 페이지를 보려면 로그인하세요.<br>처음이면 회원가입 후 관리자 승인을 받으세요.</p>' +
        '<button id="gate-login" class="btn btn-primary btn-lg">로그인</button>' +
        '<button id="gate-signup" class="btn btn-ghost">회원가입</button>' +
      '</div></div>';
    const lg = contentEl.querySelector("#gate-login");
    const sg = contentEl.querySelector("#gate-signup");
    if (lg) lg.addEventListener("click", function () { openAccountModal("login"); });
    if (sg) sg.addEventListener("click", function () { openAccountModal("signup"); });
  }

  // ── 클럽 선택 화면 (회원, 클럽 미정 시) ───────────────────────────────
  function renderClubPicker() {
    const nav = global.document.getElementById("tabbar"); if (nav) nav.innerHTML = "";
    const bar = global.document.getElementById("club-bar"); if (bar) { bar.innerHTML = ""; bar.style.display = "none"; }
    if (!contentEl) return;
    contentEl.innerHTML =
      '<div class="screen gate"><div class="gate-card">' +
        '<div class="gate-emoji">🎾</div>' +
        '<h2>어느 클럽이세요?</h2>' +
        '<p class="muted">소속 클럽을 선택하면 그 클럽 내용만 표시됩니다.</p>' +
        '<button id="pick-sat" class="btn btn-primary btn-lg">토요일 클럽</button>' +
        '<button id="pick-sun" class="btn btn-primary btn-lg">일요일 클럽</button>' +
      '</div></div>';
    function pick(c) { storeClub(c); S.setActiveClub(c); applyRoleUI(); renderHeader(); go("draw"); }
    contentEl.querySelector("#pick-sat").addEventListener("click", function () { pick("sat"); });
    contentEl.querySelector("#pick-sun").addEventListener("click", function () { pick("sun"); });
  }

  // ── 계정 모달 (login / signup / loggedin) ────────────────────────────
  function openAccountModal(mode) {
    const root = global.document.getElementById("modal-root");
    if (!root) return;
    let inner;
    if (mode === "loggedin") {
      const m = S.getMember(memberAuthId);
      inner =
        '<h3>내 계정</h3>' +
        '<p class="muted">로그인됨: <b>' + esc(m ? m.name : "") + '</b>' +
          (m && typeof m.ntrp === "number" ? ' · NTRP ' + m.ntrp.toFixed(1) : '') + '</p>' +
        '<label class="share-label">아이디 변경</label>' +
        '<div class="share-box"><input id="acc-newid" type="text" autocomplete="off" value="' + esc(m ? (m.loginId || "") : "") + '" /></div>' +
        '<p class="warn" id="acc-idwarn" hidden></p>' +
        '<p class="ok-msg" id="acc-idok" hidden>✅ 아이디가 변경되었습니다.</p>' +
        '<button id="acc-chid" class="btn btn-ghost">아이디 변경</button>' +
        '<hr class="modal-hr" />' +
        '<label class="share-label">비밀번호 변경</label>' +
        '<div class="share-box"><input id="acc-curpw" type="password" placeholder="현재 비밀번호" autocomplete="off" /></div>' +
        '<div class="share-box"><input id="acc-newpw" type="password" placeholder="새 비밀번호" autocomplete="off" /></div>' +
        '<p class="warn" id="acc-pwwarn" hidden></p>' +
        '<p class="ok-msg" id="acc-pwok" hidden>✅ 비밀번호가 변경되었습니다.</p>' +
        '<button id="acc-chpw" class="btn btn-primary btn-lg">비밀번호 변경</button>' +
        '<hr class="modal-hr" />' +
        '<button id="acc-logout" class="btn btn-danger">로그아웃</button>' +
        '<button class="btn btn-ghost modal-close">닫기</button>';
    } else if (mode === "signup") {
      inner =
        '<h3>회원가입</h3>' +
        '<p class="muted">가입 후 관리자 승인을 받으면 로그인할 수 있습니다.</p>' +
        '<label class="share-label">아이디</label><div class="share-box"><input id="acc-id" type="text" autocomplete="off" maxlength="20" /></div>' +
        '<label class="share-label">비밀번호</label><div class="share-box"><input id="acc-pw" type="password" autocomplete="off" maxlength="30" /></div>' +
        '<label class="share-label">이름</label><div class="share-box"><input id="acc-name" type="text" autocomplete="off" maxlength="20" /></div>' +
        '<label class="share-label">이메일 (비밀번호 찾기용)</label><div class="share-box"><input id="acc-email" type="email" autocomplete="off" placeholder="example@gmail.com" /></div>' +
        '<label class="share-label">소속 클럽</label>' +
        '<div class="seg seg-wide" id="acc-club">' +
          '<button type="button" data-club="sat" class="active">토요일</button>' +
          '<button type="button" data-club="sun">일요일</button>' +
          '<button type="button" data-club="both">둘다</button>' +
        '</div>' +
        '<label class="share-label">NTRP 실력 (필수)</label><div class="share-box"><select id="acc-ntrp">' + ntrpOptionsHtml() + '</select></div>' +
        '<p class="warn" id="acc-warn" hidden></p>' +
        '<p class="ok-msg" id="acc-ok" hidden>✅ 가입 신청 완료! 관리자 승인 후 로그인하세요.</p>' +
        '<button id="acc-signup" class="btn btn-primary btn-lg">가입 신청</button>' +
        (UI.ntrpGuideHtml ? UI.ntrpGuideHtml() : "") +
        '<button id="acc-tologin" class="btn btn-ghost">이미 회원이세요? 로그인</button>' +
        '<button class="btn btn-ghost modal-close">닫기</button>';
    } else {
      inner =
        '<h3>회원 로그인</h3>' +
        '<label class="share-label">아이디</label><div class="share-box"><input id="acc-id" type="text" autocomplete="username" /></div>' +
        '<label class="share-label">비밀번호</label><div class="share-box"><input id="acc-pw" type="password" autocomplete="current-password" /></div>' +
        '<p class="warn" id="acc-warn" hidden></p>' +
        '<button id="acc-login" class="btn btn-primary btn-lg">로그인</button>' +
        '<button id="acc-tosignup" class="btn btn-ghost">처음이세요? 회원가입</button>' +
        '<button id="acc-forgot" class="btn btn-ghost">아이디·비밀번호 찾기</button>' +
        '<button class="btn btn-ghost modal-close">닫기</button>';
    }
    root.innerHTML = '<div class="modal-backdrop"><div class="modal">' + inner + '</div></div>';
    bindModalCommon(root);
    bindSegToggles(root);

    const loginBtn = root.querySelector("#acc-login");
    if (loginBtn) loginBtn.addEventListener("click", function () {
      const warn = root.querySelector("#acc-warn");
      const res = S.memberLogin(root.querySelector("#acc-id").value, root.querySelector("#acc-pw").value);
      if (res.ok) {
        setMemberAuth(res.member.id);
        S.setActiveClub(allowedClubs()[0]);
        closeModal();
        applyRoleUI(); renderHeader(); go("draw");
      } else {
        warn.hidden = false;
        warn.textContent = res.reason === "pending"
          ? "아직 관리자 승인 대기 중입니다."
          : "아이디 또는 비밀번호가 올바르지 않습니다.";
      }
    });

    const signupBtn = root.querySelector("#acc-signup");
    if (signupBtn) signupBtn.addEventListener("click", function () {
      const id = (root.querySelector("#acc-id").value || "").trim();
      const pw = (root.querySelector("#acc-pw").value || "").trim();
      const name = (root.querySelector("#acc-name").value || "").trim();
      const email = (root.querySelector("#acc-email").value || "").trim();
      const ntrp = root.querySelector("#acc-ntrp").value;
      const club = segValue(root, "#acc-club");
      const warn = root.querySelector("#acc-warn");
      const ok = root.querySelector("#acc-ok");
      ok.hidden = true;
      if (!id) { warn.textContent = "아이디를 입력하세요."; warn.hidden = false; return; }
      if (!pw) { warn.textContent = "비밀번호를 입력하세요."; warn.hidden = false; return; }
      if (S.findDuplicateLoginId(id)) { warn.textContent = "이미 사용 중인 아이디입니다."; warn.hidden = false; return; }
      if (!name) { warn.textContent = "이름을 입력하세요."; warn.hidden = false; return; }
      if (!email || email.indexOf("@") < 0) { warn.textContent = "이메일을 입력하세요. (비밀번호 찾기에 필요)"; warn.hidden = false; return; }
      if (!ntrp) { warn.textContent = "NTRP 실력을 선택하세요. (모르면 NTRP 안내를 참고하세요)"; warn.hidden = false; return; }
      warn.hidden = true;
      signupBtn.disabled = true; signupBtn.textContent = "신청 중…";
      Promise.resolve(Sync.submitSignup(name, ntrp, id, pw, club, email)).then(function () {
        ok.hidden = false; signupBtn.disabled = false; signupBtn.textContent = "가입 신청";
      }).catch(function () {
        warn.textContent = "신청에 실패했습니다. 잠시 후 다시 시도하세요."; warn.hidden = false;
        signupBtn.disabled = false; signupBtn.textContent = "가입 신청";
      });
    });

    const toSignup = root.querySelector("#acc-tosignup");
    if (toSignup) toSignup.addEventListener("click", function () { openAccountModal("signup"); });
    const toLogin = root.querySelector("#acc-tologin");
    if (toLogin) toLogin.addEventListener("click", function () { openAccountModal("login"); });
    const logoutBtn = root.querySelector("#acc-logout");
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      clearMemberAuth(); closeModal(); applyRoleUI(); renderHeader(); go("draw");
    });

    const chpwBtn = root.querySelector("#acc-chpw");
    if (chpwBtn) chpwBtn.addEventListener("click", function () {
      const cur = (root.querySelector("#acc-curpw").value || "").trim();
      const nw = (root.querySelector("#acc-newpw").value || "").trim();
      const w = root.querySelector("#acc-pwwarn"); const okm = root.querySelector("#acc-pwok");
      okm.hidden = true;
      const me = S.getMember(memberAuthId);
      if (!me) { w.textContent = "로그인이 필요합니다."; w.hidden = false; return; }
      if (cur !== me.loginPw) { w.textContent = "현재 비밀번호가 올바르지 않습니다."; w.hidden = false; return; }
      if (!nw) { w.textContent = "새 비밀번호를 입력하세요."; w.hidden = false; return; }
      w.hidden = true;
      S.setMemberPassword(memberAuthId, nw);
      if (Sync.getMode() === "cloud") Sync.memberPush();
      root.querySelector("#acc-curpw").value = ""; root.querySelector("#acc-newpw").value = "";
      okm.hidden = false;
    });

    const chidBtn = root.querySelector("#acc-chid");
    if (chidBtn) chidBtn.addEventListener("click", function () {
      const nid = (root.querySelector("#acc-newid").value || "").trim();
      const w = root.querySelector("#acc-idwarn"); const okm = root.querySelector("#acc-idok");
      okm.hidden = true;
      if (!nid) { w.textContent = "아이디를 입력하세요."; w.hidden = false; return; }
      if (S.activeMembers().some(function (x) { return x.id !== memberAuthId && x.loginId === nid; })) {
        w.textContent = "이미 사용 중인 아이디입니다."; w.hidden = false; return;
      }
      w.hidden = true;
      S.updateMember(memberAuthId, { loginId: nid });
      if (Sync.getMode() === "cloud") Sync.memberPush();
      okm.hidden = false;
    });

    const forgotBtn = root.querySelector("#acc-forgot");
    if (forgotBtn) forgotBtn.addEventListener("click", function () { openRecoveryModal("member"); });

    const firstInput = root.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  function ntrpOptionsHtml() {
    let html = '<option value="">선택 안 함</option>';
    for (let v = 1.0; v <= 7.0001; v += 0.5) {
      const s = v.toFixed(1);
      html += '<option value="' + s + '">' + s + '</option>';
    }
    return html;
  }

  // ── 관리자 로그인 모달 (ID/PW) → Promise<{id,pw}|null> ───────────────
  function loginModal() {
    return new Promise(function (resolve) {
      const root = global.document.getElementById("modal-root");
      root.innerHTML =
        '<div class="modal-backdrop"><div class="modal">' +
          '<h3>관리자 로그인</h3>' +
          '<p class="muted">관리자 아이디와 비밀번호를 입력하세요.</p>' +
          '<label class="share-label">아이디</label>' +
          '<div class="share-box"><input id="login-id" type="text" autocomplete="username" placeholder="admin" /></div>' +
          '<label class="share-label">비밀번호</label>' +
          '<div class="share-box"><input id="login-pw" type="password" autocomplete="current-password" placeholder="비밀번호" /></div>' +
          '<p class="warn" id="login-warn" hidden></p>' +
          '<button id="login-ok" class="btn btn-primary btn-lg">로그인</button>' +
          '<button id="login-forgot" class="btn btn-ghost">아이디·비밀번호 찾기</button>' +
          '<button id="login-member" class="btn btn-ghost">회원으로 보기</button>' +
        '</div></div>';
      const idI = root.querySelector("#login-id");
      const pwI = root.querySelector("#login-pw");
      idI.focus();
      const fb = root.querySelector("#login-forgot");
      if (fb) fb.addEventListener("click", function () { openRecoveryModal("admin"); });
      function submit() {
        const id = (idI.value || "").trim();
        const pw = (pwI.value || "").trim();
        if (!id || !pw) {
          const w = root.querySelector("#login-warn");
          w.textContent = "아이디와 비밀번호를 입력하세요."; w.hidden = false; return;
        }
        closeModal(); resolve({ id: id, pw: pw });
      }
      root.querySelector("#login-ok").addEventListener("click", submit);
      pwI.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      idI.addEventListener("keydown", function (e) { if (e.key === "Enter") pwI.focus(); });
      root.querySelector("#login-member").addEventListener("click", function () { closeModal(); resolve(null); });
    });
  }

  function repListHtml() {
    const reps = S.repAdmins();
    if (!reps.length) return '<p class="muted small" style="margin:6px 2px">등록된 대표관리자가 없습니다.</p>';
    return '<ul class="rep-list">' + reps.map(function (r) {
      return '<li class="rep-item"><span class="rep-name">' + esc(r.name) + '</span>' +
        '<span class="badge badge-regular">' + CLUB_LABEL[r.scope] + '</span>' +
        '<span class="muted small rep-id">' + esc(r.loginId) + '</span>' +
        '<button class="icon-btn rep-del" data-id="' + r.id + '" title="삭제">🗑</button></li>';
    }).join("") + '</ul>';
  }

  // ── 설정 모달 (관리자) ───────────────────────────────────────────────
  function openSettingsModal() {
    const root = global.document.getElementById("modal-root");
    if (!root) return;

    if (!isSuper) {
      // 대표관리자: 간단 안내 + 닫기
      root.innerHTML = '<div class="modal-backdrop"><div class="modal">' +
        '<h3>설정</h3>' +
        '<p class="muted">대표관리자(' + CLUB_LABEL[adminScope] + ' 담당)로 로그인 중입니다.<br>' +
        '로그인 정보 변경·데이터 초기화는 총괄관리자에게 문의하세요.</p>' +
        '<button id="admin-logout" class="btn btn-danger">로그아웃</button>' +
        '<button class="btn btn-ghost modal-close">닫기</button>' +
        '</div></div>';
      bindModalCommon(root);
      bindAdminLogout(root);
      return;
    }

    const cred = S.adminCreds();
    root.innerHTML =
      '<div class="modal-backdrop"><div class="modal">' +
        '<h3>설정 <span class="muted small">총괄관리자</span></h3>' +
        '<label class="share-label">총괄 아이디</label>' +
        '<div class="share-box"><input id="set-id" type="text" value="' + cred.id + '" /></div>' +
        '<label class="share-label">새 비밀번호</label>' +
        '<div class="share-box"><input id="set-pw" type="password" placeholder="새 비밀번호" /></div>' +
        '<label class="share-label">새 비밀번호 확인</label>' +
        '<div class="share-box"><input id="set-pw2" type="password" placeholder="다시 입력" /></div>' +
        '<p class="warn" id="set-warn" hidden></p>' +
        '<p class="ok-msg" id="set-ok" hidden>✅ 변경되었습니다.</p>' +
        '<button id="set-save" class="btn btn-primary btn-lg">로그인 정보 변경</button>' +

        '<hr class="modal-hr" />' +
        '<h4 class="modal-sub">대표관리자</h4>' +
        '<p class="muted small" style="margin:0 2px 8px">요일별 클럽을 관리할 대표관리자를 추가합니다.</p>' +
        '<div id="rep-list">' + repListHtml() + '</div>' +
        '<label class="share-label">새 대표관리자</label>' +
        '<div class="share-box"><input id="rep-name" type="text" placeholder="이름" /></div>' +
        '<div class="share-box"><input id="rep-id" type="text" placeholder="아이디" autocomplete="off" /></div>' +
        '<div class="share-box"><input id="rep-pw" type="password" placeholder="비밀번호" autocomplete="off" /></div>' +
        '<div class="seg seg-wide" id="rep-scope">' +
          '<button type="button" data-club="sat" class="active">토요일</button>' +
          '<button type="button" data-club="sun">일요일</button>' +
          '<button type="button" data-club="both">둘다</button>' +
        '</div>' +
        '<p class="warn" id="rep-warn" hidden></p>' +
        '<button id="rep-add" class="btn btn-ghost">대표관리자 추가</button>' +

        '<hr class="modal-hr" />' +
        '<button id="admin-logout" class="btn btn-ghost">로그아웃</button>' +
        '<button id="set-reset" class="btn btn-danger">모든 데이터 초기화</button>' +
        '<button class="btn btn-ghost modal-close">닫기</button>' +
      '</div></div>';
    bindModalCommon(root);
    bindSegToggles(root);
    bindAdminLogout(root);

    root.querySelector("#set-save").addEventListener("click", function () {
      const id = (root.querySelector("#set-id").value || "").trim();
      const pw = (root.querySelector("#set-pw").value || "").trim();
      const pw2 = (root.querySelector("#set-pw2").value || "").trim();
      const warn = root.querySelector("#set-warn");
      const ok = root.querySelector("#set-ok");
      ok.hidden = true;
      if (!id) { warn.textContent = "아이디를 입력하세요."; warn.hidden = false; return; }
      if (!pw) { warn.textContent = "새 비밀번호를 입력하세요."; warn.hidden = false; return; }
      if (pw !== pw2) { warn.textContent = "새 비밀번호가 서로 다릅니다."; warn.hidden = false; return; }
      warn.hidden = true;
      S.setAdminCreds(id, pw);
      if (Sync.getMode() === "cloud") Sync.pushNow();
      ok.hidden = false;
    });

    root.querySelector("#rep-add").addEventListener("click", function () {
      const name = (root.querySelector("#rep-name").value || "").trim();
      const id = (root.querySelector("#rep-id").value || "").trim();
      const pw = (root.querySelector("#rep-pw").value || "").trim();
      const scope = segValue(root, "#rep-scope");
      const warn = root.querySelector("#rep-warn");
      if (!id || !pw) { warn.textContent = "아이디와 비밀번호를 입력하세요."; warn.hidden = false; return; }
      if (S.adminLogin(id, pw).ok || id === S.adminCreds().id) { warn.textContent = "이미 사용 중인 아이디입니다."; warn.hidden = false; return; }
      S.addRepAdmin(name, id, pw, scope);
      if (Sync.getMode() === "cloud") Sync.pushNow();
      openSettingsModal(); // 새로고침
    });

    root.querySelectorAll(".rep-del").forEach(function (b) {
      b.addEventListener("click", function () {
        if (global.confirm("이 대표관리자를 삭제할까요?")) {
          S.removeRepAdmin(b.getAttribute("data-id"));
          if (Sync.getMode() === "cloud") Sync.pushNow();
          openSettingsModal();
        }
      });
    });

    root.querySelector("#set-reset").addEventListener("click", function () {
      if (global.confirm("모든 데이터를 초기화할까요? (회원·대진·기록·로그인 정보가 모두 삭제됩니다. 되돌릴 수 없습니다)")) {
        Storage.clear(Sync.getRoomCode() || "LOCAL");
        S.replace(S.defaultState());
        if (Sync.getMode() === "cloud") Sync.pushNow();
        closeModal();
        go("members");
      }
    });
  }

  // ── 아이디/비밀번호 찾기 (이메일 4자리 코드) ─────────────────────────
  const ADMIN_RECOVERY_EMAIL = "pronow25@gmail.com";
  function openRecoveryModal(kind) {
    const root = global.document.getElementById("modal-root");
    if (!root) return;
    const rec = { kind: kind, step: kind === "admin" ? "send" : "email", code: null, members: [], email: "", sentVia: "" };

    function renderRec() {
      let inner;
      if (rec.step === "email") {
        inner = '<h3>아이디·비밀번호 찾기</h3>' +
          '<p class="muted">가입 때 등록한 이메일을 입력하면 인증코드를 보냅니다.</p>' +
          '<label class="share-label">이메일</label><div class="share-box"><input id="rec-email" type="email" placeholder="example@gmail.com" /></div>' +
          '<p class="warn" id="rec-warn" hidden></p>' +
          '<button id="rec-send" class="btn btn-primary btn-lg">인증코드 받기</button>' +
          '<button class="btn btn-ghost modal-close">닫기</button>';
      } else if (rec.step === "send") {
        inner = '<h3>관리자 계정 복구</h3>' +
          '<p class="muted">관리자 인증 이메일 <b>' + ADMIN_RECOVERY_EMAIL + '</b> 로 인증코드를 보냅니다.</p>' +
          '<p class="warn" id="rec-warn" hidden></p>' +
          '<button id="rec-send" class="btn btn-primary btn-lg">인증코드 발송</button>' +
          '<button class="btn btn-ghost modal-close">닫기</button>';
      } else if (rec.step === "code") {
        inner = '<h3>인증코드 입력</h3>' +
          '<p class="muted">' + esc(rec.sentVia) + '</p>' +
          '<label class="share-label">인증코드 (4자리)</label><div class="share-box"><input id="rec-code" type="text" inputmode="numeric" maxlength="4" /></div>' +
          '<p class="warn" id="rec-warn" hidden></p>' +
          '<button id="rec-verify" class="btn btn-primary btn-lg">확인</button>' +
          '<button id="rec-resend" class="btn btn-ghost">코드 다시 보내기</button>' +
          '<button class="btn btn-ghost modal-close">닫기</button>';
      } else if (rec.step === "reset") {
        if (kind === "member") {
          const ids = rec.members.map(function (m) {
            return '<li>' + esc(m.name) + ' — 아이디: <b>' + esc(m.loginId || "(없음)") + '</b></li>';
          }).join("");
          inner = '<h3>아이디 확인 · 비밀번호 재설정</h3>' +
            '<ul class="rec-ids">' + ids + '</ul>' +
            '<label class="share-label">새 비밀번호</label><div class="share-box"><input id="rec-newpw" type="password" /></div>' +
            '<p class="warn" id="rec-warn" hidden></p><p class="ok-msg" id="rec-ok" hidden>✅ 재설정 완료! 새 비밀번호로 로그인하세요.</p>' +
            '<button id="rec-reset" class="btn btn-primary btn-lg">비밀번호 재설정</button>' +
            '<button class="btn btn-ghost modal-close">닫기</button>';
        } else {
          inner = '<h3>관리자 로그인 정보 재설정</h3>' +
            '<label class="share-label">새 아이디</label><div class="share-box"><input id="rec-newid" type="text" value="' + esc(S.adminCreds().id) + '" /></div>' +
            '<label class="share-label">새 비밀번호</label><div class="share-box"><input id="rec-newpw" type="password" /></div>' +
            '<p class="warn" id="rec-warn" hidden></p><p class="ok-msg" id="rec-ok" hidden>✅ 변경 완료! 잠시 후 로그인 화면으로 갑니다.</p>' +
            '<button id="rec-reset" class="btn btn-primary btn-lg">변경</button>' +
            '<button class="btn btn-ghost modal-close">닫기</button>';
        }
      }
      root.innerHTML = '<div class="modal-backdrop"><div class="modal">' + inner + '</div></div>';
      bindModalCommon(root);
      bindRec();
    }

    function doSend(toEmail) {
      rec.code = global.TennisEmail.gen4();
      const btn = root.querySelector("#rec-send") || root.querySelector("#rec-resend");
      if (btn) { btn.disabled = true; btn.textContent = "발송 중…"; }
      global.TennisEmail.sendCode(toEmail, rec.code, kind === "admin" ? "관리자 계정 복구" : "비밀번호 찾기").then(function (res) {
        rec.sentVia = res.sent
          ? (toEmail + " 로 인증코드를 보냈습니다. 메일(스팸함 포함)을 확인하세요.")
          : ("⚠️ 이메일 발송이 아직 설정 전이라 화면에 표시합니다(테스트용). 인증코드: " + rec.code);
        rec.step = "code";
        renderRec();
      });
    }

    function bindRec() {
      const sendBtn = root.querySelector("#rec-send");
      if (sendBtn) sendBtn.addEventListener("click", function () {
        if (kind === "member") {
          const email = (root.querySelector("#rec-email").value || "").trim();
          const ms = S.findMembersByEmail(email);
          if (!ms.length) { const w = root.querySelector("#rec-warn"); w.textContent = "그 이메일로 가입된 회원이 없습니다."; w.hidden = false; return; }
          rec.members = ms; rec.email = email; doSend(email);
        } else { doSend(ADMIN_RECOVERY_EMAIL); }
      });
      const resendBtn = root.querySelector("#rec-resend");
      if (resendBtn) resendBtn.addEventListener("click", function () { doSend(kind === "member" ? rec.email : ADMIN_RECOVERY_EMAIL); });
      const verifyBtn = root.querySelector("#rec-verify");
      if (verifyBtn) verifyBtn.addEventListener("click", function () {
        const c = (root.querySelector("#rec-code").value || "").trim();
        const w = root.querySelector("#rec-warn");
        if (c !== rec.code) { w.textContent = "인증코드가 일치하지 않습니다."; w.hidden = false; return; }
        rec.step = "reset"; renderRec();
      });
      const resetBtn = root.querySelector("#rec-reset");
      if (resetBtn) resetBtn.addEventListener("click", function () {
        const nw = (root.querySelector("#rec-newpw").value || "").trim();
        const w = root.querySelector("#rec-warn"); const okm = root.querySelector("#rec-ok");
        if (!nw) { w.textContent = "새 비밀번호를 입력하세요."; w.hidden = false; return; }
        w.hidden = true;
        if (kind === "member") {
          rec.members.forEach(function (m) { S.setMemberPassword(m.id, nw); });
          if (Sync.getMode() === "cloud") Sync.memberPush();
          okm.hidden = false;
        } else {
          const nid = (root.querySelector("#rec-newid").value || "").trim() || S.adminCreds().id;
          S.setAdminCreds(nid, nw);
          if (Sync.getMode() === "cloud") Sync.pushNow();
          okm.hidden = false;
          setTimeout(function () { clearAdminAuth(); global.location.reload(); }, 1800);
        }
      });
    }

    renderRec();
  }

  // ── 공유 모달 ─────────────────────────────────────────────────────────
  function openShareModal() {
    const root = global.document.getElementById("modal-root");
    if (!root) return;

    let inner;
    if (Sync.getMode() !== "cloud") {
      inner =
        '<h3>실시간 공유를 켜려면</h3>' +
        '<p class="muted">실시간으로 같이 보려면 Supabase 설정이 필요합니다. ' +
        '<b>config.js</b> 에 키를 넣고 배포하면 켜집니다. (README 참고)</p>' +
        '<button class="btn btn-ghost modal-close">닫기</button>';
    } else {
      const base = Sync.memberUrl();
      const sep = base.indexOf("?") >= 0 ? "&" : "?";
      const satUrl = base + sep + "club=sat";
      const sunUrl = base + sep + "club=sun";
      inner =
        '<h3>링크 공유</h3>' +
        '<p class="muted"><b>각 클럽 회원에게 해당 링크만</b> 공유하세요. 그 링크로 들어오면 그 클럽 내용만 보입니다.</p>' +
        '<label class="share-label">🟩 토요일 클럽 회원 링크</label>' +
        '<div class="share-box"><input id="sat-url" type="text" readonly value="' + satUrl + '" /></div>' +
        '<button id="copy-sat" class="btn btn-primary btn-lg">토요일 링크 복사</button>' +
        '<label class="share-label">🟦 일요일 클럽 회원 링크</label>' +
        '<div class="share-box"><input id="sun-url" type="text" readonly value="' + sunUrl + '" /></div>' +
        '<button id="copy-sun" class="btn btn-primary btn-lg">일요일 링크 복사</button>' +
        '<label class="share-label">🔑 관리자 링크 (본인 보관용)</label>' +
        '<div class="share-box"><input id="admin-url" type="text" readonly value="' + Sync.adminUrl() + '" /></div>' +
        '<button id="copy-admin" class="btn btn-ghost">관리자 링크 복사</button>' +
        '<button class="btn btn-ghost modal-close">닫기</button>';
    }
    root.innerHTML = '<div class="modal-backdrop"><div class="modal">' + inner + '</div></div>';
    bindModalCommon(root);
    setupCopy(root, "#copy-sat", "#sat-url");
    setupCopy(root, "#copy-sun", "#sun-url");
    setupCopy(root, "#copy-admin", "#admin-url");
  }

  function setupCopy(root, btnSel, inputSel) {
    const btn = root.querySelector(btnSel);
    if (!btn) return;
    btn.addEventListener("click", function () {
      const input = root.querySelector(inputSel);
      input.select();
      const label = btn.textContent;
      const done = function () { btn.textContent = "복사됨 ✓"; setTimeout(function () { btn.textContent = label; }, 1500); };
      if (global.navigator.clipboard) {
        global.navigator.clipboard.writeText(input.value).then(done, function () { global.document.execCommand("copy"); done(); });
      } else { global.document.execCommand("copy"); done(); }
    });
  }

  function bindModalCommon(root) {
    root.querySelectorAll(".modal-close").forEach(function (b) { b.addEventListener("click", closeModal); });
    const backdrop = root.querySelector(".modal-backdrop");
    if (backdrop) backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModal(); });
  }

  // 세그먼트(.seg) 토글: 클릭 시 active 이동
  function bindSegToggles(root) {
    root.querySelectorAll(".seg").forEach(function (seg) {
      seg.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
          b.classList.add("active");
        });
      });
    });
  }
  function segValue(root, sel) {
    const a = root.querySelector(sel + " button.active");
    return a ? a.getAttribute("data-club") : "";
  }

  function bindAdminLogout(root) {
    const b = root.querySelector("#admin-logout");
    if (b) b.addEventListener("click", function () {
      if (global.confirm("로그아웃할까요?")) { clearAdminAuth(); global.location.reload(); }
    });
  }

  function closeModal() {
    const root = global.document.getElementById("modal-root");
    if (root) root.innerHTML = "";
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else { init(); }

  UI.go = go;
})(typeof window !== "undefined" ? window : this);
