import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'
import { SearchField } from './SearchField'
import { SegmentedControl } from './SegmentedControl'

describe('SearchField', () => {
  it('clears the term and returns focus to the input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <SearchField
        label="Buscar publicadores"
        value="Ana"
        onChange={onChange}
        placeholder="Nome do publicador"
      />
    )

    const input = screen.getByRole('searchbox', { name: 'Buscar publicadores' })
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }))

    expect(onChange).toHaveBeenCalledWith('')
    expect(input).toHaveFocus()
  })
})

describe('SegmentedControl', () => {
  it('uses radio semantics and moves selection with arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <SegmentedControl
        label="Modo de visualização"
        value="list"
        onChange={onChange}
        options={[
          { value: 'list', label: 'Lista' },
          { value: 'map', label: 'Mapa' }
        ]}
      />
    )

    const list = screen.getByRole('radio', { name: 'Lista' })
    expect(list).toHaveAttribute('aria-checked', 'true')

    list.focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledWith('map')
    expect(screen.getByRole('radio', { name: 'Mapa' })).toHaveFocus()
  })
})

describe('DataTable', () => {
  interface Row {
    readonly id: string
    readonly name: string
  }

  const columns = [
    { key: 'name', header: 'Nome', cell: (row: Row) => row.name, sortable: true },
    { key: 'id', header: 'Código', cell: (row: Row) => row.id }
  ]

  it('offers sortable semantic headers and keyboard row activation', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    const onRowActivate = vi.fn()

    render(
      <DataTable
        label="Publicadores"
        columns={columns}
        rows={[{ id: 'ana', name: 'Ana' }]}
        getRowKey={(row) => row.id}
        onSort={onSort}
        onRowActivate={onRowActivate}
        selectedRowKey="ana"
      />
    )

    await user.click(screen.getByRole('button', { name: 'Ordenar por Nome' }))
    expect(onSort).toHaveBeenCalledWith('name')
    expect(screen.getByRole('columnheader', { name: 'Nome' })).toHaveAttribute('aria-sort', 'none')

    const row = screen.getByRole('row', { name: 'Ana ana' })
    row.focus()
    await user.keyboard('{Enter}')
    expect(onRowActivate).toHaveBeenCalledWith({ id: 'ana', name: 'Ana' })
  })

  it('keeps table headers while exposing a recoverable error state', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <DataTable
        label="Histórico completo"
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        state={{ kind: 'error', message: 'Falha ao carregar.', onRetry }}
      />
    )

    expect(screen.getByRole('columnheader', { name: 'Nome' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar.')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
