/*
 * ui/attendance.js — 출석체크 + 세션 설정(코트/모드/라운드) + 대진 생성 트리거
 * 전역: window.TennisUI.attendance
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const UI = (global.TennisUI = global.TennisUI || {});

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(container) {
    const st = S.get();
    const sess = st.session;
    const members = S.clubMembers(S.getActiveClub());
    const presentCount = S.presentMembers().length;

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>출석 <span class="count-pill accent">' + presentCount + '명</span></h2>' +
          '<p class="muted">오늘 온 사람만 체크하세요. 체크된 인원으로 대진을 짭니다.</p>' +
        '</div>' +

        '<div class="config-grid">' +
          configField("날짜", '<input type="date" class="date-in" id="sess-date" value="' + (sess.date || "") + '" />') +
          configField("모드", modeToggle(sess.mode)) +
          configField("코트 수", stepper("courts", sess.courts, 1, 12)) +
          configField("라운드 수", stepper("rounds", sess.rounds, 1, 20)) +
          configField("점수 기록", scoringToggle(sess.scoring)) +
        '</div>' +

        '<div class="add-row guest-form">' +
          '<input type="text" id="guest-name" placeholder="게스트 이름" autocomplete="off" maxlength="20" />' +
          '<select id="guest-gender" class="type-select"><option value="">성별</option><option value="M">남</option><option value="F">여</option></select>' +
          '<select id="guest-ntrp" class="type-select">' + guestNtrpOptions() + '</select>' +
          '<input type="number" id="guest-years" class="type-select num-narrow" placeholder="구력" min="0" max="60" />' +
          '<button id="guest-add" class="btn btn-ghost">+ 게스트</button>' +
        '</div>' +
        '<p class="muted small">게스트는 <b>성별 + NTRP 또는 구력(년)</b>을 입력하면 대진 실력 배분에 반영됩니다.</p>' +
        '<div class="add-row">' +
          '<button id="att-all" class="btn btn-ghost">전체 출석</button>' +
          '<button id="att-none" class="btn btn-ghost">전체 해제</button>' +
        '</div>' +

        (members.length === 0
          ? '<p class="empty">회원 탭에서 먼저 회원을 추가하세요.</p>'
          : '<ul class="att-list">' + members.map(attCard).join("") + '</ul>') +

        '<div class="sticky-cta">' +
          '<button id="generate-btn" class="btn btn-primary btn-lg"' +
            (presentCount < (sess.mode === "singles" ? 2 : 4) ? " disabled" : "") + '>' +
            '대진 생성 →</button>' +
        '</div>' +
      '</div>';

    bind(container);
  }

  function attCard(m) {
    const present = !!S.get().session.attendance[m.id];
    return '<li class="att-card ' + (present ? "on" : "") + '" data-id="' + m.id + '">' +
      '<span class="check">' + (present ? "✅" : "⬜") + '</span>' +
      '<span class="member-name">' + esc(m.name) + '</span>' +
      '<span class="badge ' + (m.type === "guest" ? "badge-guest" : "badge-regular") + '">' +
        (m.type === "guest" ? "게스트" : "정기") + '</span>' +
    '</li>';
  }

  function configField(label, inner) {
    return '<div class="config-field"><label>' + label + '</label>' + inner + '</div>';
  }

  function guestNtrpOptions() {
    let html = '<option value="">NTRP</option>';
    for (let v = 2.0; v <= 6.0 + 1e-9; v += 0.5) { const s = v.toFixed(1); html += '<option value="' + s + '">' + s + '</option>'; }
    return html;
  }

  function modeToggle(mode) {
    return '<div class="seg" data-seg="mode">' +
      '<button data-val="doubles" class="' + (mode === "doubles" ? "active" : "") + '">복식</button>' +
      '<button data-val="singles" class="' + (mode === "singles" ? "active" : "") + '">단식</button>' +
    '</div>';
  }

  function scoringToggle(on) {
    return '<div class="seg" data-seg="scoring">' +
      '<button data-val="on" class="' + (on ? "active" : "") + '">사용</button>' +
      '<button data-val="off" class="' + (!on ? "active" : "") + '">끔</button>' +
    '</div>';
  }

  function stepper(name, value, min, max) {
    return '<div class="stepper" data-step="' + name + '" data-min="' + min + '" data-max="' + max + '">' +
      '<button data-d="-1">−</button>' +
      '<span class="stepper-val">' + value + '</span>' +
      '<button data-d="1">+</button>' +
    '</div>';
  }

  function bind(container) {
    container.querySelectorAll(".att-card").forEach(function (card) {
      card.addEventListener("click", function () {
        S.toggleAttendance(card.getAttribute("data-id"));
      });
    });

    const sd = container.querySelector("#sess-date");
    if (sd) sd.addEventListener("change", function () { S.setSessionConfig({ date: sd.value }); });

    container.querySelectorAll(".seg").forEach(function (seg) {
      const kind = seg.getAttribute("data-seg");
      seg.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          const val = b.getAttribute("data-val");
          if (kind === "mode") S.setSessionConfig({ mode: val });
          else if (kind === "scoring") S.setSessionConfig({ scoring: val === "on" });
        });
      });
    });

    container.querySelectorAll(".stepper").forEach(function (st) {
      const name = st.getAttribute("data-step");
      const min = parseInt(st.getAttribute("data-min"), 10);
      const max = parseInt(st.getAttribute("data-max"), 10);
      st.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          const d = parseInt(b.getAttribute("data-d"), 10);
          const cur = S.get().session[name];
          const next = Math.min(max, Math.max(min, cur + d));
          const patch = {};
          patch[name] = next;
          S.setSessionConfig(patch);
        });
      });
    });

    const guestInput = container.querySelector("#guest-name");
    container.querySelector("#guest-add").addEventListener("click", function () {
      const name = guestInput.value.trim();
      if (!name) return;
      const gender = container.querySelector("#guest-gender").value;
      const ntrp = container.querySelector("#guest-ntrp").value;
      const years = container.querySelector("#guest-years").value;
      const m = S.addMember(name, "guest", ntrp, S.getActiveClub(), { gender: gender, years: years });
      if (m) S.toggleAttendance(m.id, true); // 즉석 추가한 게스트는 바로 출석
      guestInput.value = "";
    });

    container.querySelector("#att-all").addEventListener("click", function () {
      S.clubMembers(S.getActiveClub()).forEach(function (m) { S.get().session.attendance[m.id] = true; });
      S.commit();
    });
    container.querySelector("#att-none").addEventListener("click", function () {
      S.get().session.attendance = {};
      S.commit();
    });

    const genBtn = container.querySelector("#generate-btn");
    if (genBtn) {
      genBtn.addEventListener("click", function () {
        UI.draw.generateAndGo();
      });
    }
  }

  UI.attendance = { render: render };
})(typeof window !== "undefined" ? window : this);
