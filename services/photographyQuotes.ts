import rawPhotographyQuotes from '../data/photography-quotes.json';

export const PHOTOGRAPHY_QUOTE_ROTATION_MS = 24 * 60 * 60 * 1_000;

export interface PhotographyQuote {
  id: string;
  originalText: string;
  displayTextZhHans: string;
  author: string;
  authorZhHans?: string;
  sourceTitle: string;
  sourceDetail?: string;
  wikiquoteUrl: string;
  wikiquoteRevisionId: number;
  translationCredit?: string;
  rightsNote: string;
  verifiedAt: string;
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function isWikiquoteRevisionUrl(value: unknown, revisionId: number): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.endsWith('.wikiquote.org')
      && url.pathname === '/w/index.php'
      && url.searchParams.get('oldid') === String(revisionId);
  } catch {
    return false;
  }
}

function parsePhotographyQuote(value: unknown, index: number): PhotographyQuote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`摄影名言第 ${index + 1} 条不是对象`);
  }

  const record = value as Record<string, unknown>;
  if (!isBoundedString(record.id, 3, 80) || !ID_PATTERN.test(record.id)) {
    throw new Error(`摄影名言第 ${index + 1} 条的 id 无效`);
  }
  if (!isBoundedString(record.originalText, 12, 360)) {
    throw new Error(`摄影名言 ${record.id} 的英文原文长度无效`);
  }
  if (!isBoundedString(record.displayTextZhHans, 6, 120)) {
    throw new Error(`摄影名言 ${record.id} 的中文译文长度无效`);
  }
  if (!isBoundedString(record.author, 2, 80)) {
    throw new Error(`摄影名言 ${record.id} 缺少作者`);
  }
  if (record.authorZhHans !== undefined && !isBoundedString(record.authorZhHans, 2, 40)) {
    throw new Error(`摄影名言 ${record.id} 的中文作者名无效`);
  }
  if (!isBoundedString(record.sourceTitle, 2, 140)) {
    throw new Error(`摄影名言 ${record.id} 缺少出处`);
  }
  if (record.sourceDetail !== undefined && !isBoundedString(record.sourceDetail, 2, 220)) {
    throw new Error(`摄影名言 ${record.id} 的出处详情无效`);
  }
  if (!Number.isInteger(record.wikiquoteRevisionId) || Number(record.wikiquoteRevisionId) <= 0) {
    throw new Error(`摄影名言 ${record.id} 的修订号无效`);
  }
  if (!isWikiquoteRevisionUrl(record.wikiquoteUrl, Number(record.wikiquoteRevisionId))) {
    throw new Error(`摄影名言 ${record.id} 的 Wikiquote 地址或修订号无效`);
  }
  if (record.translationCredit !== undefined && !isBoundedString(record.translationCredit, 2, 80)) {
    throw new Error(`摄影名言 ${record.id} 的译者信息无效`);
  }
  if (!isBoundedString(record.rightsNote, 4, 240)) {
    throw new Error(`摄影名言 ${record.id} 缺少版权说明`);
  }
  if (typeof record.verifiedAt !== 'string' || !DATE_PATTERN.test(record.verifiedAt)) {
    throw new Error(`摄影名言 ${record.id} 的核验日期无效`);
  }

  return {
    id: record.id,
    originalText: record.originalText.trim(),
    displayTextZhHans: record.displayTextZhHans.trim(),
    author: record.author.trim(),
    authorZhHans: record.authorZhHans?.trim(),
    sourceTitle: record.sourceTitle.trim(),
    sourceDetail: record.sourceDetail?.trim(),
    wikiquoteUrl: record.wikiquoteUrl,
    wikiquoteRevisionId: Number(record.wikiquoteRevisionId),
    translationCredit: record.translationCredit?.trim(),
    rightsNote: record.rightsNote.trim(),
    verifiedAt: record.verifiedAt,
  };
}

export function parsePhotographyQuoteCatalog(value: unknown): PhotographyQuote[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('摄影名言审核快照不能为空');
  }

  const quotes = value.map(parsePhotographyQuote);
  const ids = new Set<string>();
  for (const quote of quotes) {
    if (ids.has(quote.id)) throw new Error(`摄影名言 id 重复：${quote.id}`);
    ids.add(quote.id);
  }
  return quotes;
}

export function getPhotographyQuoteIndexAt(timestamp: number, count: number): number {
  if (!Number.isInteger(count) || count <= 0) return -1;
  const safeTimestamp = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
  return Math.floor(safeTimestamp / PHOTOGRAPHY_QUOTE_ROTATION_MS) % count;
}

export function getNextPhotographyQuoteUpdateDelay(timestamp: number): number {
  const safeTimestamp = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
  const elapsed = safeTimestamp % PHOTOGRAPHY_QUOTE_ROTATION_MS;
  return elapsed === 0 ? PHOTOGRAPHY_QUOTE_ROTATION_MS : PHOTOGRAPHY_QUOTE_ROTATION_MS - elapsed;
}

export const photographyQuotes = Object.freeze(parsePhotographyQuoteCatalog(rawPhotographyQuotes));
