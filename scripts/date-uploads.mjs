#!/usr/bin/env node
/**
 * 이름에 날짜가 없는 파일에 날짜를 붙여 줍니다. (봉사자가 파일 이름을 고치지 않아도 되도록)
 *
 *  - 주보 폴더: IMG_1234.jpg 처럼 날짜 없는 이미지·PDF → 가까운 주일 날짜로 2026-10-11-1.jpg, 2026-10-11-2.jpg …
 *      이름 속에 날짜가 있으면(‘히스토리교회 주보 2026.10.11001.png’, ‘2026년 10월 11일.pdf’) 그 날짜를 씁니다.
 *      이미 있는 주보와 내용이 똑같은 파일(같은 사진을 두 번 올린 경우)은 지웁니다.
 *      월·화·수요일에 올리면 지난 주일, 목·금·토·일요일에 올리면 이번(다가오는) 주일로 봅니다.
 *      여러 장을 한꺼번에 올리면 원래 이름 순서(휴대폰 사진은 찍은 순서)대로 번호를 붙입니다.
 *  - 글 폴더(목회서신·공지·은혜나눔·게시판): 추수감사의 참뜻.docx → 2026-10-11 추수감사의 참뜻.docx (올린 날짜, 이름 속 날짜가 있으면 그 날짜)
 *      제목은 원래 파일 이름 그대로 쓰입니다.
 *  - 날짜는 한국 시간 기준 ‘지금’입니다. GitHub Actions 가 올린 직후에 실행합니다 (.github/workflows/optimize-uploads.yml).
 *  - 이름이 _ 로 시작하는 파일, README.md, 이미 날짜가 있는 파일은 건드리지 않습니다.
 */
import { readdir, readFile, rename, unlink, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { BULLETIN_FILE } from '../src/lib/bulletin-files.mjs';

const ROOT = join(import.meta.dirname, '..');
const BULLETIN_DIRS = [join(ROOT, '주보')];
const OLD_BULLETINS = join(ROOT, 'public', 'uploads', 'bulletins');
const DOC_DIRS = ['목회서신', '공지', '은혜나눔', '게시판'].map((d) => join(ROOT, 'src', 'content', d));

const BULLETIN_EXT = /\.(jpe?g|png|webp|gif|pdf)$/i;
const DOC_EXT = /\.(docx|txt)$/i;
const DOC_DATED = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})/;

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** 한국 시간 오늘 (UTC 자정 기준 Date) */
const now = process.env.UPLOAD_DATE ? new Date(`${process.env.UPLOAD_DATE}T00:00:00Z`) : new Date(Date.now() + 9 * 3600 * 1000);
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** 월~수 → 지난 주일, 목~일 → 이번 주일 */
function nearestSunday(d) {
  const day = d.getUTCDay(); // 0 = 주일
  const s = new Date(d);
  if (day === 0) return s;
  s.setUTCDate(s.getUTCDate() + (day <= 3 ? -day : 7 - day));
  return s;
}

const list = async (dir) => (existsSync(dir) ? await readdir(dir) : []);
/** 이름 속 날짜: 2026.10.11 · 2026-10-11 · 2026_10_11 · 20261011 · 2026년 10월 11일 */
function dateInName(name) {
  const m = name.match(/(20\d{2})[.\-_ ]?(0[1-9]|1[0-2])[.\-_ ]?(0[1-9]|[12]\d|3[01])/) ?? name.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  return m ? `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}` : null;
}

const skip = (name) => name.startsWith('_') || name.startsWith('.') || /^readme\.md$/i.test(name);

const renamed = [];

// ── 주보 ─────────────────────────────────────────────
const allBulletins = [...(await list(OLD_BULLETINS)), ...(await Promise.all(BULLETIN_DIRS.map(list))).flat()];
const isPdf = (n) => /\.pdf$/i.test(n);

/** 그 주일에 이미 있는 이미지의 다음 번호 · PDF 가 이미 있는지 */
const counters = new Map();
function counter(day) {
  if (!counters.has(day)) {
    const taken = allBulletins.map((n) => n.match(BULLETIN_FILE)).filter((m) => m && `${m[1]}-${m[2]}-${m[3]}` === day);
    const max = Math.max(0, ...taken.filter((m) => m[5].toLowerCase() !== 'pdf').map((m) => Number(m[4].match(/(\d+)\s*$/)?.[1] ?? 1)));
    counters.set(day, { next: max + 1, pdf: taken.some((m) => m[5].toLowerCase() === 'pdf') });
  }
  return counters.get(day);
}

/** 이미 있는 주보 파일의 내용 지문 — 같은 사진을 두 번 올리면 하나만 남깁니다 */
const fingerprint = async (file) => createHash('sha1').update(await readFile(file)).digest('hex');
const known = new Map();
for (const dir of [OLD_BULLETINS, ...BULLETIN_DIRS]) {
  for (const n of await list(dir)) if (BULLETIN_FILE.test(n)) known.set(await fingerprint(join(dir, n)), n);
}

for (const dir of BULLETIN_DIRS) {
  const names = (await list(dir)).filter((n) => !skip(n) && BULLETIN_EXT.test(n) && !BULLETIN_FILE.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const name of names) {
    const file = join(dir, name);
    const same = known.get(await fingerprint(file));
    if (same) {
      await unlink(file);
      renamed.push(`주보/${name} → 지움 (이미 있는 ${same} 와 같은 파일)`);
      continue;
    }
    // 이름 속 날짜(‘주보 2026.10.11001.png’, ‘2026년 10월 11일 주보.pdf’)가 있으면 그 날짜, 없으면 가까운 주일
    const day = dateInName(name) ?? iso(nearestSunday(today));
    const c = counter(day);
    const ext = extname(name).toLowerCase().replace('.jpeg', '.jpg');
    let target;
    if (isPdf(name)) {
      target = c.pdf ? `${day}-${c.next++}.pdf` : `${day}.pdf`;
      c.pdf = true;
    } else {
      target = `${day}-${c.next++}${ext}`;
    }
    await rename(file, join(dir, target));
    known.set(await fingerprint(join(dir, target)), target);
    renamed.push(`주보/${name} → ${target}`);
  }
}

// ── 글 (워드·메모장) ─────────────────────────────────
for (const dir of DOC_DIRS) {
  for (const name of await list(dir)) {
    if (skip(name) || !DOC_EXT.test(name) || DOC_DATED.test(name)) continue;
    const date = dateInName(name) ?? iso(today);
    let target = `${date} ${name}`;
    for (let n = 2; existsSync(join(dir, target)); n++) target = `${date} ${name.replace(DOC_EXT, '')} (${n})${extname(name)}`;
    await rename(join(dir, name), join(dir, target));
    renamed.push(`${dir.split(/[\\/]/).pop()}/${name} → ${target}`);
  }
}

for (const line of renamed) console.log(line);
console.log(renamed.length ? `파일 ${renamed.length}개를 정리했습니다.` : '정리할 파일이 없습니다.');
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `changed=${renamed.length > 0}\ncount=${renamed.length}\n`);
}
