import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { MoreMenu, type MoreMenuProps } from '../app/MoreMenu';
import { CloseIcon, SettingsIcon } from '../icons/FilmFrameIcons';
import { RecipeInspector, type RecipeInspectorProps, type RecipeInspectorSection } from './RecipeInspector';

export type MobileSettingsTab = Exclude<RecipeInspectorSection, 'all'>;

export interface MobileSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  initialTab?: MobileSettingsTab;
  inspectorProps?: Omit<RecipeInspectorProps, 'section' | 'showHeader' | 'showSummary' | 'showFooter' | 'id' | 'className'>;
  children?: ReactNode;
  moreMenuProps?: Omit<MoreMenuProps, 'className'>;
  title?: string;
  className?: string;
}

const tabs: Array<{ id: MobileSettingsTab; label: string }> = [
  { id: 'film', label: '胶片' },
  { id: 'output', label: '输出' },
  { id: 'recipes', label: '配方' },
];

export function MobileSettingsSheet({
  open,
  onClose,
  initialTab = 'film',
  inspectorProps,
  children,
  moreMenuProps,
  title = '暗房配方',
  className = '',
}: MobileSettingsSheetProps) {
  const [activeTab, setActiveTab] = useState<MobileSettingsTab>(initialTab);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    previousActiveElement.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(element => !element.closest('[aria-hidden="true"], [hidden]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => previousActiveElement.current?.focus({ preventScroll: true }));
    };
  }, [open]);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  const inspector = inspectorProps ? (
    <RecipeInspector
      {...inspectorProps}
      id="mobile-settings-content"
      section={activeTab}
      showHeader={false}
      showSummary={activeTab === 'recipes'}
      showFooter={false}
      className="!min-h-0 !border-0 !bg-transparent"
    />
  ) : children;

  return (
    <div
      className={`ff-settings-sheet fixed inset-0 z-[80] flex items-end bg-[var(--ff-overlay)]/90 min-[1180px]:hidden md:items-stretch md:justify-end ${className}`}
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        id="mobile-settings-sheet"
        className="flex max-h-[92dvh] min-h-0 w-full flex-col rounded-t-[8px] border border-b-0 border-[var(--ff-line)] bg-[var(--ff-panel)] shadow-[0_-16px_40px_rgba(0,0,0,.42)] md:h-full md:max-h-none md:w-[min(380px,92vw)] md:rounded-none md:rounded-l-[8px] md:border-b md:border-r-0 md:border-l md:shadow-[-16px_0_40px_rgba(0,0,0,.42)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ff-line-soft)] px-4 py-3">
          <div className="flex items-center gap-2">
            <SettingsIcon className="text-[var(--ff-amber)]" />
            <h2 id={titleId} className="text-base font-semibold text-[var(--ff-paper)]">{title}</h2>
          </div>
          <div className="flex items-center gap-1">
            {moreMenuProps ? <MoreMenu {...moreMenuProps} className="min-[768px]:hidden" /> : null}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="关闭暗房配方"
              title="关闭"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="配方设置分类" className="grid shrink-0 grid-cols-3 gap-1 border-b border-[var(--ff-line-soft)] bg-[var(--ff-bg)] p-1.5">
          {tabs.map(tab => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`mobile-settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="mobile-settings-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={event => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const delta = event.key === 'ArrowRight' ? 1 : -1;
                  const next = (tabs.findIndex(item => item.id === activeTab) + delta + tabs.length) % tabs.length;
                  setActiveTab(tabs[next].id);
                  window.requestAnimationFrame(() => document.getElementById(`mobile-settings-tab-${tabs[next].id}`)?.focus());
                }}
                className={`min-h-11 rounded-[4px] text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] ${selected ? 'bg-[var(--ff-amber)] text-[var(--ff-ink)]' : 'text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)]'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div id="mobile-settings-panel" role="tabpanel" aria-labelledby={`mobile-settings-tab-${activeTab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {inspector ?? (
            <p className="py-8 text-center text-sm text-[var(--ff-paper-dim)]">暂无设置内容</p>
          )}
        </div>

        {inspectorProps && (
          <div className="shrink-0 border-t border-[var(--ff-line)] bg-[var(--ff-panel-raised)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={inspectorProps.onPrimaryAction}
              disabled={inspectorProps.primaryActionDisabled}
              className={`min-h-11 w-full rounded-[4px] px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40 ${inspectorProps.primaryActionTone === 'stop' ? 'border border-[var(--ff-safelight)] bg-[var(--ff-safelight-soft)] text-[var(--ff-paper)]' : 'bg-[var(--ff-amber)] text-[var(--ff-ink)]'}`}
            >
              {inspectorProps.primaryActionLabel}
            </button>
            {inspectorProps.onReprocessAll
              && inspectorProps.outputMode === 'single'
              && (inspectorProps.processedCount ?? 0) > 0
              && !inspectorProps.processing && (
                <button
                  type="button"
                  onClick={inspectorProps.onReprocessAll}
                  disabled={inspectorProps.exporting}
                  className="mt-2 min-h-11 w-full rounded-[4px] text-xs text-[var(--ff-paper-muted)] hover:bg-[var(--ff-panel-soft)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  重新冲洗全部
                </button>
              )}
          </div>
        )}
      </section>
    </div>
  );
}

export default MobileSettingsSheet;
