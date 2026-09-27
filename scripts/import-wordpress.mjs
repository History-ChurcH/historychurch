#!/usr/bin/env node
/**
 * 기존 워드프레스 사이트(historychurch.org)의 글과 사진을 이 사이트로 옮겨 옵니다. (한 번만 실행하면 됩니다)
 *
 *   npm run import:wordpress                       # 기본값으로 가져오기
 *   npm run import:wordpress -- --bulletins-since=2024-01-01 --albums=40
 *
 * 옵션
 *   --only=columns,bulletins,albums,notices   가져올 종류 (기본: 전부)
 *   --bulletins-since=YYYY-MM-DD               이 날짜 이후 주보만 (기본: 2026-01-01)
 *   --albums=N                                  최근 앨범 N개만 (기본: 8)
 *   --notices-since=YYYY-MM-DD                 이 날짜 이후 교회 소식만 (기본: 2022-01-01)
 *
 * 이미 있는 파일은 건너뜁니다. 사진은 WebP 로 줄여서 저장합니다.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const WP = 'https://historychurch.org';
const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'src', 'content');
const UPLOADS = join(ROOT, 'public', 'uploads');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const only = new Set((args.only || 'columns,bulletins,albums,notices').split(','));
const bulletinsSince = args['bulletins-since'] || '2026-01-01';
const albumLimit = Number(args.albums || 8);
const noticesSince = args['notices-since'] || '2022-01-01';

const CATEGORY = { bulletins: 8, columns: 10, albums: 14 };

// ---------------------------------------------------------------------------
// 도우미
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = 'text', tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(encodeURI(decodeURI(url)), { headers: { 'user-agent': 'Mozilla/5.0 historychurch-import' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return as === 'json' ? res.json() : as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
    } catch (err) {
      if (i >= tries) throw err;
      await sleep(800 * i);
    }
  }
}

const exists = (p) => access(p).then(() => true, () => false);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', middot: '·', laquo: '«', raquo: '»', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
const decode = (s = '') =>
  s
    .replace(/ /g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** 워드프레스 썸네일 주소(-300x200.jpg)를 원본 주소로 바꿉니다. */
const original = (src) => src.replace(/-\d+x\d+(\.\w+)$/, '$1');

