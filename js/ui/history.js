/*
 * ui/history.js — 모임 기록 화면
 *  - "이번 모임 저장"으로 현재 대진/점수를 날짜별 기록으로 보관
 *  - 지난 모임 목록 보기/펼쳐보기/삭제
 * 전역: window.TennisUI.history
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const R = global.TennisRanking;
  const UI = (global.TennisUI = global.TennisUI || {});

  const expanded = {}; // recordId -> bool
  let drawOnly = false; // 대진만 보기 모드

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function namesFrom(map, ids) {
    const seen = {};
    return (ids || []).filter(function (id) { if (id == null || seen[id]) return false; seen[id] = 1; return true; })
      .map(function (id) { return esc(map[id] || "?"); }).join(" / ");
  }
  function plainNames(map, ids) {
    return (ids || []).map(function (id) { return map[id] || "?"; }).join(" / ");
  }

  // ── 결과(기록) 엑셀 다운로드/업로드 ──────────────────────────────────
  function histTools(ro) {
    if (ro) return "";
    return '<div class="excel-row">' +
        '<button id="hist-down" class="btn btn-ghost">⬇️ 대진·기록 다운로드</button>' +
        '<button id="hist-up" class="btn btn-ghost">⬆️ 대진·기록 업로드</button>' +
      '</div>' +
      '<p class="muted small excel-hint"><b>대진과 경기 결과가 한 행</b>으로 담깁니다. 컬럼: <b>날짜·모드·라운드·코트·A팀·B팀·A점수·B점수·휴식</b> (복식 팀은 이름을 · 로 구분). 현재 진행 중인 대진도 함께 내려받고, 올리면 <b>같은 날짜끼리 한 모임</b>으로 기록됩니다.</p>';
  }
  function pushRecordRows(rows, date, mode, gen, names) {
    const modeLabel = mode === "singles" ? "단식" : "복식";
    (gen.rounds || []).forEach(function (rd) {
      const byeStr = plainNames(names, rd.byes);
      if (rd.matches && rd.matches.length) {
        rd.matches.forEach(function (m, i) {
          rows.push({
            "날짜": date, "모드": modeLabel, "라운드": rd.roundNo, "코트": m.court,
            "A팀": plainNames(names, m.teamA), "B팀": plainNames(names, m.teamB),
            "A점수": m.scoreA == null ? "" : m.scoreA, "B점수": m.scoreB == null ? "" : m.scoreB,
            "휴식": i === 0 ? byeStr : ""
          });
        });
      } else {
        rows.push({ "날짜": date, "모드": modeLabel, "라운드": rd.roundNo, "코트": "", "A팀": "", "B팀": "", "A점수": "", "B점수": "", "휴식": byeStr });
      }
    });
  }
  function historyExportRows() {
    const st = S.get();
    const rows = [];
    // 현재 진행 중인(미저장) 대진 — 그 날짜가 기록에 없을 때만 포함
    const cur = st.session.generated;
    const histDates = (st.history || []).map(function (h) { return h.date; });
    if (cur && cur.rounds && cur.rounds.length && histDates.indexOf(st.session.date) < 0) {
      pushRecordRows(rows, st.session.date, st.session.mode, cur, S.namesForGenerated(cur));
    }
    (st.history || []).forEach(function (h) {
      pushRecordRows(rows, h.date, h.mode, h.generated, h.names);
    });
    return rows;
  }
  function splitNames(s) { return String(s || "").split(/[,·\/]|\s+vs\s+|&/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function numOrNull(v) { if (v === "" || v == null) return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function pick(r, keys) { for (let i = 0; i < keys.length; i++) { if (r[keys[i]] != null && r[keys[i]] !== "") return r[keys[i]]; } return ""; }
  // 이름→id: 현재 회원이면 그 id, 아니면 이름 기반 안정 id(과거 참가자, 명단엔 추가 안 함)
  function resolveId(name, nameMap) {
    name = String(name).trim(); if (!name) return null;
    const m = S.activeMembers().find(function (x) { return x.name === name; });
    const id = m ? m.id : ("imp:" + name);
    nameMap[id] = name;
    return id;
  }
  function buildRecordsFromRows(rows) {
    const byDate = {};
    rows.forEach(function (r) {
      const date = String(pick(r, ["날짜", "date", "Date"]) || "").trim();
      const rn = parseInt(pick(r, ["라운드", "round", "Round"]), 10);
      if (!date || isNaN(rn)) return;
      if (!byDate[date]) byDate[date] = { date: date, mode: "", rounds: {} };
      const rec = byDate[date];
      if (/단식|singles/i.test(String(pick(r, ["모드", "mode"]) || ""))) rec.mode = "singles";
      if (!rec.rounds[rn]) rec.rounds[rn] = { roundNo: rn, matches: [], byeNames: [] };
      const bye = String(pick(r, ["휴식", "bye"]) || "").trim();
      if (bye) rec.rounds[rn].byeNames = rec.rounds[rn].byeNames.concat(splitNames(bye));
      const a = String(pick(r, ["A팀", "A", "a"]) || "").trim();
      const b = String(pick(r, ["B팀", "B", "b"]) || "").trim();
      if (a || b) {
        rec.rounds[rn].matches.push({
          court: parseInt(pick(r, ["코트", "court"]), 10) || (rec.rounds[rn].matches.length + 1),
          a: splitNames(a), b: splitNames(b),
          sa: numOrNull(pick(r, ["A점수", "ascore", "scoreA"])), sb: numOrNull(pick(r, ["B점수", "bscore", "scoreB"]))
        });
      }
    });
    const records = [];
    Object.keys(byDate).forEach(function (date) {
      const rec = byDate[date];
      const names = {}, gp = {}, bc = {};
      let maxTeam = 1, hasScore = false;
      function add(o, id) { if (id) o[id] = (o[id] || 0) + 1; }
      const rounds = Object.keys(rec.rounds).map(function (k) { return rec.rounds[k]; })
        .sort(function (x, y) { return x.roundNo - y.roundNo; })
        .map(function (rd) {
          const byes = rd.byeNames.map(function (n) { return resolveId(n, names); }).filter(Boolean);
          byes.forEach(function (id) { add(bc, id); });
          const matches = rd.matches.map(function (m, i) {
            const teamA = m.a.map(function (n) { return resolveId(n, names); }).filter(Boolean);
            const teamB = m.b.map(function (n) { return resolveId(n, names); }).filter(Boolean);
            teamA.concat(teamB).forEach(function (id) { add(gp, id); });
            maxTeam = Math.max(maxTeam, teamA.length, teamB.length);
            if (m.sa != null || m.sb != null) hasScore = true;
            return { court: m.court || (i + 1), teamA: teamA, teamB: teamB, scoreA: m.sa, scoreB: m.sb };
          });
          return { roundNo: rd.roundNo, matches: matches, byes: byes };
        });
      if (!rounds.length) return;
      records.push({
        id: null, date: date, mode: rec.mode || (maxTeam >= 2 ? "doubles" : "singles"),
        scoring: hasScore,
        generated: { rounds: rounds, stats: { gamesPlayed: gp, byeCount: bc, partnerPairs: {}, opponentPairs: {} }, warnings: [] },
        names: names
      });
    });
    return records;
  }

  function render(container) {
    const st = S.get();
    const saved = st.history || [];
    // 현재 진행 중인 대진도 '현재 모임'으로 맨 위에 미리보기 (저장 전이라도 날짜·라운드별로 확인)
    const cur = S.sessionRecord ? S.sessionRecord() : null;
    const hist = cur ? [cur].concat(saved) : saved;
    const ro = !!UI.readonly;
    const canSave = !ro && !!(st.session.generated && st.session.generated.rounds && st.session.generated.rounds.length);

    const saveUI = ro ? "" :
      ('<button id="archive-btn" class="btn btn-primary btn-lg"' + (canSave ? "" : " disabled") + '>' +
        '📥 이번 모임 저장' + (canSave ? '' : ' (대진 없음)') + '</button>' +
       (canSave ? '' : '<p class="muted small" style="margin:8px 2px">저장하려면 먼저 <b>출석 → 대진 생성</b>으로 대진을 만드세요.</p>'));

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>기록 <span class="count-pill">' + saved.length + '회</span></h2>' +
          '<p class="muted">' + (ro ? '지난 모임 결과를 볼 수 있습니다.' : '모임이 끝나면 저장하세요. 누적 순위는 <b>순위 → 시즌 누적</b>에서 봅니다.') + '</p>' +
        '</div>' +

        histTools(ro) +
        saveUI +

        (hist.length === 0
          ? '<p class="empty">아직 저장된 모임이 없습니다.</p>'
          : ('<div class="hist-toolbar">' +
               '<button id="draw-only-toggle" class="btn ' + (drawOnly ? "btn-primary" : "btn-ghost") + ' btn-sm">' +
                 (drawOnly ? "📋 전체 보기" : "🎾 대진만 보기") + '</button>' +
               (drawOnly ? "" : '<button id="expand-all" class="btn btn-ghost btn-sm">' +
                 (allOpen(hist) ? "모두 접기" : "모두 펼치기") + '</button>') +
             '</div>' +
             '<div class="hist-list' + (drawOnly ? " draw-only" : "") + '">' + hist.map(card).join("") + '</div>')) +
      '</div>';

    bind(container);
  }

  function allOpen(hist) { return hist.length > 0 && hist.every(function (h) { return expanded[h.id]; }); }

  function card(h) {
    const open = drawOnly || !!expanded[h.id];
    const modeLabel = h.mode === "singles" ? "단식" : "복식";
    const players = Object.keys(h.names || {}).length;
    const detail = open ? recordDetail(h, drawOnly) : "";
    const dateCell = h.isCurrent
      ? '<div class="hist-date">' + esc(h.date) + ' <span class="cur-badge">🔴 현재 모임 · 저장 전</span></div>'
      : (UI.readonly
          ? '<div class="hist-date">' + esc(h.date) + '</div>'
          : '<input type="date" class="date-in hist-date-in" data-id="' + h.id + '" value="' + esc(h.date) + '" title="날짜 수정" />');
    return '<div class="hist-card' + (drawOnly ? " draw-only" : "") + (h.isCurrent ? " hist-current" : "") + '" data-id="' + h.id + '">' +
      '<div class="hist-head">' +
        '<div class="hist-meta">' +
          dateCell +
          '<div class="muted small">' + modeLabel + ' · ' + players + '명 · ' + (h.generated.rounds.length) + '라운드</div>' +
        '</div>' +
        (drawOnly ? "" : '<button class="btn btn-ghost hist-toggle" data-id="' + h.id + '">' + (open ? "접기" : "대진·결과") + '</button>') +
        (UI.readonly || h.isCurrent ? "" : '<button class="icon-btn hist-del" data-id="' + h.id + '" title="삭제">🗑</button>') +
      '</div>' +
      detail +
    '</div>';
  }

  function winRate(r) { const t = r.wins + r.losses; return t > 0 ? Math.round((r.wins / t) * 100) : 0; }

  function recordDetail(h, drawOnlyMode) {
    let html = "";
    // 인원 + 출퇴근 (업로드/기록된 경우) — '대진만 보기'에서는 생략
    const times = h.times || {};
    if (!drawOnlyMode) {
    const hasTimes = Object.keys(times).length > 0;
    const attIds = (h.attendance && Object.keys(h.attendance).length)
      ? Object.keys(h.attendance).filter(function (id) { return h.attendance[id]; })
      : (hasTimes ? Object.keys(times) : []);
    if (attIds.length) {
      const trs = attIds.map(function (id) {
        const t = times[id] || {};
        const stay = S.stayMinutes ? S.stayMinutes(t) : null;
        const tcell = (t.in || t.out)
          ? esc((t.in || "-") + " ~ " + (t.out || "-")) + (stay != null ? ' <span class="muted">(' + S.fmtDuration(stay) + ')</span>' : "")
          : '<span class="muted">-</span>';
        return '<tr><td class="name-cell">' + esc(h.names[id] || "?") + '</td><td>' + tcell + '</td></tr>';
      }).join("");
      html += '<div class="hist-sub">👥 인원 ' + attIds.length + '명 · 출퇴근</div>' +
        '<table class="rank-table compact"><thead><tr><th>이름</th><th>출근 ~ 퇴근 (체류)</th></tr></thead><tbody>' + trs + '</tbody></table>';
    }
    // 그날 순위 (점수가 있었으면) — 승/패/승률/득실
    if (h.scoring) {
      const rows = R.compute(h.generated);
      if (rows.length) {
        const trs = rows.map(function (r) {
          const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank;
          const d = (r.diff > 0 ? "+" : "") + r.diff;
          return '<tr><td class="rank-cell">' + medal + '</td><td class="name-cell">' +
            esc(h.names[r.id] || "?") + '</td><td>' + r.played + '</td>' +
            '<td class="wdl-cell"><b>' + r.wins + '</b>·' + r.draws + '·' + r.losses + '</td>' +
            '<td class="rate-cell">' + winRate(r) + '%</td><td class="' +
            (r.diff > 0 ? "pos" : r.diff < 0 ? "neg" : "") + '">' + d + '</td></tr>';
        }).join("");
        html += '<div class="hist-sub">📊 순위 (승·무·패·승률)</div>' +
          '<table class="rank-table compact"><thead><tr><th>#</th><th>이름</th><th>경기</th><th>승·무·패</th><th>승률</th><th>득실</th></tr></thead><tbody>' + trs + '</tbody></table>';
      }
    }
    } // end !drawOnlyMode
    // 라운드별 대진 (과거 대진)
    const stepMin = h.roundMinutes || 30;
    html += '<div class="hist-sub">🎾 대진</div>';
    html += '<div class="hist-rounds">' + h.generated.rounds.map(function (rd, ri) {
      const rt = (h.startTime && S.roundTime) ? S.roundTime(h.startTime, ri, stepMin) : "";
      const ms = rd.matches.map(function (m) {
        const score = (m.scoreA != null && m.scoreB != null) ? ' <b>' + m.scoreA + ':' + m.scoreB + '</b>' : '';
        return '<div class="hist-match"><span class="hist-court">코트' + m.court + '</span> ' + namesFrom(h.names, m.teamA) +
          ' <span class="vs">vs</span> ' + namesFrom(h.names, m.teamB) + score + '</div>';
      }).join("");
      const bye = (rd.byes && rd.byes.length) ? '<div class="hist-bye">휴식 · ' + namesFrom(h.names, rd.byes) + '</div>' : '';
      const rtLabel = rt ? ' <span class="hist-round-time">🕐 ' + esc(rt) + '</span>' : "";
      return '<div class="hist-round"><div class="hist-round-title">R' + rd.roundNo + rtLabel + '</div>' + ms + bye + '</div>';
    }).join("") + '</div>';
    return '<div class="hist-detail">' + html + '</div>';
  }

  function bind(container) {
    const dot = container.querySelector("#draw-only-toggle");
    if (dot) dot.addEventListener("click", function () {
      drawOnly = !drawOnly;
      render(container);
    });

    const down = container.querySelector("#hist-down");
    if (down) down.addEventListener("click", function () {
      const rows = historyExportRows();
      if (!rows.length) { global.alert("내려받을 대진·기록이 없습니다."); return; }
      down.disabled = true;
      Promise.resolve(global.TennisExcel.exportHistory(rows))
        .then(function () { down.disabled = false; })
        .catch(function (e) { down.disabled = false; global.alert("다운로드 실패: " + e.message); });
    });
    const up = container.querySelector("#hist-up");
    if (up) up.addEventListener("click", function () {
      const input = global.document.createElement("input");
      input.type = "file"; input.accept = ".xlsx,.xls,.csv";
      input.onchange = function () {
        const f = input.files && input.files[0]; if (!f) return;
        up.disabled = true; up.textContent = "업로드 중…";
        global.TennisExcel.readRows(f).then(function (rows) {
          const recs = buildRecordsFromRows(rows);
          up.disabled = false; up.textContent = "⬆️ 결과 업로드";
          if (!recs.length) { global.alert("인식된 기록이 없습니다.\n첫 줄 헤더(날짜·라운드·코트·A팀·B팀…)를 확인하세요."); return; }
          recs.forEach(function (r) { S.addHistoryRecord(r); });
          global.alert(recs.length + "개 날짜의 결과를 불러왔습니다.");
          render(container);
        }).catch(function (e) { up.disabled = false; up.textContent = "⬆️ 결과 업로드"; global.alert("업로드 실패: " + e.message); });
      };
      input.click();
    });
    container.querySelectorAll(".hist-date-in").forEach(function (inp) {
      inp.addEventListener("change", function () {
        S.setHistoryDate(inp.getAttribute("data-id"), inp.value);
      });
      inp.addEventListener("click", function (e) { e.stopPropagation(); });
    });

    const expandAll = container.querySelector("#expand-all");
    if (expandAll) expandAll.addEventListener("click", function () {
      const hist = S.get().history || [];
      const open = !allOpen(hist);
      hist.forEach(function (h) { expanded[h.id] = open; });
      render(container);
    });
    const archive = container.querySelector("#archive-btn");
    if (archive) archive.addEventListener("click", function () {
      if (archive.disabled) return;
      if (global.confirm("이번 모임을 기록으로 저장할까요?\n(저장 후 새 모임을 시작합니다 — 출석·대진은 초기화됩니다.)")) {
        const ok = S.archiveSession();
        if (ok && UI.go) UI.go("draw");
      }
    });
    container.querySelectorAll(".hist-toggle").forEach(function (b) {
      b.addEventListener("click", function () {
        const id = b.getAttribute("data-id");
        expanded[id] = !expanded[id];
        render(container);
      });
    });
    container.querySelectorAll(".hist-del").forEach(function (b) {
      b.addEventListener("click", function () {
        const id = b.getAttribute("data-id");
        if (global.confirm("이 기록을 삭제할까요? (되돌릴 수 없습니다)")) S.deleteHistory(id);
      });
    });
  }

  UI.history = { render: render };
})(typeof window !== "undefined" ? window : this);
