#!/usr/bin/env node
/**
 * 이름에 날짜가 없는 파일에 날짜를 붙여 줍니다. (봉사자가 파일 이름을 고치지 않아도 되도록)
 *
 *  - 주보 폴더: IMG_1234.jpg 처럼 날짜 없는 이미지·PDF → 가까운 주일 날짜로 2026-10-11-1.jpg, 2026-10-11-2.jpg …
 *      월·화·수요일에 올리면 지난 주일, 목·금·토·일요일에 올리면 이번(다가오는) 주일로 봅니다.
 *      여러 장을 한꺼번에 올리면 원래 이름 순서(휴대폰 사진은 찍은 순서)대로 번호를 붙입니다.
 *  - 글 폴더(목회서신·공지·은혜나눔·게시판): 추수감사의 참뜻.docx → 2026-10-11 추수감사의 참뜻.docx (올린 날짜)
 *      제목은 원래 파일 이름 그대로 쓰입니다.
 *  - 날짜는 한국 시간 기준 ‘지금’입니다. GitHub Actions 가 올린 직후에 실행합니다 (.github/workflows/optimize-uploads.yml).
 *  - 이름이 _ 로 시작하는 파일, README.md, 이미 날짜가 있는 파일은 건드리지 않습니다.
 */
import { readdir, rename, appendFile } from 'node:fs/promises';
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
const skip = (name) => name.startsWith('_') || name.startsWith('.') || /^readme\.md$/i.test(name);

const renamed = [];

// ── 주보 ─────────────────────────────────────────────
const sunday = iso(nearestSunday(today));
const allBulletins = [...(await list(OLD_BULLETINS)), ...(await Promise.all(BULLETIN_DIRS.map(list))).flat()];
/** 그 주일에 이미 있는 이미지 번호 중 가장 큰 것 */
let next =
  Math.max(
    0,
    ...allBulletins
      .map((n) => n.match(BULLETIN_FILE))
      .filter((m) => m && `${m[1]}-${m[2]}-${m[3]}` === sunday && m[5].toLowerCase() !== 'pdf')
      .map((m) => Number(m[4].match(/(\d+)\s*$/)?.[1] ?? 1)),
  ) + 1;
let hasPdf = allBulletins.some((n) => n.startsWith(sunday) && /\.pdf$/i.test(n));

for (const dir of BULLETIN_DIRS) {
  const names = (await list(dir)).filter((n) => !skip(n) && BULLETIN_EXT.test(n) && !BULLETIN_FILE.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const name of names) {
    const ext = extname(name).toLowerCase().replace('.jpeg', '.jpg');
    let target;
    if (ext === '.pdf') {
      target = hasPdf ? `${sunday}-${next++}.pdf` : `${sunday}.pdf`;
      hasPdf = true;
    } else {
      target = `${sunday}-${next++}${ext}`;
    }
    await rename(join(dir, name), join(dir, target));
    renamed.push(`주보/${name} → ${target}`);
  }
}

// ── 글 (워드·메모장) ─────────────────────────────────
const date = iso(today);
for (const dir of DOC_DIRS) {
  for (const name of await list(dir)) {
    if (skip(name) || !DOC_EXT.test(name) || DOC_DATED.test(name)) continue;
    let target = `${date} ${name}`;
    for (let n = 2; existsSync(join(dir, target)); n++) target = `${date} ${name.replace(DOC_EXT, '')} (${n})${extname(name)}`;
    await rename(join(dir, name), join(dir, target));
    renamed.push(`${dir.split(/[\\/]/).pop()}/${name} → ${target}`);
  }
}

for (const line of renamed) console.log(line);
console.log(renamed.length ? `파일 ${renamed.length}개에 날짜를 붙였습니다.` : '날짜를 붙일 파일이 없습니다.');
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `changed=${renamed.length > 0}\ncount=${renamed.length}\n`);
}
