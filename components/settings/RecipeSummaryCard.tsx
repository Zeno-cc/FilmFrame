import { type FilmSettings, type OutputMode } from '../../types';
import { supportsReal135Template } from '../../services/filmOverlay';
import { EDGE_MODE_LABELS, FRAME_MODE_LABELS } from '../../services/renderModePresentation';

export interface RecipeSummaryCardProps {
  settings: FilmSettings;
  outputMode?: OutputMode;
  recipeName?: string;
  pendingCount?: number;
  className?: string;
}

export function RecipeSummaryCard({
  settings,
  outputMode = 'single',
  recipeName,
  pendingCount,
  className = '',
}: RecipeSummaryCardProps) {
  const real135 = supportsReal135Template(settings.brandText) && (settings.frameRenderMode ?? 'real135') === 'real135';
  const color = real135 && settings.imagingMode === 'spectral' ? '光谱模拟' : '经典色彩';
  const edge = real135
    ? (settings.edgeRenderMode === 'physical135' ? EDGE_MODE_LABELS.physical135 : EDGE_MODE_LABELS['legacy-template'])
    : FRAME_MODE_LABELS.classic;
  const output = settings.outputFormat === 'image/png' ? 'PNG' : 'JPG';

  return (
    <section className={`ff-recipe-summary border-b border-[var(--ff-line-soft)] pb-5 ${className}`} aria-label="当前配方">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-medium text-[var(--ff-paper-muted)]">当前配方</h3>
          <p className="mt-1 truncate text-sm font-medium text-[var(--ff-paper)]">
            {recipeName || settings.brandText}
          </p>
          {recipeName && recipeName !== settings.brandText ? (
            <p className="mt-0.5 truncate font-mono text-xs text-[var(--ff-paper-dim)]">{settings.brandText}</p>
          ) : null}
        </div>
        {typeof pendingCount === 'number' && pendingCount > 0 && (
          <span className="shrink-0 text-xs text-[var(--ff-warning)]">{pendingCount} 张待冲洗</span>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
        <dt className="text-[var(--ff-paper-dim)]">色彩</dt><dd className="text-[var(--ff-paper-muted)]">{color}</dd>
        <dt className="text-[var(--ff-paper-dim)]">片边</dt><dd className="text-[var(--ff-paper-muted)]">{edge}</dd>
        <dt className="text-[var(--ff-paper-dim)]">出片</dt><dd className="text-[var(--ff-paper-muted)]">{outputMode === 'strip' ? '胶片长条' : '单张'} / {output}</dd>
      </dl>
    </section>
  );
}

export default RecipeSummaryCard;
