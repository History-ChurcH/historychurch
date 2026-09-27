#!/usr/bin/env node
/**
 * 히스토리교회 YouTube 채널에 새 예배 영상이 올라오면 설교 글(src/content/sermons/*.md)을 자동으로 만듭니다.
 *
 *  - GitHub Actions 가 몇 시간마다 이 스크립트를 실행합니다 (.github/workflows/sync-sermons.yml).
 *  - 이미 있는 영상은 건너뛰므로, CMS 에서 고친 내용은 덮어쓰지 않습니다.
 *  - 직접 실행: npm run sync:sermons
 */
import { readdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCJfngn5W15Iitdv4mTv0aTg';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const DIR = join(import.meta.dirname, '..', 'src', 'content', 'sermons');
const PREACHER = '김영훈 담임목사';

// 영상 제목으로 예배 종류를 구분합니다. 여기에 없는 영상(찬양 등)은 가져오지 않습니다.
const RULES = [
  { match: /주일\s*예배/, category: '주일예배', slug: 'sunday', weekday: 0 },
  { match: /수요/, category: '수요예배', slug: 'wednesday', weekday: 3 },
  { match: /금요/, category: '금요기도회', slug: 'friday', weekday: 5 },
];

const decode = (s = '') =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);

/** 업로드 시각(한국 시간) 기준으로, 그 날짜 이전의 가장 가까운 예배 요일을 찾습니다. */
function serviceDate(publishedIso, weekday) {
  const kst = new Date(new Date(publishedIso).getTime() + 9 * 3600 * 1000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** 제목·설명에서 설교 제목, 시리즈, 본문을 뽑아냅니다. */
function parse(title, description) {
  const quoted = title.match(/[“"]([^”"]+)[”"]/)?.[1];
  const bracket = title.match(/\[\s*([^\]]+?)\s*\]\s*(?:히스토리교회\s*)?주일/)?.[1];
  const sermonTitle = (bracket || quoted || title).replace(/\s+/g, ' ').trim();

  // "스가랴 (13)“보라!…”(6장)" → 시리즈 "스가랴 (13)", 본문 "스가랴 6장"
  const seriesInTitle = title.match(/[:：]\s*([가-힣]+\s*\(\d+\))/)?.[1];
  const chapter = title.match(/\((\d+)\s*장\)/)?.[1];

  const lines = description.split(/\r?\n/);
  const seriesInDesc = lines.find((l) => /^[가-힣\s]+\(\d+\)\s*$/.test(l.trim()))?.trim();
  const series = (seriesInDesc || seriesInTitle || '').replace(/\s+\(/, ' (');

  let scripture = '';
  let passage = '';
  const idx = lines.findIndex((l) => /본\s*문\s*[:：]/.test(l));
  if (idx >= 0) {
    scripture = lines[idx].split(/[:：]/).slice(1).join(':').trim();
    const verses = [];
    for (const l of lines.slice(idx + 1)) {
      if (/^\s*✜/.test(l)) break;
      verses.push(l.trim());
    }
    passage = verses.join('\n').replace(/\n{2,}/g, '\n').trim();
  } else if (series && chapter) {
    scripture = `${series.replace(/\s*\(\d+\)/, '')} ${chapter}장`;
  }

  return { title: sermonTitle, series, scripture, passage };
}

const yamlStr = (v) => JSON.stringify(v ?? '');
const yamlBlock = (v) => (v ? `|\n${v.split('\n').map((l) => `  ${l}`).join('\n')}` : '""');

async function existingVideos() {
  const ids = new Set();
  const names = new Set();
  for (const name of await readdir(DIR).catch(() => [])) {
    if (!name.endsWith('.md')) continue;
    names.add(name);
    const text = await readFile(join(DIR, name), 'utf8');
    // CMS 에서 주소 전체(https://youtu.be/…)를 넣었어도 영상 ID 만 뽑아서 비교합니다.
    const value = text.match(/^youtube:\s*["']?([^"'\n]+)/m)?.[1].trim();
    if (value) ids.add(value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/)?.[1] ?? value);
  }
  return { ids, names };
}

/**
 * 유튜브 RSS 는 가끔 몇 시간씩 404/500 을 돌려줍니다(유튜브 쪽 문제).
 * 몇 번 다시 시도하고, 그래도 안 되면 null — 다음 시간에 다시 확인하면 되므로 실패로 치지 않습니다.
 */
async function fetchFeed(tries = 4) {
  let last = '';
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(FEED, { headers: { 'user-agent': 'historychurch-sermon-sync' } });
      if (res.ok) return await res.text();
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    if (i < tries) await new Promise((r) => setTimeout(r, 10_000 * i));
  }
  console.log(`::warning::YouTube 피드가 응답하지 않아 이번에는 건너뜁니다 (${last}). 다음 예약 시간에 다시 확인합니다.`);
  return null;
}

async function main() {
  const xml = await fetchFeed();
  if (xml === null) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'changed=false\ncount=0\n');
    return;
  }
  const entries = xml.split('<entry>').slice(1);

  const { ids, names } = await existingVideos();
  const created = [];

  for (const entry of entries) {
    const videoId = tag(entry, 'yt:videoId');
    const title = tag(entry, 'title');
    const published = tag(entry, 'published');
    const description = tag(entry, 'media:description');
    const rule = RULES.find((r) => r.match.test(title));
    if (!videoId || !rule || ids.has(videoId)) continue;

    const date = serviceDate(published, rule.weekday);
    const info = parse(title, description);

    let name = `${date}-${rule.slug}.md`;
    for (let n = 2; names.has(name); n++) name = `${date}-${rule.slug}-${n}.md`;
    names.add(name);
    ids.add(videoId);

    const body = [
      '---',
      `title: ${yamlStr(info.title)}`,
      `date: ${date}`,
      `category: ${rule.category}`,
      `preacher: ${yamlStr(PREACHER)}`,
      `scripture: ${yamlStr(info.scripture)}`,
      `series: ${yamlStr(info.series)}`,
      `youtube: ${videoId}`,
      `passage: ${yamlBlock(info.passage)}`,
      `summary: ""`,
      '---',
      '',
    ].join('\n');

    await writeFile(join(DIR, name), body, 'utf8');
    created.push(`${name}  ←  ${title}`);
  }

  if (created.length) {
    console.log(`새 설교 ${created.length}개를 추가했습니다:\n  ${created.join('\n  ')}`);
  } else {
    console.log('새로 올라온 설교 영상이 없습니다.');
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${created.length > 0}\ncount=${created.length}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
