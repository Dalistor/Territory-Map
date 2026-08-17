import { describe, expect, it } from 'vitest'
import { parseIpcError } from './ipc-error'

const FALLBACK = 'Não foi possível completar a operação.'

describe('parseIpcError', () => {
  it('recovers name/message/code/statusCode from a real bridged error wrapped in the Electron prefix', () => {
    const bridged = new Error(
      `Error invoking remote method 'session:configure': Error: ` +
        JSON.stringify({
          name: 'ApiErrorException',
          message: 'Não foi possível entrar.',
          code: 'invalid_credentials',
          statusCode: 401
        })
    )

    expect(parseIpcError(bridged, FALLBACK)).toEqual({
      name: 'ApiErrorException',
      message: 'Não foi possível entrar.',
      code: 'invalid_credentials',
      statusCode: 401
    })
  })

  it('recovers the same shape when the message is the JSON with no Electron prefix at all', () => {
    const bridged = new Error(
      JSON.stringify({ name: 'CredentialsRejectedException', message: 'Digite os dados de novo.' })
    )

    expect(parseIpcError(bridged, FALLBACK)).toEqual({
      name: 'CredentialsRejectedException',
      message: 'Digite os dados de novo.',
      code: undefined,
      statusCode: undefined
    })
  })

  it("falls back to the Error's own name when the embedded JSON carries a message but no name", () => {
    const bridged = new Error(JSON.stringify({ message: 'Sem nome no payload.' }))

    expect(parseIpcError(bridged, FALLBACK)).toEqual({
      name: 'Error',
      message: 'Sem nome no payload.',
      code: undefined,
      statusCode: undefined
    })
  })

  it('falls back to the raw message when a real Error carries an ordinary, non-JSON message', () => {
    const plain = new Error('Falha de rede genuína, sem relação com o bridge.')

    expect(parseIpcError(plain, FALLBACK)).toEqual({
      name: 'Error',
      message: 'Falha de rede genuína, sem relação com o bridge.'
    })
  })

  it('falls back to the raw message when the embedded JSON parses but carries no message field', () => {
    const shapeless = new Error(`boom: ${JSON.stringify({ foo: 'bar' })}`)

    expect(parseIpcError(shapeless, FALLBACK)).toEqual({
      name: 'Error',
      message: shapeless.message
    })
  })

  it('falls back to the raw message when a JSON-looking prefix does not actually parse', () => {
    const malformed = new Error('algo deu errado: {not valid json')

    expect(parseIpcError(malformed, FALLBACK)).toEqual({
      name: 'Error',
      message: 'algo deu errado: {not valid json'
    })
  })

  it('uses the fallback when a real Error has an empty message', () => {
    const empty = new Error('')

    expect(parseIpcError(empty, FALLBACK)).toEqual({ name: 'Error', message: FALLBACK })
  })

  it('accepts the plain {name, message} shape tests fake window.api rejections with, no bridge involved', () => {
    const fake = { name: 'ApiErrorException', message: 'Conflito.' }

    expect(parseIpcError(fake, FALLBACK)).toEqual({
      name: 'ApiErrorException',
      message: 'Conflito.',
      code: undefined,
      statusCode: undefined
    })
  })

  it('preserves the name from a plain object that carries no message at all', () => {
    expect(parseIpcError({ name: 'CredentialsRejectedException' }, FALLBACK)).toEqual({
      name: 'CredentialsRejectedException',
      message: FALLBACK,
      code: undefined,
      statusCode: undefined
    })
  })

  it('defaults name to "Error" when a plain object carries a message but no name', () => {
    expect(parseIpcError({ message: 'Sem nome.' }, FALLBACK)).toEqual({
      name: 'Error',
      message: 'Sem nome.',
      code: undefined,
      statusCode: undefined
    })
  })

  it('falls back when a plain object carries an empty message', () => {
    expect(parseIpcError({ message: '' }, FALLBACK)).toEqual({ name: 'Error', message: FALLBACK })
  })

  it('falls back for a rejection that is not an Error and not an object with a message', () => {
    expect(parseIpcError('boom', FALLBACK)).toEqual({ name: 'Error', message: FALLBACK })
    expect(parseIpcError(null, FALLBACK)).toEqual({ name: 'Error', message: FALLBACK })
    expect(parseIpcError(undefined, FALLBACK)).toEqual({ name: 'Error', message: FALLBACK })
    expect(parseIpcError(42, FALLBACK)).toEqual({ name: 'Error', message: FALLBACK })
  })

  it('ignores non-string code/statusCode fields rather than passing them through', () => {
    const bridged = new Error(
      JSON.stringify({ name: 'ApiErrorException', message: 'x', code: 123, statusCode: '401' })
    )

    expect(parseIpcError(bridged, FALLBACK)).toEqual({
      name: 'ApiErrorException',
      message: 'x',
      code: undefined,
      statusCode: undefined
    })
  })
})
