-- =====================================================================
-- TENNIS DRAW — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣고 [Run] 하세요.
--
-- 설계: 룸(공유 단위)당 1행. 앱 상태 전체를 jsonb 한 칸(state)에 저장한다.
--       단순/견고 — 동호회 규모에 충분하고, 충돌은 last-write-wins.
-- 공유: 6자리 룸 코드(code)로 접근. 로그인 불필요.
-- 보안: 익명(anon) 키로 읽기/쓰기 허용. 민감정보 없음(이름·점수뿐).
--       코드를 아는 사람이면 수정 가능 — 동호회용으로 수용 가능한 모델.
-- =====================================================================

create table if not exists public.rooms (
  code        text primary key,                 -- 공유 코드 (예: AB12CD)
  name        text,                             -- 클럽/모임 이름
  state       jsonb not null default '{}'::jsonb, -- 앱 상태 전체
  updated_at  timestamptz not null default now()
);

-- 실시간(Realtime) 활성화: rooms 테이블 변경을 구독할 수 있게 함
alter publication supabase_realtime add table public.rooms;

-- RLS(행 수준 보안) 켜기
alter table public.rooms enable row level security;

-- 익명 사용자에게 읽기/쓰기 허용 (코드 기반 접근)
-- ※ 더 강한 격리가 필요하면 정책을 좁히세요. (README 참고)
drop policy if exists "anon read rooms"   on public.rooms;
drop policy if exists "anon insert rooms" on public.rooms;
drop policy if exists "anon update rooms" on public.rooms;

create policy "anon read rooms"   on public.rooms for select using (true);
create policy "anon insert rooms" on public.rooms for insert with check (true);
create policy "anon update rooms" on public.rooms for update using (true) with check (true);

-- =====================================================================
-- 자동 백업 (데이터 유실 방지의 안전망)
--   rooms가 수정되기 직전(OLD)의 상태를 스냅샷으로 보관한다.
--   잘못된 쓰기(예: 빈 상태 덮어쓰기)가 발생해도 직전 상태로 되돌릴 수 있다.
--   코드별 최신 300개만 유지(자동 정리). anon은 접근 불가(백업은 비공개).
-- =====================================================================
create table if not exists public.room_backups (
  id          bigserial primary key,
  code        text not null,
  state       jsonb not null,
  member_cnt  int,                                -- 스냅샷 당시 회원 수(빠른 점검용)
  created_at  timestamptz not null default now()
);
create index if not exists room_backups_code_created
  on public.room_backups(code, created_at desc);

create or replace function public.backup_room_state() returns trigger as $fn$
begin
  if (OLD.state is not null) then
    insert into public.room_backups(code, state, member_cnt)
    values (OLD.code, OLD.state, coalesce(jsonb_array_length(OLD.state->'members'), 0));
    -- 코드별 최신 300개만 보관
    delete from public.room_backups b
     where b.code = OLD.code
       and b.id not in (
         select id from public.room_backups
          where code = OLD.code order by created_at desc limit 300
       );
  end if;
  return NEW;
end;
$fn$ language plpgsql security definer;

drop trigger if exists trg_backup_room on public.rooms;
create trigger trg_backup_room before update on public.rooms
for each row execute function public.backup_room_state();

-- 백업 테이블은 RLS만 켜고 anon 정책을 주지 않음 → 익명 접근 차단(복구는 관리자/서비스 키로만)
alter table public.room_backups enable row level security;
