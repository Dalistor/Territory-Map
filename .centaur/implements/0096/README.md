# [0096] Admin: cliente da API e handler IPC de designação de território

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0005/` — Task 14

## Solicitação
Spec 0005 — Task 14: em `admin/src/main/api-client.ts`, adicionar o método que chama
`PATCH /admin/territories/{territoryId}/assignment` com corpo `{"user_id": userId}`, seguindo
exatamente o padrão dos outros métodos de escrita já existentes no arquivo. Em
`admin/src/main/ipc-handlers.ts`, registrar o handler para `IPC_CHANNELS.territoriesAssign`,
chamando esse método do cliente. Em `admin/src/preload/index.ts` e `admin/src/preload/index.d.ts`,
implementar `territories.assign` repassando para `ipcRenderer.invoke`, mesmo padrão dos demais
métodos de `territories`. `IPC_CHANNELS.territoriesAssign` e `IpcApi.territories.assign` já
existiam (Task 13, implementação 0093), assim como `Territory.assignedUser` (também na 0093).

## Contexto
A Task 13 já havia dado forma ao contrato (`shared/ipc-contract.ts`, `shared/models.ts`) e o
servidor já expõe `PATCH /admin/territories/{id}/assignment` desde a Task 08 (implementação 0091),
inclusive já devolvendo `assigned_user` em todo `TerritoryOut`. Faltava ligar o fio: o `main`
process falando com esse endpoint de verdade e o `preload` repassando a chamada do renderer para
o `ipcMain`. A tela que usa isso (Task 15) ainda não existe — só o transporte.

## O que foi feito
- `admin/src/main/api-client.ts`: adicionado `assignTerritory(territoryId, userId)` à interface
  `ApiClient` e à implementação de `createApiClient`, fazendo `PATCH
  /admin/territories/{territoryId}/assignment` com corpo `{ user_id: userId }` — mesmo formato de
  `request()`/tratamento de erro/anexação de token que `updateTerritory`/`deleteTerritory` já usam.
  Também ajustado `parseTerritory()` para ler `assigned_user` do JSON e popular
  `Territory.assignedUser` (via `parsePublisherBrief`, já existente) — sem isso, `assignTerritory`
  devolveria um território sempre com `assignedUser: undefined`, e o mesmo problema afetaria
  `listTerritories`/`getTerritory`/`createTerritory`/`updateTerritory`, que também passam pela
  mesma função de parse e cujo JSON de resposta já carrega esse campo desde a implementação 0091.
- `admin/src/main/ipc-handlers.ts`: registrado `handle(IPC_CHANNELS.territoriesAssign, (territoryId,
  userId) => session.run(() => api.assignTerritory(territoryId, userId)))`, ao lado dos outros
  handlers de `territories`.
- `admin/src/preload/index.ts`: adicionado `territories.assign(territoryId, userId)` repassando
  para `ipcRenderer.invoke(IPC_CHANNELS.territoriesAssign, territoryId, userId)`.
- `admin/src/preload/index.d.ts`: nenhuma mudança necessária — o arquivo só declara `Window.api:
  IpcApi`, e `IpcApi.territories.assign` já existia desde a Task 13 (implementação 0093); o
  type-check volta a fechar porque `IpcApi` (a interface) já cobria o método, faltava só a
  implementação em `preload/index.ts`.
- `admin/src/main/session.test.ts`: o fake `fakeApiClient()`, que cobre todo membro de `ApiClient`
  para os testes de `session.ts`, ganhou `assignTerritory: vi.fn()` — sem isso o type-check do
  arquivo quebrava, já que a interface `ApiClient` passou a exigir o método.
- `admin/src/main/api-client.test.ts`: testes novos para `assignTerritory` (PATCH correto, corpo
  `{user_id}`, `null` remove a designação, território devolvido reflete `assignedUser`) e dois
  testes para o parse de `assigned_user` em `parseTerritory` (presente e ausente).

## Arquivos modificados
- `admin/src/main/api-client.ts` — método `assignTerritory`, parse de `assigned_user` em
  `parseTerritory`
- `admin/src/main/ipc-handlers.ts` — handler do canal `territoriesAssign`
- `admin/src/preload/index.ts` — `territories.assign` repassando para `ipcRenderer.invoke`
- `admin/src/main/session.test.ts` — `assignTerritory: vi.fn()` no fake de `ApiClient`
- `admin/src/main/api-client.test.ts` — testes do novo método e do parse de `assigned_user`

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`parseTerritory` passou a ler `assigned_user`, apesar de a instrução da task não citar essa
  função nominalmente.** A instrução pede "seguindo exatamente o padrão dos outros métodos de
  escrita" — o padrão de todo método de escrita do arquivo é devolver o território via
  `parseTerritory`. Sem esse ajuste, `assignTerritory` sempre devolveria `assignedUser: undefined`
  mesmo depois de designar alguém, o que contradiz o próprio propósito do método. A mudança fica
  dentro do único arquivo (`api-client.ts`) que a task já autoriza tocar.
- **Nome do método: `assignTerritory`, não `assign`.** A interface `ApiClient` já nomeia os outros
  métodos de território com o prefixo (`createTerritory`, `updateTerritory`, `deleteTerritory`);
  `assign` sozinho colidiria em legibilidade com `IpcApi.territories.assign` (que já é `assign` só
  porque mora dentro do namespace `territories`) — `api-client.ts` não tem esse namespace, é uma
  lista plana de métodos.
- **`preload/index.d.ts` não mudou.** Esse arquivo só declara `Window.api: IpcApi` importando o
  tipo de `shared/ipc-contract.ts`; não enumera métodos individualmente, então nada havia para
  adicionar ali — a Task 13 já havia coberto isso ao acrescentar `assign` à interface `IpcApi`.
- **Renderer não foi tocado**, por instrução explícita da task (isso é a Task 15). Isso inclui não
  atualizar os fakes de `ApiClient`/`IpcApi.territories` usados por `App.test.tsx`,
  `HomeScreen.test.tsx`, `SetupScreen.test.tsx`, `TerritoryEditorScreen.test.tsx` e
  `BlockEditorScreen.test.tsx` — esses arquivos já falhavam no type-check antes desta
  implementação (a Task 13/implementação 0093 tornou `assign` obrigatório em `IpcApi.territories`
  sem implementá-lo em nenhum fake do renderer), e a Task 15 é quem os corrige ao implementar a
  tela de verdade.

## Como validar
```bash
cd admin
npx vitest run src/main/api-client.test.ts src/main/session.test.ts
npx tsc --noEmit -p tsconfig.node.json --composite false
npx eslint src/main/api-client.ts src/main/ipc-handlers.ts src/preload/index.ts src/main/session.test.ts src/main/api-client.test.ts
```

## Resultado da validação
- `npx vitest run src/main/api-client.test.ts`: 47 testes passando.
- `npx vitest run src/main/session.test.ts src/main/api-client.test.ts`: 64 testes passando.
- `npx tsc --noEmit -p tsconfig.node.json --composite false`: sem erros (cobre `main/` e
  `preload/`, os quatro arquivos desta task).
- `npx eslint` nos arquivos modificados: sem erros nem warnings.
- `npx tsc --noEmit -p tsconfig.web.json --composite false` (renderer): erros pré-existentes em
  `App.test.tsx`, `HomeScreen.test.tsx`, `SetupScreen.test.tsx`, `TerritoryEditorScreen.test.tsx` e
  `BlockEditorScreen.test.tsx`, todos por fakes de `IpcApi.territories`/`ApiClient` sem o método
  `assign`/`assignTerritory` — confirmado com `git stash` que esses erros já existiam antes desta
  implementação (herdados da Task 13/implementação 0093) e continuam idênticos depois dela; fora do
  escopo desta task, que proíbe tocar o renderer. Ficam para a Task 15.
