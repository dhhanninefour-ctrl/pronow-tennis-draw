# 🎾 테니스 대진 (TENNIS DRAW)

동호회 테니스 모임용 **대진 관리 웹앱**.
회원 관리(정기/게스트) · 출석체크 · 복식/단식 로테이션 대진 · 점수/순위 · **실시간 공유**.

- 빌드 단계 없음(순수 HTML/CSS/JS). 더블클릭으로도 실행됩니다.
- **로컬 저장 모드**: 설정 없이 바로 사용(내 기기에만 저장).
- **실시간 공유 모드**: Supabase 키를 넣으면 링크 하나로 모두가 같은 화면을 실시간으로 봄.

---

## 1. 바로 써보기 (로컬 모드)

`index.html` 을 더블클릭하면 끝. 회원을 추가하고 → 출석 체크 → "대진 생성"을 누르면 됩니다.
이 모드는 **그 기기/브라우저에만** 저장됩니다. 백업·공유는 우측 상단 **💾 내보내기 / 📂 불러오기** 사용.

---

## 2. 실시간 공유 켜기 (Supabase · 무료)

여러 명이 **같은 대진을 실시간으로** 보려면 아래 3단계만 하면 됩니다. 코딩 지식 불필요(복사·붙여넣기).

### ① Supabase 프로젝트 만들기
1. https://supabase.com 접속 → 로그인 → **New project**
2. 이름/비밀번호 아무거나 입력하고 생성(1~2분 소요)

### ② 데이터베이스 표 만들기
1. 왼쪽 메뉴 **SQL Editor** 클릭 → **New query**
2. 이 저장소의 `supabase/schema.sql` 내용을 **전체 복사해서 붙여넣기** → **Run**
   (테이블 `rooms` 와 보안 정책이 생성됩니다.)

### ③ 키를 config.js 에 넣기
1. 왼쪽 메뉴 **Project Settings → API**
2. **Project URL** 과 **anon public** 키를 복사
3. 이 저장소의 `config.js` 파일을 열어 아래처럼 채우기:
   ```js
   window.TENNIS_CONFIG = {
     SUPABASE_URL: "https://여기에-내-주소.supabase.co",
     SUPABASE_ANON_KEY: "여기에-anon-public-키"
   };
   ```
   > anon 키는 웹에 공개되어도 안전한 키입니다. **service_role 키는 절대 넣지 마세요.**

이제 앱에서 우측 상단 **🔗 공유 → 방 만들기** 를 누르면 공유 링크가 생깁니다.
그 링크를 카톡 단톡방에 올리면, 들어온 모두가 **같은 대진을 실시간으로** 봅니다.
(한 명이 점수를 입력하면 다른 사람 화면에도 바로 반영됩니다.)

---

## 3. 인터넷에 올리기 (Vercel · 무료)

링크를 카톡으로 공유하려면 인터넷에 배포해야 합니다.

1. 이 폴더를 **GitHub 저장소**로 올립니다.
   ```bash
   git init
   git add .
   git commit -m "테니스 대진 앱"
   git branch -M main
   git remote add origin https://github.com/<내계정>/tennis-draw.git
   git push -u origin main
   ```
2. https://vercel.com 접속 → **Add New → Project** → 방금 만든 GitHub 저장소 **Import**
3. 설정 그대로 **Deploy** (빌드 설정 불필요 — 정적 사이트)
4. 잠시 후 `https://tennis-draw.vercel.app` 같은 **공개 주소**가 생깁니다. 끝!

> 배포 후 `config.js` 를 수정하면 GitHub에 다시 push → Vercel이 자동 재배포합니다.

---

## 폴더 구조

```
tennis_draw/
├─ index.html          진입점
├─ config.js           실시간 공유 키 (비우면 로컬 모드)
├─ config.sample.js    설정 템플릿/설명
├─ css/style.css       디자인 (Pretendard, 미니멀)
├─ js/
│  ├─ draw.js          ★ 복식/단식 로테이션 알고리즘 (순수 함수)
│  ├─ ranking.js       점수 집계 → 순위 (순수 함수)
│  ├─ state.js         중앙 상태 + 영속화 트리거
│  ├─ storage.js       localStorage + JSON 내보내기/불러오기
│  ├─ supabase.js      Supabase 클라이언트 (옵션)
│  ├─ sync.js          로컬/클라우드 동기화
│  ├─ app.js           탭 라우팅 + 공유 모달
│  └─ ui/              회원/출석/대진/순위 화면
└─ supabase/schema.sql  DB 스키마(붙여넣기용)
```

## 대진 알고리즘 요약

- 출석자 N명 · 코트 C개 · 라운드 R개 입력 → 라운드별 대진 생성.
- **공정성**: 경기 수·휴식 수를 최대한 균등하게.
- **다양성**: 같은 파트너/상대 반복 최소화(그리디 + 페널티).
- **휴식 순환**: N이 4의 배수가 아니거나 코트가 부족하면 쉬는 사람을 골고루 분배.
- **결정성**: 같은 입력+시드 → 같은 결과. "🔄 다시 생성"은 다른 조합을 만듭니다.

## 보안 메모

`rooms` 테이블은 익명(anon) 읽기/쓰기를 허용합니다(코드 기반 공유). 저장되는 건 이름·점수뿐이라 동호회용으로 충분합니다. 더 강한 격리가 필요하면 `schema.sql` 의 정책(policy)을 좁히세요.
