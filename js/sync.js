/*
 * sync.js — 로컬/클라우드 동기화 + 역할(관리자/회원)
 * 전역: window.TennisSync
 *
 * 역할:
 *  - 관리자: URL 경로가 /admin 이고 PIN 통과 → 전체 권한(쓰기/실시간 push).
 *  - 회원: 그 외 → 보기 전용. 단 "가입 신청"만 클라우드에 추가 가능.
 *  - 로컬 모드(내 기기, file://)는 항상 관리자.
 * 공유 단위: 클라우드면 고정 룸 "MAIN"(또는 ?room=). 모두 같은 클럽을 봄.
 */
(function (global) {
  "use strict";
  const S = global.TennisState;
  const Storage = global.TennisStorage;
  const Cloud = global.TennisSupabase;

  const clientId = (global.crypto && global.crypto.randomUUID)
    ? global.crypto.randomUUID() : "c" + Math.random().toString(36).slice(2);

  let mode = "local";
  let roomCode = null;
  let admin = true;
  let roomExisted = false;
  let applyingRemote = false;
  let unsub = null;

  function urlParam(name) {
    try { return new global.URLSearchParams(global.location.search).get(name); }
    catch (e) { return null; }
  }

  // 경로가 /admin (또는 /admin/) 으로 끝나면 관리자 화면
  function isAdminPath() {
    const p = (global.location.pathname || "").replace(/\/+$/, "");
    return /\/admin$/i.test(p) || /(^|\/)admin\.html$/i.test(global.location.pathname || "");
  }

  function getRoomCode() {
    const r = urlParam("room");
    if (r) return r.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return isCloudAvailable() ? "MAIN" : null;
  }

  function isCloudAvailable() { return !!(Cloud && Cloud.isConfigured()); }

  function persist(room, state) {
    if (applyingRemote) return;
    Storage.save(roomCode || "LOCAL", state);
    if (mode === "cloud" && roomCode && admin) {
      pushNow();
    }
  }

  // 강제 클라우드 push (관리자 확정 후 최초 생성/저장에도 사용)
  function pushNow() {
    if (mode !== "cloud" || !roomCode) return Promise.resolve(false);
    const state = S.get();
    state._writer = clientId;
    state._ts = new Date().toISOString();
    return Cloud.saveRoom(roomCode, state.room ? state.room.name : "", state);
  }

  function applyRemote(row) {
    if (!row || !row.state) return;
    if (row.state._writer === clientId) return;
    // 원격 적용은 되쓰지 않음(replaceFromRemote) → 핑퐁 루프 방지
    S.replaceFromRemote(row.state);
    Storage.save(roomCode, row.state);
    if (global.TennisUI && global.TennisUI.onRemoteUpdate) global.TennisUI.onRemoteUpdate();
  }

  function init() {
    S.setPersist(persist);
    roomCode = getRoomCode();
    admin = true; // 임시(로컬 기본). 클라우드면 app이 PIN 게이트로 확정.

    if (isCloudAvailable() && roomCode) {
      mode = "cloud";
      return Cloud.loadRoom(roomCode).then(function (row) {
        if (row && row.state && row.state.members) {
          roomExisted = true;
          S.replaceFromRemote(Object.assign({}, row.state, { _writer: null }));
        } else {
          roomExisted = false;
          const cached = Storage.load(roomCode) || Storage.load("LOCAL");
          if (cached) S.replace(cached);
        }
        admin = false; // 클라우드 기본은 회원. app이 /admin+PIN 통과 시 setAdmin(true).
        unsub = Cloud.subscribeRoom(roomCode, applyRemote);
        return info();
      }).catch(function (e) {
        console.warn("클라우드 연결 실패, 로컬 모드:", e);
        mode = "local"; admin = true; loadLocal();
        return info();
      });
    }

    mode = "local"; admin = true; loadLocal();
    return Promise.resolve(info());
  }

  function loadLocal() {
    const saved = Storage.load("LOCAL");
    if (saved) S.replace(saved);
  }

  function info() {
    return { mode: mode, roomCode: roomCode, admin: admin, adminPath: isAdminPath(), roomExisted: roomExisted };
  }

  function setAdmin(v) { admin = !!v; }

  // 회원 가입 신청: 로컬에 추가 후, 클라우드면 즉시 push (회원도 이 동작은 허용)
  function submitSignup(name, ntrp, loginId, loginPw, club, email) {
    const m = S.requestSignup(name, ntrp, loginId, loginPw, club, email);
    if (!m) return Promise.resolve(false);
    if (mode === "cloud" && roomCode) {
      const state = S.get();
      state._writer = clientId;
      state._ts = new Date().toISOString();
      return Cloud.saveRoom(roomCode, state.room ? state.room.name : "", state).then(function () { return m; });
    }
    return Promise.resolve(m);
  }

  // 회원이 본인 변경(비밀번호 등)을 클라우드에 반영 (회원도 허용되는 쓰기)
  function memberPush() {
    if (mode !== "cloud" || !roomCode) return Promise.resolve(false);
    const state = S.get();
    state._writer = clientId;
    state._ts = new Date().toISOString();
    return Cloud.saveRoom(roomCode, state.room ? state.room.name : "", state);
  }

  function baseOrigin() { return global.location.origin; }
  function memberUrl() {
    if (mode !== "cloud") return baseOrigin() + "/";
    return baseOrigin() + "/" + (roomCode && roomCode !== "MAIN" ? "?room=" + roomCode : "");
  }
  function adminUrl() {
    return baseOrigin() + "/admin" + (roomCode && roomCode !== "MAIN" ? "?room=" + roomCode : "");
  }

  global.TennisSync = {
    init: init,
    getMode: function () { return mode; },
    getRoomCode: function () { return roomCode; },
    isAdmin: function () { return admin; },
    setAdmin: setAdmin,
    isAdminPath: isAdminPath,
    isCloudAvailable: isCloudAvailable,
    roomExisted: function () { return roomExisted; },
    pushNow: pushNow,
    memberPush: memberPush,
    submitSignup: submitSignup,
    memberUrl: memberUrl,
    adminUrl: adminUrl,
    clientId: clientId
  };
})(typeof window !== "undefined" ? window : this);
