/*
 * ui/signup.js — 회원 가입 화면 (보기 전용 회원용)
 *  이름 + 생년월일 입력 → 가입 신청 → 관리자 승인 대기
 * 전역: window.TennisUI.signup
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const Sync = global.TennisSync;
  const UI = (global.TennisUI = global.TennisUI || {});

  let justSubmitted = null; // 방금 신청한 이름

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ntrpOptions() {
    let html = '<option value="">선택 안 함</option>';
    for (let v = 1.0; v <= 7.0001; v += 0.5) {
      const s = v.toFixed(1);
      html += '<option value="' + s + '">' + s + '</option>';
    }
    return html;
  }

  function render(container) {
    const pending = S.pendingMembers();
    const approved = S.activeMembers();

    const confirm = justSubmitted
      ? '<div class="signup-done">✅ <b>' + esc(justSubmitted) + '</b> 님, 가입 신청이 접수됐습니다.<br>' +
        '관리자 승인 후 회원으로 등록됩니다.</div>'
      : "";

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>가입</h2>' +
          '<p class="muted">아이디·비밀번호와 이름·NTRP를 입력해 가입을 신청하세요. 관리자 승인 후 등록됩니다.</p>' +
        '</div>' +
        confirm +
        '<form id="signup-form" class="signup-form">' +
          '<label>아이디</label>' +
          '<input type="text" id="su-loginid" placeholder="로그인 아이디" autocomplete="off" maxlength="20" />' +
          '<label>비밀번호</label>' +
          '<input type="password" id="su-loginpw" placeholder="비밀번호" autocomplete="off" maxlength="30" />' +
          '<label>이름</label>' +
          '<input type="text" id="su-name" placeholder="이름" autocomplete="off" maxlength="20" />' +
          '<label>NTRP 실력 (필수)</label>' +
          '<select id="su-ntrp">' + ntrpOptions() + '</select>' +
          '<button type="submit" class="btn btn-primary btn-lg">가입 신청</button>' +
        '</form>' +
        '<p class="warn" id="su-warn" hidden></p>' +

        (UI.ntrpGuideHtml ? UI.ntrpGuideHtml() : "") +

        '<div class="member-section">' +
          '<h3>승인 대기 <span class="count-pill pill-guest">' + pending.length + '</span></h3>' +
          (pending.length
            ? '<ul class="member-list">' + pending.map(function (m) {
                return '<li class="member-card"><span class="member-name">' + esc(m.name) +
                  '</span><span class="badge badge-guest">대기</span></li>';
              }).join("") + '</ul>'
            : '<p class="empty">대기 중인 신청이 없습니다.</p>') +
        '</div>' +

        '<div class="member-section">' +
          '<h3>등록 회원 <span class="count-pill">' + approved.length + '</span></h3>' +
          (approved.length
            ? '<ul class="member-list">' + approved.map(function (m) {
                return '<li class="member-card"><span class="member-name">' + esc(m.name) + '</span>' +
                  '<span class="badge ' + (m.type === "guest" ? "badge-guest" : "badge-regular") + '">' +
                  (m.type === "guest" ? "게스트" : "정기") + '</span></li>';
              }).join("") + '</ul>'
            : '<p class="empty">아직 등록된 회원이 없습니다.</p>') +
        '</div>' +
      '</div>';

    bind(container);
  }

  function bind(container) {
    const form = container.querySelector("#signup-form");
    const idI = container.querySelector("#su-loginid");
    const pwI = container.querySelector("#su-loginpw");
    const nameI = container.querySelector("#su-name");
    const ntrpI = container.querySelector("#su-ntrp");
    const warn = container.querySelector("#su-warn");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const loginId = idI.value.trim();
      const loginPw = pwI.value.trim();
      const name = nameI.value.trim();
      if (!loginId) { warn.textContent = "아이디를 입력하세요."; warn.hidden = false; return; }
      if (!loginPw) { warn.textContent = "비밀번호를 입력하세요."; warn.hidden = false; return; }
      if (S.findDuplicateLoginId(loginId)) { warn.textContent = "이미 사용 중인 아이디입니다."; warn.hidden = false; return; }
      if (!name) { warn.textContent = "이름을 입력하세요."; warn.hidden = false; return; }
      if (!ntrpI.value) { warn.textContent = "NTRP 실력을 선택하세요."; warn.hidden = false; return; }
      warn.hidden = true;
      const btn = form.querySelector("button");
      btn.disabled = true; btn.textContent = "신청 중…";
      Promise.resolve(Sync.submitSignup(name, ntrpI.value, loginId, loginPw)).then(function () {
        justSubmitted = name;
        render(container);
      }).catch(function () {
        btn.disabled = false; btn.textContent = "가입 신청";
        warn.textContent = "신청에 실패했습니다. 잠시 후 다시 시도하세요."; warn.hidden = false;
      });
    });
  }

  UI.signup = { render: render };
})(typeof window !== "undefined" ? window : this);
