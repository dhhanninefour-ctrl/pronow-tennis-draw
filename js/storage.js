/*
 * storage.js — localStorage 영속화 어댑터 + JSON 내보내기/불러오기
 * 전역: window.TennisStorage
 */
(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const KEY_PREFIX = "tennisDraw:v1:";

  function keyFor(room) {
    return KEY_PREFIX + (room || "LOCAL");
  }

  function load(room) {
    try {
      const raw = global.localStorage.getItem(keyFor(room));
      if (!raw) return null;
      const data = JSON.parse(raw);
      return migrate(data);
    } catch (e) {
      console.warn("저장된 데이터를 불러오지 못했습니다:", e);
      return null;
    }
  }

  function save(room, state) {
    try {
      const payload = Object.assign({}, state, { schemaVersion: SCHEMA_VERSION });
      global.localStorage.setItem(keyFor(room), JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error("저장 실패:", e);
      return false;
    }
  }

  function clear(room) {
    global.localStorage.removeItem(keyFor(room));
  }

  // 향후 스키마 변경 대비 마이그레이션 훅
  function migrate(data) {
    if (!data || typeof data !== "object") return null;
    if (!data.schemaVersion) data.schemaVersion = SCHEMA_VERSION;
    return data;
  }

  // ── JSON 내보내기 (파일 다운로드) ──────────────────────────────────────
  function exportToFile(state, filename) {
    const blob = new global.Blob([JSON.stringify(state, null, 2)], {
      type: "application/json"
    });
    const url = global.URL.createObjectURL(blob);
    const a = global.document.createElement("a");
    a.href = url;
    a.download = filename || "tennis-draw-backup.json";
    global.document.body.appendChild(a);
    a.click();
    global.document.body.removeChild(a);
    global.URL.revokeObjectURL(url);
  }

  // ── JSON 불러오기 (파일 선택) → Promise<state> ────────────────────────
  function importFromFile() {
    return new Promise(function (resolve, reject) {
      const input = global.document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) return reject(new Error("파일이 선택되지 않았습니다."));
        const reader = new global.FileReader();
        reader.onload = function () {
          try {
            resolve(migrate(JSON.parse(reader.result)));
          } catch (e) {
            reject(new Error("올바른 JSON 파일이 아닙니다."));
          }
        };
        reader.onerror = function () { reject(new Error("파일 읽기 실패")); };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  global.TennisStorage = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    load: load,
    save: save,
    clear: clear,
    exportToFile: exportToFile,
    importFromFile: importFromFile
  };
})(typeof window !== "undefined" ? window : this);
