import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { joinClassNames } from './utils';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  className,
  id: providedId,
}: SegmentedControlProps<T>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const firstEnabledIndex = options.findIndex(option => !disabled && !option.disabled);
  const hasSelectedOption = options.some(option => Object.is(option.value, value));

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabled = options
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option }) => !disabled && !option.disabled);
    if (enabled.length === 0) return;
    const currentEnabledIndex = enabled.findIndex(({ optionIndex }) => optionIndex === index);
    const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const nextEnabledIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? enabled.length - 1
        : (currentEnabledIndex + offset + enabled.length) % enabled.length;
    const next = enabled[nextEnabledIndex];
    if (next) {
      onChange(next.option.value);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => document.getElementById(`${id}-${next.optionIndex}`)?.focus());
      }
    }
  };

  return (
    <div
      id={id}
      className={joinClassNames('ff-segmented-control', className)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => {
        const selected = Object.is(option.value, value);
        const optionDisabled = disabled || option.disabled;
        return (
          <button
            key={String(option.value)}
            id={`${id}-${index}`}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-describedby={option.description ? `${id}-${index}-description` : undefined}
            title={option.description}
            disabled={optionDisabled}
            tabIndex={selected || (!hasSelectedOption && index === firstEnabledIndex) ? 0 : -1}
            className="ff-segmented-control__option"
            onClick={() => onChange(option.value)}
            onKeyDown={event => moveSelection(event, index)}
          >
            {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
            <span>{option.label}</span>
            {option.description ? <span id={`${id}-${index}-description`} className="sr-only">{option.description}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
