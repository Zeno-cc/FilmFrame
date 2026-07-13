import { FILM_PRESETS, type FilmSettings, type OutputMode } from '../../types';
import { supportsReal135Template } from '../../services/filmOverlay';

export interface RecipeSummaryCardProps {
  settings: FilmSettings;
  outputMode?: OutputMode;
  recipeName?: string;
  pendingCount?: number;
  className?: string;
}

function outputLabel(settings: FilmSettings): string {
  if (settings.outputFormat === 'image/png') return 'PNG';
  return `JPG ${Math.round(settings.outputQuality * 100)}`;
}

export function RecipeSummaryCard({
  settings,
  outputMode = 'single',
  recipeName,
  pendingCount,
  className = '',
}: RecipeSummaryCardProps) {
  const supportsReal135 = supportsReal135Template(settings.brandText);
  const real135 = supportsReal135 && (settings.frameRenderMode ?? 'real135') === 'real135';
  const mode = real135 ? 'REAL 135' : 'CLASSIC REBATE';
  const aspect = outputMode === 'strip'
    ? 'STRIP'
    : real135
      ? (settings.scanOutputAspect ?? '4:3').toUpperCase()
      : 'NATIVE';
  const processing = (settings.processingMode ?? 'preview') === 'high' ? 'HIGH' : 'FAST';
  const brandColor = FILM_PRESETS[settings.brandText]?.brandColor ?? 'var(--ff-amber)';

  return (
    <div className={`ff-recipe-summary relative overflow-hidden rounded-[6px] border border-[var(--ff-line)] bg-[var(--ff-panel-raised)] p-4 ${className}`}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: brandColor }} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-[var(--ff-paper-dim)]" aria-hidden="true">CURRENT RECIPE</div>
          <div className="mt-1 truncate text-sm font-semibold text-[var(--ff-paper)]">
            {recipeName || settings.brandText}
          </div>
          {recipeName && (
            <div className="mt-0.5 truncate text-xs text-[var(--ff-paper-dim)]">{settings.brandText}</div>
          )}
        </div>
        {typeof pendingCount === 'number' && pendingCount > 0 && (
          <span className="shrink-0 rounded-[4px] border border-[var(--ff-warning)] px-2 py-1 text-[11px] text-[var(--ff-warning)]">
            {pendingCount} 张待冲洗
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 pl-1 font-mono text-[11px] text-[var(--ff-paper-muted)]">
        <span>{mode}</span>
        <span aria-hidden="true">·</span>
        <span>{aspect}</span>
        <span aria-hidden="true">·</span>
        <span>{outputLabel(settings)}</span>
        {real135 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{processing}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default RecipeSummaryCard;
