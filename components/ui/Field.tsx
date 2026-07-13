import type { HTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from './utils';

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode;
  htmlFor?: string;
  helpText?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  helpText,
  error,
  required = false,
  disabled = false,
  children,
  className,
  ...props
}: FieldProps) {
  return (
    <div
      {...props}
      className={joinClassNames('ff-field', Boolean(error) && 'ff-field--error', disabled && 'ff-field--disabled', className)}
      data-disabled={disabled || undefined}
    >
      {label ? (
        <div className="ff-field__label-row">
          <label className="ff-field__label" htmlFor={htmlFor}>
            {label}
            {required ? <span className="ff-field__required" aria-hidden="true">*</span> : null}
          </label>
        </div>
      ) : null}
      {children}
      {error ? <div className="ff-field__error" role="alert">{error}</div> : helpText ? <div className="ff-field__help">{helpText}</div> : null}
    </div>
  );
}
