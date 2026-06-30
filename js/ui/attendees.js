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

  function voteCard(m, present) {
    return '<li class="att-card ' + (present ? "on" : "") + '" data-id="' + m.id + '" data-act="vote">' +
      '<span class="check">' + (present ? "✅" : "⬜") + '</span>' +
      '<span class="member-name">' + esc(m.name) + '</span>' +
      genderBadge(m) + skillBadge(m) +
    '</li>';
  }

  // 게스트 = 댓글 카드 (✅ 토글 + 메타 + ✕ 삭제)
  function guestComment(m, present) {
    const meta = [m.gender === "F" ? "여" : m.gender === "M" ? "남" : "", skillText(m)].filter(Boolean).join(" · ");
    return '<li class="guest-comment ' + (present ? "on" : "") + '" data-id="' + m.id + '">' +
      '<span class="gc-check" data-act="vote" data-id="' + m.id + '">' + (present ? "✅" : "⬜") + '</span>' +
      '<div class="gc-body">' +
        '<div class="gc-name">' + esc(m.name) + ' <span class="badge badge-guest">게스트</span></div>' +
        (meta ? '<div class="gc-meta muted small">' + esc(meta) + '</div>' : '') +
      '</div>' +
      '<button class="gc-del" data-act="del" data-id="' + m.id + '" title="삭제">✕</button>' +
    '</li>';
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

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>참석자 <span class="count-pill accent">' + present.length + '명</span></h2>' +
          '<p class="muted">📅 <b>' + esc(date) + '</b> · ' + clubLabel + ' 클럽 — 참석하면 이름을 눌러 ✅ 표시하세요. (실시간 공유)</p>' +
        '</div>' +

        '<div class="member-section">' +
          '<h3>회원 <span class="count-pill">' + roster.length + '</span></h3>' +
          (roster.length
            ? '<ul class="att-list">' + roster.map(function (m) { return voteCard(m, !!att[m.id]); }).join("") + '</ul>'
            : '<p class="empty">아직 회원이 없습니다.</p>') +
        '</div>' +

        // ── 게스트 (투표 밑, 댓글형 입력) ──
        '<div class="member-section guest-zone">' +
          '<h3>게스트 직접 추가 <span class="count-pill pill-guest">' + guests.length + '</span></h3>' +
          '<form class="add-row guest-form" id="guest-form">' +
            '<input type="text" id="g-name" placeholder="게스트 이름을 적어 추가하세요" autocomplete="off" maxlength="20" />' +
            '<select id="g-gender" class="type-select"><option value="">성별</option><option value="M">남</option><option value="F">여</option></select>' +
            '<select id="g-ntrp" class="type-select">' + ntrpOptions() + '</select>' +
            '<input type="number" id="g-years" class="type-select num-narrow" placeholder="구력(년)" min="0" max="60" />' +
            '<button type="submit" class="btn btn-primary">+ 추가</button>' +
          '</form>' +
          '<p class="muted small">NTRP를 모르면 <b>구력(년)</b>만 입력해도 대진 실력 배분에 반영됩니다.</p>' +
          (guests.length
            ? '<ul class="guest-comments">' + guests.map(function (m) { return guestComment(m, !!att[m.id]); }).join("") + '</ul>'
            : '<p class="empty">아직 게스트가 없습니다. 위에 이름을 적어 추가하세요.</p>') +
        '</div>' +
      '</div>';

    bind(container);
  }

  function bind(container) {
    // 회원 투표 토글
    container.querySelectorAll('.att-list [data-act="vote"]').forEach(function (li) {
      li.addEventListener("click", function () {
        S.toggleAttendance(li.getAttribute("data-id"));
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
    // 게스트 추가
    const form = container.querySelector("#guest-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      const name = (container.querySelector("#g-name").value || "").trim();
      if (!name) return;
      const gender = container.querySelector("#g-gender").value;
      const ntrp = container.querySelector("#g-ntrp").value;
      const years = container.querySelector("#g-years").value;
      const m = S.addMember(name, "guest", ntrp, S.getActiveClub(), { gender: gender, years: years });
      if (m) { S.toggleAttendance(m.id, true); pushShared(); }
      render(container);
    });
  }

  UI.attendees = { render: render };
})(typeof window !== "undefined" ? window : this);
