import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const WIKIQUOTE_API_URL = 'https://en.wikiquote.org/w/api.php';
export const PHOTOGRAPHER_PAGES = Object.freeze([
  'Ansel Adams',
  'Henri Cartier-Bresson',
  'Robert Capa',
  'Dorothea Lange',
  'Diane Arbus',
  'Gordon Parks',
]);

const STOP_SECTION_PATTERN = /^==+\s*(?:quotes? about\b.*|disputed|external links|references|see also)\s*==+\s*$/i;
const QUOTES_SECTION_PATTERN = /^==+\s*quotes?\s*==+\s*$/i;

export function buildWikiquoteApiUrl(title) {
  const url = new URL(WIKIQUOTE_API_URL);
  url.search = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    rvprop: 'ids|timestamp|content',
    rvslots: 'main',
    titles: title.replaceAll(' ', '_'),
    format: 'json',
    formatversion: '2',
  }).toString();
  return url.toString();
}

function decodeEntities(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ');
}

export function cleanWikiText(value) {
  let text = value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<ref\b[^>]*\/>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[(https?:\/\/\S+)\s+([^\]]+)\]/g, '$2')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  return text.replace(/\s+/g, ' ').trim().replace(/^['“"]|['”"]$/g, '');
}

export function extractQuoteCandidates(page) {
  const candidates = [];
  const lines = page.wikitext.split(/\r?\n/);
  let inQuotes = false;
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inQuotes) {
      if (QUOTES_SECTION_PATTERN.test(trimmed)) inQuotes = true;
      continue;
    }
    if (STOP_SECTION_PATTERN.test(trimmed)) break;
    if (/^==+/.test(trimmed) && !/^===+/.test(trimmed)) continue;

    if (/^\*(?!\*)/.test(trimmed)) {
      const originalText = cleanWikiText(trimmed.replace(/^\*\s*/, ''));
      if (originalText.length < 12 || originalText.length > 500) {
        current = null;
        continue;
      }
      current = {
        author: page.title,
        originalText,
        sourceDetail: '',
        wikiquoteUrl: `https://en.wikiquote.org/w/index.php?title=${encodeURIComponent(page.title.replaceAll(' ', '_'))}&oldid=${page.revisionId}`,
        wikiquoteRevisionId: page.revisionId,
        wikiquoteRevisionTimestamp: page.revisionTimestamp,
      };
      candidates.push(current);
      continue;
    }

    if (current && /^\*\*/.test(trimmed) && !current.sourceDetail) {
      current.sourceDetail = cleanWikiText(trimmed.replace(/^\*+\s*/, ''));
    }
  }

  return candidates;
}

function parseWikiquoteResponse(value, expectedTitle) {
  const page = value?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const slot = revision?.slots?.main;
  const wikitext = slot?.content;
  if (!page || page.missing || typeof page.title !== 'string') {
    throw new Error(`Wikiquote 页面不存在：${expectedTitle}`);
  }
  if (!revision || !Number.isInteger(revision.revid) || typeof revision.timestamp !== 'string' || typeof wikitext !== 'string') {
    throw new Error(`Wikiquote 页面结构无效：${expectedTitle}`);
  }
  return {
    title: page.title,
    pageId: page.pageid,
    revisionId: revision.revid,
    revisionTimestamp: revision.timestamp,
    wikitext,
  };
}

export async function fetchWikiquotePage(title, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(buildWikiquoteApiUrl(title), {
      headers: { 'User-Agent': 'FilmFrame/1.0 (photography quote sync)' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Wikiquote 请求失败：${title}（HTTP ${response.status}）`);
    return parseWikiquoteResponse(await response.json(), title);
  } finally {
    clearTimeout(timer);
  }
}

export async function collectWikiquoteCandidates({
  fetchImpl = fetch,
  pages = PHOTOGRAPHER_PAGES,
  now = () => new Date(),
} = {}) {
  const syncedPages = [];
  for (const title of pages) {
    const page = await fetchWikiquotePage(title, { fetchImpl });
    const candidates = extractQuoteCandidates(page);
    if (candidates.length === 0) throw new Error(`Wikiquote 页面没有可用候选：${title}`);
    syncedPages.push({
      title: page.title,
      pageId: page.pageId,
      revisionId: page.revisionId,
      revisionTimestamp: page.revisionTimestamp,
      candidates,
    });
  }
  return {
    generatedAt: now().toISOString(),
    source: WIKIQUOTE_API_URL,
    pages: syncedPages,
  };
}

export async function syncPhotographyQuoteCandidates({
  fetchImpl = fetch,
  pages = PHOTOGRAPHER_PAGES,
  now = () => new Date(),
  outputPath = path.resolve('generated/photography-quote-candidates.json'),
  mkdirImpl = mkdir,
  writeFileImpl = writeFile,
} = {}) {
  const payload = await collectWikiquoteCandidates({ fetchImpl, pages, now });
  await mkdirImpl(path.dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { outputPath, payload };
}

async function main() {
  const result = await syncPhotographyQuoteCandidates();
  const count = result.payload.pages.reduce((sum, page) => sum + page.candidates.length, 0);
  process.stdout.write(`已生成 ${count} 条候选：${result.outputPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
