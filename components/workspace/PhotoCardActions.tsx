import type { RenderArtifact } from '../../services/renderResult';
import { DownloadIcon, EyeIcon, RefreshIcon, TrashIcon } from '../icons/FilmFrameIcons';
import { IconButton } from '../ui/IconButton';

export interface PhotoCardActionsProps {
  fileName: string;
  artifact: RenderArtifact | null;
  showRetry?: boolean;
  removalAllowed: boolean;
  disabled?: boolean;
  retryDisabled?: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onDownload: (artifact: RenderArtifact, filename: string) => void;
  onRemove: () => void;
  className?: string;
}

export function PhotoCardActions({
  fileName,
  artifact,
  showRetry = false,
  removalAllowed,
  disabled = false,
  retryDisabled = false,
  onOpen,
  onRetry,
  onDownload,
  onRemove,
  className = '',
}: PhotoCardActionsProps) {
  return (
    <div className={`flex min-h-12 items-center gap-1.5 border-y border-[var(--ff-line-soft)] px-3 py-1 ${className}`} aria-label={`${fileName} 操作`}>
      <IconButton
        icon={<EyeIcon />}
        label={`查看 ${fileName}`}
        title="查看"
        onClick={onOpen}
        disabled={disabled}
      />
      {artifact ? (
        <IconButton
          icon={<DownloadIcon />}
          label={`下载 ${fileName}`}
          title="下载"
          onClick={() => onDownload(artifact, fileName)}
          disabled={disabled}
        />
      ) : null}
      {showRetry ? (
        <IconButton
          icon={<RefreshIcon />}
          label={`重试 ${fileName}`}
          title="重试"
          onClick={onRetry}
          disabled={disabled || retryDisabled}
        />
      ) : null}
      <IconButton
        className="ml-auto"
        icon={<TrashIcon />}
        label={`删除 ${fileName}`}
        title="删除"
        variant="danger"
        onClick={onRemove}
        disabled={disabled || !removalAllowed}
      />
    </div>
  );
}

export default PhotoCardActions;
