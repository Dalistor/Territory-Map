import { useId, useRef } from 'react'
import './query-controls.css'

export interface SegmentedControlOption<Value extends string> {
  readonly value: Value
  readonly label: string
  readonly disabled?: boolean
}

export interface SegmentedControlProps<Value extends string> {
  readonly label: string
  readonly options: readonly SegmentedControlOption<Value>[]
  readonly value: Value
  readonly onChange: (value: Value) => void
  readonly disabled?: boolean
  readonly className?: string
}

/** A compact single-choice control with radio semantics and arrow-key movement. */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className
}: SegmentedControlProps<Value>): React.JSX.Element {
  const labelId = useId()
  const controlRef = useRef<HTMLDivElement>(null)

  function moveSelection(currentValue: Value, direction: 1 | -1): void {
    const enabledOptions = options.filter((option) => !option.disabled)
    const currentIndex = enabledOptions.findIndex((option) => option.value === currentValue)
    if (currentIndex === -1 || enabledOptions.length === 0) return
    const nextIndex = (currentIndex + direction + enabledOptions.length) % enabledOptions.length
    const next = enabledOptions[nextIndex]
    if (next === undefined) return
    onChange(next.value)
    Array.from(
      controlRef.current?.querySelectorAll<HTMLButtonElement>('[data-segment-value]') ?? []
    )
      .find((button) => button.dataset.segmentValue === next.value)
      ?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, optionValue: Value): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    moveSelection(optionValue, event.key === 'ArrowRight' ? 1 : -1)
  }

  return (
    <div
      className={['segmented-control', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-labelledby={labelId}
      ref={controlRef}
    >
      <span className="segmented-control-label" id={labelId}>
        {label}
      </span>
      <div className="segmented-control-options">
        {options.map((option) => {
          const isSelected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              data-segment-value={option.value}
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={isSelected ? 'is-selected' : undefined}
              disabled={disabled || option.disabled}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => handleKeyDown(event, option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
