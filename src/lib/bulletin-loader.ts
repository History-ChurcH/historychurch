import { readdir } from 'node:fs/promises';
import type { Loader } from 'astro/loaders';

/** 주보 폴더에 올린 파일 이름 → 날짜. 예) 2026-10-11-1.jpg, 2026.10.11.pdf, 20261011_앞면.png */
const FILE = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})(.*)\.(jpe?g|png|webp|gif|pdf)$/i;

/**
 * 주보 — 마크다운 글에 더해, 폴더에 이미지·PDF 파일만 올린 주보도 읽습니다.
 *
 * `public/uploads/bulletins/` 에 날짜로 시작하는 파일을 올리면, 같은 날짜끼리 묶어 주보 한 개가 됩니다.
 * 이미 그 날짜의 마크다운 글(관리자 화면에서 만든 주보)이 있으면 마크다운 글을 씁니다.
 */
export function bulletinLoader(markdown: Loader, folder = 'public/uploads/bulletins', publicPath = '/uploads/bulletins'): Loader {
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

      let names: string[] = [];
      try {
        names = await readdir(new URL(`${folder}/`, context.config.root));
      } catch {
        return;
      }

      const groups = new Map<string, { images: string[]; pdf: string }>();
      for (const name of names.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
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
