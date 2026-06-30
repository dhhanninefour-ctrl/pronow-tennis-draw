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

  const MEMBER_HEADER = ["이름", "아이디", "비밀번호", "구분", "성별", "NTRP", "구력", "이메일", "날짜"];
  function rowsFromMembers(members) {
    return members.map(function (m) {
      return {
        "이름": m.name,
        "아이디": m.loginId || "",
        "비밀번호": m.loginPw || "",
        "구분": m.type === "guest" ? "게스트" : "정기",
        "성별": m.gender === "F" ? "여" : m.gender === "M" ? "남" : "",
        "NTRP": (typeof m.ntrp === "number") ? m.ntrp.toFixed(1) : "",
        "구력": (typeof m.years === "number") ? m.years : "",
        "이메일": m.email || "",
        "날짜": m.type === "guest" ? (m.date || "") : ""
      };
    });
  }

  // ── 다운로드 ──────────────────────────────────────────────────────────
  function exportMembers(members) {
    const rows = rowsFromMembers(members);
    return ensureXLSX().then(function (ok) {
      if (ok && global.XLSX) {
        const ws = global.XLSX.utils.json_to_sheet(rows, { header: MEMBER_HEADER });
        ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 20 }, { wch: 12 }];
        const wb = global.XLSX.utils.book_new();
        global.XLSX.utils.book_append_sheet(wb, ws, "회원");
        global.XLSX.writeFile(wb, "회원목록.xlsx");
        return "xlsx";
      }
      // CSV 대체 (엑셀 한글 깨짐 방지용 BOM)
      const header = MEMBER_HEADER;
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
      const loginId = String(raw(["아이디", "id", "loginid", "아이디(id)"]) || "").trim();
      const loginPw = String(raw(["비밀번호", "pw", "password", "암호"]) || "").trim();
      const email = String(raw(["이메일", "email", "메일"]) || "").trim();
      const gender = String(raw(["성별", "gender", "sex"]) || "").trim();
      const yearsRaw = raw(["구력", "years", "경력"]);
      const years = (yearsRaw === "" || yearsRaw == null) ? "" : yearsRaw;
      const date = String(raw(["날짜", "date"]) || "").trim();
      return { name: name, type: type, ntrp: ntrp, loginId: loginId, loginPw: loginPw, email: email, gender: gender, years: years, date: date };
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
          } catch (e) { reject(new Error("엑셀을 읽지 못했습니다. 파일에 암호/보호가 걸려 있거나 옛 형식일 수 있어요. 엑셀에서 '다른 이름으로 저장 → .xlsx(암호 없이) 또는 .csv'로 저장해 다시 올려주세요.")); }
        };
        reader.onerror = function () { reject(new Error("파일 읽기 실패")); };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  // 여러 시트 한 번에 읽기 → { 시트명: [행...] }  (CSV는 { csv: [행...] })
  function readAllSheets(file) {
    const isCsv = /\.csv$/i.test(file.name || "") || /csv/i.test(file.type || "");
    return ensureXLSX().then(function (ok) {
      return new Promise(function (resolve, reject) {
        const reader = new global.FileReader();
        reader.onload = function () {
          try {
            const out = {};
            if (!isCsv && ok && global.XLSX) {
              const wb = global.XLSX.read(new global.Uint8Array(reader.result), { type: "array", cellDates: true });
              wb.SheetNames.forEach(function (nm) {
                out[nm] = global.XLSX.utils.sheet_to_json(wb.Sheets[nm], { defval: "" });
              });
            } else {
              out.csv = parseCSV(new global.TextDecoder("utf-8").decode(reader.result));
            }
            resolve(out);
          } catch (e) { reject(new Error("엑셀을 읽지 못했습니다. 파일에 암호/보호가 걸려 있거나 옛 형식일 수 있어요. 엑셀에서 '다른 이름으로 저장 → .xlsx(암호 없이) 또는 .csv'로 저장해 다시 올려주세요.")); }
        };
        reader.onerror = function () { reject(new Error("파일 읽기 실패")); };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  const DRAW_HEADER = ["날짜", "라운드", "코트", "A팀", "B팀", "A점수", "B점수", "휴식"];
  const ATT_HEADER = ["날짜", "이름", "구분", "성별", "NTRP", "구력", "출근", "퇴근", "체류(분)"];
  // rows: 대진 행 / attRows(선택): 출퇴근 행 → 있으면 두 번째 시트로 함께 저장
  function exportDraw(rows, attRows) {
    return ensureXLSX().then(function (ok) {
      if (ok && global.XLSX) {
        const wb = global.XLSX.utils.book_new();
        const ws = global.XLSX.utils.json_to_sheet(rows, { header: DRAW_HEADER });
        ws["!cols"] = [{ wch: 12 }, { wch: 7 }, { wch: 6 }, { wch: 22 }, { wch: 22 }, { wch: 7 }, { wch: 7 }, { wch: 24 }];
        global.XLSX.utils.book_append_sheet(wb, ws, "대진");
        if (attRows && attRows.length) {
          const ws2 = global.XLSX.utils.json_to_sheet(attRows, { header: ATT_HEADER });
          ws2["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 9 }];
          global.XLSX.utils.book_append_sheet(wb, ws2, "출퇴근");
        }
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

  // 출퇴근만 단독 다운로드
  function exportAttendance(rows) {
    return ensureXLSX().then(function (ok) {
      if (ok && global.XLSX) {
        const ws = global.XLSX.utils.json_to_sheet(rows, { header: ATT_HEADER });
        ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 9 }];
        const wb = global.XLSX.utils.book_new();
        global.XLSX.utils.book_append_sheet(wb, ws, "출퇴근");
        global.XLSX.writeFile(wb, "출퇴근.xlsx");
        return "xlsx";
      }
      const lines = [ATT_HEADER.join(",")].concat(rows.map(function (r) {
        return ATT_HEADER.map(function (h) { return csvCell(r[h]); }).join(",");
      }));
      downloadBlob(new global.Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), "출퇴근.csv");
      return "csv";
    });
  }

  // ── 기록(결과) 양식 ───────────────────────────────────────────────────
  const HIST_HEADER = ["날짜", "모드", "라운드", "코트", "A팀", "B팀", "A점수", "B점수", "휴식"];
  function exportHistory(rows) {
    return ensureXLSX().then(function (ok) {
      if (ok && global.XLSX) {
        const ws = global.XLSX.utils.json_to_sheet(rows, { header: HIST_HEADER });
        ws["!cols"] = [{ wch: 12 }, { wch: 6 }, { wch: 7 }, { wch: 6 }, { wch: 22 }, { wch: 22 }, { wch: 7 }, { wch: 7 }, { wch: 22 }];
        const wb = global.XLSX.utils.book_new();
        global.XLSX.utils.book_append_sheet(wb, ws, "기록");
        global.XLSX.writeFile(wb, "기록.xlsx");
        return "xlsx";
      }
      const lines = [HIST_HEADER.join(",")].concat(rows.map(function (r) {
        return HIST_HEADER.map(function (h) { return csvCell(r[h]); }).join(",");
      }));
      downloadBlob(new global.Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), "기록.csv");
      return "csv";
    });
  }

  global.TennisExcel = {
    exportMembers: exportMembers, importMembers: importMembers,
    readRows: readRows, readAllSheets: readAllSheets, exportDraw: exportDraw, exportHistory: exportHistory,
    exportAttendance: exportAttendance
  };
})(typeof window !== "undefined" ? window : this);
