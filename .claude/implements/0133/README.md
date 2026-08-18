# [0133] Admin: cliente da API e handler da listagem geral de designações

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0008/` — Task 06

## Solicitação
> Spec 0008 — Task 06: Em `admin/src/main/api-client.ts`, adicione `listAllAssignments():
> Promise<AssignmentWithTerritory[]>` chamando `GET /admin/assignments`, no padrão dos outros
> métodos (`request()`, token, tratamento de erro), com um `parseAssignmentWithTerritory` que
> reaproveite o `parseAssignment` existente e acrescente o território (`{ id, name }`) — não
> duplique a conversão de datas. Em `admin/src/main/ipc-handlers.ts`, registre o handler de
> `IPC_CHANNELS.assignmentsListAll` via `session.run(...)`, como os demais. Em
> `admin/src/preload/index.ts`, exponha `assignments.listAll` repassando para
> `ipcRenderer.invoke`. Estenda os testes existentes (...). Valide com `npx vitest run src/main`,
> `npm run typecheck` e `npm run lint`.

## Contexto
A Task 04 (implementação 0132) criou a rota `GET /admin/assignments` no servidor e a Task 05
(implementação 0128) declarou o canal `assignments:listAll` e o método `listAll()` no
`shared/ipc-contract.ts`. Faltava o caminho que liga os dois: o método no cliente HTTP do main
process, o handler de IPC e a ponte do preload. Sem essa task, a `HistoryScreen` da Task 07 não
teria de onde tirar os dados, e o `typecheck:web` continuaria acusando o `preload/index.ts`
incompleto.

## O que foi feito
- `listAllAssignments()` no `ApiClient`, implementado como `list('/admin/assignments',
  parseAssignmentWithTerritory)` — o mesmo helper `list()` que `listAssignments` e
  `listPublishers` já usam, então token, `X-App-Key` e tratamento de erro vêm de graça do
  `request()`.
- `parseAssignmentWithTerritory` faz spread do `parseAssignment(json)` e só acrescenta
  `territory: { id, name }`; nenhuma conversão de data é repetida.
- Handler `IPC_CHANNELS.assignmentsListAll` registrado em `ipc-handlers.ts` via `session.run(...)`,
  ao lado dos outros canais de designação.
- `assignments.listAll` exposto no preload, repassando direto para `ipcRenderer.invoke`.
- Testes: caminho feliz do cliente (URL, método, território convertido e `completed_at: null`
  virando `completedAt: undefined`), um caso do handler novo (devolve o histórico e passa pela
  sessão) e o método acrescentado ao `fakeApiClient()` de `session.test.ts`.

## Arquivos modificados
- `admin/src/main/api-client.ts` — import de `AssignmentWithTerritory`, `listAllAssignments` na
  interface e na implementação, `parseAssignmentWithTerritory`
- `admin/src/main/api-client.test.ts` — caso de caminho feliz de `listAllAssignments`
- `admin/src/main/ipc-handlers.ts` — handler de `assignmentsListAll`
- `admin/src/main/ipc-handlers.test.ts` — `ASSIGNMENT_WITH_TERRITORY`, `listAllAssignments` no
  `fakeApi()` e o `describe('assignments:listAll')`
- `admin/src/main/session.test.ts` — `listAllAssignments` no `fakeApiClient()`
- `admin/src/preload/index.ts` — `assignments.listAll`

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`list()` em vez de `request()` cru**: o helper já existia justamente para "GET que devolve
  array"; usá-lo mantém `listAllAssignments` idêntico em forma a `listAssignments`.
- **Spread de `parseAssignment` em vez de reescrever os campos**: a regra de que `completed_at:
  null` vira `completedAt: undefined` (o que marca a designação aberta) vive num lugar só. Um
  segundo parser copiando os quatro campos duplicaria essa decisão.
- **Handler sem argumentos**: o escopo é a congregação do token, derivada no servidor — nada vem
  do renderer, coerente com a regra de nunca aceitar `congregation_id` do cliente.

## Como validar
`npx vitest run src/main` no `admin/`. Manualmente, com o servidor no ar, `window.api.assignments
.listAll()` no devtools do renderer devolve o histórico da congregação, mais recente primeiro.

## Resultado da validação
- `npx vitest run src/main` — 6 arquivos, **111 testes passando**.
- `npm run typecheck` — `typecheck:node` **limpo**. `typecheck:web` acusa apenas os seis fakes de
  `window.api` nos testes de tela do renderer (`App.test.tsx`, `BlockEditorScreen.test.tsx`,
  `DesignationsScreen.test.tsx` (2 ocorrências), `HomeScreen.test.tsx`, `SetupScreen.test.tsx`,
  `TerritoryEditorScreen.test.tsx`), todos com a mesma causa: falta `listAll` no fake. São das
  Tasks 07/08, fora do escopo desta task.
- `npm run lint` — 0 erros, 1 warning de prettier pré-existente em
  `admin/src/renderer/screens/TerritoryEditorScreen.tsx:103` (arquivo não tocado por esta task).
