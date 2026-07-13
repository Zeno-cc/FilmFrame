import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon, WarningIcon } from '../icons/FilmFrameIcons';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface NoticeToastProps {
  tone: NoticeTone;
  message: string;
  onDismiss: () => void;
  durationMs?: number;
  className?: string;
}

const toneStyles: Record<NoticeTone, { container: string; icon: typeof InfoIcon; label: string }> = {
  info: { container: 'border-[var(--ff-info)] bg-[var(--ff-panel-raised)] text-[var(--ff-paper)]', icon: InfoIcon, label: '提示' },
  success: { container: 'border-[var(--ff-success)] bg-[var(--ff-panel-raised)] text-[var(--ff-paper)]', icon: CheckIcon, label: '完成' },
  warning: { container: 'border-[var(--ff-warning)] bg-[var(--ff-panel-raised)] text-[var(--ff-paper)]', icon: WarningIcon, label: '注意' },
  error: { container: 'border-[var(--ff-danger)] bg-[var(--ff-panel-raised)] text-[var(--ff-paper)]', icon: AlertIcon, label: '错误' },
};

export function NoticeToast({
  tone,
  message,
  onDismiss,
  durationMs = 4000,
  className = '',
}: NoticeToastProps) {
  const [leaving, setLeaving] = useState(false);
  const dismissTimer = useRef<number | null>(null);
  const style = toneStyles[tone];
  const Icon = style.icon;

  useEffect(() => {
    setLeaving(false);
    const leaveTimer = window.setTimeout(() => setLeaving(true), Math.max(0, durationMs - 260));
    dismissTimer.current = window.setTimeout(onDismiss, durationMs);
    return () => {
      window.clearTimeout(leaveTimer);
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, [durationMs, message, onDismiss]);

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(onDismiss, 260);
  };

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`ff-notice-toast fixed inset-x-3 top-[calc(3.5rem+12px)] z-[80] flex min-h-14 items-start gap-3 rounded-[6px] border px-3.5 py-3 shadow-[0_12px_32px_rgba(0,0,0,.3)] transition-[opacity,transform] duration-200 sm:left-auto sm:right-5 sm:w-[min(420px,calc(100vw-24px))] md:top-[calc(4rem+16px)] ${leaving ? 'translate-y-[-8px] opacity-0' : 'translate-y-0 opacity-100'} ${style.container} ${className}`}
    >
      <Icon className="mt-0.5 shrink-0" size={18} />
      <div className="min-w-0 flex-1">
        <div className="sr-only">{style.label}</div>
        <p className="whitespace-pre-line text-sm leading-5">{message}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="关闭提示"
        title="关闭提示"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[4px] text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
      >
        <CloseIcon size={17} />
      </button>
    </div>
  );
}

export default NoticeToast;
