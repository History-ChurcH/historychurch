import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { slug as githubSlug } from 'github-slugger';
import { bulletinLoader } from './lib/bulletin-loader';

// CMS 는 비어 있는 선택 항목을 '' 로 저장하므로 null/'' 모두 허용합니다.
const text = z.string().nullish().transform((v) => v ?? '');
const list = z.array(z.string()).nullish().transform((v) => (v ?? []).filter(Boolean));

/**
 * 마크다운 폴더를 읽습니다.
 * - 이름이 `_` 로 시작하는 파일(예: `_템플릿.md`)은 사이트에 나오지 않습니다.
 * - 글 상단에 date 가 없으면 파일 이름 앞의 날짜(예: `2026-10-11-추수감사.md`)를 씁니다.
 */
const md = (dir: string) =>
  glob({
    base: `./src/content/${dir}`,
    pattern: ['**/*.md', '!**/_*'],
    generateId({ entry, data }) {
      // generateId 는 검사(schema) 직전에 불리므로, 여기서 빠진 날짜를 채워 넣습니다.
      const fromName = entry.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
      if (!data.date && fromName) data.date = `${fromName[1]}-${fromName[2]}-${fromName[3]}`;
      // 주소는 Astro 기본 규칙과 똑같이 만듭니다. (기존 글 주소가 바뀌지 않도록)
      if (data.slug) return String(data.slug);
      return entry
        .replace(/\.md$/, '')
        .split('/')
        .map((part) => githubSlug(part))
        .join('/')
        .replace(/\/index$/, '');
    },
  });

/** 설교 — YouTube 에서 자동으로 가져오고, CMS 에서 고칠 수 있습니다. */
const sermons = defineCollection({
  loader: md('sermons'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(['주일예배', '수요예배', '금요기도회', '특별예배']).default('주일예배'),
    preacher: z.string().default('김영훈 담임목사'),
    scripture: text,
    series: text,
    youtube: z.string(),
    passage: text,
    summary: text,
  }),
});

/** 목회서신(칼럼) */
const columns = defineCollection({
  loader: md('목회서신'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().default('김영훈 담임목사'),
    cover: text,
  }),
});

/** 주보 — 마크다운 글 + `public/uploads/bulletins/` 에 날짜 이름으로 올린 이미지·PDF */
const bulletins = defineCollection({
  loader: bulletinLoader(md('bulletins')),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    images: list,
    file: text,
  }),
});

/** 공지 · 교회 소식 */
const notices = defineCollection({
  loader: md('공지'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    pinned: z.boolean().default(false),
    images: list,
  }),
});

/** 은혜나눔 — 성도들의 간증 · 묵상 나눔 */
const grace = defineCollection({
  loader: md('은혜나눔'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: text,
    images: list,
  }),
});

/** 게시판 — 공지·주보·목회서신이 아닌 일반 글 (게시판 목록에 은혜나눔과 함께 보입니다) */
const posts = defineCollection({
  loader: md('게시판'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: text,
    category: text,
    images: list,
  }),
});

/** 영상 — 설교 외의 영상(찬양, 행사, 간증 등). 유튜브 주소만 적으면 됩니다. */
const videos = defineCollection({
  loader: md('영상'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    youtube: z.string(),
  }),
});

/** 교회 앨범 */
const albums = defineCollection({
  loader: md('albums'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    cover: text,
    photos: list,
  }),
});

export const collections = { sermons, columns, bulletins, notices, grace, posts, videos, albums };
