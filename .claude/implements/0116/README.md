# [0116] Admin/Shared: modelo `Assignment` e contrato IPC das designações e da exportação

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0007/` — Task 08

## Solicitação
> Spec 0007 — Task 08: Em `admin/src/shared/models.ts`, adicione a interface `Assignment`:
> `id`, `publisher: PublisherBrief`, `startedAt: Date`, `completedAt?: Date` — com comentário
> curto dizendo que `completedAt` ausente significa designação **aberta**. Adicione também a
> função pura `assignmentIsOpen(assignment)`, no estilo dos predicados que já existem
> (`publisherIsPending`, `blockWasNeverWorked`), e teste-a em `models.test.ts`. Em
> `ipc-contract.ts`, acrescente em `IPC_CHANNELS` os canais `assignmentsListFor`,
> `assignmentsDesignate`, `assignmentsComplete`, `assignmentsDelete` e `exportAssignments`; e em
> `IpcApi` os namespaces `assignments` e `exports`. Remova de `IpcApi.territories` o método
> `assign` e o canal `territoriesAssign`. `Territory.assignedUser` permanece.

## Contexto
A spec 0007 transforma a designação de território em **registro histórico** (estilo cartão S-13):
cada designação tem data de início e, quando encerrada, data de conclusão. O `shared/` do admin é
a fonte única dos tipos vistos por `main`, `preload` e `renderer`, então ele precisa conhecer a
entidade e os canais novos antes das Tasks 09 (main/preload), 10 (exportação) e 11 (renderer).

## O que foi feito
- `Assignment` em `shared/models.ts`, com o comentário explicando que `completedAt` ausente é a
  designação **aberta** — a única que dá ao publicador o direito de marcar quadras.
- `assignmentIsOpen(assignment)`, predicado puro, testado nos dois casos.
- Cinco canais novos em `IPC_CHANNELS` e dois namespaces novos em `IpcApi` (`assignments`,
  `exports`).
- `territoriesAssign` e `IpcApi.territories.assign` removidos — a designação passa a viver no
  namespace novo.

## Arquivos modificados
- `admin/src/shared/models.ts` — interface `Assignment` e predicado `assignmentIsOpen`
- `admin/src/shared/models.test.ts` — helper `makeAssignment` e o `describe('assignmentIsOpen')`
- `admin/src/shared/ipc-contract.ts` — canais e namespaces novos; `territoriesAssign`/`assign` fora

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`assignmentIsOpen` compara com `undefined` e `null`**, exatamente como
  `blockWasNeverWorked`/`publisherIsPending` já faziam: o JSON do servidor entrega `null`, não
  ausência de chave, e o predicado é chamado sobre dados que passaram pelo IPC.
- **`Territory.assignedUser` permanece**, conforme a spec: é a projeção da designação aberta, e o
  mapa/lista continuam lendo dela sem precisar buscar o histórico.
- **`exports.assignments()` devolve `string | null`** — o caminho salvo, ou `null` quando o admin
  cancelou o diálogo de salvar. Documentado no próprio contrato para que o renderer não trate
  cancelamento como erro.

## Como validar
```bash
cd admin && npx vitest run src/shared
```

## Resultado da validação
- `npx vitest run src/shared` — 5 arquivos, 74 testes, todos passando.
- `npm run typecheck` — **falha esperada e prevista pela spec**: a remoção de `territories.assign`
  quebra a compilação até as Tasks 09 e 11. Pontos acusados:
  - Task 09 (`typecheck:node`): `src/main/ipc-handlers.ts:103` (`IPC_CHANNELS.territoriesAssign`),
    `src/preload/index.ts:35-36` (`territories.assign` e o canal).
  - Task 11 (`typecheck:web`): `src/renderer/screens/DesignationsScreen.tsx` (1),
    `App.test.tsx` (13), `HomeScreen.test.tsx` (20), `DesignationsScreen.test.tsx` (10),
    `BlockEditorScreen.test.tsx` (1), `SetupScreen.test.tsx` (1),
    `TerritoryEditorScreen.test.tsx` (1) — todos o `assign` do fake de `window.api`.
- `npm run lint` — 0 erros; o único warning (`TerritoryEditorScreen.tsx:103`, prettier) é
  pré-existente e está fora dos arquivos tocados.
