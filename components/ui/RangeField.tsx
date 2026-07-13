import type { ChangeEventHandler, InputHTMLAttributes, ReactNode } from 'react';
import { Field } from './Field';
import { joinClassNames } from './utils';

export interface RangeFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'size'> {
  label: ReactNode;
  value: number;
  onChange: ChangeEventHandler<HTMLInputElement>;
  helpText?: ReactNode;
  error?: ReactNode;
  formatter?: (value: number) => ReactNode;
  className?: string;
}

export function RangeField({
  id,
  label,
  value,
  onChange,
  helpText,
  error,
  formatter = currentValue => currentValue,
  className,
  disabled,
  required,
  ...props
}: RangeFieldProps) {
  return (
    <Field
      label={label}
      htmlFor={id}
      helpText={helpText}
      error={error}
      required={required}
      disabled={disabled}
      className={joinClassNames('ff-range-field', className)}
    >
      <div className="ff-range-field__row">
        <input
          {...props}
          id={id}
          type="range"
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-valuetext={String(formatter(value))}
        />
        <output className="ff-range-field__output" htmlFor={id}>{formatter(value)}</output>
      </div>
    </Field>
  );
}
