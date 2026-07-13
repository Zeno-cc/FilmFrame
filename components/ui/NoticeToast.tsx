import type { HTMLAttributes, ReactNode } from 'react';
import {
  CheckCircleIcon,
  CloseIcon,
  InfoIcon,
  WarningIcon,
  ErrorIcon,
} from '../icons/FilmFrameIcons';
import { joinClassNames } from './utils';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface NoticeToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: NoticeTone;
  message: ReactNode;
  title?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  live?: 'polite' | 'assertive' | 'off';
}

const TONE_ICONS = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningIcon,
  error: ErrorIcon,
} as const;

export function NoticeToast({
  tone = 'info',
  title,
  message,
  onDismiss,
  dismissLabel = '关闭通知',
  live = tone === 'error' ? 'assertive' : 'polite',
  className,
  ...props
}: NoticeToastProps) {
  const ToneIcon = TONE_ICONS[tone];
  return (
    <div
      {...props}
      className={joinClassNames('ff-notice-toast', className)}
      data-tone={tone}
      role={live === 'off' ? undefined : tone === 'error' ? 'alert' : 'status'}
      aria-live={live === 'off' ? undefined : live}
    >
      <span className="ff-notice-toast__icon" aria-hidden="true"><ToneIcon size={18} /></span>
      <div className="ff-notice-toast__copy">
        {title ? <div className="ff-notice-toast__title">{title}</div> : null}
        <div className="ff-notice-toast__message">{message}</div>
      </div>
      {onDismiss ? (
        <button type="button" className="ff-notice-toast__dismiss" aria-label={dismissLabel} title={dismissLabel} onClick={onDismiss}>
          <CloseIcon size={16} />
        </button>
      ) : null}
    </div>
  );
}
