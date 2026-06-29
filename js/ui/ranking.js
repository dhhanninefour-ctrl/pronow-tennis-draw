/*
 * ui/ranking.js — 순위 화면 (점수 기록 ON일 때만 노출)
 *  - [이번 모임]: 현재 세션 점수 기반 순위
 *  - [시즌 누적]: 저장된 기록 + 현재 모임 합산 순위
 * 전역: window.TennisUI.ranking
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const R = global.TennisRanking;
  const UI = (global.TennisUI = global.TennisUI || {});

  let view = "current"; // 'current' | 'cumulative'

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nameOf(id) {
    const m = S.get().members.find(function (x) { return x.id === id; });
    return m ? m.name : "?";
  }
  function isGuest(id) {
    const m = S.get().members.find(function (x) { return x.id === id; });
    return m && m.type === "guest";
  }
  function medal(rank) {
    return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
  }
  function diffCell(d) {
    const s = (d > 0 ? "+" : "") + d;
    return '<td class="' + (d > 0 ? "pos" : d < 0 ? "neg" : "") + '">' + s + '</td>';
  }
  // 승률은 무승부 제외: 승 / (승+패)
  function winRate(r) { const t = r.wins + r.losses; return t > 0 ? Math.round((r.wins / t) * 100) : 0; }
  function rateCell(r) { return '<td class="rate-cell">' + winRate(r) + '%</td>'; }
  function wdlCell(r) { return '<td class="wdl-cell"><b>' + r.wins + '</b>·' + r.draws + '·' + r.losses + '</td>'; }

  function render(container) {
    if (!S.get().session.scoring) {
      container.innerHTML = '<div class="screen"><div class="screen-head"><h2>순위</h2></div>' +
        '<p class="empty">점수 기록이 꺼져 있습니다. <b>출석</b> 탭에서 “점수 기록 → 사용”으로 켜세요.</p></div>';
      return;
    }

    const toggle =
      '<div class="seg seg-wide" data-seg="view">' +
        '<button data-val="current" class="' + (view === "current" ? "active" : "") + '">이번 모임</button>' +
        '<button data-val="cumulative" class="' + (view === "cumulative" ? "active" : "") + '">시즌 누적</button>' +
      '</div>';

    const body = view === "current" ? currentView() : cumulativeView();

    container.innerHTML =
      '<div class="screen">' +
        '<div class="screen-head"><h2>순위</h2></div>' +
        toggle +
        body +
      '</div>';

    container.querySelectorAll('[data-seg="view"] button').forEach(function (b) {
      b.addEventListener("click", function () {
        view = b.getAttribute("data-val");
        render(container);
      });
    });
  }

  function currentView() {
    const gen = S.get().session.generated;
    if (!gen || !gen.rounds || gen.rounds.length === 0) {
      return '<p class="empty">아직 대진이 없습니다.</p>';
    }
    const prog = R.progress(gen);
    const rows = R.compute(gen);
    if (rows.length === 0) {
      return '<p class="sub muted">입력 0 / ' + prog.total + ' 경기</p>' +
        '<p class="empty">아직 입력된 점수가 없습니다. <b>대진</b> 탭에서 점수를 입력하세요.</p>';
    }
    const trs = rows.map(function (r) {
      return '<tr class="' + (r.rank <= 3 ? "top" : "") + '">' +
        '<td class="rank-cell">' + medal(r.rank) + '</td>' +
        '<td class="name-cell">' + esc(nameOf(r.id)) +
          (isGuest(r.id) ? ' <span class="badge badge-guest">G</span>' : '') + '</td>' +
        '<td>' + r.played + '</td>' +
        wdlCell(r) +
        rateCell(r) +
        diffCell(r.diff) +
      '</tr>';
    }).join("");
    return '<p class="sub muted">입력 ' + prog.done + ' / ' + prog.total + ' 경기 · 승 → 득실차 순 (승·무·패)</p>' +
      '<table class="rank-table">' +
        '<thead><tr><th>#</th><th>이름</th><th>경기</th><th>승·무·패</th><th>승률</th><th>득실</th></tr></thead>' +
        '<tbody>' + trs + '</tbody></table>';
  }

  function cumulativeView() {
    const sessions = S.rankingSessions();
    const rows = R.computeCumulative(sessions);
    const savedCount = S.get().history.length;
    if (rows.length === 0) {
      return '<p class="sub muted">저장된 모임 ' + savedCount + '회</p>' +
        '<p class="empty">아직 누적 기록이 없습니다. 점수를 입력하고 <b>기록</b> 탭에서 “이번 모임 저장”을 누르세요.</p>';
    }
    const trs = rows.map(function (r) {
      return '<tr class="' + (r.rank <= 3 ? "top" : "") + '">' +
        '<td class="rank-cell">' + medal(r.rank) + '</td>' +
        '<td class="name-cell">' + esc(r.name) + '</td>' +
        '<td>' + r.sessions + '</td>' +
        '<td>' + r.played + '</td>' +
        wdlCell(r) +
        rateCell(r) +
        diffCell(r.diff) +
      '</tr>';
    }).join("");
    return '<p class="sub muted">저장된 모임 ' + savedCount + '회 + 진행 중 · 승 → 득실차 순 (승·무·패)</p>' +
      '<table class="rank-table">' +
        '<thead><tr><th>#</th><th>이름</th><th>모임</th><th>경기</th><th>승·무·패</th><th>승률</th><th>득실</th></tr></thead>' +
        '<tbody>' + trs + '</tbody></table>';
  }

  UI.ranking = { render: render };
})(typeof window !== "undefined" ? window : this);
