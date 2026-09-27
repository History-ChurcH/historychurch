import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// CMS 는 비어 있는 선택 항목을 '' 로 저장하므로 null/'' 모두 허용합니다.
const text = z.string().nullish().transform((v) => v ?? '');
const list = z.array(z.string()).nullish().transform((v) => (v ?? []).filter(Boolean));

const md = (dir: string) => glob({ base: `./src/content/${dir}`, pattern: '**/*.md' });

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
  loader: md('columns'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().default('김영훈 담임목사'),
    cover: text,
  }),
});

/** 주보 */
const bulletins = defineCollection({
  loader: md('bulletins'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    images: list,
    file: text,
  }),
});

/** 공지 · 교회 소식 */
const notices = defineCollection({
  loader: md('notices'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    pinned: z.boolean().default(false),
    images: list,
  }),
});

/** 은혜나눔 — 성도들의 간증 · 묵상 나눔 */
const grace = defineCollection({
  loader: md('grace'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: text,
    images: list,
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

export const collections = { sermons, columns, bulletins, notices, grace, albums };
