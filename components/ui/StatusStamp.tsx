import type { HTMLAttributes, ReactNode } from 'react';
import type { ImageWorkflowStatusKind } from '../../services/workflowState';
import {
  CheckCircleIcon,
  CircleDashedIcon,
  ErrorIcon,
  ApertureIcon,
  RefreshIcon,
  WarningIcon,
} from '../icons/FilmFrameIcons';
import { joinClassNames } from './utils';

export type StatusTone = 'neutral' | 'amber' | 'info' | 'processing' | 'success' | 'danger';

interface StatusMeta {
  label: string;
  englishLabel: string;
  tone: StatusTone;
  icon: ReactNode;
}

const STATUS_META: Record<ImageWorkflowStatusKind, StatusMeta> = {
  unprocessed: { label: '待冲洗', englishLabel: 'WAITING', tone: 'neutral', icon: <CircleDashedIcon size={16} /> },
  stale: { label: '需重洗', englishLabel: 'RE-DEVELOP', tone: 'amber', icon: <RefreshIcon size={16} /> },
  queued: { label: '排队中', englishLabel: 'QUEUED', tone: 'info', icon: <CircleDashedIcon size={16} /> },
  processing: { label: '冲洗中', englishLabel: 'DEVELOPING', tone: 'processing', icon: <ApertureIcon size={16} /> },
  complete: { label: '已出片', englishLabel: 'READY', tone: 'success', icon: <CheckCircleIcon size={16} /> },
  failed: { label: '冲洗失败', englishLabel: 'ERROR', tone: 'danger', icon: <ErrorIcon size={16} /> },
};

export interface StatusStampProps extends HTMLAttributes<HTMLDivElement> {
  kind?: ImageWorkflowStatusKind;
  tone?: StatusTone;
  label?: ReactNode;
  englishLabel?: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  showEnglishLabel?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
}

export function StatusStamp({
  kind = 'unprocessed',
  tone,
  label,
  englishLabel,
  detail,
  icon,
  showEnglishLabel = true,
  compact = false,
  iconOnly = false,
  className,
  role,
  title,
  'aria-label': ariaLabel,
  ...props
}: StatusStampProps) {
  const meta = STATUS_META[kind];
  const resolvedLabel = label ?? meta.label;
  const accessibleLabel = typeof resolvedLabel === 'string' ? resolvedLabel : meta.label;
  return (
    <div
      {...props}
      className={joinClassNames('ff-status-stamp', compact && 'ff-status-stamp--compact', iconOnly && 'ff-status-stamp--icon-only', className)}
      data-kind={kind}
      data-tone={tone ?? meta.tone}
      role={iconOnly ? 'img' : role}
      aria-label={iconOnly ? ariaLabel ?? accessibleLabel : ariaLabel}
      title={title ?? (iconOnly ? accessibleLabel : undefined)}
    >
      <span className="ff-status-stamp__icon" aria-hidden="true">{icon ?? meta.icon}</span>
      {!iconOnly && (
        <span className="ff-status-stamp__copy">
          {showEnglishLabel ? <span className="ff-lab-label">{englishLabel ?? meta.englishLabel}</span> : null}
          <span className="ff-status-stamp__label">{resolvedLabel}</span>
          {detail ? <span className="ff-status-stamp__detail">{detail}</span> : null}
        </span>
      )}
    </div>
  );
}

export { STATUS_META as statusStampMeta };
