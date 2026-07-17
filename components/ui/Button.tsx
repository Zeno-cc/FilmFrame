import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
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
}, ref) {
  return (
    <button
      {...props}
      ref={ref}
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
});
