import { useEffect, useState } from 'react';
import { UploadIcon } from '../icons/FilmFrameIcons';
import { Button } from '../ui/Button';
import {
  getNextPhotographyQuoteUpdateDelay,
  getPhotographyQuoteIndexAt,
  photographyQuotes,
} from '../../services/photographyQuotes';

const DECORATIVE_FRAME_COUNT = 16;

export interface EmptyDarkroomProps {
  isDragActive?: boolean;
  uploadDisabled?: boolean;
  onChoosePhotos: () => void;
  className?: string;
}

export function EmptyDarkroom({
  isDragActive = false,
  uploadDisabled = false,
  onChoosePhotos,
  className = '',
}: EmptyDarkroomProps) {
  const [quoteIndex, setQuoteIndex] = useState(() => getPhotographyQuoteIndexAt(Date.now(), photographyQuotes.length));

  useEffect(() => {
    if (photographyQuotes.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setQuoteIndex(getPhotographyQuoteIndexAt(Date.now(), photographyQuotes.length));
    }, getNextPhotographyQuoteUpdateDelay(Date.now()));
    return () => window.clearTimeout(timer);
  }, [quoteIndex]);

  const quote = photographyQuotes[quoteIndex] ?? photographyQuotes[0];

  return (
    <section
      className={`ff-empty-darkroom relative isolate flex min-h-[560px] overflow-hidden border-y border-[var(--ff-line-soft)] bg-[var(--ff-panel)] px-5 py-10 sm:min-h-[580px] sm:px-8 ${className}`}
      aria-labelledby="empty-darkroom-title"
      data-drag-active={isDragActive}
    >
      <div className="ff-empty-darkroom__film" aria-hidden="true">
        <div className="ff-empty-darkroom__film-track" data-testid="empty-darkroom-film-track">
          <div className="ff-empty-darkroom__film-rail" data-testid="empty-darkroom-film-rail" />
          <div className="ff-empty-darkroom__exposures">
            {Array.from({ length: DECORATIVE_FRAME_COUNT }, (_, index) => (
              <div
                className="ff-empty-darkroom__exposure-frame"
                data-testid="empty-darkroom-exposure-frame"
                key={index}
              />
            ))}
          </div>
          <div className="ff-empty-darkroom__film-rail" data-testid="empty-darkroom-film-rail" />
        </div>
      </div>

      <div className="ff-empty-darkroom__content relative mx-auto w-full max-w-2xl text-center">
        <div className="ff-empty-darkroom__focus flex flex-col items-center">
          <div className="mb-4 flex size-10 items-center justify-center rounded-[4px] border border-[var(--ff-line-strong)] bg-[var(--ff-bg)] text-[var(--ff-amber)]" aria-hidden="true">
            <UploadIcon size={20} />
          </div>
          <h2 id="empty-darkroom-title" className="font-[var(--ff-font-display)] text-2xl leading-8 text-[var(--ff-paper)] sm:text-[28px] sm:leading-9">
            让这一卷，慢慢显影
          </h2>
          <Button
            className="mt-5"
            variant="primary"
            size="lg"
            leadingIcon={<UploadIcon />}
            onClick={onChoosePhotos}
            disabled={uploadDisabled}
          >
            选择照片
          </Button>
          <p className="mt-3 text-xs text-[var(--ff-paper-dim)]">也可以把照片拖进这间暗房</p>
        </div>
        <div className="ff-empty-darkroom__context w-full" data-testid="empty-darkroom-context">
          <div
            className="ff-empty-darkroom__quote-stage"
            data-quote-id={quote.id}
            data-testid="photography-quote"
            aria-live="off"
          >
            <blockquote className="ff-empty-darkroom__quote-text" lang="zh-Hans">
              “{quote.displayTextZhHans}”
            </blockquote>
            <div className="ff-empty-darkroom__quote-meta">
              <cite className="ff-empty-darkroom__quote-cite">
                — {quote.authorZhHans ?? quote.author}
                <span aria-hidden="true"> · </span>
                <a
                  className="ff-empty-darkroom__quote-source"
                  href={quote.wikiquoteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {quote.sourceTitle}
                </a>
              </cite>
            </div>
          </div>
          <ol className="mt-4 grid w-full grid-cols-3 border-y border-[var(--ff-line-soft)] py-3 font-mono text-[10px] text-[var(--ff-paper-dim)] sm:text-xs" aria-label="暗房流程">
            <li>01 选片</li>
            <li className="border-x border-[var(--ff-line-soft)]">02 调配</li>
            <li>03 显影与收卷</li>
          </ol>
        </div>
      </div>

      {isDragActive ? (
        <div className="absolute inset-3 z-10 flex items-center justify-center rounded-[6px] border border-[var(--ff-amber)] bg-[color:var(--ff-bg)]/95" role="status">
          <span className="font-[var(--ff-font-display)] text-xl text-[var(--ff-amber)]">松开以加入这一卷</span>
        </div>
      ) : null}
    </section>
  );
}

export default EmptyDarkroom;
