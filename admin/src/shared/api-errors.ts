// The error hierarchy the API client (Task 04) throws and the renderer
// catches, mirroring `packages/core/lib/api/api_exception.dart`. These
// classes are structural — the behaviour worth testing is `isUnauthorized`,
// the one place a rule lives (a status *or* a code marks a request as
// unauthorized, because the server does not always agree on which).

/** Base type for everything the API client throws. */
export class ApiException extends Error {}

/**
 * The server answered with a `{code, detail}` error body (or one the client
 * derived a `code` for from the HTTP status).
 */
export class ApiErrorException extends ApiException {
  readonly statusCode: number
  readonly code: string
  readonly detail: string

  constructor(statusCode: number, code: string, detail: string) {
    super(detail)
    this.name = 'ApiErrorException'
    this.statusCode = statusCode
    this.code = code
    this.detail = detail
  }

  /**
   * `true` when the request was rejected for lacking (or having an expired)
   * credential — either signalled by the HTTP status or by the server's own
   * `code`, since not every 401 necessarily carries `code: 'unauthorized'`.
   */
  get isUnauthorized(): boolean {
    return this.statusCode === 401 || this.code === 'unauthorized'
  }
}

/**
 * The request never got a response worth parsing — a non-JSON error body, or
 * `fetch` itself rejecting/throwing (offline, DNS, refused connection).
 */
export class NetworkException extends ApiException {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkException'
  }
}
