import type { ReactNode, RefObject } from 'react';
import { ModalSurface, type ModalSurfaceProps } from './ModalSurface';

export interface SheetProps extends Omit<ModalSurfaceProps, 'surface' | 'size' | 'footer' | 'title'> {
  title?: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Sheet({
  title,
  footer,
  closeLabel = '关闭设置',
  showCloseButton = true,
  ...props
}: SheetProps) {
  return (
    <ModalSurface
      {...props}
      title={title}
      footer={footer}
      closeLabel={closeLabel}
      showCloseButton={showCloseButton}
      surface="sheet"
      size="lg"
    />
  );
}
