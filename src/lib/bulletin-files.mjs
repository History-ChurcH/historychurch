/**
 * 주보 파일 규칙 — 사이트(bulletin-loader.ts)와 빌드 설정(astro.config.mjs)이 함께 씁니다.
 */

/** 주보 파일 이름 → 날짜. 예) 2026-10-11-1.jpg, 2026.10.11.pdf, 20261011_앞면.png */
export const BULLETIN_FILE = /^(\d{4})[-.]?(\d{2})[-.]?(\d{2})(.*)\.(jpe?g|png|webp|gif|pdf)$/i;

/** 지금부터 주보를 올리는 곳 (저장소 맨 위의 '주보' 폴더). 빌드할 때 /uploads/bulletins/ 로 복사됩니다. */
export const BULLETIN_DROP = '주보';

/** 예전 주보 이미지가 있는 곳 (관리자 화면으로 올린 주보도 여기에 저장됩니다) */
export const BULLETIN_PUBLIC = 'public/uploads/bulletins';

/** 두 폴더의 주보 파일이 홈페이지에서 보이는 주소 */
export const BULLETIN_URL = '/uploads/bulletins';
