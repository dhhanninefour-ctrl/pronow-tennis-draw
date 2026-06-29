/*
 * supabase.js — Supabase 클라이언트 래퍼 (옵션)
 * 전역: window.TennisSupabase
 *
 * config.js 의 window.TENNIS_CONFIG 와 CDN 의 window.supabase(SDK)가 있을 때만 활성.
 * 없으면 isConfigured()=false → 앱은 로컬 모드로 동작.
 */
(function (global) {
  "use strict";

  let client = null;

  function cfg() {
    return global.TENNIS_CONFIG || {};
  }

  function isConfigured() {
    const c = cfg();
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && global.supabase && global.supabase.createClient);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      client = global.supabase.createClient(cfg().SUPABASE_URL, cfg().SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 5 } }
      });
    }
    return client;
  }

  // 룸 1행 읽기 → { code, name, state, updated_at } | null
  function loadRoom(code) {
    const c = getClient();
    if (!c) return Promise.resolve(null);
    return c.from("rooms").select("*").eq("code", code).maybeSingle().then(function (res) {
      if (res.error) { console.warn("loadRoom:", res.error.message); return null; }
      return res.data || null;
    });
  }

  // 룸 1행 upsert (전체 상태 저장)
  function saveRoom(code, name, state) {
    const c = getClient();
    if (!c) return Promise.resolve(false);
    return c.from("rooms").upsert({
      code: code,
      name: name || "",
      state: state,
      updated_at: new Date().toISOString()
    }, { onConflict: "code" }).then(function (res) {
      if (res.error) { console.warn("saveRoom:", res.error.message); return false; }
      return true;
    });
  }

  // 룸 변경 실시간 구독 → cb(newRow)
  function subscribeRoom(code, cb) {
    const c = getClient();
    if (!c) return function () {};
    const channel = c.channel("room:" + code)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: "code=eq." + code },
        function (payload) { if (payload.new) cb(payload.new); })
      .subscribe();
    return function unsubscribe() { c.removeChannel(channel); };
  }

  global.TennisSupabase = {
    isConfigured: isConfigured,
    getClient: getClient,
    loadRoom: loadRoom,
    saveRoom: saveRoom,
    subscribeRoom: subscribeRoom
  };
})(typeof window !== "undefined" ? window : this);
