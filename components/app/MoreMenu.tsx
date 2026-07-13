import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  CoffeeIcon,
  GitHubIcon,
  HelpIcon,
  ResetIcon,
} from './FilmFrameAppIcons';
import { MoreIcon } from '../icons/FilmFrameIcons';

export interface MoreMenuProps {
  onReset: () => void;
  onOpenSupport: () => void;
  onOpenPrivacy?: () => void;
  githubHref?: string;
  disabled?: boolean;
  resetDisabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function MoreMenu({
  onReset,
  onOpenSupport,
  onOpenPrivacy,
  githubHref = 'https://github.com/Zeno-cc/FilmFrame',
  disabled = false,
  resetDisabled = false,
  onOpenChange,
  className = '',
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusOnOpenRef = useRef<'first' | 'last'>('first');
  const menuId = useId();

  const getMenuItems = () => Array.from(
    menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
  );

  const updateOpen = (next: boolean, restoreFocus = false, focusOnOpen: 'first' | 'last' = 'first') => {
    focusOnOpenRef.current = focusOnOpen;
    setOpen(next);
    onOpenChange?.(next);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const items = getMenuItems();
      const target = focusOnOpenRef.current === 'last' ? items[items.length - 1] : items[0];
      target?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) updateOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    updateOpen(true, false, event.key === 'ArrowUp' ? 'last' : 'first');
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems();
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      updateOpen(false, true);
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + items.length) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const run = (callback: () => void) => {
    updateOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
      callback();
    });
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="更多操作"
        title="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => updateOpen(!open)}
        onKeyDown={handleTriggerKeyDown}
        className="ff-icon-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] border border-[var(--ff-line-soft)] bg-[var(--ff-panel)] text-[var(--ff-paper-muted)] transition-colors hover:border-[var(--ff-line-strong)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreIcon />
      </button>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="更多操作"
          onKeyDown={handleMenuKeyDown}
          onBlur={event => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;

            window.requestAnimationFrame(() => {
              if (!menuRef.current?.contains(document.activeElement)) updateOpen(false);
            });
          }}
          className="ff-menu absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-[6px] border border-[var(--ff-line)] bg-[var(--ff-panel-raised)] p-1.5 text-sm shadow-[0_12px_32px_rgba(0,0,0,.32)]"
        >
          <button
            type="button"
            role="menuitem"
            disabled={resetDisabled}
            onClick={() => run(onReset)}
            className="flex min-h-11 w-full items-center gap-3 rounded-[4px] px-3 text-left text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:opacity-35"
          >
            <ResetIcon />
            恢复默认设置
          </button>
          <a
            role="menuitem"
            href={githubHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => updateOpen(false)}
            className="flex min-h-11 w-full items-center gap-3 rounded-[4px] px-3 text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
          >
            <GitHubIcon />
            GitHub
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(onOpenSupport)}
            className="flex min-h-11 w-full items-center gap-3 rounded-[4px] px-3 text-left text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
          >
            <CoffeeIcon />
            支持 FilmFrame
          </button>
          {onOpenPrivacy && (
            <button
              type="button"
              role="menuitem"
              onClick={() => run(onOpenPrivacy)}
              className="flex min-h-11 w-full items-center gap-3 rounded-[4px] px-3 text-left text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
            >
              <HelpIcon />
              本地处理与隐私
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default MoreMenu;
