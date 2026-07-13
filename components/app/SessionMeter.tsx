import type { OutputMode } from '../../types';

export interface SessionMeterProps {
  imageCount: number;
  processedCount?: number;
  outputMode?: OutputMode;
  rollNumber?: number;
  localOnly?: boolean;
  busyLabel?: string;
  className?: string;
}

export function SessionMeter({
  imageCount,
  processedCount = 0,
  outputMode = 'single',
  rollNumber = 1,
  localOnly = true,
  busyLabel,
  className = '',
}: SessionMeterProps) {
  const rollLabel = imageCount > 0
    ? `ROLL ${String(rollNumber).padStart(2, '0')}`
    : 'NEW ROLL';
  const frameLabel = `${imageCount} ${imageCount === 1 ? 'FRAME' : 'FRAMES'}`;
  const modeLabel = outputMode === 'strip' ? 'FILM STRIP' : 'CONTACT SHEET';
  const summary = imageCount === 0
    ? '新胶卷，本地处理'
    : `${imageCount} 张，${processedCount} 张已出片${localOnly ? '，仅本地处理' : ''}`;

  return (
    <div
      className={`ff-session-meter min-w-0 ${className}`}
      role="group"
      aria-label={summary}
    >
      <div className="hidden items-center gap-2 overflow-hidden text-[11px] font-medium text-[var(--ff-paper-dim)] min-[1180px]:flex" aria-hidden="true">
        <span className="font-mono text-[var(--ff-paper-muted)]">{rollLabel}</span>
        <span className="text-[var(--ff-line-strong)]">/</span>
        <span className="font-mono">{frameLabel}</span>
        <span className="text-[var(--ff-line-strong)]">/</span>
        <span>{modeLabel}</span>
        {localOnly && (
          <>
            <span className="text-[var(--ff-line-strong)]">/</span>
            <span>LOCAL ONLY</span>
          </>
        )}
      </div>
      <div className="truncate text-xs text-[var(--ff-paper-muted)] min-[1180px]:hidden" aria-hidden="true">
        {imageCount > 0 ? `${imageCount} 张 · 本地处理` : '新胶卷 · 本地处理'}
      </div>
      {busyLabel && (
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {busyLabel}
        </div>
      )}
    </div>
  );
}

export default SessionMeter;
