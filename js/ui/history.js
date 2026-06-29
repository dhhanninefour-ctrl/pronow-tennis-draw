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

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function namesFrom(map, ids) {
    return (ids || []).map(function (id) { return esc(map[id] || "?"); }).join(" · ");
  }

  function render(container) {
    const st = S.get();
    const hist = st.history || [];
    const ro = !!UI.readonly;
    const canSave = !ro && !!(st.session.generated && st.session.generated.rounds && st.session.generated.rounds.length);

    const saveUI = ro ? "" :
      ('<button id="archive-btn" class="btn btn-primary btn-lg"' + (canSave ? "" : " disabled") + '>' +
        '📥 이번 모임 저장' + (canSave ? '' : ' (대진 없음)') + '</button>' +
       (canSave ? '' : '<p class="muted small" style="margin:8px 2px">저장하려면 먼저 <b>출석 → 대진 생성</b>으로 대진을 만드세요.</p>'));

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head">' +
          '<h2>기록 <span class="count-pill">' + hist.length + '회</span></h2>' +
          '<p class="muted">' + (ro ? '지난 모임 결과를 볼 수 있습니다.' : '모임이 끝나면 저장하세요. 누적 순위는 <b>순위 → 시즌 누적</b>에서 봅니다.') + '</p>' +
        '</div>' +

        saveUI +

        (hist.length === 0
          ? '<p class="empty">아직 저장된 모임이 없습니다.</p>'
          : ('<div class="hist-toolbar"><button id="expand-all" class="btn btn-ghost btn-sm">' +
              (allOpen(hist) ? "모두 접기" : "모두 펼치기") + '</button></div>' +
             '<div class="hist-list">' + hist.map(card).join("") + '</div>')) +
      '</div>';

    bind(container);
  }

  function allOpen(hist) { return hist.length > 0 && hist.every(function (h) { return expanded[h.id]; }); }

  function card(h) {
    const open = !!expanded[h.id];
    const modeLabel = h.mode === "singles" ? "단식" : "복식";
    const players = Object.keys(h.names || {}).length;
    const detail = open ? recordDetail(h) : "";
    return '<div class="hist-card" data-id="' + h.id + '">' +
      '<div class="hist-head">' +
        '<div class="hist-meta">' +
          '<div class="hist-date">' + esc(h.date) + '</div>' +
          '<div class="muted small">' + modeLabel + ' · ' + players + '명 · ' + (h.generated.rounds.length) + '라운드</div>' +
        '</div>' +
        '<button class="btn btn-ghost hist-toggle" data-id="' + h.id + '">' + (open ? "접기" : "대진·결과") + '</button>' +
        (UI.readonly ? "" : '<button class="icon-btn hist-del" data-id="' + h.id + '" title="삭제">🗑</button>') +
      '</div>' +
      detail +
    '</div>';
  }

  function winRate(r) { const t = r.wins + r.losses; return t > 0 ? Math.round((r.wins / t) * 100) : 0; }

  function recordDetail(h) {
    let html = "";
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
    // 라운드별 대진 (과거 대진)
    html += '<div class="hist-sub">🎾 대진</div>';
    html += '<div class="hist-rounds">' + h.generated.rounds.map(function (rd) {
      const ms = rd.matches.map(function (m) {
        const score = (m.scoreA != null && m.scoreB != null) ? ' <b>' + m.scoreA + ':' + m.scoreB + '</b>' : '';
        return '<div class="hist-match">코트' + m.court + ' · ' + namesFrom(h.names, m.teamA) +
          ' vs ' + namesFrom(h.names, m.teamB) + score + '</div>';
      }).join("");
      const bye = (rd.byes && rd.byes.length) ? '<div class="hist-bye">휴식 · ' + namesFrom(h.names, rd.byes) + '</div>' : '';
      return '<div class="hist-round"><div class="hist-round-title">R' + rd.roundNo + '</div>' + ms + bye + '</div>';
    }).join("") + '</div>';
    return '<div class="hist-detail">' + html + '</div>';
  }

  function bind(container) {
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
        if (ok && UI.go) UI.go("history");
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
