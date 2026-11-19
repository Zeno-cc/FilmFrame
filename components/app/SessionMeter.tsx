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
  const summary = imageCount === 0
    ? '新胶卷，本地处理'
    : `${imageCount} 张，${processedCount} 张已出片${localOnly ? '，仅本地处理' : ''}`;

  return (
    <div className={`ff-session-meter min-w-0 ${className}`} role="group" aria-label={summary}>
      <div className="ff-session-meter__dial" aria-hidden="true">
        <span className="ff-session-meter__chip ff-session-meter__chip--live">
          第 {String(rollNumber).padStart(2, '0')} 卷
        </span>
        <span>{imageCount} 张照片</span>
        <span>{outputMode === 'strip' ? '胶片长条' : '单张'}</span>
        {imageCount > 0 ? <span>{processedCount} 张已出片</span> : <span>仅本地处理</span>}
      </div>
      <div className="ff-session-meter__compact" aria-hidden="true">
        {imageCount > 0 ? `${imageCount} 张 · 本地处理` : '新胶卷 · 本地处理'}
      </div>
      {busyLabel && (
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{busyLabel}</div>
      )}
    </div>
  );
}

export default SessionMeter;
