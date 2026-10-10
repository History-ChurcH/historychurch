import { readdir } from 'node:fs/promises';
import type { Loader } from 'astro/loaders';
import { BULLETIN_DROP, BULLETIN_FILE as FILE, BULLETIN_PUBLIC, BULLETIN_URL } from './bulletin-files.mjs';

/**
 * 주보 — 마크다운 글에 더해, 폴더에 이미지·PDF 파일만 올린 주보도 읽습니다.
 *
 * 저장소 맨 위 `주보/` 폴더(또는 예전 자리 `public/uploads/bulletins/`)에 날짜로 시작하는 파일을 올리면,
 * 같은 날짜끼리 묶어 주보 한 개가 됩니다. 이미 그 날짜의 마크다운 글(관리자 화면에서 만든 주보)이 있으면 마크다운 글을 씁니다.
 * 두 폴더의 파일 모두 홈페이지에서는 /uploads/bulletins/파일이름 으로 보입니다. (`주보/` 는 빌드할 때 복사 — astro.config.mjs)
 */
export function bulletinLoader(markdown: Loader, folders = [BULLETIN_DROP, BULLETIN_PUBLIC], publicPath = BULLETIN_URL): Loader {
  return {
    name: 'bulletins-with-files',
    async load(context) {
      // 마크다운 글을 먼저 읽습니다. (지난번에 파일로 만든 항목은 이때 지워졌다가 아래에서 다시 만들어집니다)
      await markdown.load(context);

      const taken = new Set<string>();
      for (const entry of context.store.values()) {
        const data = entry.data as { date: Date };
        taken.add(data.date.toISOString().slice(0, 10));
      }

      const names = new Set<string>();
      for (const folder of folders) {
        try {
          for (const name of await readdir(new URL(`${encodeURI(folder)}/`, context.config.root))) names.add(name);
        } catch {
          // 폴더가 없으면 건너뜁니다.
        }
      }

      const groups = new Map<string, { images: string[]; pdf: string }>();
      for (const name of [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
        const m = name.match(FILE);
        if (!m) continue;
        const day = `${m[1]}-${m[2]}-${m[3]}`;
        if (taken.has(day)) continue;
        const group = groups.get(day) ?? { images: [], pdf: '' };
        const path = `${publicPath}/${name}`;
        if (m[5].toLowerCase() === 'pdf') group.pdf ||= path;
        else group.images.push(path);
        groups.set(day, group);
      }

      for (const [day, { images, pdf }] of groups) {
        const data = await context.parseData({
          id: day,
          data: { title: `${day.replaceAll('-', '.')} 주보`, date: day, images, file: pdf },
        });
        context.store.set({ id: day, data, body: '', rendered: { html: '' } });
      }
    },
  };
}
