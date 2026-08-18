// Ported from the removed Dart widget test
// (`admin/test/publishers_screen_test.dart`, git history, spec 0003). The
// fake behind `window.api.publishers.*` plays the same role the
// `FakePublisherRepository` did there, and `now` is injected into
// `PublishersScreen` so whether a code is still alive is decided by the
// fixture, not by the day the suite runs.
//
// The access codes below are made up. A test may assert that one reaches the
// screen -- that is the whole point of the screen -- but none of them is
// ever printed anywhere else.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Publisher } from '../../shared/models'
import type { IpcApi } from '../../shared/ipc-contract'
import { PublishersScreen } from './PublishersScreen'

/** A fixed "now", so "expires in 20 hours" is a date and not a moving target. */
const now = new Date(2026, 7, 7, 12)

/** Access already revoked. The work log stays regardless. */
const revoked: Publisher = { id: 'p1', name: 'Ana', isActive: false }

/** A code was minted and nobody has redeemed it yet. */
const awaitingCode: Publisher = {
  id: 'p2',
  name: 'Bruno',
  isActive: true,
  accessCode: 'MTFH7K2P',
  accessCodeExpiresAt: new Date(now.getTime() + 20 * 60 * 60 * 1000)
}

/** The code ran out of its 24 hours before anyone typed it. */
const expiredCode: Publisher = {
  id: 'p3',
  name: 'Carla',
  isActive: true,
  accessCode: 'QRS4TUV9',
  accessCodeExpiresAt: new Date(now.getTime() - 60 * 60 * 1000)
}

/** Redeemed: the server nulled the code and stamped the activation. */
const onDevice: Publisher = {
  id: 'p4',
  name: 'Daniel',
  isActive: true,
  activatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
}

/** `implements` needs a named type -- an indexed access like `IpcApi['publishers']` cannot appear there directly. */
type PublishersApi = IpcApi['publishers']

/** Records every write so arguments can be checked, not just that a call happened. */
class FakePublishersApi implements PublishersApi {
  publishers: Publisher[] = []
  listCalls = 0
  created: string[] = []
  regenerated: string[] = []
  activeCalls: Array<[string, boolean]> = []
  /** What `create`/`regenerateCode` hand back when they succeed. */
  minted: Publisher | null = null
  /** When set, `list` throws it instead of answering. May be a non-`Error` value, to exercise the generic fallback message. */
  listFailure: unknown = null
  /** When set, every write throws it. */
  writeFailure: Error | null = null
  /** When true, `list` never resolves -- the loading state, held still. */
  hangs = false

  async list(): Promise<Publisher[]> {
    this.listCalls += 1
    if (this.hangs) return new Promise<Publisher[]>(() => {})
    if (this.listFailure) throw this.listFailure
    return this.publishers
  }

  async create(name: string): Promise<Publisher> {
    this.created.push(name)
    if (this.writeFailure) throw this.writeFailure
    if (!this.minted) throw new Error('test fixture missing `minted`')
    return this.minted
  }

  async regenerateCode(publisherId: string): Promise<Publisher> {
    this.regenerated.push(publisherId)
    if (this.writeFailure) throw this.writeFailure
    if (!this.minted) throw new Error('test fixture missing `minted`')
    return this.minted
  }

  async setActive(publisherId: string, isActive: boolean): Promise<Publisher> {
    this.activeCalls.push([publisherId, isActive])
    if (this.writeFailure) throw this.writeFailure
    return this.minted ?? { id: publisherId, name: '?', isActive }
  }
}

function installFakeApi(): FakePublishersApi {
  const fake = new FakePublishersApi()
  ;(window as unknown as { api: Pick<IpcApi, 'publishers'> }).api = { publishers: fake }
  return fake
}

/** The status line of one person's row, told apart from everyone else's. */
function statusOf(name: string): string {
  const row = screen.getByTestId(`publisher-row-${name}`)
  return within(row).getByTestId('publisher-status').textContent ?? ''
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  const row = screen.getByTestId(`publisher-row-${name}`)
  await user.click(within(row).getByRole('button', { name: `Ações de ${name}` }))
}

