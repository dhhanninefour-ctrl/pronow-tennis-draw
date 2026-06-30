/*
 * state.js — 중앙 상태 + 구독 + 영속화 트리거 (클럽 토/일 분리 지원)
 * 전역: window.TennisState
 *
 * 데이터는 클럽별로 분리: state.clubs = { sat:{session,history}, sun:{session,history} }.
 * 기존 화면 코드 호환을 위해 state.session / state.history 는 "활성 클럽"으로
 * 자동 연결되는 별칭(비열거 접근자)이다. activeClub 은 동기화되지 않는 로컬 UI 상태.
 */
(function (global) {
  "use strict";

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function newSession() {
    return {
      id: uid(), date: todayStr(), mode: "doubles", courts: 2,
      rounds: 5, seed: 1, scoring: false, attendance: {}, times: {},
      startTime: "", endTime: "", generated: null
    };
  }

  // ── 시간 유틸 ───────────────────────────────────────────────────────
  function minOfTime(s) {
    if (!s) return null; const p = String(s).split(":");
    const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (isNaN(h) || isNaN(m)) return null; return h * 60 + m;
  }
  function fmtHM(totalMin) {
    const t = ((totalMin % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
  }
  function fmtDuration(mins) {
    if (mins == null || mins < 0) return "";
    const h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + "시간 " : "") + (m || !h ? m + "분" : "").trim();
  }
  function stayMinutes(t) {
    if (!t) return null; const a = minOfTime(t.in), b = minOfTime(t.out);
    if (a == null || b == null) return null; return Math.max(0, b - a);
  }
  // 라운드 시작 시간(세션 시작 + 30분 단위 * idx)
  function roundTime(startTime, idx, stepMin) {
    const base = minOfTime(startTime); if (base == null) return "";
    return fmtHM(base + idx * (stepMin || 30));
  }
  // 오늘보다 과거 날짜인지 (지난 날짜는 대진 생성 불가)
  function isPastDate(date) { return !!date && String(date) < todayStr(); }

  function defaultState() {
    return {
      schemaVersion: 2,
      room: {
        code: "LOCAL", name: "우리 클럽",
        adminId: "admin", adminPw: "1234",
        repAdmins: [], // {id, name, loginId, loginPw, scope:'sat'|'sun'|'both'}
        options: { scoringEnabled: false }
      },
      members: [], // {id,name,birth,type,ntrp,club:'sat'|'sun'|'both',status,active,loginId,loginPw}
      clubs: {
        sat: { session: newSession(), history: [] },
        sun: { session: newSession(), history: [] }
      }
    };
  }

  // ── 클럽 선택 (동기화 안 함) ──────────────────────────────────────────
  let activeClub = "sat";
  function getActiveClub() { return activeClub; }
  function setActiveClub(c) {
    if (c === "sat" || c === "sun") { activeClub = c; notify(); }
  }
  function normClub(c) { return (c === "sat" || c === "sun" || c === "both") ? c : "both"; }
  function normScope(s) { return (s === "sat" || s === "sun" || s === "both") ? s : "both"; }

  function deepClone(o) { return o == null ? null : JSON.parse(JSON.stringify(o)); }

  // 상태 구성: 마이그레이션 + 기본값 보강 + 클럽 별칭 정의
  function buildState(newState) {
    const ns = newState ? deepClone(newState) : {};
    // 구버전(스키마1: 최상위 session/history) → clubs.sat 으로 이전
    if (ns.session && !ns.clubs) {
      ns.clubs = {
        sat: { session: ns.session, history: Array.isArray(ns.history) ? ns.history : [] },
        sun: { session: newSession(), history: [] }
      };
    }
    delete ns.session; delete ns.history;

    const st = Object.assign(defaultState(), ns);
    st.room = Object.assign({}, defaultState().room, ns.room || {});
    if (!Array.isArray(st.room.repAdmins)) st.room.repAdmins = [];
    if (!st.room.options) st.room.options = { scoringEnabled: false };
    ensureClubs(st);
    // 보안: 생년월일은 더 이상 수집/보관하지 않음 — 기존 데이터에서도 제거
    if (Array.isArray(st.members)) st.members.forEach(function (m) { delete m.birth; });
    defineClubAliases(st);
    return st;
  }

  function ensureClubs(st) {
    if (!st.clubs) st.clubs = {};
    ["sat", "sun"].forEach(function (c) {
      if (!st.clubs[c]) st.clubs[c] = { session: newSession(), history: [] };
      if (!st.clubs[c].session) st.clubs[c].session = newSession();
      if (!Array.isArray(st.clubs[c].history)) st.clubs[c].history = [];
    });
  }

  // state.session / state.history → 활성 클럽으로 연결 (비열거: 직렬화에서 제외)
  function defineClubAliases(st) {
    Object.defineProperty(st, "session", {
      enumerable: false, configurable: true,
      get: function () { return st.clubs[activeClub].session; },
      set: function (v) { st.clubs[activeClub].session = v; }
    });
    Object.defineProperty(st, "history", {
      enumerable: false, configurable: true,
      get: function () { return st.clubs[activeClub].history; },
      set: function (v) { st.clubs[activeClub].history = v; }
    });
  }

  const subscribers = [];
  let state = buildState(null);
  let saveTimer = null;
  let persistFn = null;

  function subscribe(fn) {
    subscribers.push(fn);
    return function () { const i = subscribers.indexOf(fn); if (i >= 0) subscribers.splice(i, 1); };
  }
  function notify() {
    subscribers.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }
  function commit() { notify(); schedulePersist(); }
  function schedulePersist() {
    if (!persistFn) return;
    // 즉시(다음 틱) 저장 — 동기 연속 변경은 1회로 합치되, 새로고침 전에 반드시 반영
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; persistFn(state.room.code, state); }, 0);
  }
  // 대기 중인 저장을 즉시 실행 (페이지 떠나기 전 등)
  function flushPersist() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (persistFn) persistFn(state.room.code, state);
  }
  function setPersist(fn) { persistFn = fn; }
  function get() { return state; }

  function replace(newState) { state = buildState(newState); commit(); }
  function replaceFromRemote(newState) { state = buildState(newState); notify(); }

  // ── 회원 ────────────────────────────────────────────────────────────
  function parseNtrp(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return null;
    return Math.min(7, Math.max(1, n));
  }

  function normGender(g) {
    if (!g) return null;
    g = String(g).trim();
    if (/^(f|여|여자|female|w)$/i.test(g)) return "F";
    if (/^(m|남|남자|male)$/i.test(g)) return "M";
    return null;
  }
  // 구력(년) → 대략적 NTRP 추정 (대진 밸런싱용)
  function ntrpFromYears(y) {
    if (y == null || isNaN(y)) return null;
    if (y < 1) return 2.0; if (y < 2) return 2.5; if (y < 4) return 3.0;
    if (y < 7) return 3.5; if (y < 10) return 4.0; return 4.5;
  }
  // 대진에 쓸 유효 NTRP: ntrp 우선 → 구력 추정 → 기본 3.0
  function effectiveNtrp(m) {
    if (m && typeof m.ntrp === "number") return m.ntrp;
    const y = m ? ntrpFromYears(m.years) : null;
    return y != null ? y : 3.0;
  }

  function addMember(name, type, ntrp, club, extra) {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    extra = extra || {};
    const m = {
      id: uid(), name: trimmed,
      type: type === "guest" ? "guest" : "regular",
      ntrp: parseNtrp(ntrp), club: normClub(club),
      status: "approved", active: true
    };
    const g = normGender(extra.gender); if (g) m.gender = g;
    if (extra.years != null && extra.years !== "") { const y = parseInt(extra.years, 10); if (!isNaN(y)) m.years = Math.max(0, y); }
    // 게스트는 방문 날짜 기록 (회원 탭 날짜별 구분/엑셀용)
    if (m.type === "guest") m.date = String(extra.date || (state.session && state.session.date) || todayStr()).trim();
    state.members.push(m);
    commit();
    return m;
  }

  function requestSignup(name, ntrp, loginId, loginPw, club, email) {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const m = {
      id: uid(), name: trimmed,
      type: "regular", ntrp: parseNtrp(ntrp), club: normClub(club),
      status: "pending", active: true,
      loginId: (loginId || "").trim(), loginPw: (loginPw || "").trim(),
      email: (email || "").trim().toLowerCase()
    };
    state.members.push(m);
    commit();
    return m;
  }

  // 이메일로 회원 찾기 (아이디/비번 찾기용)
  function findMembersByEmail(email) {
    const e = (email || "").trim().toLowerCase();
    if (!e) return [];
    return state.members.filter(function (m) { return m.active && (m.email || "").toLowerCase() === e; });
  }
  function setMemberPassword(id, newPw) { updateMember(id, { loginPw: (newPw || "").trim() }); }

  function setMemberClub(id, club) { updateMember(id, { club: normClub(club) }); }

  function findDuplicateLoginId(loginId) {
    const t = (loginId || "").trim();
    if (!t) return false;
    return state.members.some(function (m) { return m.active && m.loginId === t; });
  }
  function getMember(id) { return state.members.find(function (m) { return m.id === id; }) || null; }

  function memberLogin(loginId, loginPw) {
    const id = (loginId || "").trim(), pw = (loginPw || "").trim();
    if (!id || !pw) return { ok: false, reason: "empty" };
    const match = state.members.find(function (m) { return m.active && m.loginId === id && m.loginPw === pw; });
    if (!match) return { ok: false, reason: "nomatch" };
    if (match.status === "pending") return { ok: false, reason: "pending", member: match };
    return { ok: true, member: match };
  }

  function approveMember(id, type) {
    const m = getMember(id);
    if (!m) return;
    m.status = "approved";
    if (type) m.type = type;
    commit();
  }
  function updateMember(id, patch) {
    const m = getMember(id);
    if (!m) return;
    Object.assign(m, patch);
    // 게스트로 전환되며 날짜가 없으면 현재 세션 날짜 부여
    if (m.type === "guest" && !m.date) m.date = String((state.session && state.session.date) || todayStr());
    commit();
  }
  function removeMember(id) {
    const m = getMember(id);
    if (!m) return;
    m.active = false;
    delete state.clubs.sat.session.attendance[id];
    delete state.clubs.sun.session.attendance[id];
    commit();
  }

  // 승인된 활성 회원 전체
  function activeMembers() {
    return state.members.filter(function (m) { return m.active && m.status !== "pending"; });
  }
  // 특정 클럽 소속 승인 회원 (둘다/미지정 포함)
  function clubMembers(club) {
    return activeMembers().filter(function (m) {
      return m.club === club || m.club === "both" || !m.club;
    });
  }
  function pendingMembers() {
    return state.members.filter(function (m) { return m.active && m.status === "pending"; });
  }
  function findDuplicateName(name) {
    const t = (name || "").trim();
    return state.members.some(function (m) { return m.active && m.name === t; });
  }

  // ── 관리자 (총괄/대표) ──────────────────────────────────────────────
  function adminCreds() {
    const r = state.room || {};
    return { id: r.adminId || "admin", pw: r.adminPw || "1234" };
  }
  function checkAdminLogin(id, pw) {
    const c = adminCreds();
    return String(id) === c.id && String(pw) === c.pw;
  }
  // 통합 로그인 → { ok, role:'super'|'rep', scope, name, repId }
  function adminLogin(id, pw) {
    const c = adminCreds();
    if (String(id) === c.id && String(pw) === c.pw) {
      return { ok: true, role: "super", scope: "both", name: "총괄관리자" };
    }
    const reps = state.room.repAdmins || [];
    const r = reps.find(function (x) { return x.loginId === String(id) && x.loginPw === String(pw); });
    if (r) return { ok: true, role: "rep", scope: normScope(r.scope), name: r.name || "대표관리자", repId: r.id };
    return { ok: false };
  }
  function setAdminCreds(id, pw) {
    state.room.adminId = String(id);
    state.room.adminPw = String(pw);
    commit();
  }

  // ── 대진 생성 권한 (관리자가 특정 회원에게 부여) ──
  function drawPermitIds() { return (state.room && state.room.drawPermitIds) || []; }
  function canGenerateDraw(memberId) { return !!memberId && drawPermitIds().indexOf(memberId) >= 0; }
  function setDrawPermit(id, on) {
    if (!state.room.drawPermitIds) state.room.drawPermitIds = [];
    const arr = state.room.drawPermitIds;
    const i = arr.indexOf(id);
    if (on && i < 0) arr.push(id);
    if (!on && i >= 0) arr.splice(i, 1);
    commit();
  }
  function addRepAdmin(name, loginId, loginPw, scope) {
    const r = {
      id: uid(), name: (name || "").trim() || "대표관리자",
      loginId: (loginId || "").trim(), loginPw: (loginPw || "").trim(),
      scope: normScope(scope)
    };
    if (!r.loginId || !r.loginPw) return null;
    state.room.repAdmins.push(r);
    commit();
    return r;
  }
  function removeRepAdmin(id) {
    state.room.repAdmins = (state.room.repAdmins || []).filter(function (r) { return r.id !== id; });
    commit();
  }
  function repAdmins() { return state.room.repAdmins || []; }

  // ── 출석 / 세션 (활성 클럽) ──────────────────────────────────────────
  function toggleAttendance(id, present) {
    if (typeof present === "undefined") present = !state.session.attendance[id];
    state.session.attendance[id] = !!present;
    commit();
  }
  // 출퇴근 시간 기록 (field: 'in' 출근 / 'out' 퇴근)
  function setMemberTime(id, field, value) {
    if (!state.session.times) state.session.times = {};
    if (!state.session.times[id]) state.session.times[id] = {};
    if (value) state.session.times[id][field] = value;
    else delete state.session.times[id][field];
    commit();
  }

  function presentMembers() {
    const att = state.session.attendance;
    return clubMembers(activeClub).filter(function (m) { return att[m.id]; });
  }
  function setSessionConfig(patch) {
    Object.assign(state.session, patch);
    if (patch && typeof patch.scoring !== "undefined") {
      state.room.options.scoringEnabled = !!patch.scoring;
    }
    commit();
  }
  function setGenerated(generated) { state.session.generated = generated; commit(); }

  // ── 기록 ────────────────────────────────────────────────────────────
  function clone(obj) { return obj == null ? null : JSON.parse(JSON.stringify(obj)); }
  function namesForGenerated(generated) {
    const map = {};
    function put(ids) {
      (ids || []).forEach(function (id) {
        const m = getMember(id);
        map[id] = m ? m.name : (map[id] || "?");
      });
    }
    if (generated && generated.rounds) {
      generated.rounds.forEach(function (rd) {
        rd.matches.forEach(function (mm) { put(mm.teamA); put(mm.teamB); });
        put(rd.byes);
      });
    }
    return map;
  }
  function archiveSession() {
    const s = state.session;
    if (!s.generated || !s.generated.rounds || s.generated.rounds.length === 0) return false;
    const record = {
      id: uid(), date: s.date, mode: s.mode, courts: s.courts, rounds: s.rounds,
      scoring: s.scoring, generated: clone(s.generated),
      names: namesForGenerated(s.generated), times: clone(s.times),
      startTime: s.startTime, endTime: s.endTime, savedAt: todayStr()
    };
    state.history.unshift(record);
    state.session = {
      id: uid(), date: todayStr(), mode: s.mode, courts: s.courts, rounds: s.rounds,
      seed: 1, scoring: s.scoring, attendance: {}, generated: null
    };
    commit();
    return true;
  }
  function deleteHistory(id) {
    state.history = state.history.filter(function (h) { return h.id !== id; });
    commit();
  }
  // 업로드한 한 날짜의 데이터(출석/출퇴근/대진)를 적용:
  //  - 현재 세션 날짜면 진행 세션에, 아니면 날짜별 기록으로 보관
  function applyImportedDate(date, p) {
    p = p || {};
    if (date && date === state.session.date) {
      const s = state.session;
      if (p.attendance) Object.keys(p.attendance).forEach(function (id) { s.attendance[id] = true; });
      if (p.times) { s.times = s.times || {}; Object.assign(s.times, p.times); }
      if (p.mode) s.mode = p.mode;
      if (p.scoring) s.scoring = true;
      if (p.generated && p.generated.rounds && p.generated.rounds.length) s.generated = p.generated;
      commit();
      return "session";
    }
    // 같은 날짜 기록이 있으면 병합(출퇴근 따로 + 대진 따로 올려도 합쳐짐)
    const existing = state.history.find(function (h) { return h.date === date; });
    if (existing) {
      if (p.generated && p.generated.rounds && p.generated.rounds.length) {
        existing.generated = p.generated;
        if (p.mode) existing.mode = p.mode;
        if (p.scoring) existing.scoring = true;
      }
      existing.names = Object.assign({}, existing.names || {}, p.names || {});
      existing.times = Object.assign({}, existing.times || {}, p.times || {});
      existing.attendance = Object.assign({}, existing.attendance || {}, p.attendance || {});
      commit();
      return "history";
    }
    const gen = (p.generated && p.generated.rounds) ? p.generated
      : { rounds: [], stats: { gamesPlayed: {}, byeCount: {} }, warnings: [], names: p.names || {} };
    addHistoryRecord({
      date: date, mode: p.mode || "doubles", scoring: !!p.scoring,
      generated: gen, names: p.names || {}, times: p.times || {}, attendance: p.attendance || {}
    });
    return "history";
  }

  // 기록의 날짜 수정 → 날짜순 재정렬
  function setHistoryDate(id, date) {
    const h = state.history.find(function (x) { return x.id === id; });
    if (!h) return;
    const v = String(date || "").trim();
    if (!v) return;
    h.date = v;
    state.history.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    commit();
  }
  // 기록 레코드 추가(엑셀 업로드 복원용). 같은 날짜가 있으면 교체.
  function addHistoryRecord(rec) {
    if (!rec || !rec.generated) return false;
    if (!rec.id) rec.id = uid();
    if (!rec.savedAt) rec.savedAt = todayStr();
    state.history = state.history.filter(function (h) { return h.date !== rec.date; });
    state.history.unshift(rec);
    state.history.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    commit();
    return true;
  }
  function rankingSessions() {
    const list = state.history.map(function (h) { return { generated: h.generated, names: h.names }; });
    if (state.session.generated && state.session.generated.rounds) {
      list.unshift({ generated: state.session.generated, names: namesForGenerated(state.session.generated) });
    }
    return list;
  }

  global.TennisState = {
    uid: uid,
    todayStr: todayStr,
    defaultState: defaultState,
    subscribe: subscribe,
    commit: commit,
    setPersist: setPersist,
    flushPersist: flushPersist,
    get: get,
    replace: replace,
    replaceFromRemote: replaceFromRemote,
    getActiveClub: getActiveClub,
    setActiveClub: setActiveClub,
    parseNtrp: parseNtrp,
    effectiveNtrp: effectiveNtrp,
    drawPermitIds: drawPermitIds,
    canGenerateDraw: canGenerateDraw,
    setDrawPermit: setDrawPermit,
    setMemberTime: setMemberTime,
    stayMinutes: stayMinutes,
    fmtDuration: fmtDuration,
    roundTime: roundTime,
    isPastDate: isPastDate,
    addMember: addMember,
    requestSignup: requestSignup,
    setMemberClub: setMemberClub,
    approveMember: approveMember,
    updateMember: updateMember,
    removeMember: removeMember,
    activeMembers: activeMembers,
    clubMembers: clubMembers,
    pendingMembers: pendingMembers,
    findDuplicateName: findDuplicateName,
    findDuplicateLoginId: findDuplicateLoginId,
    findMembersByEmail: findMembersByEmail,
    setMemberPassword: setMemberPassword,
    getMember: getMember,
    memberLogin: memberLogin,
    adminCreds: adminCreds,
    checkAdminLogin: checkAdminLogin,
    adminLogin: adminLogin,
    setAdminCreds: setAdminCreds,
    addRepAdmin: addRepAdmin,
    removeRepAdmin: removeRepAdmin,
    repAdmins: repAdmins,
    toggleAttendance: toggleAttendance,
    presentMembers: presentMembers,
    setSessionConfig: setSessionConfig,
    setGenerated: setGenerated,
    archiveSession: archiveSession,
    deleteHistory: deleteHistory,
    setHistoryDate: setHistoryDate,
    addHistoryRecord: addHistoryRecord,
    applyImportedDate: applyImportedDate,
    rankingSessions: rankingSessions,
    namesForGenerated: namesForGenerated
  };
})(typeof window !== "undefined" ? window : this);
