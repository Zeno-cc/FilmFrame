import type { DragEvent } from 'react';
import type { RenderArtifact } from '../../services/renderResult';
import { ApertureIcon, DownloadIcon, EyeIcon, FilmIcon, RefreshIcon } from '../icons/FilmFrameIcons';
import { Button } from '../ui/Button';
import { FilmSequenceRail, type FilmSequenceItem } from './FilmSequenceRail';

export type FilmStripStageState =
  | { kind: 'empty'; message?: string }
  | { kind: 'processing'; message?: string }
  | { kind: 'current'; artifact: RenderArtifact; alt?: string }
  | { kind: 'stale'; artifact?: RenderArtifact; message?: string; alt?: string };

export interface FilmStripWorkspaceProps {
  stage: FilmStripStageState;
  sequenceItems: readonly FilmSequenceItem[];
  includedCount: number;
  removalAllowed: boolean;
  actionsDisabled?: boolean;
  selectionDisabled?: boolean;
  draggable?: boolean;
  generateLabel?: string;
  onGenerate: () => void;
  onPreview?: () => void;
  onDownload?: (artifact: RenderArtifact, filename: string) => void;
  downloadFilename?: string;
  onSelectSequenceItem?: (id: string) => void;
  onToggleSequenceItem?: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onDragStart?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnter?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, index: number) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>, index: number) => void;
  className?: string;
}

export function FilmStripWorkspace({
  stage,
  sequenceItems,
  includedCount,
  removalAllowed,
  actionsDisabled = false,
  selectionDisabled = false,
  draggable = false,
  generateLabel,
  onGenerate,
  onPreview,
  onDownload,
  downloadFilename = 'film_strip',
  onSelectSequenceItem,
  onToggleSequenceItem,
  onRemove,
  onMove,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
  className = '',
}: FilmStripWorkspaceProps) {
  const defaultGenerateLabel = stage.kind === 'empty' ? '生成连底长条' : '重新生成';
  const busy = stage.kind === 'processing';
  const hasIncludedItems = includedCount > 0;

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      <section className="overflow-hidden rounded-[6px] border border-[var(--ff-line-soft)] bg-[var(--ff-panel)]" aria-labelledby="film-strip-stage-title">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--ff-line-soft)] px-4 py-2 sm:px-5">
          <div>
            <h2 id="film-strip-stage-title" className="text-sm font-medium text-[var(--ff-paper)]">长条审片台</h2>
            <p className="mt-0.5 font-mono text-[10px] text-[var(--ff-paper-dim)]">ORDERED FILM OUTPUT</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {stage.kind === 'current' && onPreview ? (
              <Button variant="ghost" size="sm" leadingIcon={<EyeIcon />} onClick={onPreview} disabled={actionsDisabled}>预览</Button>
            ) : null}
            {stage.kind === 'current' && onDownload ? (
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<DownloadIcon />}
                onClick={() => onDownload(stage.artifact, downloadFilename)}
                disabled={actionsDisabled}
              >
                下载
              </Button>
            ) : null}
            <Button
              variant={stage.kind === 'current' ? 'secondary' : 'primary'}
              size="sm"
              leadingIcon={<RefreshIcon />}
              onClick={onGenerate}
              disabled={actionsDisabled || busy || !hasIncludedItems}
            >
              {generateLabel ?? defaultGenerateLabel}
            </Button>
          </div>
        </div>

        <div className="relative flex min-h-[320px] items-center justify-center overflow-x-auto bg-[var(--ff-bg-deep)] p-5 sm:min-h-[420px]" aria-live="polite">
          {stage.kind === 'processing' ? (
            <div className="ff-film-strip-bath flex flex-col items-center gap-3 text-center text-[var(--ff-paper-muted)]" role="status">
              <span className="ff-film-strip-bath__icon text-[var(--ff-safelight)]" aria-hidden="true">
                <ApertureIcon size={30} />
              </span>
              <p className="text-sm">{stage.message ?? '长条盘中拼合...'}</p>
              <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--ff-paper-dim)]">CONTACT STRIP</p>
            </div>
          ) : stage.kind === 'current' ? (
            <img
              src={stage.artifact.url}
              alt={stage.alt ?? '已生成的胶片长条'}
              className="max-h-[620px] max-w-none object-contain shadow-[0_12px_32px_rgba(0,0,0,.28)]"
            />
          ) : stage.kind === 'stale' ? (
            <div className="flex min-w-full flex-col items-center gap-4">
              {stage.artifact ? (
                <img
                  src={stage.artifact.url}
                  alt={stage.alt ?? '需要重新生成的胶片长条'}
                  className="max-h-[560px] max-w-none object-contain"
                />
              ) : <FilmIcon size={36} className="text-[var(--ff-paper-dim)]" />}
              <div className="rounded-[4px] border border-[var(--ff-warning)] bg-[var(--ff-panel)] px-4 py-2 text-center">
                <p className="text-sm font-medium text-[var(--ff-warning)]">需重新生成</p>
                <p className="mt-1 text-xs text-[var(--ff-paper-dim)]">{stage.message ?? '照片、顺序或配方已变化。'}</p>
              </div>
            </div>
          ) : (
            <div className="max-w-sm text-center text-[var(--ff-paper-muted)]">
              <FilmIcon className="mx-auto text-[var(--ff-paper-dim)]" size={38} />
              <p className="mt-4 text-sm">{stage.message ?? `将按当前顺序拼合 ${sequenceItems.length} 张照片`}</p>
              <p className="mt-1 text-xs text-[var(--ff-paper-dim)]">生成前仍可在下方调整叙事顺序</p>
            </div>
          )}
        </div>
      </section>

      <FilmSequenceRail
        items={sequenceItems}
        removalAllowed={removalAllowed}
        actionsDisabled={actionsDisabled}
        selectionDisabled={selectionDisabled}
        draggable={draggable}
        onSelect={onSelectSequenceItem}
        onToggleIncluded={onToggleSequenceItem}
        onRemove={onRemove}
        onMove={onMove}
        onDragStart={onDragStart}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      />
    </div>
  );
}

export default FilmStripWorkspace;
