import { useId, useRef } from 'react'
import './query-controls.css'

export interface SearchFieldProps {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly disabled?: boolean
  readonly clearLabel?: string
  readonly className?: string
}

/**
 * A labelled search input whose clear action returns focus to the field.
 * Keeping that small interaction here avoids each consultation screen
 * implementing a subtly different way to clear its current criterion.
 */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  clearLabel = 'Limpar busca',
  className
}: SearchFieldProps): React.JSX.Element {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  function clear(): void {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={['search-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId}>{label}</label>
      <div className="search-field-control">
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="search-field-clear"
          disabled={disabled || value.length === 0}
          onClick={clear}
        >
          {clearLabel}
        </button>
      </div>
    </div>
  )
}
