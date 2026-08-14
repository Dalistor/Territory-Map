import { describe, expect, it } from 'vitest'
import { ApiErrorException, ApiException, NetworkException } from './api-errors'

describe('ApiErrorException', () => {
  it('is both an ApiException and a native Error', () => {
    const error = new ApiErrorException(404, 'not_found', 'Território não encontrado.')

    expect(error).toBeInstanceOf(ApiErrorException)
    expect(error).toBeInstanceOf(ApiException)
    expect(error).toBeInstanceOf(Error)
  })

  it('exposes statusCode, code and detail as given', () => {
    const error = new ApiErrorException(409, 'conflict', 'A quadra 12 já existe.')

    expect(error.statusCode).toBe(409)
    expect(error.code).toBe('conflict')
    expect(error.detail).toBe('A quadra 12 já existe.')
  })

  it('isUnauthorized is true when statusCode is 401', () => {
    const error = new ApiErrorException(401, 'token_expired', 'Sessão expirada.')

    expect(error.isUnauthorized).toBe(true)
  })

  it('isUnauthorized is true when code is unauthorized, regardless of statusCode', () => {
    const error = new ApiErrorException(403, 'unauthorized', 'Não autorizado.')

    expect(error.isUnauthorized).toBe(true)
  })

  it('isUnauthorized is false otherwise', () => {
    const error = new ApiErrorException(404, 'not_found', 'Território não encontrado.')

    expect(error.isUnauthorized).toBe(false)
  })
})

describe('NetworkException', () => {
  it('is an ApiException without statusCode or code', () => {
    const error = new NetworkException('Falha de conexão com o servidor.')

    expect(error).toBeInstanceOf(NetworkException)
    expect(error).toBeInstanceOf(ApiException)
    expect(error).toBeInstanceOf(Error)
    expect((error as unknown as { statusCode?: unknown }).statusCode).toBeUndefined()
    expect((error as unknown as { code?: unknown }).code).toBeUndefined()
  })
})
