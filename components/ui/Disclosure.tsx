import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronDownIcon } from '../icons/FilmFrameIcons';
import { joinClassNames } from './utils';

export interface DisclosureProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  triggerProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'aria-expanded'>;
}

export function Disclosure({
  title,
  eyebrow,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  contentClassName,
  triggerProps,
}: DisclosureProps) {
  const generatedId = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const contentId = `${generatedId}-content`;

  const toggle = () => {
    if (disabled) return;
    const next = !isOpen;
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section className={joinClassNames('ff-disclosure', className)} data-open={isOpen}>
      <button
        {...triggerProps}
        type="button"
        className={joinClassNames('ff-disclosure__trigger', triggerProps?.className)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        disabled={disabled}
        onClick={toggle}
      >
        <span className="ff-disclosure__title">
          {eyebrow ? <span className="ff-disclosure__eyebrow">{eyebrow}</span> : null}
          <span>{title}</span>
        </span>
        <ChevronDownIcon className="ff-disclosure__chevron" size={18} />
      </button>
      <div
        id={contentId}
        className={joinClassNames('ff-disclosure__content', contentClassName)}
        hidden={!isOpen}
        aria-hidden={!isOpen}
      >
        {children}
      </div>
    </section>
  );
}
