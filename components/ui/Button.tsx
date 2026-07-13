import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={joinClassNames(
        'ff-button',
        `ff-button--${variant}`,
        size !== 'md' && `ff-button--${size}`,
        fullWidth && 'ff-button--full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="ff-button__spinner" aria-hidden="true" /> : leadingIcon ? <span className="ff-button__icon" aria-hidden="true">{leadingIcon}</span> : null}
      <span>{children}</span>
      {!loading && trailingIcon ? <span className="ff-button__icon" aria-hidden="true">{trailingIcon}</span> : null}
    </button>
  );
}
