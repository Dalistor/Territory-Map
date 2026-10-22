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
import type { AssignmentHistoryPage, AssignmentWithTerritory, Publisher } from '../../shared/models'
import type { IpcApi } from '../../shared/ipc-contract'
import { PublishersScreen } from './PublishersScreen'
import { answerConfirm } from '../components/ConfirmDialog.testing'

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
  renames: Array<[string, string]> = []
  deleted: string[] = []
  /** What `create`/`regenerateCode` hand back when they succeed. */
  minted: Publisher | null = null
  /** When set, `list` throws it instead of answering. May be a non-`Error` value, to exercise the generic fallback message. */
  listFailure: unknown = null
  /** When set, every write throws it. */
  writeFailure: Error | null = null
  /**
   * When set, `delete` alone throws it. Kept apart from `writeFailure` because
   * the server's refusal to delete is a serialized `{message, code,
   * statusCode}`, not a plain `Error` -- and only this write can meet it.
   */
  deleteFailure: unknown = null
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

  async rename(publisherId: string, name: string): Promise<Publisher> {
    this.renames.push([publisherId, name])
    if (this.writeFailure) throw this.writeFailure
    const found = this.publishers.find((publisher) => publisher.id === publisherId)
    const renamed = { ...(found ?? { id: publisherId, isActive: true }), name } as Publisher
    this.publishers = this.publishers.map((publisher) =>
      publisher.id === publisherId ? renamed : publisher
    )
    return renamed
  }

  async setActive(publisherId: string, isActive: boolean): Promise<Publisher> {
    this.activeCalls.push([publisherId, isActive])
    if (this.writeFailure) throw this.writeFailure
    return this.minted ?? { id: publisherId, name: '?', isActive }
  }

  async delete(publisherId: string): Promise<void> {
    this.deleted.push(publisherId)
    if (this.deleteFailure) throw this.deleteFailure
    if (this.writeFailure) throw this.writeFailure
  }
}

class FakeAssignmentHistoryApi {
  pages: AssignmentHistoryPage[] = []
  listCalls: Array<Parameters<IpcApi['assignments']['listAll']>[0]> = []
  failure: unknown = null

  async listAll(
    query?: Parameters<IpcApi['assignments']['listAll']>[0]
  ): Promise<AssignmentHistoryPage> {
    this.listCalls.push(query)
    if (this.failure) throw this.failure
    return this.pages.shift() ?? { items: [], total: 0, page: 1, pageSize: 50 }
  }
}

function installFakeApi(): FakePublishersApi {
  const fake = new FakePublishersApi()
  ;(window as unknown as { api: Pick<IpcApi, 'publishers' | 'assignments'> }).api = {
    publishers: fake,
    assignments: {
      listFor: vi.fn(),
      listAll: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      designate: vi.fn(),
      complete: vi.fn(),
      delete: vi.fn(),
      update: vi.fn()
    }
  }
  return fake
}

function installFakeApiWithHistory(): {
  publishers: FakePublishersApi
  history: FakeAssignmentHistoryApi
} {
  const publishers = new FakePublishersApi()
  const history = new FakeAssignmentHistoryApi()
  ;(window as unknown as { api: Pick<IpcApi, 'publishers' | 'assignments'> }).api = {
    publishers,
    assignments: {
      listFor: vi.fn(),
      listAll: history.listAll.bind(history),
      designate: vi.fn(),
      complete: vi.fn(),
      delete: vi.fn(),
      update: vi.fn()
    }
  }
  return { publishers, history }
}

function assignmentHistory(
  overrides: Partial<AssignmentWithTerritory> = {}
): AssignmentWithTerritory {
  return {
    id: 'assignment-1',
    publisher: { id: 'p4', name: 'Daniel no momento da retirada' },
    territory: { id: 'territory-1', name: 'Centro - N5' },
    startedAt: new Date(2026, 0, 4),
    completedAt: new Date(2026, 1, 12),
    ...overrides
  }
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
  await user.click(screen.getByRole('button', { name: 'Cadastrar publicador' }))
  await user.type(screen.getByLabelText('Nome da pessoa'), name)
  await user.click(screen.getByRole('button', { name: 'Gerar código' }))
}