/** Walks the register flow up to the point where the server would be called. */
async function registerFlow(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
  await user.type(screen.getByLabelText('Nome da pessoa'), name)
  await user.click(screen.getByRole('button', { name: 'Gerar código' }))
}

describe('PublishersScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a congregation with nobody registered says exactly that', async () => {
    installFakeApi()

    render(<PublishersScreen now={now} />)

    expect(await screen.findByText('Nenhum publicador cadastrado.')).toBeInTheDocument()
  })

  it('while the list is on its way, registering is still offered', async () => {
    const fake = installFakeApi()
    fake.hangs = true

    render(<PublishersScreen now={now} />)

    expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('a refused listing is reported in the server’s own words', async () => {
    const fake = installFakeApi()
    fake.listFailure = new Error('O servidor está em manutenção.')

    render(<PublishersScreen now={now} />)

    expect(await screen.findByText('O servidor está em manutenção.')).toBeInTheDocument()
  })

  it('a failure that carries no message gets a generic one instead of a blank screen', async () => {
    const fake = installFakeApi()
    // Not every rejection is an `Error` with a message -- a thrown string,
    // for instance, must not leave the admin looking at an empty page.
    fake.listFailure = 'boom'

    render(<PublishersScreen now={now} />)

    expect(await screen.findByText('Não foi possível completar a operação.')).toBeInTheDocument()
  })

  it('each status line names the state that person is actually in', async () => {
    const fake = installFakeApi()
    fake.publishers = [revoked, awaitingCode, expiredCode, onDevice]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Ana')

    // Revoking takes the access away, not the record of the work done.
    expect(statusOf('Ana')).toBe('Acesso revogado — o histórico de trabalho continua guardado.')
    expect(statusOf('Bruno')).toBe('Código válido, aguardando ser usado.')
    // The code is past its 24 hours, so it is as good as absent.
    expect(statusOf('Carla')).toBe('Sem código válido. Gere um novo para esta pessoa entrar.')
    expect(statusOf('Daniel')).toBe('Ativo neste aparelho.')
  })

  it('registering is refused until a name is typed', async () => {
    installFakeApi()
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))

    const mintButton = (): HTMLElement => screen.getByRole('button', { name: 'Gerar código' })
    expect(mintButton()).toBeDisabled()

    // Spaces are not a name: a code handed to "   " belongs to nobody.
    await user.type(screen.getByLabelText('Nome da pessoa'), '   ')
    expect(mintButton()).toBeDisabled()

    await user.type(screen.getByLabelText('Nome da pessoa'), 'Maria')
    expect(mintButton()).toBeEnabled()
  })

  it('pressing Enter with a name submits it, same as clicking "Gerar código"', async () => {
    const fake = installFakeApi()
    fake.minted = { id: 'p9', name: 'Maria', isActive: true, accessCode: 'JKMN3PQR' }
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await user.type(screen.getByLabelText('Nome da pessoa'), 'Maria{Enter}')

    expect(fake.created).toEqual(['Maria'])
    expect(screen.getByRole('dialog', { name: 'Código de Maria' })).toBeInTheDocument()
  })

  it('pressing Enter on an empty name submits nothing', async () => {
    const fake = installFakeApi()
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await user.type(screen.getByLabelText('Nome da pessoa'), '{Enter}')

    expect(fake.created).toEqual([])
    expect(screen.getByRole('dialog', { name: 'Cadastrar publicador' })).toBeInTheDocument()
  })

  it('renders with the real clock when `now` is not provided', async () => {
    installFakeApi()

    render(<PublishersScreen />)

    expect(await screen.findByText('Nenhum publicador cadastrado.')).toBeInTheDocument()
  })

  it('a freshly minted code is shown, with what it is worth, and the list is reloaded', async () => {
    const code = 'JKMN3PQR'
    const fake = installFakeApi()
    fake.minted = {
      id: 'p9',
      name: 'Maria',
      isActive: true,
      accessCode: code,
      accessCodeExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
    }
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByText('Nenhum publicador cadastrado.')

    await registerFlow(user, 'Maria')

    expect(fake.created).toEqual(['Maria'])
    expect(screen.getByRole('dialog', { name: 'Código de Maria' })).toBeInTheDocument()
    expect(screen.getByTestId('access-code')).toHaveTextContent(code)
    // The three facts the admin has to pass on before closing this dialog.
    expect(screen.getByText(/24 horas/)).toBeInTheDocument()
    expect(screen.getByText(/uma única vez/)).toBeInTheDocument()
    expect(screen.getByText(/não poderá ser consultado/)).toBeInTheDocument()
    // And the list is asked again, so the new person shows up in it.
    await waitFor(() => expect(fake.listCalls).toBe(2))
  })

  it('the code can be copied instead of read out loud', async () => {
    const code = 'JKMN3PQR'
    const fake = installFakeApi()
    fake.minted = { id: 'p9', name: 'Maria', isActive: true, accessCode: code }
    const user = userEvent.setup()
    // Defined after `userEvent.setup()`, which installs its own clipboard
    // stub -- doing this the other way round loses our fake to that stub.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    })
    render(<PublishersScreen now={now} />)

    await registerFlow(user, 'Maria')
    await user.click(screen.getByRole('button', { name: 'Copiar' }))

    expect(writeText).toHaveBeenCalledWith(code)
  })

  it('backing out of the form mints nothing', async () => {
    const fake = installFakeApi()
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)

    await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await user.type(screen.getByLabelText('Nome da pessoa'), 'Maria')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(fake.created).toEqual([])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Ver código" is offered only while there is a live code', async () => {
    const fake = installFakeApi()
    fake.publishers = [revoked, awaitingCode, expiredCode, onDevice]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Ana')

    await openMenu(user, 'Bruno')
    expect(screen.getByRole('button', { name: 'Ver código' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver código' }))
    expect(screen.getByTestId('access-code')).toHaveTextContent(awaitingCode.accessCode!)
    await user.click(screen.getByRole('button', { name: 'Fechar' }))

    // Expired, redeemed and revoked all have nothing left to show.
    for (const name of ['Carla', 'Daniel', 'Ana']) {
      await openMenu(user, name)
      expect(screen.queryByRole('button', { name: 'Ver código' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Gerar novo código' })).toBeInTheDocument()
      await openMenu(user, name)
    }
  })

  it('regenerating mints a new code, shows it, and reloads the list', async () => {
    const code = 'WXY6ZAB8'
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    fake.minted = {
      id: onDevice.id,
      name: onDevice.name,
      isActive: true,
      accessCode: code,
      accessCodeExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
    }
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Gerar novo código' }))

    expect(fake.regenerated).toEqual([onDevice.id])
    expect(screen.getByRole('dialog', { name: 'Código de Daniel' })).toBeInTheDocument()
    expect(screen.getByTestId('access-code')).toHaveTextContent(code)
    await waitFor(() => expect(fake.listCalls).toBe(2))
  })

  it('the toggle sends the opposite of the state it found', async () => {
    const fake = installFakeApi()
    fake.publishers = [revoked, awaitingCode]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Ana')

    await openMenu(user, 'Bruno')
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(fake.activeCalls).toEqual([['p2', false]]))

    await screen.findByTestId('publisher-row-Ana')
    await openMenu(user, 'Ana')
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reativar' }))
    await waitFor(() =>
      expect(fake.activeCalls).toEqual([
        ['p2', false],
        ['p1', true]
      ])
    )
  })

  it('a refused registration is shown and no code is invented', async () => {
    const fake = installFakeApi()
    fake.writeFailure = new Error('Já existe um publicador com esse nome.')
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByText('Nenhum publicador cadastrado.')

    await registerFlow(user, 'Maria')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um publicador com esse nome.'
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fake.listCalls).toBe(1)
  })

  it('a refused regeneration is shown and the old state stands', async () => {
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    fake.writeFailure = new Error('Muitas tentativas. Tente de novo em um minuto.')
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Gerar novo código' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Tente de novo em um minuto.'
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(statusOf('Daniel')).toBe('Ativo neste aparelho.')
  })

  it('the summary counts each category present and leaves the zeroed ones out', async () => {
    const fake = installFakeApi()
    // Two on-device, one live code -- nobody pending, nobody revoked.
    const second: Publisher = { ...onDevice, id: 'p5', name: 'Elisa' }
    fake.publishers = [awaitingCode, onDevice, second]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Bruno')

    const summary = screen.getByTestId('publishers-summary')
    expect(summary).toHaveTextContent('2 ativos · 1 com código válido')
    // Zeroed categories are not narrated as "0 of something".
    expect(summary.textContent).not.toMatch(/desativado|sem código/)
  })

  it('the summary pluralizes the revoked count', async () => {
    const fake = installFakeApi()
    fake.publishers = [revoked, { ...revoked, id: 'p7', name: 'Fábio' }]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Ana')

    expect(screen.getByTestId('publishers-summary')).toHaveTextContent('2 desativados')
  })

  it('the search field appears only once a non-empty list has loaded', async () => {
    const empty = installFakeApi()
    const { unmount } = render(<PublishersScreen now={now} />)
    await screen.findByText('Nenhum publicador cadastrado.')

    // Nobody registered: nothing to search through.
    expect(screen.queryByLabelText('Buscar publicador')).not.toBeInTheDocument()
    expect(empty.listCalls).toBe(1)
    unmount()

    const fake = installFakeApi()
    fake.publishers = [awaitingCode, onDevice]
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Bruno')

    expect(screen.getByLabelText('Buscar publicador')).toHaveAttribute(
      'placeholder',
      'Buscar por nome…'
    )
  })

  it('typing filters the rows by name, and clearing brings everyone back', async () => {
    const fake = installFakeApi()
    fake.publishers = [revoked, awaitingCode, expiredCode, onDevice]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Ana')

    await user.type(screen.getByLabelText('Buscar publicador'), 'an')

    // "an" matches Ana and Daniel; Bruno and Carla drop out.
    expect(screen.getByTestId('publisher-row-Ana')).toBeInTheDocument()
    expect(screen.getByTestId('publisher-row-Daniel')).toBeInTheDocument()
    expect(screen.queryByTestId('publisher-row-Bruno')).not.toBeInTheDocument()
    expect(screen.queryByTestId('publisher-row-Carla')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Buscar publicador'))
    for (const name of ['Ana', 'Bruno', 'Carla', 'Daniel']) {
      expect(screen.getByTestId(`publisher-row-${name}`)).toBeInTheDocument()
    }
  })

  it('the search ignores case and accents: "joao" finds "João"', async () => {
    const fake = installFakeApi()
    const joao: Publisher = { ...onDevice, id: 'p6', name: 'João' }
    fake.publishers = [joao, awaitingCode]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-João')

    await user.type(screen.getByLabelText('Buscar publicador'), 'joao')

    expect(screen.getByTestId('publisher-row-João')).toBeInTheDocument()
    expect(screen.queryByTestId('publisher-row-Bruno')).not.toBeInTheDocument()
  })

  it('a search with no match says so, not "nobody registered"', async () => {
    const fake = installFakeApi()
    fake.publishers = [awaitingCode, onDevice]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Bruno')

    await user.type(screen.getByLabelText('Buscar publicador'), 'zzz')

    expect(screen.getByText('Nenhum publicador encontrado para a busca.')).toBeInTheDocument()
    // The congregation does have people -- the empty-registry message would lie.
    expect(screen.queryByText('Nenhum publicador cadastrado.')).not.toBeInTheDocument()
    // And the field itself stays, so the admin can retype.
    expect(screen.getByLabelText('Buscar publicador')).toBeInTheDocument()
  })

  it('a refused toggle is shown and access is unchanged', async () => {
    const fake = installFakeApi()
    fake.publishers = [awaitingCode]
    fake.writeFailure = new Error('Este publicador não existe mais.')
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Bruno')

    await openMenu(user, 'Bruno')
    await user.click(screen.getByRole('button', { name: 'Desativar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Este publicador não existe mais.')
    expect(fake.activeCalls).toEqual([['p2', false]])
    expect(fake.listCalls).toBe(1)
    expect(statusOf('Bruno')).toBe('Código válido, aguardando ser usado.')
  })
})