/** 간단한 HTML → 마크다운 변환 (교회 글에 쓰이는 태그 위주) */
function toMarkdown(html, imageMap = new Map()) {
  let s = html
    .replace(/\r/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<figure[^>]*>([\s\S]*?)<\/figure>/gi, '$1')
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, (_, src) => {
      const local = imageMap.get(original(decode(src)));
      return local ? `\n\n![](${local})\n\n` : '';
    })
    .replace(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi, '\n\n## $1\n\n')
    .replace(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/gi, '\n\n### $1\n\n')
    .replace(/<(strong|b)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '**$3**')
    .replace(/<(em|i)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, '*$3*')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => (t.trim() ? `[${t.trim()}](${decode(h)})` : ''))
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `\n\n> ${t.trim()}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  s = decode(s)
    .split('\n')
    .map((l) => (l.trim() ? l.replace(/^[ \t]+/, '').replace(/[ \t]+$/g, (m) => (m.length >= 2 ? '  ' : '')) : ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\*\*|\*)\s*\1/g, '')
    .trim();
  return s;
}

const imgSrcs = (html) => [...html.matchAll(/<img[^>]*src="([^"]+)"/gi)].map((m) => original(decode(m[1]))).filter((u) => u.includes('/wp-content/uploads/') && !u.includes('captcha'));

/** 사진을 내려받아 WebP 로 줄여 저장하고, 사이트에서 쓸 주소(/uploads/...)를 돌려줍니다. */
async function saveImage(url, folder, name, maxSize = 1600) {
  const dir = join(UPLOADS, folder);
  const file = join(dir, `${name}.webp`);
  const publicPath = `/uploads/${folder}/${name}.webp`;
  if (await exists(file)) return publicPath;
  await mkdir(dir, { recursive: true });
  let buf;
  try {
    buf = await get(url, 'buffer');
  } catch {
    // 원본이 없으면(드물게) 큰 썸네일로 다시 시도
    buf = await get(url.replace(/(\.\w+)$/, '-1024x1024$1'), 'buffer').catch(() => null);
    if (!buf) {
      console.warn(`  ! 사진을 가져오지 못했습니다: ${url}`);
      return null;
    }
  }
  await sharp(buf).rotate().resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toFile(file);
  return publicPath;
}

const q = (v) => JSON.stringify(v ?? '');
const ymd = (d) => d.slice(0, 10);

async function writeEntry(collection, slug, front, body = '') {
  const dir = join(CONTENT, collection);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${slug}.md`);
  const lines = ['---'];
  for (const [k, v] of Object.entries(front)) {
    if (Array.isArray(v)) lines.push(v.length ? `${k}:\n${v.map((x) => `  - ${q(x)}`).join('\n')}` : `${k}: []`);
    else if (typeof v === 'boolean' || /^\d{4}-\d{2}-\d{2}$/.test(String(v))) lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${q(v)}`);
  }
  lines.push('---', '', body, '');
  await writeFile(file, lines.join('\n'), 'utf8');
}

/** 같은 날짜 글이 여러 개면 -2, -3 을 붙입니다. */
function uniqueSlugger() {
  const used = new Set();
  return (base) => {
    let s = base;
    for (let n = 2; used.has(s); n++) s = `${base}-${n}`;
    used.add(s);
    return s;
  };
}

async function wpPosts(category) {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = await get(`${WP}/wp-json/wp/v2/posts?categories=${category}&per_page=100&page=${page}&_fields=id,date,title,content`, 'json').catch(() => []);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 1) 목회서신(칼럼)
// ---------------------------------------------------------------------------
async function importColumns() {
  const posts = await wpPosts(CATEGORY.columns);
  console.log(`목회서신 ${posts.length}개`);
  const slug = uniqueSlugger();
  for (const p of posts) {
    const date = ymd(p.date);
    const id = slug(date);
    if (await exists(join(CONTENT, 'columns', `${id}.md`))) continue;
    const html = p.content.rendered;
    const srcs = imgSrcs(html);
    const map = new Map();
    let cover = '';
    for (const [i, src] of srcs.entries()) {
      const local = await saveImage(src, 'columns', i ? `${id}-${i + 1}` : id, 1200);
      if (!local) continue;
      if (i === 0) cover = local;
      else map.set(src, local);
    }
    const body = toMarkdown(html.replace(/<img[^>]*>/i, ''), map); // 첫 사진은 표지로 씁니다
    await writeEntry('columns', id, { title: decode(p.title.rendered), date, author: '김영훈 담임목사', cover }, body);
    process.stdout.write('.');
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 2) 주보
// ---------------------------------------------------------------------------
async function importBulletins() {
  const posts = (await wpPosts(CATEGORY.bulletins)).filter((p) => ymd(p.date) >= bulletinsSince);
  console.log(`주보 ${posts.length}개 (${bulletinsSince} 이후)`);
  const slug = uniqueSlugger();
  for (const p of posts) {
    const date = ymd(p.date);
    const id = slug(date);
    if (await exists(join(CONTENT, 'bulletins', `${id}.md`))) continue;
    const html = p.content.rendered;
    const images = [];
    for (const [i, src] of imgSrcs(html).entries()) {
      const local = await saveImage(src, 'bulletins', `${id}-${i + 1}`, 2000);
      if (local) images.push(local);
    }
    const text = toMarkdown(html.replace(/<img[^>]*>/gi, ''));
    // 2025년 2~7월 등 일부 주보는 옛 서버에서도 사진 파일이 지워져 있습니다. 빈 글은 만들지 않습니다.
    if (!images.length && !text.trim()) {
      console.warn(`  ! ${date} 주보: 옛 서버에 사진 파일이 없어 건너뜁니다`);
      continue;
    }
    await writeEntry('bulletins', id, { title: decode(p.title.rendered), date, images, file: '' }, text);
    process.stdout.write('.');
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 3) 앨범 — 게시판(KBoard) 앨범 + 워드프레스 '히스토리 앨범' 분류
// ---------------------------------------------------------------------------
async function kboardDocs(board) {
  const uids = new Set();
  for (let page = 1; page <= 20; page++) {
    const html = await get(`${WP}/${board}?pageid=${page}`);
    const found = [...html.matchAll(/mod=document&(?:amp;)?uid=(\d+)/g)].map((m) => Number(m[1]));
    const before = uids.size;
    found.forEach((u) => uids.add(u));
    if (uids.size === before) break;
  }
  const docs = [];
  for (const uid of [...uids].sort((a, b) => b - a)) {
    const html = await get(`${WP}/${board}?mod=document&uid=${uid}`);
    // 게시판마다 스킨이 달라서 제목이 <p> 또는 <h1> 에 들어 있습니다.
    const title = decode(html.match(/class="kboard-title"[^>]*>\s*<(?:p|h1)>([\s\S]*?)<\/(?:p|h1)>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || '');
    const posted = html.match(/detail-date">[\s\S]*?detail-value">(?:\s*<i[^>]*><\/i>)?\s*([\d-]{10})/)?.[1] || '';
    const content = (html.match(/<div class="content-view">([\s\S]*?)<div class="kboard-document-action/)?.[1] ?? '').replace(/(<\/div>\s*)+$/, '');
    // 첨부파일(다운로드 버튼) 중 사진만 가져옵니다.
    const attachments = [...html.matchAll(/window\.location\.href='([^']*kboard_file_download[^']*)'" title="다운로드 ([^"]+)"/g)]
      .filter((m) => /\.(png|jpe?g|webp|gif)$/i.test(m[2]))
      .map((m) => `${WP}${decode(m[1])}`);
    docs.push({ uid, title, posted, content, attachments });
  }
  return docs;
}

let albumBoardCache;
const albumBoard = async () => (albumBoardCache ??= await kboardDocs('album'));
// 앨범 게시판에 올라온 공지성 글(일정표·부서표 등)은 교회 소식으로 옮깁니다.
const isNotice = (title) => /^\s*\[공지|일정표|부서표/.test(title);

async function importAlbums() {
  const kb = (await albumBoard())
    .filter((d) => !isNotice(d.title)) // '[공지사항]' 글은 교회 소식으로 옮깁니다
    .map((d) => {
      const m = d.title.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
      const date = m ? `${m[1]}-${m[2].padStart(2, '0')}-01` : d.posted.slice(0, 10);
      return { title: d.title, date, html: d.content, extra: d.attachments };
    });
  // 워드프레스 '히스토리 앨범' 글 중 같은 날 게시판에도 올린 글(중복)과 공지성 글은 뺍니다.
  const boardDays = new Set((await albumBoard()).map((d) => d.posted.slice(0, 10)));
  const wp = (await wpPosts(CATEGORY.albums))
    .filter((p) => !boardDays.has(ymd(p.date)) && !isNotice(decode(p.title.rendered)))
    .map((p) => ({ title: decode(p.title.rendered), date: ymd(p.date), html: p.content.rendered, extra: [] }));
  const srcsOf = (a) => [...imgSrcs(a.html), ...a.extra];
  const all = [...kb, ...wp].filter((a) => srcsOf(a).length > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, albumLimit);
  console.log(`앨범 ${all.length}개`);
  const slug = uniqueSlugger();
  for (const a of all) {
    const id = slug(a.date);
    if (await exists(join(CONTENT, 'albums', `${id}.md`))) continue;
    const photos = [];
    for (const [i, src] of srcsOf(a).entries()) {
      const local = await saveImage(src, `albums/${id}`, String(i + 1).padStart(2, '0'), 1600);
      if (local) photos.push(local);
      process.stdout.write('.');
    }
    if (!photos.length) continue; // 원본 사진이 서버에서 지워진 앨범은 건너뜁니다
    const text = toMarkdown(a.html.replace(/<img[^>]*>/gi, ''));
    await writeEntry('albums', id, { title: a.title, date: a.date, cover: photos[0] ?? '', photos }, text);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 4) 교회 소식(공지)
// ---------------------------------------------------------------------------
async function importNotices() {
  const fromAlbum = (await albumBoard()).filter((d) => isNotice(d.title)).map((d) => ({ ...d, title: d.title.replace(/^\s*\[공지사항\]\s*/, '').replace(/^(\d{4}) /, '$1년 ') }));
  const docs = [...(await kboardDocs('news')), ...fromAlbum].filter((d) => d.posted >= noticesSince);
  console.log(`교회 소식 ${docs.length}개 (${noticesSince} 이후)`);
  const slug = uniqueSlugger();
  for (const d of docs.sort((a, b) => a.posted.localeCompare(b.posted))) {
    const date = d.posted.slice(0, 10);
    const id = slug(date);
    if (await exists(join(CONTENT, 'notices', `${id}.md`))) continue;
    const images = [];
    for (const [i, src] of [...imgSrcs(d.content), ...d.attachments].entries()) {
      const local = await saveImage(src, 'notices', `${id}-${i + 1}`, 1800);
      if (local) images.push(local);
    }
    const text = toMarkdown(d.content.replace(/<img[^>]*>/gi, ''));
    await writeEntry('notices', id, { title: d.title, date, pinned: false, images }, text);
    process.stdout.write('.');
  }
  console.log();
}

if (only.has('columns')) await importColumns();
if (only.has('bulletins')) await importBulletins();
if (only.has('albums')) await importAlbums();
if (only.has('notices')) await importNotices();
console.log('완료했습니다.');
