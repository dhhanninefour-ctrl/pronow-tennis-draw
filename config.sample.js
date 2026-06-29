/*
 * config.sample.js — 설정 템플릿
 *
 * 사용법:
 *  1) 이 파일을 복사해 같은 폴더에 "config.js" 로 저장하세요.
 *  2) 아래 두 값을 Supabase 프로젝트 값으로 채우세요.
 *     - Supabase 대시보드 > Project Settings > API
 *     - "Project URL" 과 "anon public" 키를 복사
 *  3) config.js 는 git에 올리지 않습니다(.gitignore 처리됨). 안심하고 키를 넣으세요.
 *     (anon 키는 클라이언트 노출이 설계상 안전합니다. service_role 키는 절대 넣지 마세요.)
 *
 * config.js 가 없거나 값이 비어 있으면 앱은 자동으로 "로컬 저장 모드"로 동작합니다.
 */
window.TENNIS_CONFIG = {
  SUPABASE_URL: "",       // 예: https://abcdwxyz.supabase.co
  SUPABASE_ANON_KEY: ""   // 예: eyJhbGciOiJIUzI1NiІ...
};
