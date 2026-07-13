import { useEffect, useId, useState } from 'react';
import { CoffeeIcon } from '../app/FilmFrameAppIcons';
import { ModalSurface } from '../ui/ModalSurface';

export interface SupportDialogProps {
  open: boolean;
  onClose: () => void;
  qrSrc?: string;
  title?: string;
  description?: string;
  fallbackMessage?: string;
  className?: string;
}

export function SupportDialog({
  open,
  onClose,
  qrSrc = '/alipay.jpg',
  title = '支持 FilmFrame',
  description = '如果这个本地暗房工具帮到了你，可以请作者喝一杯奶茶。',
  fallbackMessage = '二维码暂不可用，请在资源替换后重试。',
  className = '',
}: SupportDialogProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const descriptionId = useId();

  useEffect(() => {
    if (open) setImageFailed(false);
  }, [open, qrSrc]);

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      title={<><CoffeeIcon className="inline-block align-[-3px] text-[var(--ff-safelight)]" size={20} /> <span>{title}</span></>}
      description={<span id={descriptionId}>{description}</span>}
      describedBy={descriptionId}
      closeLabel="关闭支持窗口"
      size="sm"
      className={`ff-support-dialog ${className}`}
      bodyClassName="p-5"
    >
      <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-[6px] border border-black/10 bg-white p-3">
        {!imageFailed && qrSrc ? (
          <img
            src={qrSrc}
            alt="支持 FilmFrame 的二维码"
            onError={() => setImageFailed(true)}
            className="max-h-72 w-full rounded-[4px] object-contain"
          />
        ) : (
          <p className="max-w-[18rem] text-center text-sm leading-6 text-[var(--ff-ink)]">{fallbackMessage}</p>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-[var(--ff-paper-dim)]">支付与图片处理均不会上传到 FilmFrame 服务器。</p>
    </ModalSurface>
  );
}

export default SupportDialog;
