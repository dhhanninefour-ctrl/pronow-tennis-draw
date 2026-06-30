// =====================================================================
// monthly-backup — 월 1회 데이터 백업 메일 발송 (Supabase Edge Function)
//
//  · MAIN 룸의 전체 상태를 읽어 회원 명단 CSV(엑셀) + 전체 JSON을 만들고
//    제목 "데이터백업_YYYY-MM-DD" 로 지정한 이메일에 첨부 발송한다.
//  · 발송은 Resend(https://resend.com) HTTP API 사용.
//  · pg_cron 이 매월 1일 00:00(UTC) 이 함수를 호출한다(아래 schema 참고).
//
//  필요한 환경변수(함수 시크릿):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (Supabase가 자동 주입)
//    RESEND_API_KEY   — Resend API 키
//    BACKUP_EMAIL     — 받는 사람 이메일 (예: dhhanninefour@gmail.com)
//    BACKUP_FROM      — 보내는 사람 (기본 onboarding@resend.dev)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function clubLabel(c: string): string {
  return c === "sat" ? "토요일" : c === "sun" ? "일요일" : "둘다";
}
function typeLabel(t: string): string {
  return t === "guest" ? "게스트" : "정기";
}
function statusLabel(s: string): string {
  return s === "approved" ? "승인" : s === "pending" ? "대기" : (s || "");
}
// UTF-8 문자열 → base64 (첨부용)
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: room, error } = await supabase
      .from("rooms").select("state, name, updated_at").eq("code", "MAIN").single();
    if (error) throw error;

    const state = (room?.state ?? {}) as Record<string, unknown>;
    const members = (state.members ?? []) as Array<Record<string, unknown>>;
    const clubName = (room?.name as string) || (state as any)?.room?.name || "PRONOW TENNIS CLUB";

    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const subject = `데이터백업_${dateStr}`;

    // 1) 회원 명단 CSV (엑셀에서 바로 열림 — BOM 포함)
    const header = ["이름", "아이디", "비밀번호", "구분", "NTRP", "클럽", "상태", "이메일"];
    const lines = [header.map(csvCell).join(",")];
    for (const m of members) {
      lines.push([
        m.name, m.loginId ?? "", m.loginPw ?? "",
        typeLabel(m.type as string), m.ntrp ?? "",
        clubLabel(m.club as string), statusLabel(m.status as string), m.email ?? "",
      ].map(csvCell).join(","));
    }
    const csv = "﻿" + lines.join("\r\n");

    // 2) 전체 상태 JSON (완전 복원용 원본)
    const fullJson = JSON.stringify(state, null, 2);

    const satCnt = members.filter((m) => m.club === "sat").length;
    const sunCnt = members.filter((m) => m.club === "sun").length;
    const body =
      `${clubName} 데이터 백업\n\n` +
      `백업 날짜: ${dateStr}\n` +
      `총 회원: ${members.length}명 (토요일 ${satCnt} · 일요일 ${sunCnt})\n` +
      `마지막 변경: ${room?.updated_at ?? "-"}\n\n` +
      `· 데이터백업_${dateStr}.csv : 회원 명단(엑셀에서 열기)\n` +
      `· 데이터백업_${dateStr}.json : 전체 데이터(완전 복원용 원본)\n`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("BACKUP_FROM") || "PRONOW TENNIS <onboarding@resend.dev>",
        to: [Deno.env.get("BACKUP_EMAIL")],
        subject,
        text: body,
        attachments: [
          { filename: `데이터백업_${dateStr}.csv`, content: toBase64(csv) },
          { filename: `데이터백업_${dateStr}.json`, content: toBase64(fullJson) },
        ],
      }),
    });

    const out = await resp.text();
    if (!resp.ok) throw new Error(`Resend ${resp.status}: ${out}`);
    return new Response(JSON.stringify({ ok: true, members: members.length, subject }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
