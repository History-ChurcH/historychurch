// @ts-check
import { defineConfig } from 'astro/config';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  integrations: [uploadsBasePath()],
  redirects: {
    // 예전 워드프레스 주소 → 새 주소
    '/greeting': '/about/#greeting',
    '/maps': '/worship/#location',
    '/sermon': '/sermons/',
    '/history': '/news/',
  },
});
