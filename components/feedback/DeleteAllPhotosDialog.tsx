import { useRef } from 'react';
import { TrashIcon } from '../icons/FilmFrameIcons';
import { Button, ModalSurface } from '../ui';

export interface DeleteAllPhotosDialogProps {
  open: boolean;
  photoCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteAllPhotosDialog({
  open,
  photoCount,
  onCancel,
  onConfirm,
}: DeleteAllPhotosDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalSurface
      open={open}
      onClose={onCancel}
      title="删除全部照片？"
      description={`将从当前工作区移除 ${photoCount} 张照片及其生成结果。`}
      initialFocusRef={cancelButtonRef}
      showCloseButton={false}
      size="sm"
      bodyClassName="p-5"
    >
      <p className="text-sm leading-6 text-[var(--ff-paper-muted)]">
        此操作无法撤销，但不会删除设备中的原始文件，也不会更改胶片设置或已保存配方。
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button ref={cancelButtonRef} variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button variant="danger" leadingIcon={<TrashIcon size={16} />} onClick={onConfirm}>
          删除 {photoCount} 张照片
        </Button>
      </div>
    </ModalSurface>
  );
}

export default DeleteAllPhotosDialog;
