/*
 * draw.js — 복식/단식 로테이션 대진 생성 알고리즘 (순수 함수)
 *
 * DOM/네트워크를 전혀 모름. 입력(출석자, 코트 수, 라운드 수, 시드)을 받아
 * 라운드별 대진을 결정적으로 생성한다. 같은 입력+같은 시드 => 같은 결과.
 *
 * 전역 네임스페이스 window.TennisDraw 에 노출 (file:// 더블클릭 실행 호환).
 */
(function (global) {
  "use strict";

  // ── 시드 기반 PRNG (mulberry32) : 결정성 확보 ───────────────────────────
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 문자열/배열을 정수 시드로 해시
  function hashSeed(parts) {
    const str = Array.isArray(parts) ? parts.join("|") : String(parts);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 가중치: 파트너 반복 페널티가 가장 큼, 그다음 상대 반복, NTRP 실력 균형, 경기수 밸런스
  const W = { partner: 1000, opponent: 100, skill: 40, balance: 5 };

  // 두 사람 키 (순서 무관)
  function pairKey(a, b) {
    return a < b ? a + "::" + b : b + "::" + a;
  }

  /**
   * 대진 생성
   * @param {Object} opts
   *   players: [{id, name}]   출석자 목록
   *   courts:  number          코트 수 (>=1)
   *   rounds:  number          라운드 수 (>=1)
   *   mode:    "doubles"|"singles"
   *   seed:    number          (선택) 시드. 없으면 0
   * @returns {Object} { rounds:[{roundNo, matches:[{court, teamA, teamB}], byes:[id]}],
   *                      stats:{gamesPlayed, byeCount, partnerPairs, opponentPairs},
   *                      warnings:[] }
   */
  function generate(opts) {
    const players = (opts.players || []).slice();
    const courts = Math.max(1, opts.courts | 0);
    const roundCount = Math.max(1, opts.rounds | 0);
    const mode = opts.mode === "singles" ? "singles" : "doubles";
    const teamSize = mode === "singles" ? 1 : 2;
    const perMatch = teamSize * 2; // 복식 4, 단식 2
    const seed = (opts.seed | 0) || 0;

    const warnings = [];
    const N = players.length;

    if (N < perMatch) {
      warnings.push(
        mode === "doubles"
          ? "복식은 최소 4명이 필요합니다. (현재 " + N + "명)"
          : "단식은 최소 2명이 필요합니다. (현재 " + N + "명)"
      );
      return { rounds: [], stats: emptyStats(players), warnings: warnings };
    }

    const rnd = mulberry32(hashSeed([seed, N, courts, roundCount, mode]));

    // 누적 카운터
    const ids = players.map(function (p) { return p.id; });
    const gamesPlayed = {}; // id -> 경기 수
    const byeCount = {};    // id -> 휴식 횟수
    const lastByeRound = {}; // id -> 마지막 휴식 라운드
    const partnerCount = {}; // pairKey -> 횟수
    const opponentCount = {}; // pairKey -> 횟수
    ids.forEach(function (id) {
      gamesPlayed[id] = 0;
      byeCount[id] = 0;
      lastByeRound[id] = -999;
    });

    // NTRP 실력 맵 (미입력자는 평균으로 보정 → 균형에 영향 없음)
    const skill = {};
    let sSum = 0, sCnt = 0;
    players.forEach(function (p) {
      if (typeof p.ntrp === "number" && !isNaN(p.ntrp)) { sSum += p.ntrp; sCnt++; }
    });
    const meanSkill = sCnt ? sSum / sCnt : 3.0;
    players.forEach(function (p) {
      skill[p.id] = (typeof p.ntrp === "number" && !isNaN(p.ntrp)) ? p.ntrp : meanSkill;
    });
    const targetTeamSkill = teamSize * meanSkill;

    // 한 라운드에 동시 출전 가능한 매치 수
    const maxMatchesByCourt = courts;
    const maxMatchesByPeople = Math.floor(N / perMatch);
    const matchesPerRound = Math.min(maxMatchesByCourt, maxMatchesByPeople);
    const seatsPerRound = matchesPerRound * perMatch;

    if (matchesPerRound === 0) {
      warnings.push("코트/인원이 부족해 경기를 만들 수 없습니다.");
      return { rounds: [], stats: emptyStats(players), warnings: warnings };
    }
    if (maxMatchesByPeople > courts) {
      warnings.push(
        "인원에 비해 코트가 적어 매 라운드 " + (N - seatsPerRound) + "명이 쉽니다."
      );
    }

    const resultRounds = [];

    for (let r = 0; r < roundCount; r++) {
      // ── Step 1: 휴식자 선정 ──────────────────────────────────────────
      const byeNeeded = N - seatsPerRound;
      let pool = ids.slice();
      // 정렬: 적게 쉰 사람 우선 보호(=뒤로), 즉 많이 쉰 사람이 안 쉬도록
      // 휴식 우선순위: byeCount 적음 → 오래전에 쉼 → 경기 많이 함, tie는 랜덤
      pool.sort(function (a, b) {
        if (byeCount[a] !== byeCount[b]) return byeCount[a] - byeCount[b];
        if (lastByeRound[a] !== lastByeRound[b]) return lastByeRound[a] - lastByeRound[b];
        if (gamesPlayed[a] !== gamesPlayed[b]) return gamesPlayed[b] - gamesPlayed[a];
        return rnd() - 0.5;
      });
      const byes = pool.slice(0, byeNeeded);
      const playing = pool.slice(byeNeeded);
      byes.forEach(function (id) {
        byeCount[id] += 1;
        lastByeRound[id] = r;
      });

      // ── Step 2: 출전자를 팀으로 묶기 (복식) ─────────────────────────
      let teams;
      if (teamSize === 1) {
        teams = playing.map(function (id) { return [id]; });
      } else {
        teams = buildTeams(playing, partnerCount, gamesPlayed, skill, targetTeamSkill, rnd);
      }

      // ── Step 3: 팀들을 매치(2팀)로 묶기 ─────────────────────────────
      const matches = buildMatches(teams, opponentCount, gamesPlayed, skill, rnd, matchesPerRound);

      // ── Step 4: 카운터 갱신 ─────────────────────────────────────────
      matches.forEach(function (m) {
        const all = m.teamA.concat(m.teamB);
        all.forEach(function (id) { gamesPlayed[id] += 1; });
        // 파트너
        bumpWithin(m.teamA, partnerCount);
        bumpWithin(m.teamB, partnerCount);
        // 상대
        m.teamA.forEach(function (a) {
          m.teamB.forEach(function (b) {
            opponentCount[pairKey(a, b)] = (opponentCount[pairKey(a, b)] || 0) + 1;
          });
        });
      });

      resultRounds.push({
        roundNo: r + 1,
        matches: matches.map(function (m, i) {
          return { court: i + 1, teamA: m.teamA, teamB: m.teamB };
        }),
        byes: byes
      });
    }

    return {
      rounds: resultRounds,
      stats: {
        gamesPlayed: gamesPlayed,
        byeCount: byeCount,
        partnerPairs: partnerCount,
        opponentPairs: opponentCount
      },
      warnings: warnings
    };
  }

  // 팀 내부 모든 페어 카운트 +1
  function bumpWithin(team, counter) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const k = pairKey(team[i], team[j]);
        counter[k] = (counter[k] || 0) + 1;
      }
    }
  }

  // 그리디 팀 구성: 파트너 반복이 적고 + 팀 실력합이 평균에 가깝도록
  function buildTeams(playing, partnerCount, gamesPlayed, skill, targetTeamSkill, rnd) {
    const pairs = [];
    for (let i = 0; i < playing.length; i++) {
      for (let j = i + 1; j < playing.length; j++) {
        const a = playing[i], b = playing[j];
        const cost =
          (partnerCount[pairKey(a, b)] || 0) * W.partner +
          Math.abs((skill[a] + skill[b]) - targetTeamSkill) * W.skill +
          Math.abs(gamesPlayed[a] - gamesPlayed[b]) * W.balance +
          rnd() * 0.001; // tie-break
        pairs.push({ a: a, b: b, cost: cost });
      }
    }
    pairs.sort(function (x, y) { return x.cost - y.cost; });

    const used = {};
    const teams = [];
    for (let k = 0; k < pairs.length; k++) {
      const p = pairs[k];
      if (used[p.a] || used[p.b]) continue;
      used[p.a] = used[p.b] = true;
      teams.push([p.a, p.b]);
    }
    return teams;
  }

  // 그리디 매치 구성: 상대 반복이 적고 + 두 팀 실력이 비슷하도록(접전), 코트 수만큼
  function buildMatches(teams, opponentCount, gamesPlayed, skill, rnd, limit) {
    const teamPairs = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const X = teams[i], Y = teams[j];
        let opp = 0;
        X.forEach(function (a) {
          Y.forEach(function (b) {
            opp += opponentCount[pairKey(a, b)] || 0;
          });
        });
        const avgX = avg(X, gamesPlayed), avgY = avg(Y, gamesPlayed);
        const skillX = sum(X, skill), skillY = sum(Y, skill);
        const cost = opp * W.opponent +
          Math.abs(skillX - skillY) * W.skill +
          Math.abs(avgX - avgY) * W.balance + rnd() * 0.001;
        teamPairs.push({ i: i, j: j, cost: cost });
      }
    }
    teamPairs.sort(function (x, y) { return x.cost - y.cost; });

    const usedTeam = {};
    const matches = [];
    for (let k = 0; k < teamPairs.length && matches.length < limit; k++) {
      const tp = teamPairs[k];
      if (usedTeam[tp.i] || usedTeam[tp.j]) continue;
      usedTeam[tp.i] = usedTeam[tp.j] = true;
      matches.push({ teamA: teams[tp.i], teamB: teams[tp.j] });
    }
    return matches;
  }

  function avg(team, gamesPlayed) {
    let s = 0;
    team.forEach(function (id) { s += gamesPlayed[id]; });
    return s / team.length;
  }

  function sum(team, map) {
    let s = 0;
    team.forEach(function (id) { s += (map[id] || 0); });
    return s;
  }

  function emptyStats(players) {
    const g = {}, b = {};
    players.forEach(function (p) { g[p.id] = 0; b[p.id] = 0; });
    return { gamesPlayed: g, byeCount: b, partnerPairs: {}, opponentPairs: {} };
  }

  global.TennisDraw = {
    generate: generate,
    _internal: { mulberry32: mulberry32, hashSeed: hashSeed, pairKey: pairKey }
  };
})(typeof window !== "undefined" ? window : this);
