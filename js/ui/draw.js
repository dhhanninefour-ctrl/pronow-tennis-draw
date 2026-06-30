/*
 * ui/draw.js — 대진 생성/표시 화면 (라운드별 코트, 휴식, 다시 생성)
 * 점수 기록이 켜져 있으면 매치별 점수 입력칸도 표시.
 * 전역: window.TennisUI.draw
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const UI = (global.TennisUI = global.TennisUI || {});

  let viewDate = null;   // 보고 있는 날짜(null=현재 대진 기본)
  let curNames = null;   // 지난 기록을 볼 때의 이름맵(null=현재 회원으로 해석)
  let editMode = false;  // 대진 수기 수정 모드(탭-스왑)
  let selectedLoc = null; // 첫 번째로 고른 선수 위치
  let undoStack = [];    // 직전 대진 스냅샷(되돌리기)

  // 수정 권한: 관리자 또는 대진 생성 권한 회원
  function canEditDraw() {
    return (!UI.readonly) || !!(UI.memberId && S.canGenerateDraw(UI.memberId));
  }
  function editorName() {
    if (!UI.readonly) return "관리자";
    const m = UI.memberId ? S.getMember(UI.memberId) : null;
    return m ? m.name : "회원";
  }
  function pushDraw() {
    if (global.TennisSync && global.TennisSync.getMode && global.TennisSync.getMode() === "cloud") {
      global.TennisSync.memberPush();
    }
  }
  // 위치 인코딩: "r.t.mi.side.pos"(팀) / "r.b.0.X.pos"(휴식)
  function parseLoc(s) { const p = String(s).split("."); return { r: +p[0], kind: p[1], mi: +p[2], side: p[3], pos: +p[4] }; }
  function getSlot(gen, L) {
    const rd = gen.rounds[L.r]; if (!rd) return null;
    if (L.kind === "b") return rd.byes ? rd.byes[L.pos] : null;
    const m = rd.matches[L.mi]; if (!m) return null;
    return (L.side === "A" ? m.teamA : m.teamB)[L.pos];
  }
  function setSlot(gen, L, id) {
    const rd = gen.rounds[L.r]; if (!rd) return;
    if (L.kind === "b") { rd.byes[L.pos] = id; return; }
    const m = rd.matches[L.mi]; if (!m) return;
    (L.side === "A" ? m.teamA : m.teamB)[L.pos] = id;
  }
  function playerChip(id, loc) {
    return '<span class="pl-chip' + (loc === selectedLoc ? " sel" : "") + '" data-act="swap" data-loc="' + loc + '">' + esc(nameOf(id)) + '</span>';
  }
  function teamChips(ids, r, mi, side) {
    return (ids || []).map(function (id, pos) { return playerChip(id, r + ".t." + mi + "." + side + "." + pos); }).join("");
  }
  function byeChips(ids, r) {
    return (ids || []).map(function (id, pos) { return playerChip(id, r + ".b.0.X." + pos); }).join("");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function nameOf(id) {
    if (curNames) return curNames[id] || "?";
    const m = S.get().members.find(function (x) { return x.id === id; });
    return m ? m.name : "?";
  }
  function names(ids) {
    return ids.map(nameOf).map(esc).join(" / ");
  }

  // 날짜별로 볼 수 있는 대진 목록: 현재 진행 대진 + 지난 기록(날짜별)
  function availableDraws() {
    const st = S.get();
    const map = {};
    (st.history || []).forEach(function (h) {
      if (h.generated && h.generated.rounds && h.generated.rounds.length) {
        map[h.date] = { date: h.date, mode: h.mode, generated: h.generated, names: h.names || {}, editable: false };
      }
    });
    const sg = st.session.generated;
    if (sg && sg.rounds && sg.rounds.length) {
      map[st.session.date] = { date: st.session.date, mode: st.session.mode, generated: sg, names: sg.names || null, editable: true };
    }
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }
  function selectedDraw() {
    const list = availableDraws();
    if (!list.length) return null;
    let v = null;
    if (viewDate) v = list.find(function (d) { return d.date === viewDate; });
    return v || list[0]; // 기본: 최신
  }

  // 출석자로 대진 생성 후 대진 탭으로 이동
  function generateAndGo(bumpSeed) {
    const sess = S.get().session;
    const players = S.presentMembers().map(function (m) { return { id: m.id, name: m.name, ntrp: S.effectiveNtrp(m) }; });
    const seed = bumpSeed ? (sess.seed || 1) + 1 : (sess.seed || 1);

    const result = global.TennisDraw.generate({
      players: players,
      courts: sess.courts,
      rounds: sess.rounds,
      mode: sess.mode,
      seed: seed
    });

    // 점수 슬롯 초기화(점수 기록 ON일 때 입력 보존을 위해 구조 유지)
    result.rounds.forEach(function (rd) {
      rd.matches.forEach(function (m) {
        m.scoreA = null;
        m.scoreB = null;
      });
    });

    S.setSessionConfig({ seed: seed });
    S.setGenerated(result);
    // 회원(권한자)이 생성해도 클라우드에 반영
    if (global.TennisSync && global.TennisSync.getMode && global.TennisSync.getMode() === "cloud") {
      global.TennisSync.memberPush();
    }
    if (UI.go) UI.go("draw");
  }

  function render(container) {
    const st = S.get();
    const sel = selectedDraw();
    curNames = sel ? (sel.names || null) : null; // 업로드/지난 기록은 스냅샷 이름맵, 자동생성은 회원으로 해석

    if (!sel) {
      curNames = null;
      container.innerHTML =
        '<div class="screen"><div class="screen-head"><h2>대진</h2></div>' +
        dateBar() +
        drawTools() +
        '<p class="empty">' + (UI.readonly
              ? '아직 대진이 없습니다. 관리자가 대진을 만들면 실시간으로 표시됩니다.'
              : '아직 대진이 없습니다. <b>출석</b> 탭에서 인원을 체크하고 “대진 생성”을 누르거나, 위 <b>대진·결과 업로드</b>로 직접 입력하세요.') + '</p>' +
        '</div>';
      bind(container);
      return;
    }

    const gen = sel.generated;
    const editable = !!sel.editable;
    const scoring = editable ? st.session.scoring : recordHasScore(gen);

    const warnHtml = editable && gen.warnings && gen.warnings.length
      ? '<p class="warn">' + gen.warnings.map(esc).join("<br>") + '</p>' : "";

    const canEdit = editable && canEditDraw();
    const editing = canEdit && editMode;

    const roundsHtml = gen.rounds.map(function (rd, rIdx) {
      const matchesHtml = rd.matches.map(function (m, idx) {
        return matchCard(rd.roundNo, idx, m, scoring, editable, editing, rIdx);
      }).join("");
      const byeHtml = rd.byes && rd.byes.length
        ? '<div class="bye-row">휴식 · ' + (editing ? byeChips(rd.byes, rIdx) : names(rd.byes)) + '</div>' : "";
      const rtime = editable ? S.roundTime(st.session.startTime, rIdx, 30) : "";
      return '<div class="round-block">' +
        '<div class="round-title">ROUND ' + rd.roundNo +
          (rtime ? ' <span class="round-time">🕐 ' + rtime + '</span>' : "") + '</div>' +
        '<div class="court-grid">' + matchesHtml + '</div>' +
        byeHtml +
      '</div>';
    }).join("");

    const regenBtn = (editable && !UI.readonly && !editMode) ? '<button id="regen-btn" class="btn btn-ghost">🔄 다시 생성</button>' : "";
    const editToggle = canEdit
      ? '<button id="draw-edit-toggle" class="btn ' + (editMode ? "btn-primary" : "btn-ghost") + '">' + (editMode ? "✓ 수정 완료" : "✏️ 수정") + '</button>'
      : "";
    const pastBadge = editable ? "" : ' <span class="badge badge-regular">지난 기록</span>';
    const editBar = editing
      ? '<div class="edit-bar"><p class="muted small">바꿀 두 선수를 차례로 누르면 자리가 교체됩니다. (실시간 공유)</p>' +
          (undoStack.length ? '<button id="draw-undo" class="btn btn-ghost btn-sm">↩ 되돌리기</button>' : "") +
        '</div>'
      : "";
    const editorLabel = (gen._editor ? '<p class="muted small">✏️ 최근 수정: ' + esc(gen._editor) + '</p>' : "");
    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head row-between">' +
          '<h2>대진 <span class="muted small">' + (sel.mode === "singles" ? "단식" : "복식") +
            ' · ' + gen.rounds.length + '라운드</span>' + pastBadge + '</h2>' +
          '<span class="head-btns">' + editToggle + regenBtn + '</span>' +
        '</div>' +
        dateBar() +
        (editMode ? "" : drawTools()) +
        editBar +
        scoreGuide(scoring) +
        (editable && !editing ? memberScoreHint(scoring) : "") +
        editorLabel +
        warnHtml +
        roundsHtml +
        (editing ? "" : statsBlock(gen.stats)) +
      '</div>';

    bind(container);
  }
  function recordHasScore(gen) {
    return (gen.rounds || []).some(function (rd) {
      return (rd.matches || []).some(function (m) { return m.scoreA != null || m.scoreB != null; });
    });
  }

  // 회원용 점수 입력 안내
  function memberScoreHint(scoring) {
    if (!UI.readonly || !scoring) return "";
    return UI.memberId
      ? '<p class="muted small score-hint">✏️ 본인이 참여한 경기의 점수를 직접 입력할 수 있어요. (승률에 반영)</p>'
      : '<p class="muted small score-hint">🔒 점수를 입력하려면 우측 상단 👤에서 로그인하세요.</p>';
  }

  // 점수 기록 기준 안내 (1세트)
  function scoreGuide(scoring) {
    if (!scoring) return "";
    return '<p class="muted small score-guide">🎾 기록 기준(1세트): <b>5:5 무승부</b> · 5:5 타이브레이크 승리는 <b>6:5</b> · 6:6 타이브레이크는 <b>7:6</b></p>';
  }

  // 날짜 선택(검색) + 현재 대진 날짜 수정(관리자)
  function dateBar() {
    const list = availableDraws();
    const sel = selectedDraw();
    const selDate = sel ? sel.date : (S.get().session.date || "");
    let html = '<div class="draw-date-row"><label>📅 날짜</label>';
    if (list.length) {
      html += '<select id="view-date" class="date-in">' +
        list.map(function (d) {
          return '<option value="' + esc(d.date) + '"' + (d.date === selDate ? ' selected' : '') + '>' +
            esc(d.date) + (d.editable ? ' (현재)' : '') + '</option>';
        }).join("") + '</select>';
    } else {
      html += '<span class="muted small">' + esc(selDate) + '</span>';
    }
    // 관리자가 현재(편집 가능) 대진을 보고 있을 때만 날짜 수정 가능
    if (!UI.readonly && sel && sel.editable) {
      html += '<input type="date" class="date-in" id="draw-date" value="' + esc(selDate) + '" title="현재 대진 날짜 수정" />';
    }
    return html + '</div>';
  }

  // 관리자 전용: 대진·결과 다운로드/업로드 (한 행에 대진+점수)
  function drawTools() {
    if (UI.readonly) return "";
    return '<div class="excel-row">' +
        '<button id="draw-down" class="btn btn-ghost">⬇️ 대진·결과 다운로드</button>' +
        '<button id="draw-up" class="btn btn-ghost">⬆️ 대진·결과 업로드</button>' +
      '</div>' +
      '<p class="muted small excel-hint"><b>대진과 경기 결과를 한 행</b>으로 작성·업로드할 수 있어요. 컬럼: <b>날짜·라운드·코트·A팀·B팀·A점수·B점수·휴식</b> (복식 팀은 이름을 <b>/</b> 로 구분). 받은 파일에 점수만 채워 다시 올려도 됩니다.</p>';
  }

  // 점수 입력 가능 여부: 관리자 전체, 회원은 본인이 참여한 경기만
  function canEditScore(m) {
    if (!UI.readonly) return true;
    if (!UI.memberId) return false;
    return (m.teamA && m.teamA.indexOf(UI.memberId) >= 0) ||
           (m.teamB && m.teamB.indexOf(UI.memberId) >= 0);
  }

  function matchCard(roundNo, idx, m, scoring, editable, editing, rIdx) {
    let scoreHtml = "";
    if (editing) {
      // 수정 모드: 선수 칩으로 표시(점수칸 숨김)
      return '<div class="court-card">' +
        '<div class="court-no">코트 ' + m.court + '</div>' +
        '<div class="team team-edit">' + teamChips(m.teamA, rIdx, idx, "A") + '</div>' +
        '<div class="vs">VS</div>' +
        '<div class="team team-edit">' + teamChips(m.teamB, rIdx, idx, "B") + '</div>' +
      '</div>';
    }
    if (scoring && editable) {
      const dis = canEditScore(m) ? "" : " disabled";
      scoreHtml = '<div class="score-row">' +
          '<input class="score-in" type="number" inputmode="numeric" min="0" max="99"' + dis + ' ' +
            'data-round="' + roundNo + '" data-match="' + idx + '" data-side="A" ' +
            'value="' + (m.scoreA == null ? "" : m.scoreA) + '" placeholder="-" />' +
          '<span class="score-sep">:</span>' +
          '<input class="score-in" type="number" inputmode="numeric" min="0" max="99"' + dis + ' ' +
            'data-round="' + roundNo + '" data-match="' + idx + '" data-side="B" ' +
            'value="' + (m.scoreB == null ? "" : m.scoreB) + '" placeholder="-" />' +
        '</div>';
    } else if (scoring) {
      // 지난 기록: 점수 읽기 전용 표시
      scoreHtml = '<div class="score-row score-readonly">' +
          '<span class="score-text">' + (m.scoreA == null ? "-" : m.scoreA) + '</span>' +
          '<span class="score-sep">:</span>' +
          '<span class="score-text">' + (m.scoreB == null ? "-" : m.scoreB) + '</span>' +
        '</div>';
    }
    const win = winnerSide(m);
    return '<div class="court-card">' +
      '<div class="court-no">코트 ' + m.court + '</div>' +
      '<div class="team ' + (win === "A" ? "win" : "") + '">' + names(m.teamA) + '</div>' +
      '<div class="vs">VS</div>' +
      '<div class="team ' + (win === "B" ? "win" : "") + '">' + names(m.teamB) + '</div>' +
      scoreHtml +
    '</div>';
  }

  function winnerSide(m) {
    if (m.scoreA == null || m.scoreB == null) return null;
    if (m.scoreA > m.scoreB) return "A";
    if (m.scoreB > m.scoreA) return "B";
    return null;
  }

  function statsBlock(stats) {
    if (!stats || !stats.gamesPlayed) return "";
    const entries = Object.keys(stats.gamesPlayed).map(function (id) {
      return { name: nameOf(id), g: stats.gamesPlayed[id], b: stats.byeCount[id] || 0 };
    }).sort(function (a, b) { return b.g - a.g; });
    if (entries.length === 0) return "";
    const rows = entries.map(function (e) {
      return '<tr><td>' + esc(e.name) + '</td><td>' + e.g + '</td><td>' + e.b + '</td></tr>';
    }).join("");
    return '<details class="stats"><summary>경기 수 / 휴식 횟수 보기</summary>' +
      '<table class="stats-table"><thead><tr><th>이름</th><th>경기</th><th>휴식</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></details>';
  }

  // ── 대진·결과 다운로드/업로드 (날짜별 전체) ──────────────────────────
  function plainNm(namesMap, ids) {
    return (ids || []).map(function (id) {
      if (namesMap) return namesMap[id] || "?";
      const m = S.get().members.find(function (x) { return x.id === id; });
      return m ? m.name : "?";
    }).join(" / ");
  }
  function pushDrawRows(rows, date, gen, namesMap) {
    (gen.rounds || []).forEach(function (rd) {
      if (rd.matches && rd.matches.length) {
        rd.matches.forEach(function (m, i) {
          rows.push({
            "날짜": date, "라운드": rd.roundNo, "코트": m.court,
            "A팀": plainNm(namesMap, m.teamA), "B팀": plainNm(namesMap, m.teamB),
            "A점수": m.scoreA == null ? "" : m.scoreA, "B점수": m.scoreB == null ? "" : m.scoreB,
            "휴식": i === 0 ? plainNm(namesMap, rd.byes) : ""
          });
        });
      } else {
        rows.push({ "날짜": date, "라운드": rd.roundNo, "코트": "", "A팀": "", "B팀": "", "A점수": "", "B점수": "", "휴식": plainNm(namesMap, rd.byes) });
      }
    });
  }
  function drawExportRows() {
    const st = S.get();
    const rows = [];
    const sg = st.session.generated;
    const histDates = (st.history || []).map(function (h) { return h.date; });
    if (sg && sg.rounds && sg.rounds.length && histDates.indexOf(st.session.date) < 0) {
      pushDrawRows(rows, st.session.date, sg, sg.names || null);
    }
    (st.history || []).forEach(function (h) {
      if (h.generated && h.generated.rounds) pushDrawRows(rows, h.date, h.generated, h.names || null);
    });
    if (!rows.length) {
      // 빈 양식 예시 (출석자 참고)
      const date = st.session.date || "";
      const present = S.presentMembers().map(function (m) { return m.name; });
      rows.push({ "날짜": date, "라운드": 1, "코트": 1, "A팀": present[0] ? present.slice(0, 2).join(" / ") : "홍길동 / 김철수", "B팀": present[2] ? present.slice(2, 4).join(" / ") : "이영희 / 박민수", "A점수": "", "B점수": "", "휴식": "" });
      rows.push({ "날짜": date, "라운드": 2, "코트": 1, "A팀": "", "B팀": "", "A점수": "", "B점수": "", "휴식": "" });
    }
    return rows;
  }
  function splitNames(s) { return String(s || "").split(/[,·\/]|\s+vs\s+|&/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function numOrNull(v) { if (v === "" || v == null) return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function pick(r, keys) { for (let i = 0; i < keys.length; i++) { if (r[keys[i]] != null && r[keys[i]] !== "") return r[keys[i]]; } return ""; }

  function buildFromRows(rows) {
    let date = "";
    for (let i = 0; i < rows.length; i++) {
      const dv = String(pick(rows[i], ["날짜", "date", "Date"]) || "").trim();
      if (dv) { date = dv; break; }
    }
    const nmMap = {}; // id → 이름 (회원이면 회원id, 아니면 imp:이름 — 명단은 더럽히지 않음)
    function resolveId(name) {
      name = String(name).trim(); if (!name) return null;
      const m = S.activeMembers().find(function (x) { return x.name === name; });
      const id = m ? m.id : ("imp:" + name);
      nmMap[id] = name;
      return id;
    }
    const byRound = {};
    rows.forEach(function (r) {
      const rn = parseInt(pick(r, ["라운드", "round", "Round"]), 10);
      if (isNaN(rn)) return;
      if (!byRound[rn]) byRound[rn] = { roundNo: rn, matches: [], byeNames: [] };
      const bye = String(pick(r, ["휴식", "bye"]) || "").trim();
      if (bye) byRound[rn].byeNames = byRound[rn].byeNames.concat(splitNames(bye));
      const a = String(pick(r, ["A팀", "A", "a"]) || "").trim();
      const b = String(pick(r, ["B팀", "B", "b"]) || "").trim();
      if (a || b) {
        byRound[rn].matches.push({
          court: parseInt(pick(r, ["코트", "court"]), 10) || (byRound[rn].matches.length + 1),
          a: splitNames(a), b: splitNames(b),
          sa: numOrNull(pick(r, ["A점수", "ascore", "scoreA"])), sb: numOrNull(pick(r, ["B점수", "bscore", "scoreB"]))
        });
      }
    });
    const gamesPlayed = {}, byeCount = {};
    function add(o, id) { if (id) o[id] = (o[id] || 0) + 1; }
    let maxTeam = 1, hasScore = false;
    const rounds = Object.keys(byRound).map(function (k) { return byRound[k]; })
      .sort(function (x, y) { return x.roundNo - y.roundNo; })
      .map(function (rd) {
        const byes = rd.byeNames.map(resolveId).filter(Boolean);
        byes.forEach(function (id) { add(byeCount, id); });
        const matches = rd.matches.map(function (m, i) {
          const teamA = m.a.map(resolveId).filter(Boolean);
          const teamB = m.b.map(resolveId).filter(Boolean);
          teamA.concat(teamB).forEach(function (id) { add(gamesPlayed, id); });
          maxTeam = Math.max(maxTeam, teamA.length, teamB.length);
          if (m.sa != null || m.sb != null) hasScore = true;
          return { court: m.court || (i + 1), teamA: teamA, teamB: teamB, scoreA: m.sa, scoreB: m.sb };
        });
        return { roundNo: rd.roundNo, matches: matches, byes: byes };
      });
    return {
      generated: { rounds: rounds, stats: { gamesPlayed: gamesPlayed, byeCount: byeCount, partnerPairs: {}, opponentPairs: {} }, warnings: [], names: nmMap },
      mode: maxTeam >= 2 ? "doubles" : "singles", hasScore: hasScore, date: date, names: nmMap
    };
  }

  function attendanceRows() {
    const st = S.get(), date = st.session.date || "", times = st.session.times || {};
    return S.presentMembers().map(function (m) {
      const t = times[m.id] || {}, stay = S.stayMinutes(t);
      return { "날짜": date, "이름": m.name, "구분": m.type === "guest" ? "게스트" : "정기",
        "성별": m.gender === "F" ? "여" : m.gender === "M" ? "남" : "",
        "NTRP": (typeof m.ntrp === "number") ? m.ntrp.toFixed(1) : "",
        "구력": (typeof m.years === "number") ? m.years : "",
        "출근": t.in || "", "퇴근": t.out || "", "체류(분)": stay == null ? "" : stay };
    });
  }

  function bindDrawTools(container) {
    const down = container.querySelector("#draw-down");
    if (down) down.addEventListener("click", function () {
      down.disabled = true;
      Promise.resolve(global.TennisExcel.exportDraw(drawExportRows())).then(function () { down.disabled = false; })
        .catch(function (e) { down.disabled = false; global.alert("다운로드 실패: " + e.message); });
    });
    const up = container.querySelector("#draw-up");
    if (up) up.addEventListener("click", function () {
      const input = global.document.createElement("input");
      input.type = "file"; input.accept = ".xlsx,.xls,.csv";
      input.onchange = function () {
        const f = input.files && input.files[0]; if (!f) return;
        up.disabled = true; up.textContent = "업로드 중…";
        global.TennisExcel.readRows(f).then(function (rows) {
          // 날짜별로 묶어서 처리: 현재 날짜는 진행 대진, 나머지는 날짜별 기록으로 보관
          const groups = {};
          const curDate = S.get().session.date;
          rows.forEach(function (r) {
            const dv = String(pick(r, ["날짜", "date", "Date"]) || "").trim() || curDate;
            (groups[dv] = groups[dv] || []).push(r);
          });
          const dates = Object.keys(groups);
          let datesDone = 0;
          dates.forEach(function (d) {
            const built = buildFromRows(groups[d]);
            if (!built.generated.rounds.length) return;
            datesDone++;
            // 같은 날짜의 출퇴근 기록과 자동 병합 (현재 날짜면 진행 세션)
            S.applyImportedDate(d, {
              generated: built.generated, names: built.names,
              mode: built.mode, scoring: built.hasScore
            });
          });
          up.disabled = false; up.textContent = "⬆️ 대진·결과 업로드";
          if (!datesDone) { global.alert("인식된 대진이 없습니다.\n첫 줄 헤더(날짜·라운드·코트·A팀·B팀…)를 확인하세요."); return; }
          viewDate = null; // 업로드 후 최신/현재로
          global.alert(datesDone + "개 날짜의 대진·결과를 불러왔습니다.");
          render(container);
        }).catch(function (e) { up.disabled = false; up.textContent = "⬆️ 대진·결과 업로드"; global.alert("업로드 실패: " + e.message); });
      };
      input.click();
    });
  }

  function doSwap(locA, locB, container) {
    const gen = S.get().session.generated;
    if (!gen || !gen.rounds) return;
    undoStack.push(JSON.parse(JSON.stringify(gen)));
    if (undoStack.length > 30) undoStack.shift();
    const A = parseLoc(locA), B = parseLoc(locB);
    const ida = getSlot(gen, A), idb = getSlot(gen, B);
    setSlot(gen, A, idb); setSlot(gen, B, ida);
    gen._editor = editorName();
    selectedLoc = null;
    S.setGenerated(gen);
    pushDraw();
    render(container);
  }

  function bind(container) {
    bindDrawTools(container);
    const vd = container.querySelector("#view-date");
    if (vd) vd.addEventListener("change", function () { viewDate = vd.value; render(container); });
    const dd = container.querySelector("#draw-date");
    if (dd) dd.addEventListener("change", function () { S.setSessionConfig({ date: dd.value }); });
    const regen = container.querySelector("#regen-btn");
    if (regen) regen.addEventListener("click", function () {
      if (!global.confirm("대진을 다시 생성할까요? 지금 대진이 새 조합으로 바뀝니다.")) return;
      generateAndGo(true);
    });

    // 대진 수정 모드 토글
    const editToggle = container.querySelector("#draw-edit-toggle");
    if (editToggle) editToggle.addEventListener("click", function () {
      editMode = !editMode; selectedLoc = null; if (!editMode) undoStack = [];
      render(container);
    });
    // 되돌리기
    const undo = container.querySelector("#draw-undo");
    if (undo) undo.addEventListener("click", function () {
      if (!undoStack.length) return;
      const prev = undoStack.pop();
      S.setGenerated(prev); pushDraw(); selectedLoc = null; render(container);
    });
    // 선수 칩 탭 → 두 번째 탭 시 자리 교체
    container.querySelectorAll('[data-act="swap"]').forEach(function (chip) {
      chip.addEventListener("click", function () {
        const loc = chip.getAttribute("data-loc");
        if (!selectedLoc) { selectedLoc = loc; render(container); return; }
        if (selectedLoc === loc) { selectedLoc = null; render(container); return; }
        doSwap(selectedLoc, loc, container);
      });
    });

    container.querySelectorAll(".score-in").forEach(function (inp) {
      inp.addEventListener("change", function () {
        const roundNo = parseInt(inp.getAttribute("data-round"), 10);
        const matchIdx = parseInt(inp.getAttribute("data-match"), 10);
        const side = inp.getAttribute("data-side");
        const val = inp.value === "" ? null : Math.max(0, parseInt(inp.value, 10) || 0);
        const gen = S.get().session.generated;
        const rd = gen.rounds.find(function (x) { return x.roundNo === roundNo; });
        if (!rd) return;
        const m = rd.matches[matchIdx];
        if (!m) return;
        if (side === "A") m.scoreA = val; else m.scoreB = val;
        S.commit();
        // 회원이 입력하면 클라우드에 반영
        if (UI.memberId && global.TennisSync && global.TennisSync.getMode() === "cloud") {
          global.TennisSync.memberPush();
        }
      });
    });
  }

  UI.draw = { render: render, generateAndGo: generateAndGo, buildFromRows: buildFromRows };
})(typeof window !== "undefined" ? window : this);
