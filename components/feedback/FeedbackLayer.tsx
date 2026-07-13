import type { ReactNode } from 'react';
import { ErrorDialog, type ErrorDialogProps } from './ErrorDialog';
import { NoticeToast, type NoticeToastProps } from './NoticeToast';
import { SupportDialog, type SupportDialogProps } from './SupportDialog';

export interface FeedbackLayerProps {
  notice?: NoticeToastProps | null;
  error?: ErrorDialogProps | null;
  support?: SupportDialogProps | null;
  children?: ReactNode;
}

export function FeedbackLayer({ notice, error, support, children }: FeedbackLayerProps) {
  return (
    <>
      {children}
      {notice && <NoticeToast {...notice} />}
      {error && <ErrorDialog {...error} />}
      {support && <SupportDialog {...support} />}
    </>
  );
}

export default FeedbackLayer;

