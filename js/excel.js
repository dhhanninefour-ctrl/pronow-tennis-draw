/*
 * excel.js — 회원 명단 엑셀(.xlsx)/CSV 업로드·다운로드
 * 전역: window.TennisExcel
 *
 * SheetJS(XLSX)를 필요할 때만 CDN에서 지연 로드. 실패 시 CSV로 대체.
 * 컬럼: 이름 / 생년월일 / 구분(정기·게스트)
 */
(function (global) {
  "use strict";

  const CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

  function ensureXLSX() {
    return new Promise(function (resolve) {
      if (global.XLSX) return resolve(true);
      const s = global.document.createElement("script");
      s.src = CDN;
      s.onload = function () { resolve(!!global.XLSX); };
      s.onerror = function () { resolve(false); };
      global.document.head.appendChild(s);
    });
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function normBirth(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v)) return fmtDate(v);
    if (typeof v === "number" && v > 0) { // 엑셀 날짜 시리얼
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d)) return fmtDate(d);
    }
    return String(v).trim();
  }

  function rowsFromMembers(members) {
    return members.map(function (m) {
      return {
        "이름": m.name,
        "구분": m.type === "guest" ? "게스트" : "정기",
        "NTRP": (typeof m.ntrp === "number") ? m.ntrp.toFixed(1) : ""
      };
    });
  }

  // ── 다운로드 ──────────────────────────────────────────────────────────
  function exportMembers(members) {
    const rows = rowsFromMembers(members);
    return ensureXLSX().then(function (ok) {
      if (ok && global.XLSX) {
        const ws = global.XLSX.utils.json_to_sheet(rows, { header: ["이름", "구분", "NTRP"] });
        ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 8 }];
        const wb = global.XLSX.utils.book_new();
        global.XLSX.utils.book_append_sheet(wb, ws, "회원");
        global.XLSX.writeFile(wb, "회원목록.xlsx");
        return "xlsx";
      }
      // CSV 대체 (엑셀 한글 깨짐 방지용 BOM)
      const header = ["이름", "구분", "NTRP"];
      const lines = [header.join(",")].concat(rows.map(function (r) {
        return header.map(function (h) { return csvCell(r[h]); }).join(",");
      }));
      downloadBlob(new global.Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), "회원목록.csv");
      return "csv";
    });
  }

  function csvCell(v) {
    v = String(v == null ? "" : v);
    if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function downloadBlob(blob, name) {
    const u = global.URL.createObjectURL(blob);
    const a = global.document.createElement("a");
    a.href = u; a.download = name;
    global.document.body.appendChild(a); a.click(); global.document.body.removeChild(a);
    global.URL.revokeObjectURL(u);
  }

  // ── 업로드 → Promise<[{name, birth, type}]> ──────────────────────────
  function importMembers(file) {
    const isCsv = /\.csv$/i.test(file.name || "") || /csv/i.test(file.type || "");
    return ensureXLSX().then(function (ok) {
      return new Promise(function (resolve, reject) {
        const reader = new global.FileReader();
        reader.onload = function () {
          try {
            let rows;
            if (!isCsv && ok && global.XLSX) {
              const data = new global.Uint8Array(reader.result);
              const wb = global.XLSX.read(data, { type: "array", cellDates: true });
              const ws = wb.Sheets[wb.SheetNames[0]];
              rows = global.XLSX.utils.sheet_to_json(ws, { defval: "" });
            } else {
              // CSV 또는 XLSX 미로드 → 전용 CSV 파서
              rows = parseCSV(new global.TextDecoder("utf-8").decode(reader.result));
            }
            resolve(mapRows(rows));
          } catch (e) { reject(new Error("엑셀을 읽지 못했습니다. 형식을 확인하세요.")); }
        };
        reader.onerror = function () { reject(new Error("파일 읽기 실패")); };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function mapRows(rows) {
    return rows.map(function (r) {
      const keys = Object.keys(r);
      function raw(matchers) {
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i].toLowerCase().replace(/\s/g, "");
          for (let j = 0; j < matchers.length; j++) {
            if (k.indexOf(matchers[j]) >= 0) return r[keys[i]];
          }
        }
        return "";
      }
      const name = String(raw(["이름", "name", "성명"]) || "").trim();
      const typeRaw = String(raw(["구분", "유형", "type", "회원"]) || "");
      const type = /게스트|guest/i.test(typeRaw) ? "guest" : "regular";
      const ntrpRaw = raw(["ntrp", "실력", "등급", "레벨", "level"]);
      const nt = parseFloat(ntrpRaw);
      const ntrp = isNaN(nt) ? "" : nt;
      return { name: name, type: type, ntrp: ntrp };
    }).filter(function (x) { return x.name; });
  }

  // 간단 CSV 파서 (따옴표/콤마 처리) → 객체 배열(첫 줄을 헤더로)
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* skip */ }
        else field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    if (rows.length < 1) return [];
    const header = rows[0];
    return rows.slice(1).filter(function (r) { return r.some(function (v) { return String(v).trim(); }); })
      .map(function (r) {
        const o = {};
        header.forEach(function (h, i) { o[h] = r[i] == null ? "" : r[i]; });
        return o;
      });
  }

  // ── 대진 양식 ────────────────────────────────────────────────────────
  // 원본 행 읽기 (헤더→객체 배열)
  function readRows(file) {
    const isCsv = /\.csv$/i.test(file.name || "") || /csv/i.test(file.type || "");
    return ensureXLSX().then(function (ok) {
      return new Promise(function (resolve, reject) {
        const reader = new global.FileReader();
        reader.onload = function () {
          try {
            let rows;
            if (!isCsv && ok && global.XLSX) {
              const data = new global.Uint8Array(reader.result);
              const wb = global.XLSX.read(data, { type: "array", cellDates: true });
              const ws = wb.Sheets[wb.SheetNames[0]];
              rows = global.XLSX.utils.sheet_to_json(ws, { defval: "" });
            } else {
              rows = parseCSV(new global.TextDecoder("utf-8").decode(reader.result));
            }
            resolve(rows);
          } catch (e) { reject(new Error("파일을 읽지 못했습니다.")); }
        };
        reader.onerror = function () { reject(new Error("파일 읽기 실패")); };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  const DRAW_HEADER = ["라운드", "코트", "A팀", "B팀", "A점수", "B점수", "휴식"];
  function exportDraw(rows) {
    return ensureXLSX().then(function (ok) {
      if (ok && global.XLSX) {
        const ws = global.XLSX.utils.json_to_sheet(rows, { header: DRAW_HEADER });
        ws["!cols"] = [{ wch: 7 }, { wch: 6 }, { wch: 22 }, { wch: 22 }, { wch: 7 }, { wch: 7 }, { wch: 24 }];
        const wb = global.XLSX.utils.book_new();
        global.XLSX.utils.book_append_sheet(wb, ws, "대진");
        global.XLSX.writeFile(wb, "대진양식.xlsx");
        return "xlsx";
      }
      const lines = [DRAW_HEADER.join(",")].concat(rows.map(function (r) {
        return DRAW_HEADER.map(function (h) { return csvCell(r[h]); }).join(",");
      }));
      downloadBlob(new global.Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), "대진양식.csv");
      return "csv";
    });
  }

  global.TennisExcel = {
    exportMembers: exportMembers, importMembers: importMembers,
    readRows: readRows, exportDraw: exportDraw
  };
})(typeof window !== "undefined" ? window : this);
