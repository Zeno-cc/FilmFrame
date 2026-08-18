import type { DragEvent } from 'react';
import type { ImageItem } from '../../types';
import { isImageIncluded } from '../../services/batchCuration';
import { ArrowDownIcon, ArrowUpIcon, GripIcon, TrashIcon } from '../icons/FilmFrameIcons';
import { IconButton } from '../ui/IconButton';

export interface FilmSequenceItem {
  item: ImageItem;
  sequenceNumber: number;
  selected?: boolean;
  dropTarget?: boolean;
}

export interface FilmSequenceRailProps {
  items: readonly FilmSequenceItem[];
  removalAllowed: boolean;
  actionsDisabled?: boolean;
  selectionDisabled?: boolean;
  draggable?: boolean;
  onSelect?: (id: string) => void;
  onToggleIncluded?: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDragStart?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnter?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>, index: number) => void;
  className?: string;
}

export function FilmSequenceRail({
  items,
  removalAllowed,
  actionsDisabled = false,
  selectionDisabled = false,
  draggable = false,
  onSelect,
  onToggleIncluded,
  onRemove,
  onMove,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
  className = '',
}: FilmSequenceRailProps) {
  return (
    <section className={`ff-film-sequence-rail border-y border-[var(--ff-line-soft)] py-4 ${className}`} aria-labelledby="film-sequence-title">
      <div className="mb-3 flex items-center justify-between gap-3 px-4 sm:px-5">
        <div>
          <h2 id="film-sequence-title" className="text-sm font-medium text-[var(--ff-paper)]">叙事顺序</h2>
          <p className="mt-0.5 text-[11px] text-[var(--ff-paper-dim)]">长条会按下列顺序从左到右拼合</p>
        </div>
        <span className="font-mono text-[10px] text-[var(--ff-paper-dim)]">{items.length} FRAMES</span>
      </div>

      <ol className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:px-5" aria-label="胶片长条照片顺序">
        {items.map((view, index) => {
          const included = isImageIncluded(view.item);
          return (
            <li
            key={view.item.id}
            draggable={draggable || undefined}
            onDragStart={event => onDragStart?.(event, index)}
            onDragEnter={event => onDragEnter?.(event, index)}
            onDragOver={event => onDragOver?.(event, index)}
            onDragEnd={event => onDragEnd?.(event, index)}
            className={`ff-film-sequence-rail__cell relative w-40 shrink-0 snap-start border p-2 ${
              view.dropTarget ? 'border-[var(--ff-amber)]' : view.selected ? 'border-[var(--ff-line-strong)]' : 'border-[var(--ff-line-soft)]'
            } ${included ? '' : 'opacity-75'} ${draggable ? 'md:cursor-move md:active:cursor-grabbing' : ''}`}
          >
            {view.dropTarget ? <span className="absolute -left-2 top-0 h-full w-0.5 bg-[var(--ff-amber)]" aria-hidden="true" /> : null}
            <button
              type="button"
              className="relative block aspect-[4/3] w-full overflow-hidden rounded-[3px] bg-[var(--ff-bg-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-default"
              onClick={() => onSelect?.(view.item.id)}
              disabled={!onSelect}
              aria-label={`选择第 ${view.sequenceNumber} 张，${view.item.file.name}`}
              aria-current={view.selected ? 'true' : undefined}
              title={view.item.file.name}
            >
              <img
                src={view.item.previewUrl}
                alt={view.item.file.name}
                className="size-full object-cover"
                loading="lazy"
                draggable={false}
              />
              <span className="absolute bottom-1 left-1 rounded-[2px] bg-[var(--ff-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ff-paper)]">
                {String(view.sequenceNumber).padStart(2, '0')}
              </span>
              {draggable ? <span className="absolute right-1 top-1 rounded-[2px] bg-[var(--ff-bg)] p-1 text-[var(--ff-paper-muted)]" aria-hidden="true"><GripIcon size={14} /></span> : null}
            </button>

            <p className="mt-2 truncate font-mono text-[10px] text-[var(--ff-paper-muted)]" title={view.item.file.name}>{view.item.file.name}</p>
            <label
              className="mt-1 flex min-h-11 cursor-pointer items-center gap-1.5 text-[10px] text-[var(--ff-paper-muted)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
              title={included ? '取消入选' : '加入本次处理'}
            >
              <input
                type="checkbox"
                checked={included}
                onChange={() => onToggleIncluded?.(view.item.id)}
                disabled={selectionDisabled || !onToggleIncluded}
                aria-label={`${included ? '取消入选' : '入选'} ${view.item.file.name}`}
                className="size-4 accent-[var(--ff-amber)]"
              />
              <span>{included ? '入选' : '未入选'}</span>
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              <IconButton
                size="sm"
                icon={<ArrowUpIcon size={15} />}
                label={`上移 ${view.item.file.name}`}
                title="上移"
                onClick={() => onMove(view.item.id, 'up')}
                disabled={actionsDisabled || index === 0}
              />
              <IconButton
                size="sm"
                icon={<ArrowDownIcon size={15} />}
                label={`下移 ${view.item.file.name}`}
                title="下移"
                onClick={() => onMove(view.item.id, 'down')}
                disabled={actionsDisabled || index === items.length - 1}
              />
              <IconButton
                size="sm"
                variant="danger"
                icon={<TrashIcon size={15} />}
                label={`删除 ${view.item.file.name}`}
                title="删除"
                onClick={() => onRemove(view.item.id)}
                disabled={actionsDisabled || !removalAllowed}
              />
            </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default FilmSequenceRail;
