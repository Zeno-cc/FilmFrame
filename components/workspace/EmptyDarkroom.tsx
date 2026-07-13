import { UploadIcon } from '../icons/FilmFrameIcons';
import { Button } from '../ui/Button';

export interface EmptyDarkroomProps {
  isDragActive?: boolean;
  uploadDisabled?: boolean;
  onChoosePhotos: () => void;
  className?: string;
}

export function EmptyDarkroom({
  isDragActive = false,
  uploadDisabled = false,
  onChoosePhotos,
  className = '',
}: EmptyDarkroomProps) {
  return (
    <section
      className={`relative isolate flex min-h-[360px] overflow-hidden border-y border-[var(--ff-line-soft)] bg-[var(--ff-panel)] px-5 py-10 sm:min-h-[460px] sm:px-8 ${className}`}
      aria-labelledby="empty-darkroom-title"
    >
      <div className="pointer-events-none absolute inset-x-0 top-5 h-6 border-y border-[var(--ff-line-soft)] opacity-70" aria-hidden="true">
        <div className="h-full bg-[repeating-linear-gradient(90deg,transparent_0_18px,var(--ff-line)_18px_28px,transparent_28px_45px)]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 h-6 border-y border-[var(--ff-line-soft)] opacity-70" aria-hidden="true">
        <div className="h-full bg-[repeating-linear-gradient(90deg,transparent_0_18px,var(--ff-line)_18px_28px,transparent_28px_45px)]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center text-center">
        <div className="mb-5 flex size-12 items-center justify-center rounded-[4px] border border-[var(--ff-line-strong)] bg-[var(--ff-bg)] text-[var(--ff-amber)]" aria-hidden="true">
          <UploadIcon size={22} />
        </div>
        <h2 id="empty-darkroom-title" className="font-[var(--ff-font-display)] text-2xl leading-8 text-[var(--ff-paper)] sm:text-[28px] sm:leading-9">
          把这一卷带进暗房
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--ff-paper-muted)] sm:text-[15px]">
          添加 JPG、PNG 或 WebP。照片只在当前浏览器中处理，关闭或刷新页面后不会保留。
        </p>
        <Button
          className="mt-6"
          variant="primary"
          size="lg"
          leadingIcon={<UploadIcon />}
          onClick={onChoosePhotos}
          disabled={uploadDisabled}
        >
          选择照片
        </Button>
        <p className="mt-3 text-xs text-[var(--ff-paper-dim)]">也可以把照片拖到工作区</p>

        <ol className="mt-8 grid w-full grid-cols-3 border-y border-[var(--ff-line-soft)] py-4 font-mono text-[10px] text-[var(--ff-paper-dim)] sm:text-xs" aria-label="暗房流程">
          <li>01 选片</li>
          <li className="border-x border-[var(--ff-line-soft)]">02 配方</li>
          <li>03 冲洗与导出</li>
        </ol>
      </div>

      {isDragActive ? (
        <div className="absolute inset-3 z-10 flex items-center justify-center rounded-[6px] border border-[var(--ff-amber)] bg-[color:var(--ff-bg)]/95" role="status">
          <span className="font-[var(--ff-font-display)] text-xl text-[var(--ff-amber)]">松开以加入这一卷</span>
        </div>
      ) : null}
    </section>
  );
}

export default EmptyDarkroom;
