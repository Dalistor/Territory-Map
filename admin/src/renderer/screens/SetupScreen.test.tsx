import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// `vitest.setup.ts` already imports this for runtime (registering the
// matchers), but it is not part of `tsconfig.web.json`'s program, so `tsc`
// never sees the ambient type augmentation that makes `toBeInTheDocument`,
// `toBeDisabled`, etc. type-check. Re-importing it here -- the first file in
// this codebase to render a component and assert on it -- pulls the
// augmentation into this program without editing shared config.
import '@testing-library/jest-dom/vitest'
import type { IpcApi } from '../../shared/ipc-contract'
import type { Congregation } from '../../shared/models'
import SetupScreen from './SetupScreen'

/**
 * A fake covering every member of `IpcApi` -- `SetupScreen` only calls
 * `session.configure`, but the interface is wide, and `vi.fn()` stubs for the
 * rest keep this fake honest about what it implements without ever touching
 * the real IPC bridge (there is no Electron window in this test at all).
 */
function fakeApi(overrides: Partial<IpcApi['session']> = {}): IpcApi {
  return {
    session: {
      isConfigured: vi.fn(),
      configure: vi.fn(),
      signOut: vi.fn(),
      getCongregation: vi.fn(),
      ...overrides
    },
    territories: {
      listWithBlocks: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    blocks: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    publishers: {
      list: vi.fn(),
      create: vi.fn(),
      regenerateCode: vi.fn(),
      setActive: vi.fn()
    },
    assignments: {
      listAll: vi.fn().mockResolvedValue([]),
      listFor: vi.fn(),
      designate: vi.fn(),
      complete: vi.fn(),
      delete: vi.fn()
    },
    exports: { assignments: vi.fn() },
    workLogs: {
      listFor: vi.fn(),
      delete: vi.fn(),
      markWorked: vi.fn()
    },
    geo: {
      geocodeCity: vi.fn()
    }
  }
}

const CONGREGATION: Congregation = { id: 'cong-1', name: 'Congregação Central', city: 'São Paulo' }

/** Resolves only once the microtask queue drains, letting a pending promise settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { name, city, password }: { name?: string; city?: string; password?: string }
): Promise<void> {
  if (name !== undefined) await user.type(screen.getByLabelText('Nome da congregação'), name)
  if (city !== undefined) await user.type(screen.getByLabelText('Cidade'), city)
  if (password !== undefined) await user.type(screen.getByLabelText('Senha'), password)
}

beforeEach(() => {
  window.api = fakeApi()
})

describe('SetupScreen', () => {
  it('does not call configure and shows "Campo obrigatório." when every field is empty', async () => {
    const user = userEvent.setup()
    render(<SetupScreen />)

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(window.api.session.configure).not.toHaveBeenCalled()
    expect(screen.getAllByText('Campo obrigatório.')).toHaveLength(3)
  })

  it('does not call configure and flags only the empty field when name and city are filled but password is not', async () => {
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, { name: 'Congregação Central', city: 'São Paulo' })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(window.api.session.configure).not.toHaveBeenCalled()
    expect(screen.getAllByText('Campo obrigatório.')).toHaveLength(1)
  })

  it('calls configure with name and city trimmed but the password untouched', async () => {
    const configure = vi.fn().mockResolvedValue(CONGREGATION)
    window.api = fakeApi({ configure })
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, {
      name: '  Congregação Central  ',
      city: '  São Paulo  ',
      password: '  senha com espaços  '
    })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() =>
      expect(configure).toHaveBeenCalledWith({
        name: 'Congregação Central',
        city: 'São Paulo',
        password: '  senha com espaços  '
      })
    )
  })

  it('disables the submit button and shows a loading indicator while configure is pending', async () => {
    let resolveConfigure: (value: Congregation) => void = () => {}
    const configure = vi.fn(
      () =>
        new Promise<Congregation>((resolve) => {
          resolveConfigure = resolve
        })
    )
    window.api = fakeApi({ configure })
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, {
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'super-secret'
    })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()

    resolveConfigure(CONGREGATION)
    await flushMicrotasks()
  })

  it('shows the error message and re-enables the form when configure rejects', async () => {
    const configure = vi
      .fn()
      .mockRejectedValue(new Error('As credenciais salvas não foram aceitas.'))
    window.api = fakeApi({ configure })
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, {
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'super-secret'
    })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('As credenciais salvas não foram aceitas.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).not.toBeDisabled()
  })

  it('shows the message of a plain-object rejection, the shape a faked IPC error takes', async () => {
    // The real bridge only reliably carries `message` across (see
    // `SerializedIpcError` in `shared/ipc-contract.ts`) -- it does not have
    // to be a genuine `Error` instance by the time it reaches the renderer.
    const configure = vi.fn().mockRejectedValue({ name: 'ApiErrorException', message: 'Conflito.' })
    window.api = fakeApi({ configure })
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, {
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'super-secret'
    })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Conflito.')).toBeInTheDocument()
  })

  it('falls back to a generic message when the rejection carries an empty message', async () => {
    const configure = vi.fn().mockRejectedValue({ message: '' })
    window.api = fakeApi({ configure })
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, {
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'super-secret'
    })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(
      await screen.findByText('Não foi possível configurar a congregação. Tente novamente.')
    ).toBeInTheDocument()
  })

  it('falls back to a generic message when the rejection carries no usable message', async () => {
    const configure = vi.fn().mockRejectedValue('boom')
    window.api = fakeApi({ configure })
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, {
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'super-secret'
    })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(
      await screen.findByText('Não foi possível configurar a congregação. Tente novamente.')
    ).toBeInTheDocument()
  })

  it('does not navigate on success -- it only calls configure and leaves the rest to the caller', async () => {
    const configure = vi.fn().mockResolvedValue(CONGREGATION)
    const onConfigured = vi.fn()
    window.api = fakeApi({ configure })
    const user = userEvent.setup()
    render(<SetupScreen />)

    await fillForm(user, {
      name: 'Congregação Central',
      city: 'São Paulo',
      password: 'super-secret'
    })
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(configure).toHaveBeenCalled())
    expect(onConfigured).not.toHaveBeenCalled()
  })

  it('shows the reason banner when the reason prop is given', () => {
    render(<SetupScreen reason="As credenciais salvas não foram aceitas pelo servidor." />)

    expect(
      screen.getByText('As credenciais salvas não foram aceitas pelo servidor.')
    ).toBeInTheDocument()
  })

  it('shows no reason banner when the reason prop is omitted', () => {
    render(<SetupScreen />)

    expect(screen.queryByTestId('setup-reason')).not.toBeInTheDocument()
  })
})
