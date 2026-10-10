# 히스토리교회 홈페이지 (리뉴얼)

기독교대한감리회 히스토리교회 — 말씀의 역사로 믿음의 역사를 쓰는 교회
사이트: https://historychurch.org (2026-09-27 새 사이트로 전환) · 예비 주소: https://historychurch.soul0691.workers.dev/

> 글·사진을 올리는 분은 **[운영가이드.md](./운영가이드.md)**(관리자 화면) 또는 **[업로드_가이드.md](./업로드_가이드.md)**(GitHub 에 파일만 올리기)를 보시면 됩니다.
> 이 문서는 사이트를 관리·설정하는 분을 위한 안내입니다.

## 무엇이 바뀌었나

| 예전 문제 | 이렇게 바꿨습니다 |
| --- | --- |
| 디자인이 오래되고 복잡함 | 로고의 초록·금색을 바탕으로 한 절제된 디자인. 로고의 십자가를 ‘빛의 십자가’ 모티프로 사용 |
| 글 확인·업로드가 불편함 | `/admin` 관리자 화면(한국어)에서 메뉴를 고르고 → 채우고 → 저장. 1~2분 뒤 자동 반영 |
| 사진 올리기가 불편함 | 여러 장을 한꺼번에 끌어다 놓기. 휴대폰 사진(HEIC 포함)도 올리는 순간 자동으로 WebP 로 줄여 저장 |
| 어떤 교회인지 알기 어려움 | 홈 화면에 교회 소개 한 문단 · 핵심 정보 · 3대 비전 · 담임목사 인사 · 표어 · 예배 시간을 차례로 배치 |
| 주일 설교를 매번 올려야 함 | 유튜브 채널을 매시간 확인해 새 예배 영상을 자동으로 추가. 홈 화면 ‘이번 주 설교’가 알아서 바뀜 |

## 구성

