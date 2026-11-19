import type { KeyboardEvent } from 'react';
import type { OutputMode } from '../../types';
import { DownloadIcon, PlusIcon, TrashIcon } from '../icons/FilmFrameIcons';
import { Button } from '../ui/Button';

export interface WorkspaceToolbarProps {
  outputMode: OutputMode;
  imageCount: number;
  includedCount?: number;
  processedCount?: number;
  stripStatusLabel?: string;
  description?: string;
  statusSummary?: string;
  controlsDisabled?: boolean;
  canExport?: boolean;
  exportLabel?: string;
  onOutputModeChange: (mode: OutputMode) => void;
  onAddPhotos: () => void;
  onExport?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onDeleteAll?: () => void;
  className?: string;
}

export function WorkspaceToolbar({
  outputMode,
  imageCount,
  includedCount = imageCount,
  processedCount = 0,
  stripStatusLabel,
  description = '选片、调整，然后把这一卷带回去。',
  statusSummary,
  controlsDisabled = false,
  canExport = false,
  exportLabel = '导出成片',
  onOutputModeChange,
  onAddPhotos,
  onExport,
  onSelectAll,
  onClearSelection,
  onDeleteAll,
  className = '',
}: WorkspaceToolbarProps) {
  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, mode: OutputMode) => {
    if (controlsDisabled) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextMode = event.key === 'Home'
      ? 'single'
      : event.key === 'End'
        ? 'strip'
        : mode === 'single' ? 'strip' : 'single';
    onOutputModeChange(nextMode);
    window.requestAnimationFrame(() => document.getElementById(`workspace-tab-${nextMode}`)?.focus());
  };

  return (
    <header className={`ff-workspace-toolbar border-b border-[var(--ff-line-soft)] px-4 py-5 sm:px-6 lg:px-8 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-[var(--ff-font-display)] text-[26px] font-medium leading-9 tracking-[-0.025em] text-[var(--ff-paper)]">
              照片工作台
            </h1>
            {statusSummary ? (
              <span
                className="text-xs text-[var(--ff-paper-muted)]"
                data-testid="workspace-summary"
                data-included-count={includedCount}
                data-image-count={imageCount}
                data-processed-count={processedCount}
              >
                {statusSummary}
              </span>
            ) : null}
          </div>
          <p className="ff-workspace-toolbar__description mt-1 text-sm leading-6 text-[var(--ff-paper-muted)]">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport && onExport ? (
            <Button
              variant="secondary"
              leadingIcon={<DownloadIcon />}
              onClick={onExport}
              disabled={controlsDisabled}
            >
              {exportLabel}
            </Button>
          ) : null}
          <Button
            id="workspace-add-photos"
            variant="secondary"
            leadingIcon={<PlusIcon />}
            onClick={onAddPhotos}
            disabled={controlsDisabled}
          >
            添加照片
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div
          className="ff-output-tabs inline-grid min-h-12 w-full grid-cols-2 sm:w-auto"
          role="tablist"
          aria-label="出片方式"
        >
          <button
            id="workspace-tab-single"
            type="button"
            role="tab"
            aria-selected={outputMode === 'single'}
            aria-controls="workspace-panel-single"
            tabIndex={outputMode === 'single' ? 0 : -1}
            disabled={controlsDisabled}
            onClick={() => onOutputModeChange('single')}
            onKeyDown={event => selectFromKeyboard(event, 'single')}
          >
            单张 <span className="ff-output-tabs__meta">{processedCount}/{includedCount}</span>
          </button>
          <button
            id="workspace-tab-strip"
            type="button"
            role="tab"
            aria-selected={outputMode === 'strip'}
            aria-controls="workspace-panel-strip"
            tabIndex={outputMode === 'strip' ? 0 : -1}
            disabled={controlsDisabled}
            onClick={() => onOutputModeChange('strip')}
            onKeyDown={event => selectFromKeyboard(event, 'strip')}
          >
            胶片长条{stripStatusLabel ? <span className="ff-output-tabs__meta">{stripStatusLabel}</span> : null}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSelectAll && onClearSelection ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label="选片范围">
              <Button variant="ghost" onClick={onSelectAll} disabled={controlsDisabled || includedCount === imageCount}>全部入选</Button>
              <Button variant="ghost" onClick={onClearSelection} disabled={controlsDisabled || includedCount === 0}>清空入选</Button>
            </div>
          ) : null}
          {onDeleteAll ? (
            <Button
              variant="ghost"
              leadingIcon={<TrashIcon size={16} />}
              onClick={onDeleteAll}
              disabled={controlsDisabled}
              aria-label="删除全部照片"
              title="删除全部照片"
            />
          ) : null}
        </div>
      </div>

      {includedCount === 0 ? (
        <p className="mt-3 text-xs text-[var(--ff-warning)]" role="status" aria-live="polite">请先选择至少一张照片</p>
      ) : null}
    </header>
  );
}

export default WorkspaceToolbar;
