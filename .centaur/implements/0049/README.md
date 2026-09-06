# [0049] IPC do admin Electron: handlers, preload e janela principal

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0003/` — Task 07

## Solicitação

Criar `admin/src/shared/ipc-contract.ts` descrevendo em um único lugar o nome de cada canal IPC e a
assinatura das operações de sessão, territórios, quadras, publicadores e histórico de trabalho.
Criar `admin/src/main/ipc-handlers.ts` registrando um `ipcMain.handle` por canal, cada um chamando
`session.run(...)` com a operação correspondente do `api-client`, com `territories:listWithBlocks`
fazendo o fan-out (listar territórios + buscar detalhe de cada um). Qualquer erro lançado precisa
chegar ao renderer de um jeito que ele consiga distinguir o tipo, serializado para
`{name, message, code?, statusCode?}`. Criar `admin/src/preload/index.ts` expondo `window.api` via
`contextBridge`, 1:1 com o contrato. Reescrever `admin/src/main/index.ts`: ciclo de vida do Electron,
janela com `contextIsolation: true`/`nodeIntegration: false`/`sandbox: true`, carregando
`API_BASE_URL`/`APP_KEY` de `admin/.env` via `dotenv` para construir o `api-client` e o
`credentials-store` reais que alimentam a `session`.

## Contexto

Esta é a Task 07 da spec 0003 (migração do admin de Flutter para Electron). As tasks 01–06 já
entregaram, testadas: o esqueleto Electron, `shared/geo.ts`, `shared/models.ts`/`api-errors.ts`,
`main/api-client.ts`, `main/credentials-store.ts` e `main/session.ts`. Esta task é a fiação que
conecta essas peças ao processo principal do Electron e ao mundo do renderer via IPC — sem regra de
negócio nova. É pré-requisito para as Tasks 12–18 (as telas), que vão consumir `window.api`.

## O que foi feito

- `shared/ipc-contract.ts`: define `IPC_CHANNELS` (um `const` por canal, os 15 pedidos +
  `session:isConfigured`/`configure`/`signOut`), os tipos de entrada (`TerritoryCreateInput`,
  `TerritoryUpdateInput`, `BlockCreateInput`, `BlockUpdateInput`, `SessionCredentials` — este último
  redeclarado em vez de importado de `main/credentials-store.ts`, porque `shared/` não pode depender
  de `main/`), `SerializedIpcError` (o formato plano que sobrevive à borda do IPC), e a interface
  `IpcApi` que descreve `window.api` por completo, agrupada por namespace
  (`session`/`territories`/`blocks`/`publishers`/`workLogs`).
- `main/ipc-handlers.ts`: uma função `handle(channel, fn)` que registra `ipcMain.handle` e envolve
  `fn` num try/catch — qualquer erro lançado é reduzido por `serializeError` ao formato
  `SerializedIpcError` e relançado como `new Error(JSON.stringify(serialized))`. `registerIpcHandlers
  ({session, api})` registra os 15 canais de operação de domínio chamando `session.run(...)` com a
  operação correspondente do `api-client`, mais os 3 canais de sessão chamando `session.isConfigured/
  configure/signOut` diretamente (sem passar por `run`, já que são os próprios métodos que
  autenticam). `territories:listWithBlocks` lista territórios e busca o detalhe de cada um com
  `Promise.all`, reproduzindo o fan-out do antigo `ApiTerritoryRepository.listWithBlocks`.
- `preload/index.ts`: reescrito para implementar `IpcApi` chamando `ipcRenderer.invoke(canal, ...)`
  por método, exposto como `window.api` via `contextBridge.exposeInMainWorld` quando
  `contextIsolated` (mantido o fallback pré-existente para quando não está isolado, e `window.electron`
  continua exposto como antes).
- `preload/index.d.ts`: `window.api` deixou de ser tipado como `unknown` e passou a ser `IpcApi`
  (import de `shared/ipc-contract.ts`) — necessário para que "a forma de `window.api` bate 1:1 com o
  contrato" seja verificável pelo compilador, não só por convenção. É um arquivo companheiro do
  preload (mesma pasta, mesmo propósito de tipagem), fora da lista literal de arquivos da task, mas
  sem ele `window.api` continuaria `unknown` e a garantia de tipo pedida pela task não existiria.
- `main/index.ts`: reescrito. Carrega `admin/.env` com `dotenv` usando um caminho calculado a partir
  de `__dirname` (`<admin>/out/main` tanto em dev quanto em produção, porque o electron-vite sempre
  empacota o processo principal em `out/`), falha cedo com uma mensagem clara se `API_BASE_URL` ou
  `APP_KEY` estiverem vazios (mesmo espírito do antigo gate de build do Flutter/dart-define), constrói
  o `api-client` real, o `credentials-store` real (`safeStorage` do Electron +
  `app.getPath('userData')`) e a `session`, chama `registerIpcHandlers` antes de abrir a janela, e cria
  a `BrowserWindow` com `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (compatível
  com o preload, que só usa `contextBridge`/`ipcRenderer` e o `electronAPI` do
  `@electron-toolkit/preload`, ambos sandbox-safe). Resto do ciclo de vida (criação da janela,
  `activate`, `window-all-closed`) preservado do scaffold gerado pela Task 01.
