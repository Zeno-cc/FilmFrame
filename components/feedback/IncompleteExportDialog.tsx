import { useRef } from 'react';
import { DownloadIcon } from '../icons/FilmFrameIcons';
import { Button, ModalSurface } from '../ui';

export interface IncompleteExportDialogProps {
  open: boolean;
  readyCount: number;
  totalCount: number;
  onCancel: () => void;
  onProcessAndExport: () => void;
  onExportReady: () => void;
}

export function IncompleteExportDialog({
  open,
  readyCount,
  totalCount,
  onCancel,
  onProcessAndExport,
  onExportReady,
}: IncompleteExportDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const pendingCount = totalCount - readyCount;

  return (
    <ModalSurface
      open={open}
      onClose={onCancel}
      title="这一卷还没有全部冲洗完成"
      description={`当前 ${readyCount}/${totalCount} 张已有成片，另有 ${pendingCount} 张待冲洗。`}
      initialFocusRef={cancelButtonRef}
      showCloseButton={false}
      size="sm"
      bodyClassName="p-5"
    >
      <p className="text-sm leading-6 text-[var(--ff-paper-muted)]">
        完成剩余冲洗后再打包，可以避免 ZIP 遗漏照片。
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button ref={cancelButtonRef} variant="ghost" onClick={onCancel}>
          取消
        </Button>
        {readyCount > 0 ? (
          <Button variant="secondary" onClick={onExportReady}>
            仅导出当前 {readyCount}/{totalCount} 张
          </Button>
        ) : null}
        <Button variant="primary" leadingIcon={<DownloadIcon />} onClick={onProcessAndExport}>
          冲洗剩余 {pendingCount} 张并导出
        </Button>
      </div>
    </ModalSurface>
  );
}

export default IncompleteExportDialog;
