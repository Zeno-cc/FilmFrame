import { useEffect, useState, type AnimationEvent, type DragEvent } from 'react';
import type { RenderArtifact } from '../../services/renderResult';
import type { ImageWorkflowStatus } from '../../services/workflowState';
import { isImageIncluded } from '../../services/batchCuration';
import type { ImageItem } from '../../types';
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  GripIcon,
} from '../icons/FilmFrameIcons';
import { IconButton } from '../ui/IconButton';
import { StatusStamp } from '../ui/StatusStamp';
import { PhotoCardActions } from './PhotoCardActions';

export interface PhotoCardDragHandlers {
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnter?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>, index: number) => void;
}

export interface PhotoCardProps extends PhotoCardDragHandlers {
  item: ImageItem;
  index: number;
  total: number;
  frameNumber: number;
  status: ImageWorkflowStatus;
  artifact: RenderArtifact | null;
  active?: boolean;
  dropTarget?: boolean;
  removalAllowed: boolean;
  actionsDisabled?: boolean;
  reorderDisabled?: boolean;
  selectionDisabled?: boolean;
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
  onToggleIncluded: (id: string) => void;
  onDownload: (artifact: RenderArtifact, filename: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  className?: string;
}

/** Contact-print tray phases: wet bath while processing; result-driven reveal when print URL lands. */
type DevelopPhase = 'idle' | 'bath' | 'reveal' | 'print';

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

function isBusyStatus(kind: ImageWorkflowStatus['kind']): boolean {
  return kind === 'processing' || kind === 'queued';
}

function initialDevelopPhase(status: ImageWorkflowStatus, hasPrint: boolean): DevelopPhase {
  if (isBusyStatus(status.kind)) return 'bath';
  if (hasPrint) return 'print';
  return 'idle';
}

export function PhotoCard({
  item,
  index,
  total,
  frameNumber,
  status,
  artifact,
  active = false,
  dropTarget = false,
  removalAllowed,
  actionsDisabled = false,
  reorderDisabled = false,
  selectionDisabled = false,
  onOpen,
  onRetry,
  onToggleIncluded,
  onDownload,
  onRemove,
  onMove,
  draggable = false,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
  className = '',
}: PhotoCardProps) {
  const included = isImageIncluded(item);
  const printUrl = artifact?.url ?? null;
  const [developPhase, setDevelopPhase] = useState<DevelopPhase>(() =>
    initialDevelopPhase(status, Boolean(printUrl)),
  );

  useEffect(() => {
    if (isBusyStatus(status.kind)) {
      setDevelopPhase('bath');
      return;
    }

    setDevelopPhase(current => {
      if (printUrl) {
        if (current === 'bath') return 'reveal';
        if (current === 'reveal') return current;
        return 'print';
      }
      return 'idle';
    });
  }, [status.kind, printUrl]);

  // Fallback when prefers-reduced-motion disables CSS animationend.
  useEffect(() => {
    if (developPhase !== 'reveal') return;
    const timer = window.setTimeout(() => {
      setDevelopPhase(current => (current === 'reveal' ? 'print' : current));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [developPhase]);

  const handlePrintAnimationEnd = (event: AnimationEvent<HTMLImageElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!event.animationName.includes('ff-contact-print')) return;
    setDevelopPhase(current => (current === 'reveal' ? 'print' : current));
  };

  return (
    <article
      draggable={draggable || undefined}
      aria-busy={active || developPhase === 'bath' || undefined}
      data-develop={developPhase}
      onDragStart={event => onDragStart?.(event, index)}
      onDragEnter={event => onDragEnter?.(event, index)}
      onDragOver={event => onDragOver?.(event, index)}
      onDragEnd={event => onDragEnd?.(event, index)}
      className={`ff-photo-card group relative overflow-hidden border transition-colors ${
        dropTarget ? 'border-[var(--ff-amber)]' : active || developPhase === 'bath' ? 'border-[var(--ff-safelight)]' : included ? 'border-[var(--ff-line)]' : 'border-[var(--ff-line-soft)] hover:border-[var(--ff-line-strong)]'
      } ${included ? '' : 'opacity-75'} ${draggable ? 'md:cursor-move md:active:cursor-grabbing' : ''} ${className}`}
    >
      {dropTarget ? <span className="absolute inset-y-0 left-0 z-10 w-0.5 bg-[var(--ff-amber)]" aria-hidden="true" /> : null}

      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--ff-line-soft)] bg-[rgba(0,0,0,0.18)] px-3">
        <span className="ff-photo-card__frame-tag">
          FRAME {padded(frameNumber)} / {padded(total)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <label
            className="flex min-h-11 cursor-pointer items-center gap-1.5 text-[11px] text-[var(--ff-paper-muted)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
            title={included ? '取消入选' : '加入本次处理'}
          >
            <input
              type="checkbox"
              checked={included}
              onChange={() => onToggleIncluded(item.id)}
              disabled={selectionDisabled}
              aria-label={`${included ? '取消入选' : '入选'} ${item.file.name}`}
              className="size-4 accent-[var(--ff-amber)]"
            />
            <span>{included ? '入选' : '未入选'}</span>
          </label>
          {status.kind === 'complete' ? (
            <StatusStamp
              kind="complete"
              icon={<CheckIcon size={18} />}
              iconOnly
              title={status.detail ?? '已出片'}
            />
          ) : (
            <StatusStamp kind={status.kind} compact title={status.detail} />
          )}
        </div>
      </div>

      <div className="ff-photo-card__mat relative aspect-[4/3] w-full overflow-hidden" data-develop={developPhase}>
        <img
          src={item.previewUrl}
          alt=""
          aria-hidden="true"
          className="ff-photo-card__latent size-full select-none object-contain"
          loading="lazy"
          draggable={false}
        />
        {printUrl ? (
          <div className="ff-photo-card__reveal-surface">
            <span className="ff-photo-card__print-bed" aria-hidden="true" />
            <img
              src={printUrl}
              alt={item.file.name}
              className="ff-photo-card__print size-full select-none object-contain"
              loading="lazy"
              draggable={false}
              onAnimationEnd={handlePrintAnimationEnd}
            />
          </div>
        ) : (
          <img
            src={item.previewUrl}
            alt={item.file.name}
            className="ff-photo-card__print ff-photo-card__print--preview size-full select-none object-contain"
            loading="lazy"
            draggable={false}
          />
        )}
        <span className="ff-photo-card__bath" aria-hidden="true" />
        <span className="ff-photo-card__bath-meniscus" aria-hidden="true" />
        {developPhase === 'bath' ? (
          <span className="ff-photo-card__bath-label" role="status">
            盘中显影
          </span>
        ) : null}
        {draggable ? (
          <span className="absolute right-2 top-2 z-[4] hidden rounded-[3px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1.5 text-[var(--ff-paper-dim)] md:block" aria-hidden="true">
            <GripIcon size={16} />
          </span>
        ) : null}
        {status.kind === 'failed' ? (
          <span className="absolute bottom-2 left-2 z-[4] inline-flex items-center gap-1 rounded-[3px] bg-[var(--ff-bg)] px-2 py-1 text-xs text-[var(--ff-danger)]">
            <AlertIcon size={13} />
            {status.detail ?? '处理失败，请重试'}
          </span>
        ) : null}
      </div>

      <PhotoCardActions
        fileName={item.file.name}
        artifact={artifact}
        showRetry={status.kind === 'failed'}
        removalAllowed={removalAllowed}
        disabled={actionsDisabled}
        retryDisabled={selectionDisabled || !included}
        onOpen={() => onOpen(item.id)}
        onRetry={() => onRetry(item.id)}
        onDownload={onDownload}
        onRemove={() => onRemove(item.id)}
      />

      <div className="flex min-h-[68px] items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-[var(--ff-paper)]" title={item.file.name}>{item.file.name}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--ff-paper-dim)]">
            {status.detail ?? item.exifDate ?? '无 EXIF 日期'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton
            icon={<ArrowUpIcon />}
            label={`上移 ${item.file.name}`}
            title="上移"
            onClick={() => onMove(item.id, 'up')}
            disabled={actionsDisabled || reorderDisabled || index === 0}
          />
          <IconButton
            icon={<ArrowDownIcon />}
            label={`下移 ${item.file.name}`}
            title="下移"
            onClick={() => onMove(item.id, 'down')}
            disabled={actionsDisabled || reorderDisabled || index === total - 1}
          />
        </div>
      </div>
    </article>
  );
}

export default PhotoCard;
