// @ts-check
import { defineConfig } from 'astro/config';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BULLETIN_DROP, BULLETIN_FILE, BULLETIN_URL } from './src/lib/bulletin-files.mjs';

// GitHub Actions 에서 SITE / BASE_PATH 를 넣어 줍니다.
// - 하위 경로에 올릴 때(예: GitHub Pages): SITE=https://<계정>.github.io, BASE_PATH=/<저장소>
// - 실제 도메인 연결 후:    SITE=https://historychurch.org,   BASE_PATH=(비움)
const site = process.env.SITE || 'https://historychurch.org';
const base = process.env.BASE_PATH || '/';

/**
 * CMS 는 사진 주소를 항상 "/uploads/..." 로 저장합니다.
 * 미리보기 주소(/historychurch/)처럼 하위 경로에 올릴 때, 본문 속 사진 주소에도 그 경로를 붙여 줍니다.
 * @returns {import('astro').AstroIntegration}
 */
function uploadsBasePath() {
  const prefix = base.replace(/\/$/, '');
  return {
    name: 'uploads-base-path',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        if (!prefix) return;
        const walk = async (/** @type {string} */ d) => {
          for (const entry of await readdir(d, { withFileTypes: true })) {
            const p = join(d, entry.name);
            if (entry.isDirectory()) await walk(p);
            else if (entry.name.endsWith('.html')) {
              const html = await readFile(p, 'utf8');
              const fixed = html.replace(/(src|href)="\/uploads\//g, `$1="${prefix}/uploads/`);
              if (fixed !== html) await writeFile(p, fixed);
            }
          }
        };
        await walk(fileURLToPath(dir));
      },
    },
  };
}

/**
 * 저장소 맨 위 '주보' 폴더에 올린 주보 파일을 사이트의 /uploads/bulletins/ 로 내보냅니다.
 * (예전 주보는 public/uploads/bulletins 에 그대로 있고, 주소도 똑같은 /uploads/bulletins/… 입니다)
 * @returns {import('astro').AstroIntegration}
 */
function bulletinDropFolder() {
  const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };
  /** @param {URL} root */
  const sourceDir = (root) => fileURLToPath(new URL(`${encodeURI(BULLETIN_DROP)}/`, root));
  /** @param {string} dir */
  const list = async (dir) => (existsSync(dir) ? (await readdir(dir)).filter((n) => BULLETIN_FILE.test(n)) : []);
  /** @type {URL} */
  let root;
  return {
    name: 'bulletin-drop-folder',
    hooks: {
      'astro:config:done': ({ config }) => {
        root = config.root;
      },
      // 개발 서버(npm run dev)에서도 보이도록
      'astro:server:setup': ({ server }) => {
        const prefix = `${base.replace(/\/$/, '')}${BULLETIN_URL}/`;
        server.middlewares.use((req, res, next) => {
          const url = decodeURIComponent((req.url ?? '').split('?')[0]);
          if (!url.startsWith(prefix)) return next();
          const name = url.slice(prefix.length);
          const file = join(sourceDir(root), name);
          if (name.includes('/') || !BULLETIN_FILE.test(name) || !existsSync(file)) return next();
          res.setHeader('Content-Type', MIME[/** @type {keyof MIME} */ (extname(name).toLowerCase())] ?? 'application/octet-stream');
          createReadStream(file).pipe(res);
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const from = sourceDir(root);
        const to = fileURLToPath(new URL(`.${BULLETIN_URL}/`, dir));
        const names = await list(from);
        if (!names.length) return;
        await mkdir(to, { recursive: true });
        for (const name of names) {
          // 예전 폴더에 같은 이름이 있으면 예전 파일을 지키고 알려 줍니다.
          if (existsSync(join(to, name))) logger.warn(`주보/${name}: public/uploads/bulletins 에 같은 이름이 있어 건너뜁니다.`);
          else await copyFile(join(from, name), join(to, name));
        }
        logger.info(`주보 폴더의 파일 ${names.length}개를 ${BULLETIN_URL}/ 로 복사했습니다.`);
      },
    },
  };
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  integrations: [bulletinDropFolder(), uploadsBasePath()],
  redirects: {
    // 예전 워드프레스 주소 → 새 주소
    '/greeting': '/about/#greeting',
    '/maps': '/worship/#location',
    '/sermon': '/sermons/',
    '/history': '/news/',
  },
});
