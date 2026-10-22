export interface ErrorNoticeProps {
  readonly message: string
  /** Offers "Tentar novamente" when the failed read can simply be repeated. */
  readonly onRetry?: () => void
  readonly retryDisabled?: boolean
}

/**
 * A failure inside the block that failed: what went wrong and, for a read,
 * the way back. Data already on screen stays where it is.
 */
export function ErrorNotice({
  message,
  onRetry,
  retryDisabled = false
}: ErrorNoticeProps): React.JSX.Element {
  return (
    <div role="alert" className="error-notice">
      <span>{message}</span>
      {onRetry !== undefined && (
        <button type="button" className="button-small" disabled={retryDisabled} onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}
