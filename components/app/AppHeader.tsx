import type { OutputMode } from '../../types';
import { SettingsIcon } from '../icons/FilmFrameIcons';
import { FilmLogoIcon } from './FilmFrameAppIcons';
import { MoreMenu } from './MoreMenu';
import { SessionMeter } from './SessionMeter';

export interface AppHeaderProps {
  imageCount: number;
  processedCount?: number;
  outputMode?: OutputMode;
  hasPhotos?: boolean;
  processing?: boolean;
  exporting?: boolean;
  busyLabel?: string;
  settingsOpen?: boolean;
  onOpenSettings: (trigger?: HTMLButtonElement) => void;
  onReset: () => void;
  onOpenSupport: () => void;
  onOpenPrivacy?: () => void;
  onOpenCredits?: () => void;
  githubHref?: string;
  className?: string;
}

export function AppHeader({
  imageCount,
  processedCount = 0,
  outputMode = 'single',
  hasPhotos = imageCount > 0,
  processing = false,
  exporting = false,
  busyLabel,
  settingsOpen = false,
  onOpenSettings,
  onReset,
  onOpenSupport,
  onOpenPrivacy,
  onOpenCredits,
  githubHref,
  className = '',
}: AppHeaderProps) {
  const controlsDisabled = processing || exporting;

  return (
    <header className={`ff-app-header sticky top-0 z-40 border-b border-[var(--ff-line-soft)] ${className}`}>
      <div className="mx-auto flex h-14 max-w-[1900px] items-center gap-3 px-3 sm:px-4 md:h-16 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5 text-[var(--ff-amber)]">
          <FilmLogoIcon size={30} />
          <div className="min-w-0">
            <div className="truncate font-[var(--ff-font-display)] text-lg leading-none text-[var(--ff-paper)]">FilmFrame</div>
            <div className="ff-app-header__brand-mark mt-1 hidden sm:block" aria-hidden="true">
              本地数字暗房
            </div>
          </div>
        </div>

        <div className="mx-1 min-w-0 flex-1 border-l border-[var(--ff-line-soft)] pl-3 md:mx-4 md:pl-5">
          <SessionMeter
            imageCount={imageCount}
            processedCount={processedCount}
            outputMode={outputMode}
            busyLabel={busyLabel}
          />
        </div>

        <div className="hidden items-center gap-2 min-[768px]:flex">
          {hasPhotos && (
            <button
              type="button"
              onClick={event => onOpenSettings(event.currentTarget)}
              aria-label="打开调整"
              aria-expanded={settingsOpen}
              aria-controls="mobile-settings-sheet"
              className="ff-header-control inline-flex min-h-11 items-center gap-2 px-3 text-sm text-[var(--ff-paper-muted)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] min-[1180px]:hidden"
            >
              <SettingsIcon />
              调整
            </button>
          )}
          <MoreMenu
            onReset={onReset}
            onOpenSupport={onOpenSupport}
            onOpenPrivacy={onOpenPrivacy}
            onOpenCredits={onOpenCredits}
            githubHref={githubHref}
            resetDisabled={controlsDisabled}
          />
        </div>

        {hasPhotos && (
          <button
            type="button"
            onClick={event => onOpenSettings(event.currentTarget)}
            aria-label="打开调整"
            title="调整"
            aria-expanded={settingsOpen}
            aria-controls="mobile-settings-sheet"
            className="ff-header-control inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] min-[768px]:hidden"
          >
            <SettingsIcon />
          </button>
        )}
      </div>
    </header>
  );
}

export default AppHeader;
