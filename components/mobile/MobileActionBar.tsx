import type { PrimaryAction } from '../../services/workflowState';
import { SettingsIcon } from '../icons/FilmFrameIcons';

export interface MobileActionBarProps {
  primaryAction: Pick<PrimaryAction, 'label' | 'disabled' | 'command'>;
  onPrimaryAction: () => void;
  onOpenSettings: (trigger: HTMLButtonElement) => void;
  settingsOpen?: boolean;
  processing?: boolean;
  exporting?: boolean;
  hidden?: boolean;
  className?: string;
}

export function MobileActionBar({
  primaryAction,
  onPrimaryAction,
  onOpenSettings,
  settingsOpen = false,
  processing = false,
  exporting = false,
  hidden = false,
  className = '',
}: MobileActionBarProps) {
  const disabled = primaryAction.disabled || exporting;
  const stopAction = primaryAction.command === 'stop' || processing;

  return (
    <nav
      aria-label="移动端主要操作"
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className={`ff-mobile-action-bar fixed inset-x-0 bottom-0 z-50 flex min-h-16 items-center gap-2 border-t border-[var(--ff-line-soft)] bg-[var(--ff-bg)] px-3 pt-2 md:hidden ${hidden ? 'invisible pointer-events-none' : ''} ${className}`}
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={event => onOpenSettings(event.currentTarget)}
        aria-label={settingsOpen ? '收起暗房配方' : '打开暗房配方'}
        title={settingsOpen ? '收起暗房配方' : '打开暗房配方'}
        aria-expanded={settingsOpen}
        aria-controls="mobile-settings-sheet"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] border border-[var(--ff-line)] bg-[var(--ff-panel)] text-[var(--ff-paper-muted)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ff-focus)]"
      >
        <SettingsIcon />
      </button>
      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={disabled}
        aria-busy={exporting || undefined}
        className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[4px] px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40 ${stopAction ? 'border border-[var(--ff-safelight)] bg-[var(--ff-safelight-soft)] text-[var(--ff-paper)]' : primaryAction.command === 'none' ? 'bg-[var(--ff-panel-soft)] text-[var(--ff-paper-muted)]' : 'bg-[var(--ff-amber)] text-[var(--ff-ink)] hover:bg-[var(--ff-amber-hover)]'}`}
      >
        <span className="min-w-0 truncate">{primaryAction.label}</span>
      </button>
    </nav>
  );
}

export default MobileActionBar;
