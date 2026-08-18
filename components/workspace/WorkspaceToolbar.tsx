import type { KeyboardEvent } from 'react';
import type { OutputMode } from '../../types';
import { DownloadIcon, PlusIcon, TrashIcon } from '../icons/FilmFrameIcons';
import { Button } from '../ui/Button';

const MODE_COPY: Record<OutputMode, { eyebrow: string; title: string; description: string }> = {
  single: {
    eyebrow: 'CONTACT SHEET',
    title: '接触印象',
    description: '逐张查看、排序并冲洗这一卷照片。',
  },
  strip: {
    eyebrow: 'FILM STRIP',
    title: '连底长条',
    description: '按当前顺序拼合整卷照片，生成连续胶片长条。',
  },
};

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
  description,
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
  const copy = MODE_COPY[outputMode];

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
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="ff-lab-label text-[var(--ff-amber)]" aria-hidden="true">
            {copy.eyebrow}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-[var(--ff-font-display)] text-2xl leading-8 text-[var(--ff-paper)] sm:text-[28px] sm:leading-9">
              {copy.title}
            </h1>
            {statusSummary ? (
              <span className="font-mono text-xs text-[var(--ff-paper-dim)]">{statusSummary}</span>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ff-paper-muted)]">
            {description ?? copy.description}
          </p>
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
            variant="primary"
            leadingIcon={<PlusIcon />}
            onClick={onAddPhotos}
            disabled={controlsDisabled}
          >
            添加照片
          </Button>
        </div>
      </div>

      <div
        className="mt-5 inline-grid min-h-11 w-full grid-cols-2 rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-bg)] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] sm:w-auto"
        role="tablist"
        aria-label="输出工作区"
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
          className="min-h-9 rounded-[3px] px-3 text-xs font-medium text-[var(--ff-paper-muted)] transition-colors aria-selected:bg-[var(--ff-amber-soft)] aria-selected:text-[var(--ff-amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          单张成片 · {processedCount}/{includedCount}
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
          className="min-h-9 rounded-[3px] px-3 text-xs font-medium text-[var(--ff-paper-muted)] transition-colors aria-selected:bg-[var(--ff-amber-soft)] aria-selected:text-[var(--ff-amber)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          连底长条{stripStatusLabel ? ` · ${stripStatusLabel}` : ''}
        </button>
      </div>

      {imageCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ff-line-soft)] pt-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-[var(--ff-paper-muted)]">入选 {includedCount} / {imageCount}</p>
            {includedCount === 0 ? (
              <p className="mt-1 text-xs text-[var(--ff-warning)]" role="status" aria-live="polite">请先选择至少一张照片</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onSelectAll && onClearSelection ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="选片范围">
                <Button variant="ghost" onClick={onSelectAll} disabled={controlsDisabled || includedCount === imageCount}>全部入选</Button>
                <Button variant="ghost" onClick={onClearSelection} disabled={controlsDisabled || includedCount === 0}>清空入选</Button>
              </div>
            ) : null}
            {onDeleteAll ? (
              <div className="border-l border-[var(--ff-line)] pl-2">
                <Button
                  variant="danger"
                  leadingIcon={<TrashIcon size={16} />}
                  onClick={onDeleteAll}
                  disabled={controlsDisabled}
                >
                  删除全部照片
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

export default WorkspaceToolbar;
