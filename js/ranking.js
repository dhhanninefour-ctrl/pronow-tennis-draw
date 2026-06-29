/*
 * ranking.js — 점수 집계 → 개인 순위 (순수 함수, DOM/네트워크 모름)
 * 전역: window.TennisRanking
 *
 * 입력: generated(draw 결과 + 점수), 정렬 기준: 승 → 득실차 → 득점 → 경기수
 */
(function (global) {
  "use strict";

  /**
   * @param {Object} generated  { rounds:[{ matches:[{teamA,teamB,scoreA,scoreB}] }] }
   * @returns {Array} [{ id, played, wins, losses, draws, pointsFor, pointsAgainst, diff }]
   */
  function compute(generated) {
    const table = {}; // id -> row

    function row(id) {
      if (!table[id]) {
        table[id] = {
          id: id, played: 0, wins: 0, losses: 0, draws: 0,
          pointsFor: 0, pointsAgainst: 0, diff: 0
        };
      }
      return table[id];
    }

    if (generated && generated.rounds) {
      generated.rounds.forEach(function (rd) {
        rd.matches.forEach(function (m) {
          if (m.scoreA == null || m.scoreB == null) return; // 미입력 경기 제외
          const a = m.scoreA, b = m.scoreB;
          const aWin = a > b, bWin = b > a, draw = a === b;
          m.teamA.forEach(function (id) {
            const r = row(id);
            r.played += 1;
            r.pointsFor += a; r.pointsAgainst += b;
            if (aWin) r.wins += 1; else if (bWin) r.losses += 1; else r.draws += 1;
          });
          m.teamB.forEach(function (id) {
            const r = row(id);
            r.played += 1;
            r.pointsFor += b; r.pointsAgainst += a;
            if (bWin) r.wins += 1; else if (aWin) r.losses += 1; else r.draws += 1;
          });
          void draw;
        });
      });
    }

    const rows = Object.keys(table).map(function (id) {
      const r = table[id];
      r.diff = r.pointsFor - r.pointsAgainst;
      return r;
    });

    rows.sort(function (x, y) {
      if (y.wins !== x.wins) return y.wins - x.wins;
      if (y.diff !== x.diff) return y.diff - x.diff;
      if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
      return y.played - x.played;
    });

    // 공동 순위(동률) 부여
    let rank = 0, prevKey = null;
    rows.forEach(function (r, i) {
      const key = r.wins + ":" + r.diff + ":" + r.pointsFor;
      if (key !== prevKey) { rank = i + 1; prevKey = key; }
      r.rank = rank;
    });

    return rows;
  }

  // 여러 모임(세션) 누적 순위
  // sessions: [{ generated, names }]  → 이름까지 붙여 정렬된 행 반환
  function computeCumulative(sessions) {
    const acc = {};   // id -> row
    const nameOf = {}; // id -> name (스냅샷 우선)

    (sessions || []).forEach(function (sess) {
      const names = sess.names || {};
      Object.keys(names).forEach(function (id) {
        if (names[id] && names[id] !== "?") nameOf[id] = names[id];
      });
      const rows = compute(sess.generated);
      rows.forEach(function (r) {
        const a = acc[r.id] || (acc[r.id] = {
          id: r.id, sessions: 0, played: 0, wins: 0, losses: 0, draws: 0,
          pointsFor: 0, pointsAgainst: 0, diff: 0
        });
        a.sessions += 1;
        a.played += r.played;
        a.wins += r.wins;
        a.losses += r.losses;
        a.draws += r.draws;
        a.pointsFor += r.pointsFor;
        a.pointsAgainst += r.pointsAgainst;
      });
    });

    const out = Object.keys(acc).map(function (id) {
      const a = acc[id];
      a.diff = a.pointsFor - a.pointsAgainst;
      a.name = nameOf[id] || "?";
      return a;
    });

    out.sort(function (x, y) {
      if (y.wins !== x.wins) return y.wins - x.wins;
      if (y.diff !== x.diff) return y.diff - x.diff;
      if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
      return y.played - x.played;
    });

    let rank = 0, prevKey = null;
    out.forEach(function (r, i) {
      const key = r.wins + ":" + r.diff + ":" + r.pointsFor;
      if (key !== prevKey) { rank = i + 1; prevKey = key; }
      r.rank = rank;
    });

    return out;
  }

  // 입력된 경기 수 / 전체 경기 수
  function progress(generated) {
    let done = 0, total = 0;
    if (generated && generated.rounds) {
      generated.rounds.forEach(function (rd) {
        rd.matches.forEach(function (m) {
          total += 1;
          if (m.scoreA != null && m.scoreB != null) done += 1;
        });
      });
    }
    return { done: done, total: total };
  }

  global.TennisRanking = { compute: compute, computeCumulative: computeCumulative, progress: progress };
})(typeof window !== "undefined" ? window : this);
