import { useId } from 'react';
import { AlertIcon, RefreshIcon } from '../icons/FilmFrameIcons';
import { ModalSurface } from '../ui/ModalSurface';

export interface ErrorDialogProps {
  open: boolean;
  message: string;
  title?: string;
  details?: readonly string[];
  onClose: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  onSupport?: () => void;
  className?: string;
}

export function ErrorDialog({
  open,
  message,
  title = '需要处理',
  details,
  onClose,
  onRetry,
  retryLabel = '重新冲洗',
  onSupport,
  className = '',
}: ErrorDialogProps) {
  const messageId = useId();

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      title={title}
      describedBy={messageId}
      closeLabel="关闭错误提示"
      size="sm"
      className={`ff-error-dialog ${className}`}
      bodyClassName="p-5"
    >
      <div className="flex gap-3">
        <AlertIcon className="mt-0.5 shrink-0 text-[var(--ff-danger)]" size={22} />
        <div className="min-w-0">
          <p id={messageId} className="whitespace-pre-line text-sm leading-6 text-[var(--ff-paper-muted)]">{message}</p>
        </div>
      </div>
      {details && details.length > 0 && (
        <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto border-l-2 border-[var(--ff-danger)]/60 pl-3 text-xs leading-5 text-[var(--ff-paper-dim)]">
          {details.map(detail => <li key={detail}>{detail}</li>)}
        </ul>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onSupport && (
          <button
            type="button"
            onClick={onSupport}
            className="min-h-11 rounded-[4px] px-3 text-sm text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
          >
            获取帮助
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[4px] bg-[var(--ff-amber)] px-4 text-sm font-semibold text-[var(--ff-ink)] hover:bg-[var(--ff-amber-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
          >
            <RefreshIcon size={16} />
            {retryLabel}
          </button>
        )}
        {!onRetry && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-[4px] bg-[var(--ff-panel-soft)] px-4 text-sm font-medium text-[var(--ff-paper)] hover:bg-[var(--ff-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
          >
            我知道了
          </button>
        )}
      </div>
    </ModalSurface>
  );
}

export default ErrorDialog;
