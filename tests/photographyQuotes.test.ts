import { describe, expect, it } from 'vitest';
import {
  getNextPhotographyQuoteUpdateDelay,
  getPhotographyQuoteIndexAt,
  parsePhotographyQuoteCatalog,
  photographyQuotes,
} from '../services/photographyQuotes';

describe('摄影名言审核快照', () => {
  it('包含经过结构校验的摄影师名言', () => {
    expect(photographyQuotes.length).toBeGreaterThanOrEqual(6);
    expect(new Set(photographyQuotes.map(quote => quote.id)).size).toBe(photographyQuotes.length);
    expect(photographyQuotes.every(quote => quote.wikiquoteUrl.includes(`oldid=${quote.wikiquoteRevisionId}`))).toBe(true);
  });

  it('拒绝重复 id、不可信来源和不匹配的修订号', () => {
    const base = photographyQuotes[0];
    expect(() => parsePhotographyQuoteCatalog([base, base])).toThrow(/id 重复/);
    expect(() => parsePhotographyQuoteCatalog([{ ...base, wikiquoteUrl: 'http://example.com/quote' }])).toThrow(/Wikiquote 地址或修订号无效/);
    expect(() => parsePhotographyQuoteCatalog([{ ...base, wikiquoteRevisionId: base.wikiquoteRevisionId + 1 }])).toThrow(/修订号无效/);
  });
});

describe('摄影名言每日轮换', () => {
  it('同一个 24 小时时段保持稳定，跨时段切换下一条', () => {
    expect(getPhotographyQuoteIndexAt(0, 6)).toBe(0);
    expect(getPhotographyQuoteIndexAt(86_399_999, 6)).toBe(0);
    expect(getPhotographyQuoteIndexAt(86_400_000, 6)).toBe(1);
    expect(getPhotographyQuoteIndexAt(6 * 86_400_000, 6)).toBe(0);
  });

  it('计算下一时段边界并安全处理无效输入', () => {
    expect(getNextPhotographyQuoteUpdateDelay(0)).toBe(86_400_000);
    expect(getNextPhotographyQuoteUpdateDelay(1)).toBe(86_399_999);
    expect(getPhotographyQuoteIndexAt(Number.NaN, 6)).toBe(0);
    expect(getPhotographyQuoteIndexAt(0, 0)).toBe(-1);
  });
});
