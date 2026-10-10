#!/usr/bin/env node
/**
 * GitHub 웹에서 올린 큰 사진(jpg·png)을 홈페이지용 WebP 로 줄입니다.
 *
 *  - public/uploads 아래의 400KB 넘는 .jpg / .jpeg / .png 파일을 찾아 가로·세로 2000px 이하, WebP(품질 82)로 바꿉니다.
 *    (관리자 화면이 사진을 올릴 때 하는 것과 같은 설정입니다. 이미 작은 파일은 그대로 둡니다)
 *  - 원본 파일은 지우고, 글(src/content, src/data)에 적힌 사진 주소도 새 이름(.webp)으로 바꿔 줍니다.
 *  - 주보처럼 파일 이름의 날짜·번호(2026-10-11-1.jpg → 2026-10-11-1.webp)는 그대로 유지됩니다.
 *  - GitHub Actions 가 실행합니다 (.github/workflows/optimize-uploads.yml). 직접 실행: npm run optimize:uploads
 */
import { readdir, readFile, writeFile, unlink, stat, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
const UPLOADS = join(ROOT, 'public', 'uploads');
const TEXT_DIRS = [join(ROOT, 'src', 'content'), join(ROOT, 'src', 'data')];
const RASTER = /\.(jpe?g|png)$/i;
const MIN_BYTES = 400 * 1024;

async function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const toUrl = (file) => '/' + relative(join(ROOT, 'public'), file).split(sep).join('/');

const renamed = new Map(); // 옛 주소 → 새 주소
let savedBytes = 0;

for await (const file of walk(UPLOADS)) {
  if (!RASTER.test(file)) continue;
  const before = (await stat(file)).size;
  if (before < MIN_BYTES) continue;
  const target = file.replace(RASTER, '.webp');
  if (existsSync(target)) {
    console.warn(`건너뜀: 같은 이름의 WebP 가 이미 있습니다 → ${toUrl(target)}`);
    continue;
  }
  await sharp(file)
    .rotate() // 휴대폰 사진의 회전 정보(EXIF) 반영
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(target);
  const after = (await stat(target)).size;
  await unlink(file);
  savedBytes += before - after;
  renamed.set(toUrl(file), toUrl(target));
  console.log(`${toUrl(file)} → ${toUrl(target)}  (${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB)`);
}

// 글 속 사진 주소 바꾸기 (한글·띄어쓰기 이름이 %인코딩된 경우도 함께)
if (renamed.size) {
  for (const dir of TEXT_DIRS) {
    for await (const file of walk(dir)) {
      // _템플릿.md 같은 안내 파일의 예시 주소는 건드리지 않습니다.
      if (!/\.(md|json)$/.test(file) || /[\\/]_[^\\/]*$/.test(file)) continue;
      const text = await readFile(file, 'utf8');
      let next = text;
      for (const [from, to] of renamed) {
        next = next.split(from).join(to).split(encodeURI(from)).join(encodeURI(to));
      }
      if (next !== text) {
        await writeFile(file, next);
        console.log(`주소 고침: ${relative(ROOT, file)}`);
      }
    }
  }
}

console.log(renamed.size ? `사진 ${renamed.size}장을 줄였습니다. (${(savedBytes / 1024 / 1024).toFixed(1)}MB 절약)` : '줄일 사진이 없습니다.');
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `changed=${renamed.size > 0}\ncount=${renamed.size}\n`);
}
