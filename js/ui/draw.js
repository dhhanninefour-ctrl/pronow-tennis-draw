/*
 * ui/draw.js — 대진 생성/표시 화면 (라운드별 코트, 휴식, 다시 생성)
 * 점수 기록이 켜져 있으면 매치별 점수 입력칸도 표시.
 * 전역: window.TennisUI.draw
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

  function nameOf(id) {
    const m = S.get().members.find(function (x) { return x.id === id; });
    return m ? m.name : "?";
  }
  function names(ids) {
    return ids.map(nameOf).map(esc).join(" · ");
  }

  // 출석자로 대진 생성 후 대진 탭으로 이동
  function generateAndGo(bumpSeed) {
    const sess = S.get().session;
    const players = S.presentMembers().map(function (m) { return { id: m.id, name: m.name, ntrp: m.ntrp }; });
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
    if (UI.go) UI.go("draw");
  }

  function render(container) {
    const st = S.get();
    const gen = st.session.generated;
    const scoring = st.session.scoring;

    if (!gen || !gen.rounds || gen.rounds.length === 0) {
      container.innerHTML =
        '<div class="screen"><div class="screen-head"><h2>대진</h2></div>' +
        drawTools() +
        (gen && gen.warnings && gen.warnings.length
          ? '<p class="warn">' + gen.warnings.map(esc).join("<br>") + '</p>'
          : '<p class="empty">' + (UI.readonly
              ? '아직 대진이 없습니다. 관리자가 대진을 만들면 실시간으로 표시됩니다.'
              : '아직 대진이 없습니다. <b>출석</b> 탭에서 인원을 체크하고 “대진 생성”을 누르거나, 아래 <b>대진 양식</b>으로 수기 입력하세요.') + '</p>') +
        '</div>';
      bind(container);
      return;
    }

    const warnHtml = gen.warnings && gen.warnings.length
      ? '<p class="warn">' + gen.warnings.map(esc).join("<br>") + '</p>' : "";

    const roundsHtml = gen.rounds.map(function (rd) {
      const matchesHtml = rd.matches.map(function (m, idx) {
        return matchCard(rd.roundNo, idx, m, scoring);
      }).join("");
      const byeHtml = rd.byes && rd.byes.length
        ? '<div class="bye-row">휴식 · ' + names(rd.byes) + '</div>' : "";
      return '<div class="round-block">' +
        '<div class="round-title">ROUND ' + rd.roundNo + '</div>' +
        '<div class="court-grid">' + matchesHtml + '</div>' +
        byeHtml +
      '</div>';
    }).join("");

    const regenBtn = UI.readonly ? "" : '<button id="regen-btn" class="btn btn-ghost">🔄 다시 생성</button>';
    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head row-between">' +
          '<h2>대진 <span class="muted small">' + (st.session.mode === "singles" ? "단식" : "복식") +
            ' · ' + gen.rounds.length + '라운드</span></h2>' +
          regenBtn +
        '</div>' +
        drawTools() +
        warnHtml +
        roundsHtml +
        statsBlock(gen.stats) +
      '</div>';

    bind(container);
  }

  // 관리자 전용: 대진 양식 다운로드/업로드
  function drawTools() {
    if (UI.readonly) return "";
    return '<div class="excel-row">' +
        '<button id="draw-down" class="btn btn-ghost">⬇️ 대진 양식</button>' +
        '<button id="draw-up" class="btn btn-ghost">⬆️ 대진 업로드</button>' +
      '</div>' +
      '<p class="muted small excel-hint">엑셀로 대진·점수를 직접 입력할 수 있어요. 컬럼: <b>라운드·코트·A팀·B팀·A점수·B점수·휴식</b> (복식은 이름을 · 로 구분)</p>';
  }

  function matchCard(roundNo, idx, m, scoring) {
    const dis = UI.readonly ? " disabled" : "";
    const scoreHtml = scoring
      ? '<div class="score-row">' +
          '<input class="score-in" type="number" inputmode="numeric" min="0" max="99"' + dis + ' ' +
            'data-round="' + roundNo + '" data-match="' + idx + '" data-side="A" ' +
            'value="' + (m.scoreA == null ? "" : m.scoreA) + '" placeholder="-" />' +
          '<span class="score-sep">:</span>' +
          '<input class="score-in" type="number" inputmode="numeric" min="0" max="99"' + dis + ' ' +
            'data-round="' + roundNo + '" data-match="' + idx + '" data-side="B" ' +
            'value="' + (m.scoreB == null ? "" : m.scoreB) + '" placeholder="-" />' +
        '</div>'
      : "";
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

  // ── 대진 양식 다운로드/업로드 ────────────────────────────────────────
  function nm(ids) { return (ids || []).map(nameOf).join(" · "); }
  function drawExportRows() {
    const gen = S.get().session.generated;
    const rows = [];
    if (gen && gen.rounds && gen.rounds.length) {
      gen.rounds.forEach(function (rd) {
        if (rd.matches.length) {
          rd.matches.forEach(function (m, i) {
            rows.push({
              "라운드": rd.roundNo, "코트": m.court, "A팀": nm(m.teamA), "B팀": nm(m.teamB),
              "A점수": m.scoreA == null ? "" : m.scoreA, "B점수": m.scoreB == null ? "" : m.scoreB,
              "휴식": i === 0 ? nm(rd.byes) : ""
            });
          });
        } else {
          rows.push({ "라운드": rd.roundNo, "코트": "", "A팀": "", "B팀": "", "A점수": "", "B점수": "", "휴식": nm(rd.byes) });
        }
      });
    } else {
      // 빈 양식 예시 (출석자 참고)
      const present = S.presentMembers().map(function (m) { return m.name; });
      rows.push({ "라운드": 1, "코트": 1, "A팀": present[0] ? present.slice(0, 2).join(" · ") : "홍길동 · 김철수", "B팀": present[2] ? present.slice(2, 4).join(" · ") : "이영희 · 박민수", "A점수": "", "B점수": "", "휴식": "" });
      rows.push({ "라운드": 2, "코트": 1, "A팀": "", "B팀": "", "A점수": "", "B점수": "", "휴식": "" });
    }
    return rows;
  }
  function splitNames(s) { return String(s || "").split(/[,·\/]|\s+vs\s+|&/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function numOrNull(v) { if (v === "" || v == null) return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function pick(r, keys) { for (let i = 0; i < keys.length; i++) { if (r[keys[i]] != null && r[keys[i]] !== "") return r[keys[i]]; } return ""; }

  function buildFromRows(rows) {
    function resolveId(name) {
      name = String(name).trim(); if (!name) return null;
      const m = S.activeMembers().find(function (x) { return x.name === name; });
      if (m) return m.id;
      const g = S.addMember(name, "guest", "", S.getActiveClub()); // 명단에 없으면 게스트로 추가
      return g ? g.id : null;
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
      generated: { rounds: rounds, stats: { gamesPlayed: gamesPlayed, byeCount: byeCount, partnerPairs: {}, opponentPairs: {} }, warnings: [] },
      mode: maxTeam >= 2 ? "doubles" : "singles", hasScore: hasScore
    };
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
          const built = buildFromRows(rows);
          if (!built.generated.rounds.length) { up.disabled = false; up.textContent = "⬆️ 대진 업로드"; global.alert("인식된 대진이 없습니다.\n첫 줄 헤더(라운드·코트·A팀·B팀…)를 확인하세요."); return; }
          S.setSessionConfig({ mode: built.mode });
          if (built.hasScore) S.setSessionConfig({ scoring: true });
          S.setGenerated(built.generated);
          up.disabled = false; up.textContent = "⬆️ 대진 업로드";
          render(container);
        }).catch(function (e) { up.disabled = false; up.textContent = "⬆️ 대진 업로드"; global.alert("업로드 실패: " + e.message); });
      };
      input.click();
    });
  }

  function bind(container) {
    bindDrawTools(container);
    const regen = container.querySelector("#regen-btn");
    if (regen) regen.addEventListener("click", function () { generateAndGo(true); });

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
      });
    });
  }

  UI.draw = { render: render, generateAndGo: generateAndGo };
})(typeof window !== "undefined" ? window : this);
