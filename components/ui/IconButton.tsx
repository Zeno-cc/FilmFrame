import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './utils';
import type { ButtonSize, ButtonVariant } from './Button';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  title?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function IconButton({
  className,
  icon,
  label,
  title,
  size = 'md',
  variant,
  disabled,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={joinClassNames(
        'ff-icon-button',
        size !== 'md' && `ff-icon-button--${size}`,
        variant && `ff-icon-button--${variant}`,
        className,
      )}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}
