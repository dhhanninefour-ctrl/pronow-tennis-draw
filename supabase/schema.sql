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