describe('PublishersScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a name can be corrected without touching anything else about the person', async () => {
    const user = userEvent.setup()
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    render(<PublishersScreen now={now} />)
    await screen.findByText('Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Renomear' }))
    const field = screen.getByLabelText('Novo nome de Daniel')
    await user.clear(field)
    await user.type(field, 'Daniel Souza')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(fake.renames).toEqual([['p4', 'Daniel Souza']])
    expect(fake.activeCalls).toEqual([])
    expect(await screen.findByText('Daniel Souza')).toBeInTheDocument()
  })

  it('the field opens holding the current name, so a small fix is a small edit', async () => {
    const user = userEvent.setup()
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    render(<PublishersScreen now={now} />)
    await screen.findByText('Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Renomear' }))

    expect(screen.getByLabelText('Novo nome de Daniel')).toHaveValue('Daniel')
  })

  it('backing out leaves the name alone', async () => {
    const user = userEvent.setup()
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    render(<PublishersScreen now={now} />)
    await screen.findByText('Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Renomear' }))
    await user.type(screen.getByLabelText('Novo nome de Daniel'), ' Souza')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(fake.renames).toEqual([])
    expect(screen.getByText('Daniel')).toBeInTheDocument()
  })

  it('a blank name is not sent, and simply closes the field', async () => {
    const user = userEvent.setup()
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    render(<PublishersScreen now={now} />)
    await screen.findByText('Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Renomear' }))
    await user.clear(screen.getByLabelText('Novo nome de Daniel'))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(fake.renames).toEqual([])
    expect(await screen.findByText('Daniel')).toBeInTheDocument()
  })

  it('saving the same name spares the round trip', async () => {
    const user = userEvent.setup()
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    render(<PublishersScreen now={now} />)
    await screen.findByText('Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Renomear' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(fake.renames).toEqual([])
  })

  it('a refused rename is reported in the server’s own words', async () => {
    const user = userEvent.setup()
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    fake.writeFailure = new Error('Já existe alguém com esse nome.')
    render(<PublishersScreen now={now} />)
    await screen.findByText('Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Renomear' }))
    await user.clear(screen.getByLabelText('Novo nome de Daniel'))
    await user.type(screen.getByLabelText('Novo nome de Daniel'), 'Outro')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Já existe alguém com esse nome.')).toBeInTheDocument()
  })

  it('a congregation with nobody registered says exactly that', async () => {
    installFakeApi()

    render(<PublishersScreen now={now} />)

    expect(await screen.findByText(/Nenhum publicador cadastrado\./)).toBeInTheDocument()
  })

  it('keeps the publisher register in an accessible internal scrolling region', async () => {
    const fake = installFakeApi()
    fake.publishers = [onDevice, awaitingCode]

    render(<PublishersScreen now={now} />)

    const register = await screen.findByRole('region', { name: 'Lista de publicadores' })
    expect(register).toHaveAttribute('tabindex', '0')
    expect(within(register).getByTestId('publisher-row-Daniel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar publicador' })).toBeVisible()
    expect(screen.getByLabelText('Buscar publicador')).toBeVisible()
  })

  it('while the list is on its way, registering is still offered', async () => {
    const fake = installFakeApi()
    fake.hangs = true

    render(<PublishersScreen now={now} />)

    expect(screen.getByRole('button', { name: 'Cadastrar publicador' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Carregando publicadores…')
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
    expect(statusOf('Ana')).toBe('Desativado')
    expect(statusOf('Bruno')).toBe('Código válido')
    // The code is past its 24 hours, so it is as good as absent.
    expect(statusOf('Carla')).toBe('Sem código válido')
    expect(statusOf('Daniel')).toBe('Ativo')
  })

  it('registering is refused until a name is typed', async () => {
    installFakeApi()
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)

    await user.click(screen.getByRole('button', { name: 'Cadastrar publicador' }))

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

    await user.click(screen.getByRole('button', { name: 'Cadastrar publicador' }))
    await user.type(screen.getByLabelText('Nome da pessoa'), 'Maria{Enter}')

    expect(fake.created).toEqual(['Maria'])
    expect(screen.getByRole('dialog', { name: 'Código de Maria' })).toBeInTheDocument()
  })

  it('pressing Enter on an empty name submits nothing', async () => {
    const fake = installFakeApi()
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)

    await user.click(screen.getByRole('button', { name: 'Cadastrar publicador' }))
    await user.type(screen.getByLabelText('Nome da pessoa'), '{Enter}')

    expect(fake.created).toEqual([])
    expect(screen.getByRole('dialog', { name: 'Cadastrar publicador' })).toBeInTheDocument()
  })

  it('renders with the real clock when `now` is not provided', async () => {
    installFakeApi()

    render(<PublishersScreen />)

    expect(await screen.findByText(/Nenhum publicador cadastrado\./)).toBeInTheDocument()
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
    await screen.findByText(/Nenhum publicador cadastrado\./)

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

    await user.click(screen.getByRole('button', { name: 'Cadastrar publicador' }))
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
    await screen.findByText(/Nenhum publicador cadastrado\./)

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
    expect(statusOf('Daniel')).toBe('Ativo')
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
    await screen.findByText(/Nenhum publicador cadastrado\./)

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
    expect(statusOf('Bruno')).toBe('Código válido')
  })
  it('every publisher row offers deleting that person', async () => {
    const fake = installFakeApi()
    fake.publishers = [revoked, awaitingCode, expiredCode, onDevice]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Ana')

    for (const name of ['Ana', 'Bruno', 'Carla', 'Daniel']) {
      await openMenu(user, name)
      expect(screen.getByRole('button', { name: `Apagar ${name}` })).toBeInTheDocument()
      await openMenu(user, name)
    }
  })
  it('confirming the deletion removes that person and asks the list again', async () => {
    const fake = installFakeApi()
    fake.publishers = [awaitingCode, onDevice]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Bruno')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Apagar Daniel' }))
    await answerConfirm(user, true)

    await waitFor(() => expect(fake.deleted).toEqual([onDevice.id]))
    await waitFor(() => expect(fake.listCalls).toBe(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('backing out of the confirmation deletes nobody', async () => {
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Apagar Daniel' }))
    await answerConfirm(user, false)

    expect(fake.deleted).toEqual([])
    expect(fake.listCalls).toBe(1)
    expect(screen.getByTestId('publisher-row-Daniel')).toBeInTheDocument()
  })

  it('the confirmation says the history survives, which is what separates it from "Desativar"', async () => {
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Apagar Daniel' }))
    const message = await answerConfirm(user, true)

    expect(message).toMatch(/Daniel/)
    // What goes: the person and her access.
    expect(message).toMatch(/perde o acesso/i)
    // What stays, named explicitly -- and with her name still on it.
    expect(message).toMatch(/histórico/i)
    expect(message).toMatch(/designações/i)
    expect(message).toMatch(/nome preservado/i)
  })
  it('a deletion refused for an open assignment is reported in the server’s own words', async () => {
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    // What `PublisherHasOpenAssignmentError` turns into by the time it
    // crosses the IPC bridge: the 409 already explains what to do, so the
    // screen must pass it through instead of narrating a failure of its own.
    fake.deleteFailure = {
      name: 'ApiErrorException',
      message:
        'Daniel ainda tem território designado. Conclua a designação antes de apagar o publicador.',
      code: 'publisher_has_open_assignment',
      statusCode: 409
    }
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Apagar Daniel' }))
    await answerConfirm(user, true)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Daniel ainda tem território designado. Conclua a designação antes de apagar o publicador.'
    )
    // Nothing changed on the server, so there is nothing to re-read.
    expect(fake.listCalls).toBe(1)
    expect(screen.getByTestId('publisher-row-Daniel')).toBeInTheDocument()
  })

  it('a deletion that fails for any other reason is shown instead of passing silently', async () => {
    const fake = installFakeApi()
    fake.publishers = [onDevice]
    fake.deleteFailure = new Error('O servidor não respondeu.')
    const user = userEvent.setup()
    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Apagar Daniel' }))
    await answerConfirm(user, true)

    expect(await screen.findByRole('alert')).toHaveTextContent('O servidor não respondeu.')
    expect(fake.listCalls).toBe(1)
  })

  it('opens a territory-assignment history for the selected publisher without showing block work logs', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice]
    history.pages = [{ items: [assignmentHistory()], total: 1, page: 1, pageSize: 50 }]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await user.click(screen.getByRole('button', { name: 'Daniel' }))

    expect(
      await screen.findByRole('heading', { name: 'Histórico de territórios' })
    ).toBeInTheDocument()
    expect(history.listCalls).toEqual([{ publisherId: onDevice.id, page: 1 }])
    expect(screen.getByText('Centro - N5')).toBeInTheDocument()
    expect(screen.getByText('Retirada')).toBeInTheDocument()
    expect(screen.getByText('Devolução')).toBeInTheDocument()
    expect(screen.getByText('Situação')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Publicador' })).not.toBeInTheDocument()
    expect(screen.queryByText(/saída de campo/i)).not.toBeInTheDocument()
  })

  it('distinguishes a publisher with no assignment history from an unloaded detail', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice]
    history.pages = [{ items: [], total: 0, page: 1, pageSize: 50 }]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')

    await user.click(screen.getByRole('button', { name: 'Daniel' }))

    expect(
      await screen.findByText('Nenhum território registrado para esta pessoa.')
    ).toBeInTheDocument()
  })

  it('loads the next history page without replacing the assignments already shown', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice]
    history.pages = [
      { items: [assignmentHistory()], total: 2, page: 1, pageSize: 1 },
      {
        items: [
          assignmentHistory({
            id: 'assignment-2',
            territory: { id: 'territory-2', name: 'Jardim - N6' }
          })
        ],
        total: 2,
        page: 2,
        pageSize: 1
      }
    ]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')
    await user.click(screen.getByRole('button', { name: 'Daniel' }))
    await screen.findByText('Centro - N5')

    await user.click(screen.getByRole('button', { name: 'Carregar mais' }))

    expect(await screen.findByText('Jardim - N6')).toBeInTheDocument()
    expect(screen.getByText('Centro - N5')).toBeInTheDocument()
    expect(history.listCalls).toEqual([
      { publisherId: onDevice.id, page: 1 },
      { publisherId: onDevice.id, page: 2 }
    ])
  })

  it('keeps the selected person and the local search after a rename reloads the list', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice, awaitingCode]
    history.pages = [{ items: [assignmentHistory()], total: 1, page: 1, pageSize: 50 }]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')
    await user.type(screen.getByLabelText('Buscar publicador'), 'dan')
    await user.click(screen.getByRole('button', { name: 'Daniel' }))
    await screen.findByText('Centro - N5')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Renomear' }))
    await user.clear(screen.getByLabelText('Novo nome de Daniel'))
    await user.type(screen.getByLabelText('Novo nome de Daniel'), 'Daniel Souza')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(
      await screen.findByRole('heading', { name: 'Histórico de territórios' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Daniel Souza' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByLabelText('Buscar publicador')).toHaveValue('dan')
  })

  it('keeps the selected person after changing that person’s active state', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice]
    history.pages = [{ items: [assignmentHistory()], total: 1, page: 1, pageSize: 50 }]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')
    await user.click(screen.getByRole('button', { name: 'Daniel' }))
    await screen.findByText('Centro - N5')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Desativar' }))

    expect(
      await screen.findByRole('heading', { name: 'Histórico de territórios' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Daniel' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the selected detail visible when its history fails and retries that same publisher', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice]
    history.failure = new Error('Não foi possível buscar o histórico.')
    history.pages = [{ items: [assignmentHistory()], total: 1, page: 1, pageSize: 50 }]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')
    await user.click(screen.getByRole('button', { name: 'Daniel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível buscar o histórico.'
    )

    history.failure = null
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Centro - N5')).toBeInTheDocument()
    expect(history.listCalls).toEqual([
      { publisherId: onDevice.id, page: 1 },
      { publisherId: onDevice.id, page: 1 }
    ])
  })

  it('closes the detail and returns focus to its publisher after the close action', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice]
    history.pages = [{ items: [], total: 0, page: 1, pageSize: 50 }]

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')
    const trigger = screen.getByRole('button', { name: 'Daniel' })
    await user.click(trigger)
    await screen.findByRole('heading', { name: 'Histórico de territórios' })

    await user.click(screen.getByRole('button', { name: 'Fechar histórico de territórios' }))

    expect(
      screen.queryByRole('heading', { name: 'Histórico de territórios' })
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes the selected history when deleting that publisher', async () => {
    const user = userEvent.setup()
    const { publishers, history } = installFakeApiWithHistory()
    publishers.publishers = [onDevice]
    history.pages = [{ items: [assignmentHistory()], total: 1, page: 1, pageSize: 50 }]
    publishers.delete = async (publisherId: string) => {
      publishers.deleted.push(publisherId)
      publishers.publishers = publishers.publishers.filter(
        (publisher) => publisher.id !== publisherId
      )
    }

    render(<PublishersScreen now={now} />)
    await screen.findByTestId('publisher-row-Daniel')
    await user.click(screen.getByRole('button', { name: 'Daniel' }))
    await screen.findByText('Centro - N5')

    await openMenu(user, 'Daniel')
    await user.click(screen.getByRole('button', { name: 'Apagar Daniel' }))
    await answerConfirm(user, true)

    await screen.findByText(/Nenhum publicador cadastrado\./)
    expect(
      screen.queryByRole('heading', { name: 'Histórico de territórios' })
    ).not.toBeInTheDocument()
  })
})