- Adicionada a dependência `dotenv` (`^17.4.2`) a `admin/package.json`, e `npm install` executado.

## Arquivos modificados

- `admin/src/main/index.ts` — reescrito: monta `api-client`/`credentials-store`/`session` reais,
  registra os handlers de IPC, cria a janela com `contextIsolation`/`sandbox`.
- `admin/src/preload/index.ts` — reescrito: implementa `IpcApi` sobre `ipcRenderer.invoke`.
- `admin/src/preload/index.d.ts` — `window.api` tipado como `IpcApi` em vez de `unknown`.
- `admin/package.json` — dependência `dotenv` adicionada.
- `admin/package-lock.json` — atualizado por `npm install`.

## Arquivos criados

- `admin/src/shared/ipc-contract.ts` — canais, tipos de entrada, `SerializedIpcError` e a interface
  `IpcApi` que é o contrato entre `main/ipc-handlers.ts` e `preload/index.ts`.
- `admin/src/main/ipc-handlers.ts` — um `ipcMain.handle` por canal, com serialização de erro na
  borda.

## Decisões técnicas

- **Erro serializado como JSON dentro de `message`, não como objeto direto.** O `ipcMain.handle` do
  Electron só relaia a `message` de um `Error` lançado através da borda — subclasse e campos extras
  (`code`, `statusCode`) não sobrevivem. Para não depender de comportamento não documentado/instável
  entre versões do Electron, o handler serializa o erro para `SerializedIpcError` e o codifica como
  JSON dentro da `message` de um novo `Error`. Quem consumir o erro do lado do renderer (fora do
  escopo desta task) faz `JSON.parse(error.message)` para recuperar `name`/`code`/`statusCode`.
- **`SessionCredentials` redeclarado em `shared/`, não importado de `main/credentials-store.ts`.**
  A direção de dependência é `main`/`preload` → `shared`, nunca o inverso; `shared/` não pode importar
  de `main/`.
- **Canais de sessão (`isConfigured`/`configure`/`signOut`) não passam por `session.run(...)`.** Eles
  *são* os métodos que autenticam — `run` existe para envolver uma ação já autenticada com retry
  silencioso, não faria sentido a sessão se autenticar através de si mesma.
- **`sandbox: true` no `webPreferences`.** O preload só usa `contextBridge`, `ipcRenderer` e o
  `electronAPI` do `@electron-toolkit/preload` (biblioteca desenhada para funcionar sandboxed) — nada
  de Node direto —, então não há razão para abrir mão do sandbox, que é a proteção mais forte
  disponível.
- **`.env` localizado via `__dirname`, não via `process.cwd()`.** O comportamento padrão do `dotenv`
  busca `.env` no diretório de trabalho do processo, que é imprevisível uma vez empacotado. Como o
  electron-vite sempre compila o processo principal para `<admin>/out/main/index.js` (tanto em `dev`
  quanto em `build`), o caminho relativo `../../.env` a partir de `__dirname` chega em `admin/.env` de
  forma estável nos dois modos.
- **Falha cedo se `API_BASE_URL`/`APP_KEY` estiverem vazios.** Mesmo princípio do antigo gate de build
  do admin Flutter (dart-define vazio falhava o build): um app que sobe silenciosamente e toma 401 em
  toda chamada é pior do que um app que não sobe e diz o que fazer.

## Como validar

```bash
cd admin
npm install
npm run typecheck   # tsc --noEmit em node e web
npm run lint         # eslint (inclui prettier)
npm run build        # electron-vite build (main, preload, renderer)
npm test             # vitest — nenhum teste novo exigido por esta task, mas os existentes não podem quebrar
```

Para rodar de verdade: copiar `admin/.env.example` para `admin/.env`, preencher `API_BASE_URL` e
`APP_KEY`, e `npm run dev` deve abrir a janela sem lançar o erro de env ausente.

## Resultado da validação

- `npm install` — ok (dependência `dotenv` instalada, `postinstall`/`electron-builder
  install-app-deps` rodou sem erro).
- `npm run typecheck` — sem erros (node e web).
- `npm run lint` — sem erros nem warnings (dois warnings de formatação do Prettier em
  `ipc-handlers.ts` corrigidos com `prettier --write` antes do relatório final).
- `npm run build` — `electron-vite build` gerou `out/main/index.js`, `out/preload/index.js` e
  `out/renderer/*` sem erro.
- `npm test` — 9 arquivos de teste, 148 testes, todos passando (nenhuma regressão nos testes das
  Tasks 01–06/08–11 já implementadas).
- Revisão manual: `ipc-handlers.ts` cobre os 15 canais de operação + 3 de sessão listados na task;
  `preload/index.ts` implementa `IpcApi` por completo (checado pelo `tsc`, que reclamaria de qualquer
  método faltando ou de assinatura divergente); `main/index.ts` não contém regra de negócio, só
  montagem de dependências e ciclo de vida do Electron.
- Revisão de camadas: `shared/ipc-contract.ts` não importa de `main/`, `preload/` nem `renderer/`;
  `main/ipc-handlers.ts` só delega para `session`/`api-client`, sem lógica de domínio; `preload/
  index.ts` não importa nada além de `electron` e `shared/`; `renderer/` não foi tocado.
