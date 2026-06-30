/*
 * ui/attendees.js — 참석자 투표 + 게스트 등록 (회원 앱)
 *  - 지정된 날짜에 대해 회원이 본인/동반 참석을 투표(토글)한다.
 *  - 하단 게스트란: 이름/성별/NTRP 또는 구력을 입력해 게스트를 추가 → 대진에 반영.
 *  - 변경은 회원도 허용되는 클라우드 쓰기(memberPush)로 공유된다.
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
  function skillBadge(m) {
    if (typeof m.ntrp === "number") return '<span class="ntrp-badge">' + m.ntrp.toFixed(1) + '</span>';
    if (typeof m.years === "number") return '<span class="ntrp-badge">구력 ' + m.years + '년</span>';
    return "";
  }

  function voteCard(m, present) {
    return '<li class="att-card ' + (present ? "on" : "") + '" data-id="' + m.id + '" data-act="vote">' +
      '<span class="check">' + (present ? "✅" : "⬜") + '</span>' +
      '<span class="member-name">' + esc(m.name) + '</span>' +
      genderBadge(m) + skillBadge(m) +
      '<span class="badge ' + (m.type === "guest" ? "badge-guest" : "badge-regular") + '">' +
        (m.type === "guest" ? "게스트" : "정기") + '</span>' +
    '</li>';
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

    function list(items) {
      return '<ul class="att-list">' + items.map(function (m) { return voteCard(m, !!att[m.id]); }).join("") + '</ul>';
    }

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>참석자 <span class="count-pill accent">' + present.length + '명</span></h2>' +
          '<p class="muted">📅 <b>' + esc(date) + '</b> · ' + clubLabel + ' 클럽 — 참석하면 이름을 눌러 ✅ 표시하세요. (실시간 공유)</p>' +
        '</div>' +

        '<div class="member-section">' +
          '<h3>회원 <span class="count-pill">' + roster.length + '</span></h3>' +
          (roster.length ? list(roster) : '<p class="empty">아직 회원이 없습니다.</p>') +
        '</div>' +

        '<div class="member-section">' +
          '<h3>게스트 <span class="count-pill pill-guest">' + guests.length + '</span></h3>' +
          (guests.length ? list(guests) : '') +
          '<form class="add-row guest-form" id="guest-form">' +
            '<input type="text" id="g-name" placeholder="게스트 이름" autocomplete="off" maxlength="20" />' +
            '<select id="g-gender" class="type-select"><option value="">성별</option><option value="M">남</option><option value="F">여</option></select>' +
            '<select id="g-ntrp" class="type-select">' + ntrpOptions() + '</select>' +
            '<input type="number" id="g-years" class="type-select num-narrow" placeholder="구력(년)" min="0" max="60" />' +
            '<button type="submit" class="btn btn-primary">+ 게스트</button>' +
          '</form>' +
          '<p class="muted small">NTRP를 모르면 <b>구력(년)</b>만 입력해도 대진 실력 배분에 반영됩니다.</p>' +
        '</div>' +
      '</div>';

    bind(container);
  }

  function ntrpOptions() {
    let html = '<option value="">NTRP</option>';
    for (let v = 2.0; v <= 6.0 + 1e-9; v += 0.5) {
      const s = v.toFixed(1);
      html += '<option value="' + s + '">' + s + '</option>';
    }
    return html;
  }

  function bind(container) {
    container.querySelectorAll('[data-act="vote"]').forEach(function (li) {
      li.addEventListener("click", function () {
        S.toggleAttendance(li.getAttribute("data-id"));
        pushShared();
        render(container);
      });
    });
    const form = container.querySelector("#guest-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      const name = (container.querySelector("#g-name").value || "").trim();
      if (!name) return;
      const gender = container.querySelector("#g-gender").value;
      const ntrp = container.querySelector("#g-ntrp").value;
      const years = container.querySelector("#g-years").value;
      const m = S.addMember(name, "guest", ntrp, S.getActiveClub(), { gender: gender, years: years });
      if (m) {
        S.toggleAttendance(m.id, true); // 추가한 게스트는 바로 참석 처리
        pushShared();
      }
      render(container);
    });
  }

  UI.attendees = { render: render };
})(typeof window !== "undefined" ? window : this);
