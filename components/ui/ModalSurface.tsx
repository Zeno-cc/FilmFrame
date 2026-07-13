import { useEffect, useId, useRef, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../icons/FilmFrameIcons';
import { IconButton } from './IconButton';
import { joinClassNames } from './utils';

type ModalSize = 'sm' | 'md' | 'lg';
type ModalSurfaceKind = 'dialog' | 'sheet';

export interface ModalSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  titleId?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  closeLabel?: string;
  size?: ModalSize;
  surface?: ModalSurfaceKind;
  bodyClassName?: string;
  backdropClassName?: string;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
  )).filter(element => !element.hasAttribute('aria-hidden'));
}

export function ModalHeader({
  title,
  description,
  titleId,
  closeLabel = '关闭',
  onClose,
  showCloseButton = true,
}: {
  title?: ReactNode;
  description?: ReactNode;
  titleId?: string;
  closeLabel?: string;
  onClose?: () => void;
  showCloseButton?: boolean;
}) {
  if (!title && !description && !(showCloseButton && onClose)) return null;
  return (
    <header className="ff-modal-header">
      <div className="ff-modal-header__copy">
        {title ? <h2 id={titleId} className="ff-modal-header__title">{title}</h2> : null}
        {description ? <p className="ff-modal-header__description">{description}</p> : null}
      </div>
      {showCloseButton && onClose ? <IconButton icon={<CloseIcon size={18} />} label={closeLabel} onClick={onClose} /> : null}
    </header>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <footer className={joinClassNames('ff-sheet-footer', className)}>{children}</footer>;
}

export function ModalSurface({
  open,
  onClose,
  children,
  title,
  description,
  footer,
  labelledBy,
  describedBy,
  titleId: providedTitleId,
  initialFocusRef,
  returnFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  closeLabel = '关闭',
  size = 'md',
  surface = 'dialog',
  bodyClassName,
  backdropClassName,
  className,
  role = 'dialog',
  onPointerDown,
  ...props
}: ModalSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const generatedId = useId();
  const titleId = providedTitleId ?? `${generatedId}-title`;

  onCloseRef.current = onClose;
  closeOnEscapeRef.current = closeOnEscape;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    previousFocusRef.current = returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(() => {
        (initialFocusRef?.current ?? focusableElements(rootRef.current ?? document.body)[0] ?? rootRef.current)?.focus({ preventScroll: true });
      })
      : undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!rootRef.current) return;
      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements(rootRef.current);
      if (elements.length === 0) {
        event.preventDefault();
        rootRef.current.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const restore = returnFocusRef?.current ?? previousFocusRef.current;
      if (restore && document.contains(restore)) restore.focus({ preventScroll: true });
    };
  }, [open, initialFocusRef, returnFocusRef]);

  if (!open || typeof document === 'undefined') return null;

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current();
    onPointerDown?.(event);
  };

  return createPortal(
    <div
      className={joinClassNames('ff-modal-backdrop', surface === 'sheet' && 'ff-sheet-backdrop', backdropClassName)}
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        {...props}
        ref={rootRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={joinClassNames('ff-modal-surface', className)}
        data-size={size}
        data-surface={surface}
      >
        <ModalHeader
          title={title}
          description={description}
          titleId={titleId}
          closeLabel={closeLabel}
          onClose={onCloseRef.current}
          showCloseButton={showCloseButton}
        />
        <div className={joinClassNames('ff-modal-surface__body', bodyClassName)}>{children}</div>
        {footer ? <ModalFooter>{footer}</ModalFooter> : null}
      </div>
    </div>,
    document.body,
  );
}
