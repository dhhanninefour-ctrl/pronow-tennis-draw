/*
 * ui/attendees.js — 참석자 보기 화면 (회원 읽기 전용)
 *  - 활성 클럽에서 "출석 체크된" 회원을 표시한다. (출석 체크 자체는 관리자 출석 탭)
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
  function ntrpBadge(m) {
    return (typeof m.ntrp === "number") ? '<span class="ntrp-badge">' + m.ntrp.toFixed(1) + '</span>' : "";
  }
  function card(m) {
    return '<li class="att-card on readonly" data-id="' + m.id + '">' +
      '<span class="check">✅</span>' +
      '<span class="member-name">' + esc(m.name) + '</span>' +
      ntrpBadge(m) +
      '<span class="badge ' + (m.type === "guest" ? "badge-guest" : "badge-regular") + '">' +
        (m.type === "guest" ? "게스트" : "정기") + '</span>' +
    '</li>';
  }

  function render(container) {
    const club = S.getActiveClub();
    const clubLabel = CLUB_LABEL[club] || "";
    const present = S.presentMembers();
    const roster = S.clubMembers(club);
    const reg = present.filter(function (m) { return m.type !== "guest"; });
    const guests = present.filter(function (m) { return m.type === "guest"; });

    function section(title, list, guest) {
      if (!list.length) return "";
      return '<div class="member-section">' +
        '<h3>' + title + ' <span class="count-pill ' + (guest ? "pill-guest" : "") + '">' + list.length + '</span></h3>' +
        '<ul class="att-list">' + list.map(card).join("") + '</ul></div>';
    }

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>참석자 <span class="count-pill accent">' + present.length + '명</span></h2>' +
          '<p class="muted">' + clubLabel + ' 클럽 · 오늘 출석한 회원입니다. (출석 체크는 관리자가 합니다)</p>' +
        '</div>' +
        (present.length === 0
          ? '<p class="empty">아직 출석 체크된 참석자가 없습니다. 관리자가 출석을 체크하면 여기에 표시됩니다.</p>'
          : (section("정기 멤버", reg, false) + section("게스트", guests, true))) +
        '<p class="muted small" style="margin-top:10px">' + clubLabel + ' 클럽 전체 회원 ' + roster.length + '명 중 ' + present.length + '명 참석</p>' +
      '</div>';
  }

  UI.attendees = { render: render };
})(typeof window !== "undefined" ? window : this);
