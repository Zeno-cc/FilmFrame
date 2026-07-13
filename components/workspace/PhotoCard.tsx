import type { DragEvent } from 'react';
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

function padded(value: number): string {
  return String(value).padStart(2, '0');
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

  return (
    <article
      draggable={draggable || undefined}
      aria-busy={active || undefined}
      onDragStart={event => onDragStart?.(event, index)}
      onDragEnter={event => onDragEnter?.(event, index)}
      onDragOver={event => onDragOver?.(event, index)}
      onDragEnd={event => onDragEnd?.(event, index)}
      className={`group relative overflow-hidden rounded-[6px] border bg-[var(--ff-panel)] transition-colors ${
        dropTarget ? 'border-[var(--ff-amber)]' : active ? 'border-[var(--ff-safelight)]' : 'border-[var(--ff-line-soft)] hover:border-[var(--ff-line-strong)]'
      } ${included ? '' : 'opacity-75'} ${draggable ? 'md:cursor-move md:active:cursor-grabbing' : ''} ${className}`}
    >
      {dropTarget ? <span className="absolute inset-y-0 left-0 z-10 w-0.5 bg-[var(--ff-amber)]" aria-hidden="true" /> : null}

      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--ff-line-soft)] px-3">
        <span className="font-mono text-[11px] text-[var(--ff-paper-muted)]">
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

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--ff-bg-deep)]">
        <img
          src={artifact?.url ?? item.previewUrl}
          alt={item.file.name}
          className="size-full select-none object-contain"
          loading="lazy"
          draggable={false}
        />
        {draggable ? (
          <span className="absolute right-2 top-2 hidden rounded-[3px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1.5 text-[var(--ff-paper-dim)] md:block" aria-hidden="true">
            <GripIcon size={16} />
          </span>
        ) : null}
        {status.kind === 'failed' ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-[3px] bg-[var(--ff-bg)] px-2 py-1 text-xs text-[var(--ff-danger)]">
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
