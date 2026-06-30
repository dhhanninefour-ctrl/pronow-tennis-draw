/*
 * ui/attendance.js — 출석체크 + 세션 설정(코트/모드/라운드) + 대진 생성 트리거
 * 전역: window.TennisUI.attendance
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const UI = (global.TennisUI = global.TennisUI || {});

  // 출석 트리(회원/게스트) 펼침 상태 — 기본 펼침
  const attOpen = { reg: true, guest: true };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // 회원/게스트 트리 섹션
  function attSection(title, type, list, guest) {
    const open = attOpen[type] !== false;
    return '<div class="member-section tree' + (open ? "" : " collapsed") + '" data-tree-sec="' + type + '">' +
      '<h3 class="tree-head" data-act="att-tree-toggle" data-tree="' + type + '">' +
        '<span class="tree-caret">' + (open ? "▼" : "▶") + '</span> ' + title +
        ' <span class="count-pill ' + (guest ? "pill-guest" : "") + '">' + list.length + '</span></h3>' +
      '<div class="tree-body">' +
        (list.length ? '<ul class="att-list">' + list.map(attCard).join("") + '</ul>' : '<p class="empty">없습니다.</p>') +
      '</div></div>';
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
          configField("시작 시간", '<input type="time" class="date-in" id="sess-start" value="' + (sess.startTime || "") + '" />') +
          configField("종료 시간", '<input type="time" class="date-in" id="sess-end" value="' + (sess.endTime || "") + '" />') +
          configField("모드", modeToggle(sess.mode)) +
          configField("코트 수", stepper("courts", sess.courts, 1, 12)) +
          configField("라운드 수", stepper("rounds", sess.rounds, 1, 20)) +
          configField("점수 기록", scoringToggle(sess.scoring)) +
        '</div>' +
        '<p class="muted small">⏱ 라운드는 <b>시작 시간부터 30분 간격</b>으로 대진 화면에 표시됩니다. 출석한 인원의 <b>출퇴근·체류시간</b>도 아래에서 기록할 수 있어요.</p>' +
        '<div class="excel-row">' +
          '<button id="att-down" class="btn btn-ghost">⬇️ 출퇴근 다운로드</button>' +
          '<button id="att-up" class="btn btn-ghost">⬆️ 출퇴근·인원·대진 업로드</button>' +
        '</div>' +
        '<p class="muted small">⬆️ 다운로드와 <b>같은 양식</b>(엑셀 시트 <b>대진</b>+<b>출퇴근</b>)을 올리면 <b>날짜별</b>로 인원·출퇴근·대진·결과가 한 번에 기록됩니다. (과거 데이터 일괄 입력용)</p>' +

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
          : attSection("회원", "reg", members.filter(function (m) { return m.type !== "guest"; }), false) +
            attSection("게스트", "guest", members.filter(function (m) { return m.type === "guest"; }), true)) +

        '<div class="sticky-cta">' +
          '<button id="generate-btn" class="btn btn-primary btn-lg"' +
            (presentCount < (sess.mode === "singles" ? 2 : 4) ? " disabled" : "") + '>' +
            '대진 생성 →</button>' +
        '</div>' +
      '</div>';

    bind(container);
  }

  function fmtNow() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function attTimeControls(id) {
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
  function attCard(m) {
    const present = !!S.get().session.attendance[m.id];
    return '<li class="att-card ' + (present ? "on" : "") + '" data-id="' + m.id + '">' +
      '<div class="att-main" data-act="att-toggle" data-id="' + m.id + '">' +
        '<span class="check">' + (present ? "✅" : "⬜") + '</span>' +
        '<span class="member-name">' + esc(m.name) + '</span>' +
        '<span class="badge ' + (m.type === "guest" ? "badge-guest" : "badge-regular") + '">' +
          (m.type === "guest" ? "게스트" : "정기") + '</span>' +
      '</div>' +
      (present ? attTimeControls(m.id) : "") +
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

  // 통합 업로드: {시트명:행[]} → 날짜별 인원·출퇴근·대진을 기록
  function pick(r, keys) { for (let i = 0; i < keys.length; i++) { if (r[keys[i]] != null && r[keys[i]] !== "") return r[keys[i]]; } return ""; }
  function importUnified(sheets) {
    let drawRows = [], attRows = [];
    Object.keys(sheets).forEach(function (nm) {
      const rows = sheets[nm]; if (!rows || !rows.length) return;
      const keys = Object.keys(rows[0] || {}).join("|");
      if (/라운드|round|A팀|a팀/i.test(keys)) drawRows = drawRows.concat(rows);
      else if (/이름|name|성명/i.test(keys) && /출근|퇴근|in|out|체류/i.test(keys)) attRows = attRows.concat(rows);
    });
    const dRows = {}, aRows = {}, allDates = {};
    drawRows.forEach(function (r) { const d = String(pick(r, ["날짜", "date", "Date"]) || "").trim(); if (d) { (dRows[d] = dRows[d] || []).push(r); allDates[d] = 1; } });
    attRows.forEach(function (r) { const d = String(pick(r, ["날짜", "date", "Date"]) || "").trim(); if (d) { (aRows[d] = aRows[d] || []).push(r); allDates[d] = 1; } });
    const drawApi = global.TennisUI.draw;
    let dates = 0, people = 0;
    Object.keys(allDates).forEach(function (date) {
      const names = {};
      function resolveId(name) {
        name = String(name).trim(); if (!name) return null;
        const m = S.activeMembers().find(function (x) { return x.name === name; });
        const id = m ? m.id : ("imp:" + name); names[id] = name; return id;
      }
      let generated = null, mode = "doubles", scoring = false;
      if (dRows[date] && dRows[date].length && drawApi && drawApi.buildFromRows) {
        const built = drawApi.buildFromRows(dRows[date]);
        if (built && built.generated && built.generated.rounds.length) {
          generated = built.generated; mode = built.mode; scoring = built.hasScore;
          Object.assign(names, built.names || {});
        }
      }
      const attendance = {}, times = {};
      (aRows[date] || []).forEach(function (r) {
        const id = resolveId(pick(r, ["이름", "name", "성명"]));
        if (!id) return;
        attendance[id] = true; people++;
        const tin = String(pick(r, ["출근", "in"]) || "").trim(), tout = String(pick(r, ["퇴근", "out"]) || "").trim();
        if (tin || tout) times[id] = { in: tin, out: tout };
      });
      if (generated) generated.rounds.forEach(function (rd) {
        (rd.matches || []).forEach(function (m) { (m.teamA || []).concat(m.teamB || []).forEach(function (id) { attendance[id] = true; }); });
      });
      S.applyImportedDate(date, { attendance: attendance, times: times, generated: generated, names: names, mode: mode, scoring: scoring });
      dates++;
    });
    return { dates: dates, people: people };
  }

  function bind(container) {
    // 회원/게스트 트리 접기·펼치기
    container.querySelectorAll('[data-act="att-tree-toggle"]').forEach(function (h) {
      h.addEventListener("click", function () {
        const type = h.getAttribute("data-tree");
        attOpen[type] = !attOpen[type];
        const sec = container.querySelector('[data-tree-sec="' + type + '"]');
        const caret = h.querySelector(".tree-caret");
        if (sec) sec.classList.toggle("collapsed", !attOpen[type]);
        if (caret) caret.textContent = attOpen[type] ? "▼" : "▶";
      });
    });
    container.querySelectorAll('[data-act="att-toggle"]').forEach(function (main) {
      main.addEventListener("click", function () {
        S.toggleAttendance(main.getAttribute("data-id"));
      });
    });

    // 출퇴근 시간 입력 / "지금" / 다운로드
    container.querySelectorAll(".time-in").forEach(function (inp) {
      inp.addEventListener("click", function (e) { e.stopPropagation(); });
      inp.addEventListener("change", function () {
        const row = inp.closest(".time-row");
        S.setMemberTime(row.getAttribute("data-id"), inp.getAttribute("data-field"), inp.value);
      });
    });
    container.querySelectorAll(".time-now").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const row = btn.closest(".time-row");
        S.setMemberTime(row.getAttribute("data-id"), btn.getAttribute("data-field"), fmtNow());
      });
    });
    const attDown = container.querySelector("#att-down");
    if (attDown) attDown.addEventListener("click", function () {
      const st = S.get(), date = st.session.date || "", times = st.session.times || {};
      const rows = S.presentMembers().map(function (m) {
        const t = times[m.id] || {}, stay = S.stayMinutes(t);
        return { "날짜": date, "이름": m.name, "구분": m.type === "guest" ? "게스트" : "정기",
          "NTRP": (typeof m.ntrp === "number") ? m.ntrp.toFixed(1) : "",
          "출근": t.in || "", "퇴근": t.out || "", "체류(분)": stay == null ? "" : stay };
      });
      if (!rows.length) { global.alert("출석한 인원이 없습니다."); return; }
      attDown.disabled = true;
      Promise.resolve(global.TennisExcel.exportAttendance(rows)).then(function () { attDown.disabled = false; })
        .catch(function (e) { attDown.disabled = false; global.alert("다운로드 실패: " + e.message); });
    });

    const attUp = container.querySelector("#att-up");
    if (attUp) attUp.addEventListener("click", function () {
      const input = global.document.createElement("input");
      input.type = "file"; input.accept = ".xlsx,.xls,.csv";
      input.onchange = function () {
        const f = input.files && input.files[0]; if (!f) return;
        attUp.disabled = true; attUp.textContent = "업로드 중…";
        global.TennisExcel.readAllSheets(f).then(function (sheets) {
          const res = importUnified(sheets);
          attUp.disabled = false; attUp.textContent = "⬆️ 출퇴근·인원·대진 업로드";
          if (!res.dates) { global.alert("인식된 데이터가 없습니다.\n시트 헤더(날짜·이름·출근/퇴근 또는 날짜·라운드·A팀…)를 확인하세요."); return; }
          global.alert(res.dates + "개 날짜 기록 완료 (인원 " + res.people + "명).");
          render(container);
        }).catch(function (e) { attUp.disabled = false; attUp.textContent = "⬆️ 출퇴근·인원·대진 업로드"; global.alert("업로드 실패: " + e.message); });
      };
      input.click();
    });

    const sd = container.querySelector("#sess-date");
    if (sd) sd.addEventListener("change", function () { S.setSessionConfig({ date: sd.value }); });
    const ss = container.querySelector("#sess-start");
    if (ss) ss.addEventListener("change", function () { S.setSessionConfig({ startTime: ss.value }); });
    const se = container.querySelector("#sess-end");
    if (se) se.addEventListener("change", function () { S.setSessionConfig({ endTime: se.value }); });

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
