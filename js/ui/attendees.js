/*
 * ui/attendees.js — 참석자 투표 + 게스트 등록(댓글형) (회원 앱)
 *  - 위: 회원 참석 투표(이름 눌러 ✅ 토글).
 *  - 아래: 게스트를 댓글처럼 직접 입력(이름/성별/NTRP·구력) → 목록에 쌓이고 ✕로 삭제.
 *  - 변경은 회원도 허용되는 클라우드 쓰기(memberPush)로 실시간 공유.
 * 전역: window.TennisUI.attendees
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const UI = (global.TennisUI = global.TennisUI || {});

  const CLUB_LABEL = { sat: "토요일", sun: "일요일", both: "토·일" };
  // 트리 펼침 상태(기본 펼침) — 회원 / 게스트
  const treeOpen = { member: true, guest: true };
  let guestQuery = ""; // 게스트 이름 검색어(재렌더 후 유지)

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function sync() { return global.TennisSync; }
  function pushShared() {
    const s = sync();
    if (s && s.getMode && s.getMode() === "cloud") s.memberPush();
  }
  function genderBadge(m) {
    if (m.gender === "F") return '<span class="badge badge-guest">여</span>';
    if (m.gender === "M") return '<span class="badge badge-regular">남</span>';
    return "";
  }
  function skillText(m) {
    if (typeof m.ntrp === "number") return "NTRP " + m.ntrp.toFixed(1);
    if (typeof m.years === "number") return "구력 " + m.years + "년";
    return "";
  }
  function skillBadge(m) {
    const t = skillText(m);
    return t ? '<span class="ntrp-badge">' + t + '</span>' : "";
  }
  function fmtNow() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  // 출퇴근(출근/퇴근) 시간 입력 + 체류시간 — 출석한 사람만 표시
  function timeControls(id) {
    const t = (S.get().session.times || {})[id] || {};
    const stay = S.stayMinutes(t);
    return '<div class="time-row" data-id="' + id + '">' +
      '<span class="time-lbl">🟢 출근</span>' +
      '<input type="time" class="time-in" data-field="in" value="' + (t.in || "") + '" />' +
      '<button type="button" class="time-now btn-tiny" data-field="in">지금</button>' +
      '<span class="time-lbl">🔴 퇴근</span>' +
      '<input type="time" class="time-in" data-field="out" value="' + (t.out || "") + '" />' +
      '<button type="button" class="time-now btn-tiny" data-field="out">지금</button>' +
      (stay != null ? '<span class="stay-badge">체류 ' + S.fmtDuration(stay) + '</span>' : "") +
    '</div>';
  }

  // 회원 카드: 본인(mine)만 토글 가능, 나머지는 읽기 전용. 출석 시 출퇴근 시간 표시.
  function voteCard(m, present, mine) {
    return '<li class="att-card ' + (present ? "on " : "") + (mine ? "mine" : "locked") + '" data-id="' + m.id + '">' +
      '<div class="att-main"' + (mine ? ' data-act="vote" data-id="' + m.id + '"' : '') + '>' +
        '<span class="check">' + (present ? "✅" : "⬜") + '</span>' +
        '<span class="member-name">' + esc(m.name) + (mine ? ' <span class="badge badge-regular">나</span>' : '') + '</span>' +
        genderBadge(m) + skillBadge(m) +
      '</div>' +
      (present ? timeControls(m.id) : "") +
    '</li>';
  }

  // 게스트 = 체크 카드 (✅ 토글 + 메타 + ✕ 삭제). 출석 시 출퇴근 시간 표시.
  function guestComment(m, present) {
    const meta = [m.gender === "F" ? "여" : m.gender === "M" ? "남" : "", skillText(m)].filter(Boolean).join(" · ");
    return '<li class="guest-comment ' + (present ? "on" : "") + '" data-id="' + m.id + '"' +
        ' data-name="' + esc(String(m.name || "").toLowerCase()) + '" data-present="' + (present ? "1" : "0") + '">' +
      '<div class="gc-row">' +
        '<span class="gc-check" data-act="vote" data-id="' + m.id + '">' + (present ? "✅" : "⬜") + '</span>' +
        '<div class="gc-body">' +
          '<div class="gc-name">' + esc(m.name) + ' <span class="badge badge-guest">게스트</span></div>' +
          (meta ? '<div class="gc-meta muted small">' + esc(meta) + '</div>' : '') +
        '</div>' +
        '<button class="gc-del" data-act="del" data-id="' + m.id + '" title="삭제">✕</button>' +
      '</div>' +
      (present ? timeControls(m.id) : "") +
    '</li>';
  }

  // 참석 체크한 사람들(회원+게스트) 요약 칩
  function presentSummary(present) {
    if (!present.length) {
      return '<div class="present-summary empty-sum"><span class="muted small">아직 참석 체크한 사람이 없어요. 아래에서 본인 이름을 눌러 ✅ 표시하세요.</span></div>';
    }
    const chips = present.map(function (m) {
      const g = m.type === "guest";
      return '<span class="ps-chip' + (g ? " guest" : "") + '">' + esc(m.name) + (g ? ' <span class="ps-tag">G</span>' : "") + '</span>';
    }).join("");
    return '<div class="present-summary">' +
      '<div class="ps-head">✅ 참석 명단 <span class="count-pill accent">' + present.length + '</span></div>' +
      '<div class="ps-chips">' + chips + '</div>' +
    '</div>';
  }

  // 게스트 목록 필터: 검색어 있으면 이름 매칭, 없으면 '참석 체크된' 게스트만 표시 (누계 X)
  function applyGuestFilter(container) {
    const inp = container.querySelector("#g-search");
    const q = inp ? inp.value.trim().toLowerCase() : "";
    const list = container.querySelector(".guest-comments");
    if (!list) return;
    let shown = 0;
    list.querySelectorAll(".guest-comment").forEach(function (li) {
      const name = li.getAttribute("data-name") || "";
      const present = li.getAttribute("data-present") === "1";
      const match = q ? name.indexOf(q) >= 0 : present;
      li.style.display = match ? "" : "none";
      if (match) shown++;
    });
    const hint = container.querySelector("#guest-empty-hint");
    if (hint) {
      hint.style.display = shown ? "none" : "";
      hint.textContent = q
        ? "'" + inp.value.trim() + "' 게스트가 없어요. 위 ‘게스트 신청’으로 추가하세요."
        : "참석 체크된 게스트가 없어요. 이름을 검색하거나 위에서 신청하세요.";
    }
  }

  function ntrpOptions() {
    let html = '<option value="">NTRP</option>';
    for (let v = 2.0; v <= 6.0 + 1e-9; v += 0.5) { const s = v.toFixed(1); html += '<option value="' + s + '">' + s + '</option>'; }
    return html;
  }

  function render(container) {
    const st = S.get();
    const club = S.getActiveClub();
    const clubLabel = CLUB_LABEL[club] || "";
    const date = st.session.date || "";
    const att = st.session.attendance || {};
    const roster = S.clubMembers(club).filter(function (m) { return m.type !== "guest"; });
    const guests = S.clubMembers(club).filter(function (m) { return m.type === "guest"; });
    const present = S.presentMembers();

    const canGen = !!(UI.memberId && S.canGenerateDraw(UI.memberId));
    const past = S.isPastDate(date);
    const need = (st.session.mode === "singles") ? 2 : 4;

    container.innerHTML =
      '<div class="screen attendees">' +
        '<div class="screen-head">' +
          '<h2>참석자 <span class="count-pill accent">' + present.length + '명</span></h2>' +
          '<div class="draw-date-row"><label>📅 날짜</label>' +
            '<input type="date" class="date-in" id="att-date" value="' + esc(date) + '" /></div>' +
          '<p class="muted small">' + clubLabel + ' 클럽 — ' +
            (UI.memberId ? '<b>본인 이름(나)</b>을 눌러 출석을 ✅ 표시하세요.' : '로그인하면 본인 출석을 체크할 수 있어요. (우측 상단 👤)') +
            ' (실시간 공유)</p>' +
        '</div>' +

        presentSummary(present) +

        '<div class="member-section tree' + (treeOpen.member ? "" : " collapsed") + '" data-tree-sec="member">' +
          '<h3 class="tree-head" data-act="tree-toggle" data-tree="member">' +
            '<span class="tree-caret">' + (treeOpen.member ? "▼" : "▶") + '</span> 회원 ' +
            '<span class="count-pill">' + roster.length + '</span></h3>' +
          '<div class="tree-body">' +
            (roster.length
              ? '<ul class="att-list">' + roster.map(function (m) { return voteCard(m, !!att[m.id], m.id === UI.memberId); }).join("") + '</ul>'
              : '<p class="empty">아직 회원이 없습니다.</p>') +
          '</div>' +
        '</div>' +

        // ── 게스트 신청 (이름 검색 → 체크 / 신규 신청) ──
        '<div class="member-section guest-zone tree' + (treeOpen.guest ? "" : " collapsed") + '" data-tree-sec="guest">' +
          '<h3 class="tree-head" data-act="tree-toggle" data-tree="guest">' +
            '<span class="tree-caret">' + (treeOpen.guest ? "▼" : "▶") + '</span> 게스트 신청 ' +
            '<span class="count-pill pill-guest">' + guests.filter(function (m) { return !!att[m.id]; }).length + '</span></h3>' +
          '<div class="tree-body">' +
          '<form class="add-row guest-form" id="guest-form">' +
            '<input type="text" id="g-name" class="g-name-in" placeholder="이름" autocomplete="off" maxlength="20" />' +
            '<select id="g-gender" class="type-select"><option value="">성별</option><option value="M">남</option><option value="F">여</option></select>' +
            '<select id="g-ntrp" class="type-select">' + ntrpOptions() + '</select>' +
            '<input type="number" id="g-years" class="type-select num-narrow" placeholder="구력" min="0" max="60" />' +
            '<button type="submit" class="btn btn-primary">신청</button>' +
          '</form>' +
          '<p class="muted small">NTRP를 모르면 <b>구력(년)</b>만 입력해도 대진 실력 배분에 반영됩니다. 이미 신청한 이름이면 자동으로 참석 체크돼요.</p>' +
          '<input type="text" id="g-search" class="tree-search" placeholder="🔍 이름 검색 — 신청한 게스트 찾아 체크" value="' + esc(guestQuery) + '" />' +
          '<ul class="guest-comments">' + guests.map(function (m) { return guestComment(m, !!att[m.id]); }).join("") + '</ul>' +
          '<p class="empty" id="guest-empty-hint">참석 체크된 게스트가 없어요. 이름을 검색하거나 위에서 신청하세요.</p>' +
          '</div>' +
        '</div>' +

        // ── 대진 생성 (회원/게스트 추가 아래, 권한자만) ──
        (canGen
          ? (past
              ? '<p class="muted small gen-blocked">⛔ 지난 날짜(' + esc(date) + ')는 대진을 생성할 수 없습니다.</p>'
              : '<button id="member-gen" class="btn btn-primary btn-lg member-gen"' + (present.length < need ? ' disabled' : '') + '>' +
                  '🎾 대진 생성 →' + (present.length < need ? ' (' + need + '명 이상)' : '') + '</button>')
          : "") +
      '</div>';

    bind(container);
  }

  function bind(container) {
    // 트리 접기/펼치기 (회원 / 게스트)
    container.querySelectorAll('[data-act="tree-toggle"]').forEach(function (h) {
      h.addEventListener("click", function () {
        const type = h.getAttribute("data-tree");
        treeOpen[type] = !treeOpen[type];
        const sec = container.querySelector('[data-tree-sec="' + type + '"]');
        const caret = h.querySelector('.tree-caret');
        if (sec) sec.classList.toggle("collapsed", !treeOpen[type]);
        if (caret) caret.textContent = treeOpen[type] ? "▼" : "▶";
      });
    });
    // 날짜 설정 (회원도 변경 가능, 실시간 공유)
    const dateIn = container.querySelector("#att-date");
    if (dateIn) dateIn.addEventListener("change", function () {
      S.setSessionConfig({ date: dateIn.value });
      pushShared();
      render(container);
    });
    // 권한자 대진 생성 (관리자 부여 권한자만)
    const gen = container.querySelector("#member-gen");
    if (gen) gen.addEventListener("click", function () {
      if (gen.disabled) return;
      if (!(UI.memberId && S.canGenerateDraw(UI.memberId))) { global.alert("대진 생성 권한이 없습니다. 관리자에게 권한을 요청하세요."); return; }
      if (S.isPastDate(S.get().session.date)) { global.alert("지난 날짜는 대진을 생성할 수 없습니다."); return; }
      if (!global.confirm("출석 인원으로 대진을 생성할까요?")) return;
      if (UI.draw && UI.draw.generateAndGo) UI.draw.generateAndGo(false);
    });
    // 회원 투표 토글
    container.querySelectorAll('.att-list [data-act="vote"]').forEach(function (li) {
      li.addEventListener("click", function () {
        S.toggleAttendance(li.getAttribute("data-id"));
        pushShared();
        render(container);
      });
    });
    // 출퇴근 시간: 직접 입력 / "지금" 버튼
    container.querySelectorAll(".time-in").forEach(function (inp) {
      inp.addEventListener("click", function (e) { e.stopPropagation(); });
      inp.addEventListener("change", function () {
        const row = inp.closest(".time-row");
        S.setMemberTime(row.getAttribute("data-id"), inp.getAttribute("data-field"), inp.value);
        pushShared();
        render(container);
      });
    });
    container.querySelectorAll(".time-now").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const row = btn.closest(".time-row");
        S.setMemberTime(row.getAttribute("data-id"), btn.getAttribute("data-field"), fmtNow());
        pushShared();
        render(container);
      });
    });
    // 게스트 댓글: ✅ 토글
    container.querySelectorAll('.guest-comments [data-act="vote"]').forEach(function (el) {
      el.addEventListener("click", function () {
        S.toggleAttendance(el.getAttribute("data-id"));
        pushShared();
        render(container);
      });
    });
    // 게스트 댓글: ✕ 삭제
    container.querySelectorAll('.guest-comments [data-act="del"]').forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (global.confirm("이 게스트를 삭제할까요?")) {
          S.removeMember(btn.getAttribute("data-id"));
          pushShared();
          render(container);
        }
      });
    });
    // 게스트 이름 검색 (재렌더 없이 DOM 필터)
    const gs = container.querySelector("#g-search");
    if (gs) {
      gs.addEventListener("click", function (e) { e.stopPropagation(); });
      gs.addEventListener("input", function () { guestQuery = gs.value; applyGuestFilter(container); });
    }
    // 초기 필터: 기본은 참석 체크된 게스트만, 검색어 있으면 매칭
    applyGuestFilter(container);

    // 게스트 신청 (같은 이름이 이미 있으면 새로 만들지 않고 참석 체크)
    const form = container.querySelector("#guest-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      const name = (container.querySelector("#g-name").value || "").trim();
      if (!name) return;
      const club = S.getActiveClub();
      const existing = S.clubMembers(club).filter(function (x) { return x.type === "guest"; })
        .find(function (x) { return String(x.name).toLowerCase() === name.toLowerCase(); });
      if (existing) {
        S.toggleAttendance(existing.id, true);
        pushShared();
        global.alert("이미 신청된 게스트라 참석 체크했어요: " + existing.name);
      } else {
        const gender = container.querySelector("#g-gender").value;
        const ntrp = container.querySelector("#g-ntrp").value;
        const years = container.querySelector("#g-years").value;
        const m = S.addMember(name, "guest", ntrp, club, { gender: gender, years: years });
        if (m) { S.toggleAttendance(m.id, true); pushShared(); }
      }
      guestQuery = ""; // 신청 후 검색 초기화(참석 명단 기본 보기)
      render(container);
    });
  }

  UI.attendees = { render: render };
})(typeof window !== "undefined" ? window : this);
