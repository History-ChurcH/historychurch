import { readdir, readFile } from 'node:fs/promises';
import type { Loader } from 'astro/loaders';
import { slug as githubSlug } from 'github-slugger';
import mammoth from 'mammoth';

/** 2026-10-11 추수감사의 참뜻.docx · 2026.10.11_공지.txt · 20261011.txt */
const FILE = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})[\s_.-]*(.*)\.(docx|txt)$/i;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 메모장 파일 읽기. 예전 윈도우 메모장이 저장한 한글(EUC-KR, ‘ANSI’)도 알아서 읽습니다. */
function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('euc-kr').decode(buffer);
  }
}

/** 메모장 글 → HTML. 빈 줄로 문단을 나누고, 줄바꿈과 인터넷 주소(링크)는 살립니다. */
function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

/**
 * 워드 글 → HTML. 굵게·기울임·목록·표·링크는 살리고, 글꼴·크기·색은 홈페이지 디자인을 따릅니다.
 * 워드의 ‘제목 1/2/3’ 스타일은 글 안의 소제목이 됩니다. (페이지 제목은 파일 이름에서 가져옵니다)
 */
async function docxToHtml(buffer: Buffer): Promise<{ html: string; text: string }> {
  const styleMap = [
    "p[style-name='Title'] => h2:fresh",
    "p[style-name='Heading 1'] => h2:fresh",
    "p[style-name='heading 1'] => h2:fresh",
    "p[style-name='Heading 2'] => h3:fresh",
    "p[style-name='heading 2'] => h3:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='heading 3'] => h3:fresh",
  ];
  const [{ value: html }, { value: text }] = await Promise.all([mammoth.convertToHtml({ buffer }, { styleMap }), mammoth.extractRawText({ buffer })]);
  return { html, text };
}

/**
 * 마크다운 글에 더해, 같은 폴더에 올린 워드(.docx)·메모장(.txt) 파일도 글로 읽습니다.
 *
 * - 파일 이름: `날짜 제목.docx` → 날짜와 제목으로 사용. 이름이 날짜뿐이면 본문 첫 줄이 제목이 됩니다.
 * - 이름이 `_` 로 시작하는 파일은 건너뜁니다.
 * - 같은 주소의 마크다운 글이 이미 있으면 주소 뒤에 -2, -3 … 을 붙입니다.
 */
export function withDocuments(markdown: Loader, folder: string): Loader {
  return {
    name: `documents:${folder}`,
    async load(context) {
      await markdown.load(context);

      const dir = new URL(`src/content/${encodeURI(folder)}/`, context.config.root);
      let names: string[] = [];
      try {
        names = (await readdir(dir)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      } catch {
        return;
      }

      for (const name of names) {
        const m = name.normalize('NFC').match(FILE);
        if (!m || name.startsWith('_')) continue;
        const [, y, mo, d, rest, ext] = m;
        const file = new URL(encodeURIComponent(name), dir);

        let html: string;
        let text: string;
        try {
          if (ext.toLowerCase() === 'txt') {
            text = decodeText(await readFile(file)).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
            html = '';
          } else {
            ({ html, text } = await docxToHtml(await readFile(file)));
          }
        } catch (error) {
          context.logger.warn(`${folder}/${name}: 파일을 읽지 못해 건너뜁니다. (${(error as Error).message})`);
          continue;
        }

        // 제목: 파일 이름의 날짜 뒤 글자. 없으면 본문 첫 줄(그리고 본문에서는 그 줄을 뺍니다)
        let title = rest.replace(/_+/g, ' ').trim();
        if (!title) {
          const lines = text.split('\n');
          const first = lines.findIndex((l) => l.trim());
          title = first >= 0 ? lines[first].trim() : `${y}.${mo}.${d}`;
          if (ext.toLowerCase() === 'txt' && first >= 0) text = lines.slice(first + 1).join('\n');
          else html = html.replace(/^<(p|h[1-6])>[\s\S]*?<\/\1>/, '');
        }
        if (ext.toLowerCase() === 'txt') html = textToHtml(text);

        const base = githubSlug(name.normalize('NFC').replace(/\.(docx|txt)$/i, ''));
        let id = base;
        for (let n = 2; context.store.has(id); n++) id = `${base}-${n}`;

        const data = await context.parseData({ id, data: { title, date: `${y}-${mo}-${d}` } });
        context.store.set({ id, data, body: text.trim(), rendered: { html } });
      }
    },
  };
}
