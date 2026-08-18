import type { OutputMode } from '../../types';
import { DownloadIcon, SettingsIcon, UploadIcon } from '../icons/FilmFrameIcons';
import { FilmLogoIcon } from './FilmFrameAppIcons';
import { MoreMenu } from './MoreMenu';
import { SessionMeter } from './SessionMeter';

export interface AppHeaderProps {
  imageCount: number;
  processedCount?: number;
  outputMode?: OutputMode;
  hasDownloadableResult?: boolean;
  processing?: boolean;
  exporting?: boolean;
  busyLabel?: string;
  settingsOpen?: boolean;
  onAddPhotos: () => void;
  onExport: () => void;
  onOpenSettings: (trigger?: HTMLButtonElement) => void;
  onReset: () => void;
  onOpenSupport: () => void;
  onOpenPrivacy?: () => void;
  githubHref?: string;
  className?: string;
}

export function AppHeader({
  imageCount,
  processedCount = 0,
  outputMode = 'single',
  hasDownloadableResult = false,
  processing = false,
  exporting = false,
  busyLabel,
  settingsOpen = false,
  onAddPhotos,
  onExport,
  onOpenSettings,
  onReset,
  onOpenSupport,
  onOpenPrivacy,
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
          <button
            type="button"
            onClick={onAddPhotos}
            disabled={controlsDisabled}
            className="ff-header-control inline-flex min-h-11 items-center gap-2 px-3.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UploadIcon />
            添加照片
          </button>
          {hasDownloadableResult && (
            <button
              type="button"
              onClick={onExport}
              disabled={controlsDisabled}
              className="ff-header-control ff-header-control--primary inline-flex min-h-11 items-center gap-2 px-3.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DownloadIcon />
              {exporting ? '正在导出' : '导出成片'}
            </button>
          )}
          <button
            type="button"
            onClick={event => onOpenSettings(event.currentTarget)}
            aria-expanded={settingsOpen}
            aria-controls="mobile-settings-sheet"
            className="ff-header-control inline-flex min-h-11 items-center gap-2 px-3 text-sm text-[var(--ff-paper-muted)] hover:text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] min-[1180px]:hidden"
          >
            <SettingsIcon />
            配方
          </button>
          <MoreMenu
            onReset={onReset}
            onOpenSupport={onOpenSupport}
            onOpenPrivacy={onOpenPrivacy}
            githubHref={githubHref}
            resetDisabled={controlsDisabled}
          />
        </div>

        <button
          type="button"
          onClick={event => onOpenSettings(event.currentTarget)}
          aria-label="打开暗房配方"
          title="暗房配方"
          aria-expanded={settingsOpen}
          aria-controls="mobile-settings-sheet"
          className="ff-header-control inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--ff-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ff-focus)] min-[768px]:hidden"
        >
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}

export default AppHeader;
