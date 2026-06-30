-- =====================================================================
-- 월 1회 백업 메일 자동 발송 — pg_cron 예약 (실제 적용본)
--   매월 1일 00:00 UTC(한국시간 오전 9시)에 monthly-backup 함수를 호출.
--   인증은 공개 anon 키 사용(공개되어도 안전) → Vault 불필요.
--   ※ 함수 배포 + 시크릿(RESEND_API_KEY, BACKUP_EMAIL) 설정 후 실행.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 기존 예약 제거 후 재등록
select cron.unschedule('monthly-backup')
 where exists (select 1 from cron.job where jobname = 'monthly-backup');

select cron.schedule(
  'monthly-backup',
  '0 0 1 * *',                       -- 매월 1일 00:00 UTC
  $job$
  select net.http_post(
    url     := 'https://vnznkvvcssuqwptrzzvy.functions.supabase.co/monthly-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>'   -- config.js의 공개 anon 키
    ),
    body    := '{}'::jsonb
  );
  $job$
);

-- 확인:        select jobname, schedule, active from cron.job;
-- 즉시 테스트:  POST https://<ref>.functions.supabase.co/monthly-backup  (Authorization: Bearer <anon>)
