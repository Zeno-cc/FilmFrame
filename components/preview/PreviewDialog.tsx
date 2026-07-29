import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CropIcon,
  DownloadIcon,
  RotateCwIcon,
} from '../icons/FilmFrameIcons';
import { ShareIcon } from '../app/FilmFrameAppIcons';

export type PreviewSourceMode = 'before' | 'after';
export type PreviewDialogMode = 'single' | 'strip';

export interface PreviewDialogProps {
  open: boolean;
  mode: PreviewDialogMode;
  title: string;
  source?: string | null;
  beforeSource?: string | null;
  afterSource?: string | null;
  sourceMode?: PreviewSourceMode;
  onSourceModeChange?: (mode: PreviewSourceMode) => void;
  index?: number;
  total?: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  canNavigate?: boolean;
  downloadHref?: string | null;
  downloadName?: string;
  onShare?: () => void;
  canShare?: boolean;
  onCrop?: () => void;
  cropTriggerRef?: RefObject<HTMLButtonElement | null>;
  onRotate?: () => void;
  onApply?: () => void;
  applyLabel?: string;
  isCropping?: boolean;
  previewRendering?: boolean;
  cropContent?: ReactNode;
  footer?: ReactNode;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

export function PreviewDialog({
  open,
  mode,
  title,
  source,
  beforeSource,
  afterSource,
  sourceMode = 'after',
  onSourceModeChange,
  index,
  total,
  onClose,
  onPrevious,
  onNext,
  canNavigate = false,
  downloadHref,
  downloadName = 'filmframe-preview',
  onShare,
  canShare = false,
  onCrop,
  cropTriggerRef,
  onRotate,
  onApply,
  applyLabel = '应用并冲洗此张',
  isCropping = false,
  previewRendering = false,
  cropContent,
  footer,
  restoreFocusRef,
  className = '',
}: PreviewDialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const interactionRef = useRef({
    mode,
    canNavigate,
    isCropping,
    onClose,
    onPrevious,
    onNext,
    onRotate,
    restoreFocusRef,
  });
  interactionRef.current = {
    mode,
    canNavigate,
    isCropping,
    onClose,
    onPrevious,
    onNext,
    onRotate,
    restoreFocusRef,
  };

  useEffect(() => {
    if (!open) return;
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        interactionRef.current.onClose();
        return;
      }
      if (
        interactionRef.current.mode === 'single'
        && !interactionRef.current.isCropping
      ) {
        const target = event.target;
        const editableTarget = target instanceof HTMLElement
          && (target.matches('input, textarea, select') || target.isContentEditable);
        if (
          (event.key === 'r' || event.key === 'R')
          && !event.repeat
          && !event.metaKey
          && !event.ctrlKey
          && !event.altKey
          && !editableTarget
          && interactionRef.current.onRotate
        ) {
          event.preventDefault();
          interactionRef.current.onRotate();
          return;
        }
      }
      if (
        interactionRef.current.mode === 'single'
        && interactionRef.current.canNavigate
        && !interactionRef.current.isCropping
      ) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          interactionRef.current.onPrevious?.();
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          interactionRef.current.onNext?.();
        }
      }
      if (event.key !== 'Tab' || !rootRef.current) return;
      const focusable = Array.from(rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => (
        interactionRef.current.restoreFocusRef?.current ?? previousActiveElement.current
      )?.focus());
    };
  }, [open]);

  if (!open) return null;

  const effectiveSource = mode === 'single'
    ? (sourceMode === 'before' ? beforeSource : afterSource) ?? source
    : source;
  const hasBeforeAfter = mode === 'single' && Boolean(beforeSource || afterSource);

  return (
    <div ref={rootRef} className={`ff-preview-dialog fixed inset-0 z-[85] flex flex-col bg-[var(--ff-overlay)] ${className}`} role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="filmframe-preview-title" className="flex h-full min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start gap-3 px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0 flex-1">
            <h2 id="filmframe-preview-title" className="truncate text-sm font-medium text-[var(--ff-paper)] md:text-base">{title}</h2>
            {mode === 'single' && typeof index === 'number' && typeof total === 'number' && (
              <div className="mt-1 font-mono text-[11px] text-[var(--ff-paper-dim)]">{index + 1} / {total}{previewRendering ? ' · 正在生成预览' : ''}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canShare && onShare && !isCropping && (
              <button
                type="button"
                onClick={onShare}
                aria-label="分享当前成片"
                title="分享"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
              >
                <ShareIcon />
              </button>
            )}
            {downloadHref && !isCropping && (
              <a
                href={downloadHref}
                download={downloadName}
                aria-label="下载当前预览"
                title="下载"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
              >
                <DownloadIcon />
              </a>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="关闭预览"
              title="关闭预览"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col px-3 pb-3 md:px-6 md:pb-4">
          {canNavigate && mode === 'single' && !isCropping && (
            <>
              <button
                type="button"
                onClick={onPrevious}
                aria-label="上一张"
                title="上一张"
                className="absolute left-1 top-1/2 z-10 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-panel)]/80 text-[var(--ff-paper)] hover:bg-[var(--ff-panel-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] md:left-4"
              >
                <ChevronLeftIcon size={24} />
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label="下一张"
                title="下一张"
                className="absolute right-1 top-1/2 z-10 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-panel)]/80 text-[var(--ff-paper)] hover:bg-[var(--ff-panel-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] md:right-4"
              >
                <ChevronRightIcon size={24} />
              </button>
            </>
          )}
          {isCropping && cropContent ? (
            <div data-crop-workbench className="flex min-h-0 w-full flex-1 flex-col">{cropContent}</div>
          ) : effectiveSource ? (
            <div className="flex h-full min-h-0 items-center justify-center">
              <img
                src={effectiveSource}
                alt={title || '成片预览'}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--ff-paper-dim)]">暂无可预览成片</div>
          )}
        </div>

        {!isCropping && mode === 'single' && (
          <div className="mx-auto mb-3 flex w-[min(100%-24px,900px)] shrink-0 flex-wrap items-center justify-center gap-2 rounded-[6px] border border-[var(--ff-line)] bg-[var(--ff-panel)]/95 p-2.5 shadow-[0_12px_32px_rgba(0,0,0,.28)] md:mb-5">
            {hasBeforeAfter && onSourceModeChange && (
              <div className="flex rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1">
                <button
                  type="button"
                  onClick={() => onSourceModeChange('before')}
                  aria-pressed={sourceMode === 'before'}
                  className={`min-h-11 rounded-[3px] px-3 text-xs ${sourceMode === 'before' ? 'bg-[var(--ff-paper)] text-[var(--ff-ink)]' : 'text-[var(--ff-paper-muted)] hover:text-[var(--ff-paper)]'}`}
                >
                  原图
                </button>
                <button
                  type="button"
                  onClick={() => onSourceModeChange('after')}
                  aria-pressed={sourceMode === 'after'}
                  className={`min-h-11 rounded-[3px] px-3 text-xs ${sourceMode === 'after' ? 'bg-[var(--ff-amber)] text-[var(--ff-ink)]' : 'text-[var(--ff-paper-muted)] hover:text-[var(--ff-paper)]'}`}
                >
                  成片
                </button>
              </div>
            )}
            {onCrop && (
              <button
                ref={cropTriggerRef}
                type="button"
                onClick={onCrop}
                aria-label="调整构图"
                className="inline-flex min-h-11 items-center gap-2 rounded-[4px] border border-[var(--ff-line)] px-3 text-xs text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
              >
                <CropIcon size={17} />
                调整构图
              </button>
            )}
            {onRotate && (
              <button
                type="button"
                onClick={onRotate}
                aria-label="顺时针旋转 90°"
                aria-keyshortcuts="R"
                title="顺时针旋转 90°"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[4px] border border-[var(--ff-line)] px-3 text-xs text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
              >
                <RotateCwIcon size={17} />
                旋转 90°
              </button>
            )}
            {onApply && (
              <button
                type="button"
                onClick={onApply}
                disabled={previewRendering}
                className="min-h-11 rounded-[4px] bg-[var(--ff-amber)] px-4 text-xs font-semibold text-[var(--ff-ink)] hover:bg-[var(--ff-amber-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:opacity-40"
              >
                {applyLabel}
              </button>
            )}
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}

export default PreviewDialog;