- **[Astro](https://astro.build)** — 정적 사이트 생성기. 글은 `src/content/` 의 마크다운 파일입니다.
- **[Sveltia CMS](https://sveltiacms.app)** — `/admin` 관리자 화면. 저장하면 이 저장소에 커밋됩니다.
- **Cloudflare** — `main` 에 커밋될 때마다 자동으로 빌드·배포합니다 (무료, 비공개 저장소 가능). 아래 "실제 도메인" 절 참고.
- **설교 자동 동기화** — 매시간 유튜브 RSS 를 확인합니다 (`.github/workflows/sync-sermons.yml`, `scripts/sync-sermons.mjs`).

```
src/
  content/
    sermons/     설교 (유튜브에서 자동 생성 + CMS 에서 수정)
    bulletins/   주보
    목회서신/    목회서신 (컬렉션 이름 columns)
    공지/        공지 · 교회 소식 (notices) — 홈 화면에는 고정 + 최근 30일 공지만 3개까지
    은혜나눔/    은혜나눔 (grace) — 성도들의 간증 · 묵상, 게시판에 함께 보임
    게시판/      게시판 (posts) — 공지·주보·목회서신이 아닌 일반 글
    영상/        영상 (videos) — 설교 외 유튜브 영상
    albums/      앨범
    */_템플릿.md 복사해서 쓰는 견본. 이름이 _ 로 시작하는 파일은 사이트에서 제외
  data/
    site.json    교회 기본 정보 · 예배 시간 · 헌금 계좌 · 표어
    about.json   교회 소개 · 비전 · 담임목사 인사말
  pages/         화면 (index, about, worship, sermons, news, album, give)
  components/    헤더, 푸터, 로고, 영상 플레이어 등
  styles/global.css  디자인 토큰(색·글꼴·간격)
public/
  admin/         관리자 화면 (config.yml 에 메뉴 구성)
  uploads/       CMS 로 올린 사진·파일
    bulletins/   예전 주보 이미지(2026-10-04 까지) · 관리자 화면으로 올린 주보
주보/            새 주보 올리는 곳. 날짜 이름(2026-10-11-1.jpg, 2026-10-11.pdf)으로 올리면 .md 없이도 주보가 됨
                 빌드할 때 /uploads/bulletins/ 로 복사되므로 예전 주보와 주소 규칙이 같음
scripts/
  sync-sermons.mjs      유튜브 → 설교 글 자동 생성
  import-wordpress.mjs  기존 워드프레스 글·사진 가져오기
  optimize-uploads.mjs  GitHub 웹으로 올린 400KB 넘는 jpg·png → WebP (.github/workflows/optimize-uploads.yml)
```

## 처음 설정 (한 번만)

### 1) 호스팅 연결

실제 서비스는 Cloudflare(Workers 정적 에셋) 입니다 — 아래 "실제 도메인(historychurch.org)으로 옮기기" 절을 따릅니다.

### 2) 관리자 로그인 설정

글을 올리는 사람은 GitHub 계정이 있어야 하고, 이 저장소의 **Collaborator** 로 초대되어 있어야 합니다.
(Settings → Collaborators → Add people)

**지금 방식 — 토큰으로 로그인 (설정 없이 바로 사용)**

1. `/admin` 에서 **액세스 토큰으로 로그인** 을 누릅니다.
2. 안내 창의 링크를 누르면 GitHub 토큰 만드는 화면이 열립니다. 권한이 미리 골라져 있으니 만료일만 정하고 만듭니다.
   - 직접 만든다면: Fine-grained token → 이 저장소만 선택 → Repository permissions **Contents: Read and write**
3. 만든 토큰을 붙여 넣으면 로그인됩니다. 같은 브라우저에서는 계속 로그인 상태가 유지됩니다.
4. 휴대폰은 컴퓨터 관리자 화면의 계정 메뉴 → **Sign In with Mobile** QR 코드로 로그인하면 편합니다.

**나중에 — ‘GitHub로 로그인’ 버튼 (여러 사람이 쓸 때 권장)**

토큰 없이 버튼 하나로 로그인하려면 무료 인증 서버가 필요합니다 (약 10분).

1. [Sveltia CMS Authenticator](https://github.com/sveltia/sveltia-cms-auth) 안내대로 Cloudflare Workers 에 배포합니다.
2. GitHub **Settings → Developer settings → OAuth Apps** 에서 앱을 만들고, Callback URL 에 `https://<워커 주소>/callback` 을 넣습니다.
3. 발급된 Client ID / Secret 을 워커 환경 변수에 넣습니다.
4. `public/admin/config.yml` 의 `backend` 에 아래처럼 추가합니다.

   ```yaml
   backend:
     name: github
     repo: History-ChurcH/historychurch
     branch: main
     base_url: https://<워커 주소>
     auth_methods: [oauth, token]
   ```

## 파일만 올려서 글 쓰기 (GitHub 웹)

관리자 화면 없이 GitHub 웹에서 파일을 올려도 됩니다. 봉사자 안내는 [업로드_가이드.md](./업로드_가이드.md).

- 글 상단에 `date` 가 없으면 파일 이름 앞의 날짜를 씁니다 (`src/content.config.ts` 의 `md()`).
- `_` 로 시작하는 파일은 사이트에서 빠집니다. 관리자 화면에서는 제목이 `[템플릿]` 으로 시작하는 글을 숨깁니다 (`config.yml` 의 `filter`).
- 주보는 `src/lib/bulletin-loader.ts` 가 맨 위 `주보/` 와 `public/uploads/bulletins/` 의 날짜 이름 파일을 날짜별로 묶어 만듭니다. `주보/` 의 파일은 `astro.config.mjs` 의 `bulletinDropFolder()` 가 빌드 때 `dist/uploads/bulletins/` 로 복사합니다(같은 이름이 있으면 예전 파일 우선). 같은 날짜의 `.md` 가 있으면 `.md` 가 우선입니다. (파일만 올린 주보는 관리자 화면 목록에는 나오지 않습니다)
- 큰 사진은 `optimize-uploads.yml` 이 WebP 로 줄여 다시 커밋합니다. 이미 400KB 이하인 파일은 그대로 둡니다.
- 봉사자가 찾기 쉽도록 글 폴더는 한국어 이름입니다. 코드에서 쓰는 컬렉션 이름(columns 등)과 주소(/news/columns/…)는 영어 그대로이고, 폴더와의 연결은 `src/content.config.ts` 의 `md('목회서신')` 처럼 적혀 있습니다. 주보·설교·앨범과 사진 폴더(public/uploads)는 사진 주소가 바뀌지 않도록 영어로 둡니다.
- 카테고리 목록: `/news/bulletins/` · `/news/columns/` · `/news/notices/` · `/news/posts/`(은혜나눔 + 게시판), 영상: `/videos/`

## 오류 제보함

- 홈페이지 맨 아래 **오류 제보** → `/report/` 양식. 제보자는 로그인할 필요가 없습니다.
- 제보는 **비공개 저장소** [historychurch-reports](https://github.com/History-ChurcH/historychurch-reports) 의 이슈로 들어옵니다.
  (공개 저장소가 아니라서 제보자의 연락처는 관리자만 볼 수 있습니다.) 저장소 주인은 새 제보가 올 때마다 GitHub 알림 메일을 받습니다.
- 처리가 끝나면 이슈를 **Close** 하면 됩니다. 유형별 라벨(화면이 이상해요 / 내용이 틀려요 / 영상·링크가 안 돼요 / 기타)로 걸러 볼 수 있습니다.
- 동작 방식: 양식 → Cloudflare Worker(`workers/report`) → GitHub 이슈. 스팸 방지로 숨은 입력칸, 3초 미만 제출 차단, IP 당 1분 5건 제한, 허용된 사이트 주소에서 온 요청만 받습니다.
- 워커 주소는 `src/lib/services.ts` 의 `REPORT_ENDPOINT` 에 넣습니다. 비어 있으면 양식 대신 전화·이메일 안내가 보입니다.
- 워커의 `GITHUB_TOKEN` 은 **제보함 저장소의 Issues 쓰기 권한만** 가진 fine-grained 토큰이어야 하고, Cloudflare 대시보드에 **Secret(암호화)** 으로만 저장합니다.

## Cloudflare Workers (www 이동 · 로그인 서버 · 제보함)

| 폴더 | 워커 이름 | 하는 일 | 대시보드에 넣는 Secret |
| --- | --- | --- | --- |
| `workers/www-redirect` | historychurch-www | `www.historychurch.org` → `historychurch.org` 301 이동 (배포됨) | 없음 |
| `workers/cms-auth` | historychurch-cms-auth | 관리자 화면 'GitHub로 로그인' | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| `workers/report` | historychurch-report | 오류 제보 → 비공개 저장소 이슈 | `GITHUB_TOKEN` |

배포: 각 폴더에서 `npx wrangler deploy`. 설정 파일은 반드시 `wrangler.jsonc` 로 둡니다 — `.toml` 이면 wrangler 가 저장소 맨 위의 `wrangler.jsonc`(본 사이트)를 먼저 찾아서 본 사이트를 배포해 버립니다.
`keep_vars` 가 켜져 있어서 다시 배포해도 대시보드에 넣은 값은 지워지지 않습니다.
`workers/cms-auth` 는 [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) (MIT) 를 그대로 가져온 것이니 고치지 말고, 새 버전이 나오면 `src/index.js` 만 바꿔 넣으세요.

## 설교 자동 업데이트

- `sync-sermons.yml` 이 **매시간** 히스토리교회 유튜브 채널(RSS)을 확인합니다.
- 제목에 `주일예배` / `수요` / `금요` 가 들어간 새 영상이 있으면 `src/content/sermons/날짜-sunday.md` 같은 파일을 만들고 커밋 → 사이트를 다시 배포합니다.
- 영상 설명의 `✜ 본 문 : 잠언 20:5-12` 와 그 아래 성경 구절, `잠언 (16)` 같은 시리즈 이름도 자동으로 가져옵니다.
- 예배 날짜는 업로드 시각(한국 시간)을 기준으로 가장 가까운 주일/수요일/금요일로 정합니다. (제목의 날짜 오타에 영향받지 않음)
- 이미 있는 영상은 건너뛰므로 CMS 에서 고친 내용은 덮어쓰지 않습니다.
- 바로 확인하고 싶으면 **Actions → 설교 영상 자동 가져오기 → Run workflow**.
- 인식 규칙을 바꾸려면 `scripts/sync-sermons.mjs` 의 `RULES` 를 고치세요.

> GitHub 는 60일 동안 저장소에 변화가 없으면 예약 작업을 멈춥니다. 매주 설교가 자동으로 커밋되므로 보통은 문제없지만,
> 유튜브 업로드가 오래 멈추면 Actions 화면에서 다시 켜 주세요.

## 실제 도메인(historychurch.org)으로 옮기기

호스팅은 **Cloudflare Workers(무료)** 를 씁니다. 비공개 저장소도 되고, 방문자 수·전송량 제한이 없으며, HTTPS 와 DDoS 방어가 기본입니다.
도메인 `historychurch.org` 는 Squarespace Domains 에 등록되어 있습니다(2033년까지 결제됨). 이메일(MX)은 SiteGround 에 남아 있으니 @historychurch.org 메일을 쓰는 사람이 없는지 먼저 확인합니다.

1. **Cloudflare 에 도메인 추가** — 대시보드 → **Add a domain** → `historychurch.org` → Free 요금제.
   기존 DNS 레코드(A, MX, TXT)는 자동으로 복사됩니다. 마지막에 알려 주는 **네임서버 2개**를
   Squarespace Domains → 해당 도메인 → DNS → Nameservers → *Use custom nameservers* 에 넣습니다. 반영까지 보통 1시간 이내, 길면 하루입니다.
   (이 단계까지는 옛 워드프레스 사이트가 그대로 보입니다.)
2. **Workers 프로젝트 만들기** — **Workers & Pages → Create → Import a repository** → GitHub 조직 *History ChurcH* 의 `historychurch` 선택.
   설정 화면("Set up your application")은 아래처럼 채웁니다. 배포 방법은 저장소의 `wrangler.jsonc` 에 들어 있습니다.

   | 항목 | 값 |
   | --- | --- |
   | Project name | `historychurch` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Preview command | (비움) |
   | Enable Preview builds | 켜 둠 (다른 브랜치를 미리 볼 때만 쓰임) |
   | Protect with Cloudflare Access | 끔 |
   | Path | `/` |
   | API token | Create new token (자동 생성) |
   | Variables | 없음 |

   - 환경 변수는 필요 없습니다. `SITE` 기본값이 `https://historychurch.org` 이고 Node 버전은 `.node-version` 에서 읽습니다.
   - Deploy 를 누르면 1~2분 뒤 `https://historychurch.soul0691.workers.dev` 에서 확인할 수 있습니다. 이후 `main` 에 커밋될 때마다(설교 자동 동기화 포함) 자동으로 다시 빌드됩니다.
   - 실행되는 코드 없이 `dist/` 의 파일만 올리는 구성(정적 에셋)이라 방문자 요청은 무료·무제한입니다. Cloudflare 는 새 프로젝트에 Pages 대신 이 방식을 권장합니다.
3. **저장소를 비공개로** — Settings → General → Danger Zone → *Change visibility* → Private. Cloudflare 는 그대로 빌드합니다.
   (예전 GitHub Pages 미리보기 `history-church.github.io` 는 이때 자동으로 내려갑니다. 배포 작업 파일은 이미 지워 두었습니다.)
4. **옛 글 가져오기 (2026-09-27 완료)** — 옛 워드프레스의 글을 모두 옮겼습니다: 목회서신 218개, 주보 218개(2021-09 ~), 앨범 203개(사진 1,786장), 공지 8개, 은혜나눔 6개.
   2025년 2~11월 주보 상당수와 일부 앨범 사진은 **옛 서버에서도 파일이 지워져 있어** 옮기지 못했습니다(사진 약 160장).
   다시 실행해야 할 때(이미 있는 글은 건너뜀). 도메인이 새 사이트로 바뀌었으므로 `--origin` 으로 옛 서버에 직접 접속합니다:

   ```bash
   npm run import:wordpress -- --origin=35.247.160.145 --bulletins-since=2021-01-01 --albums=10000 --notices-since=2000-01-01
   ```

5. **도메인 연결 (2026-09-27 완료)** — 지금은 **Worker 경로(route)** 로 연결되어 있습니다: `historychurch.org/*` → `historychurch`, `www.historychurch.org/*` → `historychurch-www`(대표 주소로 301).
   경로 방식은 DNS 기록(주황 구름, Proxied)이 있어야 동작하므로 `historychurch.org`·`www` 의 `A` 기록을 지우지 마세요. 옛 서버 IP 를 가리키지만 요청은 Cloudflare 에서 끝나서 옛 서버로 가지 않습니다.
   경로는 `wrangler.jsonc` 에 넣지 않았습니다(자동 빌드용 토큰 권한과 무관하게 유지되도록). 대시보드 **Workers & Pages → historychurch → Settings → Domains & Routes** 에서 볼 수 있습니다.
   아래는 대시보드에서 **Custom domain** 방식으로 다시 연결할 때의 참고용입니다. Workers 프로젝트 → **Settings → Domains & Routes → Add → Custom domain** → `historychurch.org` 추가.
   이미 옛 서버(SiteGround)를 가리키는 `A` 레코드가 있어서 추가가 거절되면, **DNS → Records** 에서 이름이 `historychurch.org` 와 `www` 인 `A`(또는 `CNAME`) 레코드만 지우고 다시 추가합니다. (`MX`·`TXT` 는 메일용이니 그대로 둡니다. 지우고 다시 추가하는 사이 1~2분 동안만 사이트가 안 열립니다.)
   `workers.dev` 예비 주소는 켜 두었습니다. 모든 페이지의 대표 주소(canonical)가 historychurch.org 라서 검색엔진에는 한 주소로 잡힙니다. 예전 주소(`/greeting`, `/maps`, `/sermon`, `/history`) 이동은 `public/_redirects` 에 있습니다.
   `www` → 대표 주소 이동은 `_redirects` 로는 안 되고(상대 주소만 허용) `workers/www-redirect` 워커가 맡습니다.
   **http → https 강제 이동**: 대시보드 **historychurch.org → SSL/TLS → Edge Certificates → Always Use HTTPS** 를 켭니다. (`_headers` 의 HSTS 는 한 번 https 로 들어온 브라우저에만 적용됩니다.)
6. 남은 옛 글을 가져오고 새 사이트가 며칠 문제없이 돌면 **SiteGround 를 해지**합니다. (다음 결제일 전에만 하면 됩니다.)

> 다른 호스팅으로 옮길 때: `public/_redirects` 와 `public/_headers` 는 Cloudflare(및 Netlify) 전용입니다. 그 밖의 호스팅에서는 `astro.config.mjs` 의 `redirects` 가 예전 주소 이동을 대신합니다.

## 내 컴퓨터에서 고치기

[Node.js](https://nodejs.org) 22.12 이상이 필요합니다.

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # dist/ 에 결과물
npm run sync:sermons # 유튜브에서 새 설교 가져오기
```

개발 서버를 켠 채로 Chrome/Edge 에서 `http://localhost:4321/admin/` 을 열고 **로컬 저장소로 작업** 을 누르면,
로그인 없이 내 컴퓨터의 파일을 바로 고칠 수 있습니다.

### 디자인 바꾸기

- 색·글꼴·간격: `src/styles/global.css` 맨 위의 `:root` 변수
- 로고: `src/lib/logo-paths.ts` (기존 로고 PNG 를 그대로 벡터로 옮긴 것 — 모양을 바꾸지 마세요), 원본 PNG 는 `public/images/`
- 링크 미리보기 배너(카카오톡 등): 원본 `design/og-banner.html` → `public/images/og-banner.jpg` (1200×630). 만드는 법은 그 파일 맨 위에 있습니다. 카카오톡에 옛 그림이 계속 보이면 [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing)에서 캐시를 지웁니다.
- 글꼴: 본문 Pretendard, 성경 구절·표어 Noto Serif KR, 로고 글자 Black Han Sans (`src/layouts/Base.astro`)
