/*
 * ui/members.js — 회원 관리 (관리자) : 승인 대기 + 정기/게스트, 생년월일
 * 전역: window.TennisUI.members
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const UI = (global.TennisUI = global.TennisUI || {});

  // 트리 섹션 상태: 펼침 여부(기본 접힘, 헤더 클릭 시 펼침) + 검색어
  const secOpen = { regular: false, guest: false };
  const secQuery = { regular: "", guest: "" };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ntrpOptions(selected) {
    let html = '<option value="">NTRP</option>';
    for (let v = 1.0; v <= 7.0001; v += 0.5) {
      const s = v.toFixed(1);
      html += '<option value="' + s + '"' + (String(selected) === s ? " selected" : "") + '>' + s + '</option>';
    }
    return html;
  }

  function ntrpBadge(m) {
    return (typeof m.ntrp === "number") ? '<span class="ntrp-badge">' + m.ntrp.toFixed(1) + '</span>' : '';
  }

  const CLUB_SHORT = { sat: "토", sun: "일", both: "토·일" };
  function clubOf(m) { return m.club || "both"; }
  function clubChip(m) {
    return '<button class="club-chip" data-act="club" title="클럽 변경(토→일→둘다)">' + CLUB_SHORT[clubOf(m)] + '</button>';
  }
  function clubOptions(sel) {
    return ["sat", "sun", "both"].map(function (c) {
      return '<option value="' + c + '"' + (sel === c ? " selected" : "") + '>' +
        ({ sat: "토요일", sun: "일요일", both: "둘다" })[c] + '</option>';
    }).join("");
  }
  function nextClub(c) { return c === "sat" ? "sun" : c === "sun" ? "both" : "sat"; }

  function render(container) {
    // 회원 관리는 현재 선택된 클럽 소속만 보여줌(완전 분리). '둘다'·미지정은 양쪽에 노출.
    const active = S.getActiveClub();
    const inClub = function (m) { return m.club === active || m.club === "both" || !m.club; };
    const clubFull = { sat: "토요일", sun: "일요일" }[active] || "";
    const pending = S.pendingMembers().filter(inClub);
    const members = S.clubMembers(active);
    const regulars = members.filter(function (m) { return m.type === "regular"; });
    const guests = members.filter(function (m) { return m.type === "guest"; });

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>' + clubFull + ' 회원 <span class="count-pill">' + members.length + '명</span></h2>' +
          '<p class="muted"><b>' + clubFull + ' 클럽</b> 회원만 표시됩니다. 클럽칩(토·일·둘다)으로 소속 변경, <b>🎾</b>를 눌러 <b>대진 생성 권한</b>을 부여/해제할 수 있습니다. (권한 회원은 앱 참석자 화면에서 대진을 만들 수 있어요)</p>' +
        '</div>' +

        '<div class="excel-row">' +
          '<button id="excel-down" class="btn btn-ghost">⬇️ 엑셀 다운로드</button>' +
          '<button id="excel-up" class="btn btn-ghost">⬆️ 엑셀 업로드</button>' +
        '</div>' +
        '<p class="muted small excel-hint">엑셀 컬럼: <b>이름</b> · <b>아이디</b> · <b>비밀번호</b> · <b>구분</b>(정기/게스트) · <b>NTRP</b>(1.0~7.0) · <b>이메일</b>. 관리자가 임시 아이디/비밀번호를 만들어 올리면 회원이 로그인 후 직접 바꿀 수 있어요.</p>' +
        (UI.ntrpGuideHtml ? UI.ntrpGuideHtml() : "") +

        pendingSection(pending) +

        '<form class="add-row" id="member-add-form">' +
          '<input type="text" id="member-name" placeholder="이름" autocomplete="off" maxlength="20" />' +
          '<select id="member-club" class="type-select">' + clubOptions(S.getActiveClub()) + '</select>' +
          '<select id="member-ntrp" class="type-select">' + ntrpOptions("") + '</select>' +
          '<select id="member-type" class="type-select">' +
            '<option value="regular">정기</option>' +
            '<option value="guest">게스트</option>' +
          '</select>' +
          '<button type="submit" class="btn btn-primary">추가</button>' +
        '</form>' +
        '<p class="warn" id="member-warn" hidden></p>' +

        section("정기 멤버", "regular", regulars) +
        section("게스트", "guest", guests) +
      '</div>';

    bind(container);
  }

  function pendingSection(list) {
    if (list.length === 0) return "";
    const rows = list.map(function (m) {
      return '<li class="member-card pending" data-id="' + m.id + '">' +
        '<div class="member-info"><span class="member-name">' + esc(m.name) + '</span>' +
          (m.loginId ? '<span class="member-sub">@' + esc(m.loginId) + ' · ' + CLUB_SHORT[clubOf(m)] + '</span>' : '') + '</div>' +
        ntrpBadge(m) +
        '<button class="btn btn-primary btn-sm" data-act="approve">승인</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="reject">거절</button>' +
      '</li>';
    }).join("");
    return '<div class="member-section pending-box">' +
      '<h3>승인 대기 <span class="count-pill pill-guest">' + list.length + '</span></h3>' +
      '<ul class="member-list">' + rows + '</ul></div>';
  }

  // 트리(접기/펼치기) + 검색 섹션
  function section(title, type, list) {
    const pill = type === "guest" ? "pill-guest" : "";
    const open = secOpen[type] !== false; // 기본 펼침
    const head =
      '<h3 class="tree-head" data-act="tree-toggle" data-tree="' + type + '">' +
        '<span class="tree-caret">' + (open ? "▼" : "▶") + '</span> ' + title +
        ' <span class="count-pill ' + pill + '">' + list.length + '</span></h3>';
    if (list.length === 0) {
      return '<div class="member-section tree' + (open ? "" : " collapsed") + '" data-tree-sec="' + type + '">' +
        head + '<div class="tree-body"><p class="empty">아직 없습니다.</p></div></div>';
    }
    const rows = list.map(function (m) {
      return '<li class="member-card" data-id="' + m.id + '" data-name="' + esc(m.name).toLowerCase() + '">' +
        '<div class="member-info"><span class="member-name">' + esc(m.name) + '</span>' +
          (m.loginId ? '<span class="member-sub">@' + esc(m.loginId) + '</span>' : '<span class="member-sub muted">아이디 없음</span>') + '</div>' +
        ntrpBadge(m) +
        clubChip(m) +
        '<span class="badge ' + (m.type === "guest" ? "badge-guest" : "badge-regular") + '">' +
          (m.type === "guest" ? "게스트" : "정기") + '</span>' +
        '<button class="icon-btn' + (S.canGenerateDraw(m.id) ? ' permit-on' : '') + '" data-act="permit" title="대진 생성 권한 부여/해제">🎾</button>' +
        '<button class="icon-btn" data-act="edit" title="정보 수정">✏️</button>' +
        '<button class="icon-btn" data-act="toggle" title="정기/게스트 전환">🔁</button>' +
        '<button class="icon-btn" data-act="del" title="삭제">🗑</button>' +
      '</li>';
    }).join("");
    return '<div class="member-section tree' + (open ? "" : " collapsed") + '" data-tree-sec="' + type + '">' +
      head +
      '<div class="tree-body">' +
        '<input type="text" class="tree-search" data-tree-search="' + type + '" placeholder="🔍 이름 검색" value="' + esc(secQuery[type] || "") + '" />' +
        '<ul class="member-list">' + rows + '</ul>' +
      '</div></div>';
  }

  function bind(container) {
    // 트리 접기/펼치기 (회원 / 게스트)
    container.querySelectorAll('[data-act="tree-toggle"]').forEach(function (h) {
      h.addEventListener("click", function () {
        const type = h.getAttribute("data-tree");
        secOpen[type] = !secOpen[type];
        const sec = container.querySelector('[data-tree-sec="' + type + '"]');
        const caret = h.querySelector('.tree-caret');
        if (sec) sec.classList.toggle("collapsed", !secOpen[type]);
        if (caret) caret.textContent = secOpen[type] ? "▼" : "▶";
      });
    });
    // 트리 검색 (이름 필터, 재렌더 없이 행 숨김)
    container.querySelectorAll('.tree-search').forEach(function (inp) {
      inp.addEventListener("click", function (e) { e.stopPropagation(); });
      inp.addEventListener("input", function () {
        const type = inp.getAttribute("data-tree-search");
        const q = inp.value.trim().toLowerCase();
        secQuery[type] = q;
        const sec = container.querySelector('[data-tree-sec="' + type + '"]');
        if (!sec) return;
        sec.querySelectorAll('.member-card').forEach(function (li) {
          const name = li.getAttribute("data-name") || "";
          li.style.display = (!q || name.indexOf(q) >= 0) ? "" : "none";
        });
      });
      // 재렌더 후 기존 검색어 다시 적용
      if (inp.value.trim()) inp.dispatchEvent(new global.Event("input"));
    });

    // 엑셀 다운로드/업로드
    const downBtn = container.querySelector("#excel-down");
    if (downBtn) downBtn.addEventListener("click", function () {
      const Excel = global.TennisExcel;
      downBtn.disabled = true;
      Promise.resolve(Excel.exportMembers(S.activeMembers())).then(function () {
        downBtn.disabled = false;
      }).catch(function (e) { downBtn.disabled = false; global.alert("다운로드 실패: " + e.message); });
    });
    const upBtn = container.querySelector("#excel-up");
    if (upBtn) upBtn.addEventListener("click", function () {
      const input = global.document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.xls,.csv";
      input.onchange = function () {
        const f = input.files && input.files[0];
        if (!f) return;
        upBtn.disabled = true; upBtn.textContent = "업로드 중…";
        global.TennisExcel.importMembers(f).then(function (rows) {
          const existing = {};
          S.activeMembers().forEach(function (m) { existing[m.name] = true; });
          const club = S.getActiveClub();
          let added = 0, skipped = 0;
          rows.forEach(function (r) {
            if (existing[r.name]) { skipped++; return; }
            const mm = S.addMember(r.name, r.type, r.ntrp, club);
            if (mm && (r.loginId || r.loginPw || r.email)) {
              S.updateMember(mm.id, {
                loginId: (r.loginId || "").trim(),
                loginPw: (r.loginPw || "").trim(),
                email: (r.email || "").trim().toLowerCase()
              });
            }
            existing[r.name] = true; added++;
          });
          upBtn.disabled = false; upBtn.textContent = "⬆️ 엑셀 업로드";
          if (rows.length === 0) {
            global.alert("인식된 회원이 없습니다.\n첫 줄에 '이름' 헤더가 있는지 확인하세요.");
          } else {
            global.alert(added + "명 추가됨" + (skipped ? " · " + skipped + "명 중복 건너뜀" : ""));
          }
        }).catch(function (e) {
          upBtn.disabled = false; upBtn.textContent = "⬆️ 엑셀 업로드";
          global.alert("업로드 실패: " + e.message);
        });
      };
      input.click();
    });

    const form = container.querySelector("#member-add-form");
    const nameInput = container.querySelector("#member-name");
    const ntrpSel = container.querySelector("#member-ntrp");
    const clubSel = container.querySelector("#member-club");
    const typeSel = container.querySelector("#member-type");
    const warn = container.querySelector("#member-warn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      if (S.findDuplicateName(name) && form.dataset.dupConfirm !== name) {
        warn.textContent = '"' + name + '" 이름이 이미 있습니다. 한 번 더 누르면 추가합니다.';
        warn.hidden = false; form.dataset.dupConfirm = name; return;
      }
      S.addMember(name, typeSel.value, ntrpSel.value, clubSel.value);
      nameInput.value = ""; ntrpSel.value = ""; warn.hidden = true;
      form.dataset.dupConfirm = ""; nameInput.focus();
    });

    // 승인 대기 처리
    container.querySelectorAll(".member-card.pending").forEach(function (card) {
      const id = card.getAttribute("data-id");
      card.querySelector('[data-act="approve"]').addEventListener("click", function () {
        S.approveMember(id);
      });
      card.querySelector('[data-act="reject"]').addEventListener("click", function () {
        if (global.confirm("이 가입 신청을 거절할까요?")) S.removeMember(id);
      });
    });

    // 등록 회원 관리
    container.querySelectorAll('.member-card:not(.pending)').forEach(function (card) {
      const id = card.getAttribute("data-id");
      const editBtn = card.querySelector('[data-act="edit"]');
      const toggleBtn = card.querySelector('[data-act="toggle"]');
      const delBtn = card.querySelector('[data-act="del"]');
      const clubBtn = card.querySelector('[data-act="club"]');
      const permitBtn = card.querySelector('[data-act="permit"]');
      if (permitBtn) permitBtn.addEventListener("click", function () {
        S.setDrawPermit(id, !S.canGenerateDraw(id));
      });
      if (clubBtn) clubBtn.addEventListener("click", function () {
        const m = S.activeMembers().find(function (x) { return x.id === id; });
        if (m) S.setMemberClub(id, nextClub(clubOf(m)));
      });
      if (editBtn) editBtn.addEventListener("click", function () { openEditModal(id); });
      if (toggleBtn) toggleBtn.addEventListener("click", function () {
        const m = S.activeMembers().find(function (x) { return x.id === id; });
        if (m) S.updateMember(id, { type: m.type === "guest" ? "regular" : "guest" });
      });
      if (delBtn) delBtn.addEventListener("click", function () {
        if (global.confirm("삭제하시겠어요? (출석/대진에서 제외됩니다)")) S.removeMember(id);
      });
    });
  }

  // 회원 전체 정보 수정 모달 (이름·아이디·비밀번호·NTRP·구분·클럽)
  function openEditModal(id) {
    const m = S.getMember(id);
    const root = global.document.getElementById("modal-root");
    if (!m || !root) return;
    function segBtns(name, opts, cur) {
      return '<div class="seg seg-wide" id="' + name + '">' + opts.map(function (o) {
        return '<button type="button" data-v="' + o[0] + '" class="' + (cur === o[0] ? "active" : "") + '">' + o[1] + '</button>';
      }).join("") + '</div>';
    }
    root.innerHTML = '<div class="modal-backdrop"><div class="modal">' +
      '<h3>회원 정보 수정</h3>' +
      '<label class="share-label">이름</label><div class="share-box"><input id="ed-name" type="text" value="' + esc(m.name) + '" /></div>' +
      '<label class="share-label">아이디</label><div class="share-box"><input id="ed-id" type="text" autocomplete="off" value="' + esc(m.loginId || "") + '" /></div>' +
      '<label class="share-label">비밀번호</label><div class="share-box"><input id="ed-pw" type="text" autocomplete="off" value="' + esc(m.loginPw || "") + '" /></div>' +
      '<label class="share-label">이메일</label><div class="share-box"><input id="ed-email" type="email" autocomplete="off" value="' + esc(m.email || "") + '" /></div>' +
      '<label class="share-label">NTRP</label><div class="share-box"><select id="ed-ntrp">' + ntrpOptions(m.ntrp != null ? m.ntrp.toFixed(1) : "") + '</select></div>' +
      '<label class="share-label">구분</label>' + segBtns("ed-type", [["regular", "정기"], ["guest", "게스트"]], m.type === "guest" ? "guest" : "regular") +
      '<label class="share-label">클럽</label>' + segBtns("ed-club", [["sat", "토요일"], ["sun", "일요일"], ["both", "둘다"]], clubOf(m)) +
      '<p class="warn" id="ed-warn" hidden></p>' +
      '<button id="ed-save" class="btn btn-primary btn-lg">저장</button>' +
      '<button id="ed-del" class="btn btn-danger">회원 삭제</button>' +
      '<button class="btn btn-ghost ed-close">닫기</button>' +
      '</div></div>';

    function close() { root.innerHTML = ""; }
    function segV(sel) { const a = root.querySelector(sel + " button.active"); return a ? a.getAttribute("data-v") : ""; }
    root.querySelectorAll(".seg").forEach(function (seg) {
      seg.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
          b.classList.add("active");
        });
      });
    });
    root.querySelectorAll(".ed-close").forEach(function (b) { b.addEventListener("click", close); });
    const bd = root.querySelector(".modal-backdrop");
    if (bd) bd.addEventListener("click", function (e) { if (e.target === bd) close(); });

    root.querySelector("#ed-save").addEventListener("click", function () {
      const name = (root.querySelector("#ed-name").value || "").trim();
      const lid = (root.querySelector("#ed-id").value || "").trim();
      const lpw = (root.querySelector("#ed-pw").value || "").trim();
      const ntrp = root.querySelector("#ed-ntrp").value;
      const warn = root.querySelector("#ed-warn");
      if (!name) { warn.textContent = "이름을 입력하세요."; warn.hidden = false; return; }
      if (lid && S.activeMembers().some(function (x) { return x.id !== id && x.loginId === lid; })) {
        warn.textContent = "이미 사용 중인 아이디입니다."; warn.hidden = false; return;
      }
      const email = (root.querySelector("#ed-email").value || "").trim();
      S.updateMember(id, {
        name: name, loginId: lid, loginPw: lpw, email: email,
        ntrp: S.parseNtrp(ntrp), type: segV("#ed-type"), club: segV("#ed-club")
      });
      close();
    });
    root.querySelector("#ed-del").addEventListener("click", function () {
      if (global.confirm("이 회원을 삭제할까요? (출석/대진에서 제외됩니다)")) { S.removeMember(id); close(); }
    });
  }

  UI.members = { render: render };
})(typeof window !== "undefined" ? window : this);
