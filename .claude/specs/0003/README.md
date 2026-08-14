# [0003] Migrar o admin de Flutter desktop para Electron + React + TypeScript + Leaflet

**Data:** 2026-08-08
**Status:** Concluída
**Solicitação original:** "Vamos transferir o admin para electron, o build aqui para electron funciona eu já gerei o neurosystems (outro projeto) assim" — decisão tomada porque a máquina de desenvolvimento não tem o Xcode completo (só Command Line Tools) e não compila `flutter build macos` localmente. O dono do projeto desistiu de compilar via GitHub Actions ("compilação no git eu desisti disso, vamos compilar local mesmo") e quer builds locais com `electron-builder`, como já fez em outro projeto.

## Objetivo

Ao final desta spec, `admin/` deixa de ser um projeto Flutter e passa a ser um app Electron completo
— main process + preload + renderer React/TypeScript — com **toda** a funcionalidade que o admin
Flutter já tinha (configuração inicial, sessão com reautenticação silenciosa, mapa OSM com
territórios/quadras, editor de polígono com desfazer, cadastro de quadra e numeração, publicadores e
código de acesso, histórico de trabalho, sair da congregação, apagar quadra/território), testada, e
compilável localmente para pelo menos macOS via `electron-builder`. O `admin/` Flutter antigo é
removido. `packages/core` (Dart) e o CI do servidor/`packages/core` não são tocados — continuam
existindo para o futuro app Android. O `CLAUDE.md` reflete a nova stack ao final.

## Contexto técnico

**Por que isto está acontecendo:** `flutter build macos` exige o Xcode completo; esta máquina só tem
as Command Line Tools. O caminho documentado no CLAUDE.md era adicionar `macos-latest` à matriz do
CI, mas o dono do projeto decidiu abandonar build via CI (Windows e Linux inclusive) e compilar tudo
localmente, usando Electron — stack que ele já compila localmente com sucesso em outro projeto
("neurosystems"). Isto reverte a decisão documentada em CLAUDE.md ("Flutter também no admin, em vez
de Electron"); a Task 20 atualiza essa documentação.

**Decisões já tomadas (não reabrir):**
- **Armazenamento seguro**: `safeStorage` nativo do Electron (criptografa com o keychain do SO), não
  `keytar` — evita reintroduzir dependência de módulo nativo compilado.
- **Arquitetura de processo**: o **main process** fala com a API (login, token, todas as chamadas
  HTTP); o **renderer** (React) nunca vê a senha nem o token — só chama `window.api.*` via
  `contextBridge`, com `contextIsolation: true` e `nodeIntegration: false`. Isso é o que preserva o
  argumento de segurança que o CLAUDE.md já usava contra Electron.
- **Editor de mapa**: Leaflet + **Leaflet-Geoman** (não Leaflet.draw) para desenhar/editar polígono —
  suporta arrastar vértice, arrastar ponto intermediário para inserir, remover vértice.
- **Build**: sem CI por enquanto. `admin/lib/**` (Flutter) é apagado; `admin-release.yml` é removido.
  Build é só `electron-builder` local, documentado no README novo. `packages/core` e os workflows
  `server.yml`/`core.yml` **não são tocados**.

**O que o admin Flutter já faz hoje (mapeado por leitura de código, é o comportamento a replicar):**
- `admin/lib/data/session.dart` — `Session.run()` faz login se ainda não autenticado; se a ação falha
  com 401, marca como deslogado, faz login de novo e repete a ação **uma vez**; se essa segunda
  tentativa falhar com 401, ou se não houver credenciais salvas, lança `CredentialsRejectedException`
  (mensagem própria) em vez do erro cru. Uma falha de sign-in por outro motivo (ex.: rede) propaga
  como está.
- `admin/lib/data/credentials_store.dart` — grava/lê/limpa `{name, city, password}`; leitura parcial
  (algum campo faltando) conta como "não configurado".
- `packages/core/lib/api/api_client.dart` — todo request carrega `X-App-Key`; erro do servidor com
  `{code, detail}` vira exceção tipada com esses campos; `{detail: string}` sem `code` vira exceção
  com um `code` derivado do status (401→`unauthorized`, 403→`forbidden`, 404→`not_found`,
  409→`conflict`, 429→`rate_limit_exceeded`, senão `error`); `{detail: [...]}` (lista, formato do 422
  nativo do FastAPI) vira `invalid_request`; corpo que não é JSON, ou falha de rede, vira
  `NetworkException`.
- `packages/core/lib/geo/lat_lng.dart` — `validateRing` checa, nesta ordem: coordenada fora do globo
  → `offGlobe`; depois de abrir o anel (remover o ponto de fechamento se repetir o primeiro) e colapsar
  pontos consecutivos duplicados, menos de 3 pontos distintos → `tooFewPoints`; aresta não-adjacente
  cruzando outra (incluindo sobreposição colinear) → `selfIntersecting`. `ringToJson` sempre envia o
  anel aberto.
- `admin/lib/presentation/map/polygon_editor.dart` — `PolygonEditorController`: cada mutação
  (adicionar ponto, iniciar arraste, long-press de remoção, limpar) tira um snapshot **antes** de
  mutar, para desfazer; pilha limitada a 50; `undo()` restaura o último snapshot.
- `admin/lib/presentation/map/territory_map.dart` — cor da quadra: nunca trabalhada → vermelho/erro;
  trabalhada há mais de 120 dias (`since > overdueAfter`, estritamente maior) → laranja; senão →
  verde.
- As seis telas (`setup_screen.dart`, `home_screen.dart`, `territory_editor_screen.dart`,
  `block_editor_screen.dart`, `publishers_screen.dart`, `block_history_sheet.dart`) e `main.dart`
  (`_Root`/`_Authenticated`) — os comportamentos observáveis de cada uma estão descritos na task
  correspondente abaixo.

**Convenções para o projeto novo:**
- TypeScript estrito em `main`, `preload`, `renderer` e `shared`.
- Testes com **Vitest** (+ **React Testing Library** para componentes), arquivos co-localizados
  `*.test.ts`/`*.test.tsx` — convenção diferente do `test/` espelhado usado pelo servidor e pelo
  Flutter antigo, mas é o padrão do ecossistema TS/Vitest; documentar isso na Task 20.
- `electron`, `safeStorage`, `app.getPath`, `fetch` global e o módulo `electron` inteiro são mockados
  nos testes — nenhum teste sobe uma janela Electron real.
- Estrutura de pastas: `admin/src/{main,preload,renderer,shared}/`.
- `API_BASE_URL` e `APP_KEY` (equivalentes aos antigos `--dart-define`) chegam ao main process via
  `.env` (carregado com `dotenv`), nunca hardcoded; `.env.example` documenta as chaves.

## Tasks

### Task 01 — Scaffold do projeto Electron e remoção do admin Flutter

**Objetivo:** `admin/` deixa de ser um projeto Flutter e vira o esqueleto de um projeto Electron +
Vite + React + TypeScript, pronto para receber código nas tasks seguintes.
**Camadas:** Build/Config
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0003 — Task 01: Apague todo o conteúdo Flutter de `admin/` (`lib/`, `test/`, `pubspec.yaml`,
> `pubspec.lock`, `analysis_options.yaml`, `linux/`, `windows/`, `web/`, e qualquer outro artefato
> específico de Flutter). Delete também `.github/workflows/admin-release.yml` — ele só sabe compilar
> Flutter e não há substituto por CI nesta spec (build é local). Não toque em `.github/workflows/
> server.yml` nem `.github/workflows/core.yml`, nem em nada dentro de `packages/core/` ou `server/`.
> Em seguida, crie o esqueleto do projeto Electron em `admin/` usando `electron-vite` com template
> React + TypeScript: `admin/package.json` (scripts `dev`, `build`, `test`, `lint`), configuração do
> Vite/electron-vite, `admin/tsconfig.json` com modo estrito, ESLint com `typescript-eslint`
> recomendado e o plugin de React, Vitest configurado (ambiente `jsdom` para testes de componente).
> Crie as pastas vazias `admin/src/main/`, `admin/src/preload/`, `admin/src/renderer/`,
> `admin/src/shared/` (cada uma com um arquivo mínimo, ex. um `index.ts`/`main.tsx` "hello world",
> só para o projeto compilar e os testes rodarem — as tasks seguintes substituem esse conteúdo).
> Adicione `admin/.env.example` documentando `API_BASE_URL` e `APP_KEY`, e `admin/.gitignore` cobrindo
> `node_modules/`, `dist/`, `out/`, `.env`. Não escreva nenhuma lógica de negócio, tela ou chamada de
> API — isto é só o esqueleto. Confirme ao final que `npm install`, `npm run build` e `npm test` (mesmo
> que sem testes reais ainda) rodam sem erro dentro de `admin/`.

---

### Task 02 — Domínio compartilhado: geometria (`shared/geo.ts`)

**Objetivo:** Portar `packages/core/lib/geo/lat_lng.dart` para TypeScript — o tipo `LatLng`, a
validação de anel de polígono e a conversão de/para o formato da API.
**Camadas:** Shared
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0003 — Task 02: Implemente por TDD `admin/src/shared/geo.ts` (+ `geo.test.ts`), portando o
> comportamento de `packages/core/lib/geo/lat_lng.dart` para TypeScript. Represente um ponto como
> `{ readonly lat: number; readonly lng: number }` (sem classe, é um DTO). Critérios de aceite:
> - `isOnGlobe(point)`: verdadeiro sse `lat` está em `[-90, 90]` e `lng` em `[-180, 180]`.
> - `pointsEqual(a, b)`: igualdade por valor de `lat`/`lng`.
> - `ringToJson(ring)`: abre o anel (remove o último ponto se ele repetir o primeiro) e retorna a
>   lista de `{lat, lng}` — a API recebe o anel sempre aberto.
> - `ringFromJson(json)`: lê uma lista de `{lat, lng}` da API.
> - `toGeoJson(point)` / `fromGeoJson(position)`: conversão para/de `[lng, lat]` (ordem GeoJSON,
>   invertida).
> - `validateRing(ring)`: lança um erro tipado (`InvalidPolygonError` com uma propriedade `problem`
>   de tipo `'offGlobe' | 'tooFewPoints' | 'selfIntersecting'` e uma `message` em português) nesta
>   ordem de checagem: (1) qualquer ponto fora do globo → `offGlobe`; (2) depois de abrir o anel e
>   colapsar pontos consecutivos duplicados (um ponto repetido é uma aresta de comprimento zero — deve
>   ser removido antes de checar cruzamento, e o colapso pode expor uma nova duplicata no fechamento,
>   que também deve cair), menos de 3 pontos **distintos** → `tooFewPoints`; (3) alguma aresta
>   não-adjacente cruza outra aresta (adjacência inclui a primeira e a última aresta, que se tocam
>   quando o anel fecha; sobreposição colinear entre arestas não-adjacentes também conta como
>   cruzamento) → `selfIntersecting`. As mensagens em português, uma por problema, devem existir (não
>   precisam ser idênticas letra a letra ao Dart, mas devem ser claras para o admin).
> - `isValidRing(ring)`: `true`/`false` sem lançar, usando `validateRing` por baixo.
> Cubra em teste: ponto fora do globo, menos de 3 pontos após abrir/colapsar, anel com aresta
> cruzando outra, anel com pontos colineares sobrepostos (deve contar como cruzamento), anel válido de
> 3 e de 5+ pontos, anel fechado (primeiro==último) sendo tratado igual ao aberto, `ringToJson` de um
> anel fechado abrindo corretamente. Toque apenas em `admin/src/shared/geo.ts` e seu teste; não crie
> nenhum outro arquivo.

---

### Task 03 — Domínio compartilhado: modelos e exceções de API (`shared/models.ts`, `shared/api-errors.ts`)

**Objetivo:** Os tipos de dados que a API devolve (Congregation, Publisher, Territory, Block,
WorkLog, AdminSession), suas funções derivadas com regra própria, e a hierarquia de erro da API.
**Camadas:** Shared
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0003 — Task 03: Implemente `admin/src/shared/models.ts` com as interfaces `Congregation {id,
> name, city}`, `Publisher {id, name, isActive, accessCode?, accessCodeExpiresAt?: Date,
> activatedAt?: Date}`, `PublisherBrief {id, name}`, `Territory {id, name, boundary: LatLng[], blocks:
> Block[]}`, `Block {id, number, polygon: LatLng[], lastWorkedAt?: Date}`, `WorkLog {id, blockId,
> publisher: PublisherBrief, workedAt: Date, createdAt: Date}`, `AdminSession {accessToken,
> congregation}`, espelhando os campos de `packages/core/lib/models/models.dart` (a conversão
> `fromJson`/parsing destes tipos a partir da resposta HTTP fica na Task 04, junto do cliente da API —
> aqui só os tipos e as funções derivadas puras). Implemente por TDD as seguintes funções derivadas,
> com teste cobrindo os casos de borda indicados:
> - `publisherHasLiveCode(publisher, now)`: verdadeiro sse `accessCode` existe e `accessCodeExpiresAt`
>   existe e é **depois** de `now` (teste o limite: `now` igual a `accessCodeExpiresAt` conta como
>   expirado, não como válido — mesma semântica de `isAfter` do Dart).
> - `publisherIsPending(publisher)`: verdadeiro sse `activatedAt` é `undefined`/`null`.
> - `blockWasNeverWorked(block)`: verdadeiro sse `lastWorkedAt` é `undefined`/`null`.
> - `blockTimeSinceWorked(block, now)`: `null` se nunca trabalhada, senão a diferença em milissegundos
>   entre `now` e `lastWorkedAt`.
> - `workLogWasSyncedLate(log)`: verdadeiro sse a diferença entre `createdAt` e `workedAt` é maior que
>   5 minutos (teste o limite: exatamente 5 minutos não conta como atrasado).
> Implemente também `admin/src/shared/api-errors.ts` com a hierarquia de erro: uma classe base
> `ApiException extends Error`, `ApiErrorException extends ApiException` com campos `statusCode:
> number`, `code: string`, `detail: string`, e um getter/propriedade `isUnauthorized` (verdadeiro sse
> `statusCode === 401` ou `code === 'unauthorized'`), e `NetworkException extends ApiException` (sem
> `statusCode`/`code`). Essas classes são estruturais — não precisam de teste próprio além de um
> `instanceof` básico se fizer sentido; o foco do TDD desta task são as cinco funções derivadas acima.
> Toque apenas em `admin/src/shared/models.ts`, `admin/src/shared/api-errors.ts` e seus testes.

---

### Task 04 — Cliente HTTP da API (`main/api-client.ts`)

**Objetivo:** Portar `packages/core/lib/api/api_client.dart` (só a parte que o admin usa — sem
`/app/activate` nem `/app/blocks/{id}/worked`, que são do futuro app Android).
**Camadas:** Main
**Modo:** TDD
**Depende de:** Task 02, Task 03
**Instrução para o subagente:**
> Spec 0003 — Task 04: Implemente por TDD `admin/src/main/api-client.ts`, uma classe/função
> `createApiClient({ baseUrl, appKey, fetchImpl? })` que expõe: `login({name, city, password}) →
> AdminSession`, `setToken(token: string | null)`, `listPublishers()`, `createPublisher(name)`,
> `regenerateAccessCode(publisherId)`, `setPublisherActive(publisherId, isActive)`,
> `listTerritories()`, `getTerritory(territoryId)`, `createTerritory({name, boundary})`,
> `updateTerritory(territoryId, {name?, boundary?})`, `deleteTerritory(territoryId)`,
> `createBlock({territoryId, polygon, number?})`, `updateBlock(blockId, {polygon?, number?})`,
> `deleteBlock(blockId)`, `listWorkLogs(blockId)`, `deleteWorkLog(logId)`. Use o `fetch` global do
> Node (injete via `fetchImpl` nos testes com `vi.fn()`/mock, não use `vi.stubGlobal` obrigatoriamente
> — a injeção por parâmetro é mais simples de testar). Critérios de aceite:
> - Todo request envia o header `X-App-Key` com o valor configurado.
> - Depois de `setToken('abc')`, todo request subsequente envia `Authorization: Bearer abc`; depois de
>   `setToken(null)`, o header some.
> - `login` faz `POST /auth/login` com `{name, city, password}` e retorna um `AdminSession` parseado
>   da resposta `{access_token, congregation: {...}}`.
> - `createTerritory`/`updateTerritory` (quando `boundary` é passado) e `createBlock`/`updateBlock`
>   (quando `polygon` é passado) chamam `validateRing` (Task 02) **antes** de disparar o request — um
>   anel inválido não deve gerar nenhuma chamada de rede, e o erro lançado é o `InvalidPolygonError` da
>   Task 02, não um erro de API.
> - `updateTerritory`/`updateBlock` só incluem no corpo os campos efetivamente passados (omitir
>   `name`/`boundary`/`number`/`polygon` quando `undefined`).
> - Todas as rotas e verbos batem com os do Dart: `GET/POST/PATCH/DELETE /admin/territories[/{id}]`,
>   `POST /admin/territories/{id}/blocks`, `PATCH/DELETE /admin/blocks/{id}`, `GET /admin/blocks/{id}/
>   work-logs`, `DELETE /admin/work-logs/{id}`, `GET/POST /admin/users`, `POST /admin/users/{id}/
>   access-code`, `PATCH /admin/users/{id}`.
> - Uma resposta com `status >= 400` sempre lança antes de retornar (nunca retorna um valor parcial).
> - Corpo de erro `{code: string, detail: string}` → `ApiErrorException{statusCode, code, detail}`.
> - Corpo de erro `{detail: string}` sem `code` → `ApiErrorException` com `code` derivado do status:
>   401→`unauthorized`, 403→`forbidden`, 404→`not_found`, 409→`conflict`, 429→`rate_limit_exceeded`,
>   qualquer outro→`error`.
> - Corpo de erro `{detail: [...]}` (array — formato do 422 nativo do FastAPI) →
>   `ApiErrorException{code: 'invalid_request', detail: 'O aplicativo enviou dados em formato
>   inválido.'}`.
> - Corpo de erro que não é JSON válido, ou uma falha do próprio `fetch` (rejeita/lança) → lança
>   `NetworkException` com uma mensagem em português.
> - Resposta de sucesso com corpo vazio (ex.: um `DELETE`) resolve sem lançar, sem tentar fazer parse
>   de JSON de string vazia.
> Toque apenas em `admin/src/main/api-client.ts` e seu teste (pode importar de `shared/`, mas não
> crie nem edite arquivos em `shared/`, `preload/` ou `renderer/`).

---

### Task 05 — Armazenamento seguro de credenciais (`main/credentials-store.ts`)

**Objetivo:** Portar `admin/lib/data/credentials_store.dart` usando `safeStorage` do Electron em vez
de `flutter_secure_storage`.
**Camadas:** Main
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0003 — Task 05: Implemente por TDD `admin/src/main/credentials-store.ts`, exportando um tipo
> `Credentials {name: string, city: string, password: string}` e uma função/classe
> `createCredentialsStore({ safeStorage, getFilePath, fs? })` (injete as dependências do Electron —
> `safeStorage.encryptString`/`decryptString`/`isEncryptionAvailable`, e o caminho do arquivo — para
> poder mockar `electron` inteiro nos testes com `vi.mock('electron', ...)` ou por injeção direta,
> sem subir uma janela real) com os métodos: `read(): Promise<Credentials | null>`,
> `write(credentials): Promise<void>`, `clear(): Promise<void>`. Critérios de aceite:
> - `write` criptografa os dados com `safeStorage.encryptString` antes de gravar em disco (nunca grava
>   `password` em texto puro).
> - Se `safeStorage.isEncryptionAvailable()` retorna `false`, `write` lança um erro claro em vez de
>   gravar em texto puro silenciosamente.
> - `read` retorna `null` quando o arquivo não existe.
> - `read` retorna `null` quando o arquivo existe mas está corrompido/incompleto (não é um JSON válido,
>   ou falta `name`/`city`/`password`) — tudo ou nada, igual ao Dart: um registro parcial não conta
>   como configurado.
> - `read` retorna as `Credentials` decodificadas quando tudo está presente e válido.
> - `clear` remove o arquivo/dado gravado; um `read` seguinte retorna `null`. `clear` não lança se já
>   não havia nada gravado.
> - Nada aqui deve nunca logar `password` (nem em uma mensagem de erro).
> Toque apenas em `admin/src/main/credentials-store.ts` e seu teste.

---

### Task 06 — Sessão: login e reautenticação silenciosa (`main/session.ts`)

**Objetivo:** Portar `admin/lib/data/session.dart` — o coração da UX "nunca pedir login de novo".
**Camadas:** Main
**Modo:** TDD
**Depende de:** Task 04, Task 05
**Instrução para o subagente:**
> Spec 0003 — Task 06: Implemente por TDD `admin/src/main/session.ts`, uma classe/função
> `createSession({ api, store })` (usando o cliente da Task 04 e o store da Task 05, injetados como
> fakes nos testes — não use os reais) expondo: `isConfigured(): Promise<boolean>`,
> `configure(credentials): Promise<Congregation>`, `run<T>(action: () => Promise<T>): Promise<T>`,
> `signOut(): Promise<void>`, e um getter `congregation: Congregation | null`. Exporte também uma
> classe de erro `CredentialsRejectedException extends Error`. Critérios de aceite, espelhando
> `admin/lib/data/session.dart` exatamente:
> - `isConfigured()` é verdadeiro sse `store.read()` não é `null`.
> - `configure(credentials)`: chama `api.login(...)` **antes** de gravar (um login que falha não deixa
>   nada salvo); em caso de sucesso, grava as credenciais no store, seta o token no `api`, guarda a
>   congregação e marca a sessão como autenticada; retorna a congregação. Uma falha do login propaga
>   como está (não é convertida para `CredentialsRejectedException` aqui — isso só se aplica ao
>   sign-in automático dentro de `run`).
> - `run(action)`: se a sessão ainda não autenticou nesta instância, faz sign-in primeiro (lê as
>   credenciais do store; se não houver nenhuma, lança `CredentialsRejectedException` **sem** chamar a
>   API) e então executa `action`.
> - Dentro do sign-in automático: se `api.login` falhar com um erro "unauthorized" (verifique via
>   `isUnauthorized` da Task 03), lança `CredentialsRejectedException` com uma mensagem dizendo para
>   digitar os dados de novo; se falhar por outro motivo (ex. erro de rede), propaga o erro original
>   sem converter.
> - Se `action()` lançar um erro "unauthorized", a sessão marca-se como não-autenticada, refaz o
>   sign-in, e tenta `action()` de novo **uma única vez**. Se essa segunda tentativa de sign-in também
>   falhar por unauthorized, lança `CredentialsRejectedException`. Um erro não-unauthorized vindo de
>   `action()` propaga sem retry.
> - `signOut()`: limpa o store, zera o token no `api`, limpa a congregação guardada e marca a sessão
>   como não-autenticada.
> Toque apenas em `admin/src/main/session.ts` e seu teste; pode importar de `shared/` e usar os tipos
> de `api-client.ts`/`credentials-store.ts`, mas não edite esses arquivos.

---

### Task 07 — IPC: handlers, preload e janela principal

**Objetivo:** Conectar main (Session/ApiClient) ao renderer via IPC tipado, e subir a janela
Electron com `contextIsolation` ligado.
**Camadas:** Main, Preload, Shared
**Modo:** direto
**Depende de:** Task 06
**Instrução para o subagente:**
> Spec 0003 — Task 07: Crie `admin/src/shared/ipc-contract.ts` descrevendo, em um único lugar, o
> nome de cada canal IPC e a assinatura (parâmetros e retorno) das operações: `session:isConfigured`,
> `session:configure`, `session:signOut`, `territories:listWithBlocks`, `territories:create`,
> `territories:update`, `territories:delete`, `blocks:create`, `blocks:update`, `blocks:delete`,
> `publishers:list`, `publishers:create`, `publishers:regenerateCode`, `publishers:setActive`,
> `workLogs:listFor`, `workLogs:delete` — usando os tipos de `shared/models.ts` (Task 03) nos
> parâmetros/retornos. Crie `admin/src/main/ipc-handlers.ts` registrando um `ipcMain.handle` por
> canal, cada um chamando `session.run(...)` (Task 06) com a operação correspondente do `api-client`
> (Task 04) — `territories:listWithBlocks` faz o mesmo fan-out que
> `ApiTerritoryRepository.listWithBlocks` no Dart: lista os territórios e busca o detalhe (com blocos)
> de cada um. Qualquer erro lançado (`ApiErrorException`, `NetworkException`,
> `CredentialsRejectedException`) deve chegar ao renderer de um jeito que ele consiga distinguir o
> tipo — serialize para um objeto plano `{ name: string, message: string, code?: string, statusCode?:
> number }` antes de relançar, porque o IPC do Electron não preserva subclasses de `Error` através da
> borda, só `message`. Crie `admin/src/preload/index.ts` expondo `window.api` via
> `contextBridge.exposeInMainWorld`, com um método por canal, cada um chamando
> `ipcRenderer.invoke(canal, ...args)` — a forma de `window.api` deve bater 1:1 com o contrato de
> `shared/ipc-contract.ts` (o renderer nunca chama `ipcRenderer` diretamente). Reescreva
> `admin/src/main/index.ts`: ciclo de vida do app Electron, cria a `BrowserWindow` com
> `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (se compatível com o preload
> escolhido), carrega o preload e o renderer (URL do dev server em desenvolvimento, `index.html`
> buildado em produção); lê `API_BASE_URL` e `APP_KEY` de `process.env` (via `dotenv`, carregando
> `admin/.env`) e usa esses valores para construir o `api-client` e o `credentials-store` reais
> (com `safeStorage` e `app.getPath('userData')`) que alimentam a `session` usada pelos handlers.
> Nenhuma regra de negócio nova aqui — é só fiação. Toque apenas em `admin/src/main/ipc-handlers.ts`,
> `admin/src/main/index.ts`, `admin/src/preload/index.ts` e `admin/src/shared/ipc-contract.ts`; não
> mexa em `renderer/`.

---

### Task 08 — Cor da quadra por tempo sem trabalho (`renderer/map/blockColor.ts`)

**Objetivo:** A regra pura que decide se uma quadra aparece vermelha, laranja ou verde no mapa.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 03
**Instrução para o subagente:**
> Spec 0003 — Task 08: Implemente por TDD `admin/src/renderer/map/blockColor.ts`, exportando
> `const OVERDUE_AFTER_MS = 120 * 24 * 60 * 60 * 1000` e uma função `blockColorCategory(block, now):
> 'never' | 'overdue' | 'recent'`, usando `blockTimeSinceWorked` da Task 03. Critérios de aceite,
> espelhando `admin/lib/presentation/map/territory_map.dart` (`_blockColor`): `lastWorkedAt` ausente →
> `'never'`; tempo desde o trabalho **estritamente maior** que `OVERDUE_AFTER_MS` → `'overdue'`;
> exatamente igual a `OVERDUE_AFTER_MS` ou menor → `'recent'` (teste esse limite explicitamente).
> Toque apenas em `admin/src/renderer/map/blockColor.ts` e seu teste.

---

### Task 09 — Componente de mapa: `TerritoryMap`

**Objetivo:** Portar `admin/lib/presentation/map/territory_map.dart` — a exibição (não-editável) dos
territórios e quadras.
**Camadas:** Renderer
**Modo:** direto
**Depende de:** Task 08, Task 03
**Instrução para o subagente:**
> Spec 0003 — Task 09: Implemente `admin/src/renderer/map/TerritoryMap.tsx` usando `react-leaflet`:
> um `MapContainer` com um `TileLayer` apontando para `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
> (comente no código a política de uso do OSM — identificar com User-Agent, sem bulk download — como
> o Dart já documenta), um polígono de contorno (não preenchido, borda fina) por território, um
> polígono preenchido por quadra colorido segundo `blockColorCategory` (Task 08: vermelho para
> `'never'`, laranja para `'overdue'`, verde para `'recent'`), e um marcador numerado no centróide de
> cada quadra (média simples dos vértices, não centróide geométrico real — mesma aproximação do Dart)
> que, ao ser clicado, chama uma prop `onBlockTap(territory, block)`. Centro inicial: média de todos
> os pontos de todos os territórios; se não houver nenhum território, cai para `(-15.78, -47.93)`
> (Brasília) com zoom baixo (4); com territórios, zoom 15. Este componente só recebe dados via props
> (`territories`, `now`, `onBlockTap`) — nenhuma chamada a `window.api` aqui. Toque apenas em
> `admin/src/renderer/map/TerritoryMap.tsx`.

---

### Task 10 — Controller de edição de polígono (`renderer/map/usePolygonEditor.ts`)

**Objetivo:** Portar `PolygonEditorController` de `admin/lib/presentation/map/polygon_editor.dart` —
o estado do desenho, o desfazer, e a validação — sem nenhuma dependência de biblioteca de mapa.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0003 — Task 10: Implemente por TDD `admin/src/renderer/map/usePolygonEditor.ts` — pode ser um
> hook React ou uma classe/factory simples testável fora de um componente montado (a critério seu,
> mas **sem importar Leaflet ou Leaflet-Geoman aqui** — isso é só estado). Aceita um anel inicial
> opcional (`LatLng[]`). Expõe: `points: LatLng[]` (estado atual), `addPoint(point)`, `movePoint(index,
> point)`, `removePoint(index)`, `undo()`, `canUndo: boolean`, `clear()`, e um `state` derivado com
> `points`, `problem` (via `validateRing`/`isValidRing` da Task 02, `null` quando o anel é válido), e
> um `hint` em português por tipo de problema — trate `tooFewPoints` como uma dica neutra ("toque no
> mapa para marcar ao menos 3 pontos"), não como um erro alarmante, igual ao Dart. Critérios de
> aceite: `addPoint`, `movePoint` e `removePoint` cada um tira um snapshot do estado **antes** de
> mutar (é o que faz `undo` funcionar depois de um arraste ou uma remoção, não só depois de adicionar
> — esse é o comportamento não-trivial que o comentário do Dart documenta: sem isso, desfazer depois
> de um arraste perderia o arraste e um vértice junto); `undo()` restaura o snapshot mais recente e
> não faz nada se não houver nenhum; `canUndo` é verdadeiro sse há pelo menos um snapshot; `clear()`
> tira um snapshot antes de esvaziar (e não faz nada, nem tira snapshot, se já estava vazio); a pilha
> de snapshots tem um teto de 50 entradas, descartando a mais antiga quando excede. Cubra em teste a
> sequência "adicionar 3 pontos, arrastar um (via `movePoint`), desfazer" restaurando o estado de
> **antes do arraste** (com os 3 pontos originais), não de antes do último ponto adicionado. Toque
> apenas em `admin/src/renderer/map/usePolygonEditor.ts` e seu teste.

---

### Task 11 — Camada visual do editor de polígono com Leaflet-Geoman

**Objetivo:** Portar a parte de `admin/lib/presentation/map/polygon_editor.dart` que liga a
biblioteca de terceiros ao controller da Task 10 — confinando Leaflet-Geoman a este único arquivo.
**Camadas:** Renderer
**Modo:** direto
**Depende de:** Task 10
**Instrução para o subagente:**
> Spec 0003 — Task 11: Implemente `admin/src/renderer/map/PolygonEditorLayers.tsx`, o único arquivo
> do projeto que importa Leaflet-Geoman (`@geoman-io/leaflet-geoman-free` ou equivalente) — se a lib
> algum dia precisar trocar, só este arquivo muda, mesmo princípio de isolamento que o Dart já aplica
> a `flutter_map_line_editor`/`flutter_map_dragmarker`. Recebe o controller da Task 10 (via props ou
> hook) e um `context?: LatLng[][]` (contornos de referência não-editáveis — o território ao redor de
> uma quadra sendo desenhada, ou os territórios vizinhos). Comportamento: clique no mapa em modo de
> desenho chama `controller.addPoint`; arrastar um vértice existente chama `controller.movePoint`
> (não mutando o ponto direto — sempre pelo controller, para preservar a disciplina de snapshot da
> Task 10); remover um vértice (via o gesto que o Geoman oferece — long-press/botão direito/ícone,
> o que for mais natural na lib) chama `controller.removePoint`; renderiza os contornos de `context`
> em cinza fino, e o anel atual do controller na cor primária quando `state.problem` é `null` ou na
> cor de erro quando não é (mesma sinalização visual do Dart: vermelho enquanto não pode salvar).
> Este arquivo não precisa de teste unitário dedicado além de uma renderização de fumaça, se fizer
> sentido — é fiação de UI sobre o modelo de eventos de uma lib de terceiro, o mesmo motivo pelo qual
> o Dart não testa a integração com `flutter_map_line_editor` diretamente (só o controller, que já foi
> testado na Task 10). Toque apenas em `admin/src/renderer/map/PolygonEditorLayers.tsx`.

---

### Task 12 — Tela de configuração inicial (`SetupScreen`)

**Objetivo:** Portar `admin/lib/presentation/setup_screen.dart`.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0003 — Task 12: Implemente por TDD `admin/src/renderer/screens/SetupScreen.tsx` (+ teste com
> React Testing Library, usando um fake de `window.api.session.configure` — não o IPC real). Campos:
> nome da congregação, cidade, senha (mascarada). Uma prop opcional `reason?: string` mostra um aviso
> acima do formulário (usada quando a tela reaparece por credenciais rejeitadas ou por falha de
> leitura do armazenamento — a Task 13 decide quando passar isso). Critérios de aceite: submeter com
> qualquer campo vazio não chama `configure` e mostra "Campo obrigatório." (ou equivalente) no campo
> vazio; submeter com os três campos preenchidos chama `window.api.session.configure({name, city,
> password})` com os valores **cortados de espaço** (`trim`) para nome e cidade, mas a senha **sem**
> `trim` (senha é uma sequência de bytes, não um texto de exibição — cortar espaço mudaria a senha
> que o usuário quis digitar); enquanto a chamada está pendente, o botão de submeter fica desabilitado
> e mostra um indicador de carregamento; se `configure` rejeitar, a mensagem de erro do
> `ApiErrorException`/`NetworkException` (campo `message`, repassado pelo IPC) aparece na tela, e o
> formulário volta a ficar habilitado; em caso de sucesso, a tela **não** navega sozinha — só chama
> `configure` e deixa quem a usa decidir o próximo passo (mesma divisão de responsabilidade do Dart,
> onde quem invalida o provider e troca de tela é o chamador). Toque apenas em
> `admin/src/renderer/screens/SetupScreen.tsx` e seu teste.

---

### Task 13 — Roteamento raiz (`App.tsx`)

**Objetivo:** Portar `_Root`/`_Authenticated` de `admin/lib/main.dart` — a decisão entre tela de
configuração e o app autenticado.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 07, Task 12
**Instrução para o subagente:**
> Spec 0003 — Task 13: Implemente por TDD `admin/src/renderer/App.tsx` (+ teste com um fake de
> `window.api`). Ao montar, chama `window.api.session.isConfigured()`. Critérios de aceite: enquanto a
> chamada está pendente, mostra um estado de carregamento; se resolve `false`, renderiza
> `SetupScreen` sem `reason`; se a chamada **rejeita** (falha ao ler o armazenamento), renderiza
> `SetupScreen` com `reason` = "Não foi possível ler os dados guardados neste computador." (ou
> equivalente); se resolve `true`, tenta carregar os territórios (via `window.api.territories
> .listWithBlocks`) para decidir se o app autenticado (a `HomeScreen` da Task 14 — pode ser um
> placeholder mínimo nesta task, já que a `HomeScreen` real só existe depois da Task 14) é exibido; se
> esse carregamento falhar especificamente com um erro cujo `name` é `'CredentialsRejectedException'`
> (repassado pelo IPC conforme a Task 07), cai de volta para `SetupScreen` com a mensagem desse erro
> como `reason`, em vez de mostrar uma tela quebrada — mesmo comportamento do par `_Root`/
> `_Authenticated` do Dart. Um erro de carregamento que **não** seja `CredentialsRejectedException`
> não deve acionar esse fallback (deixe a tela autenticada lidar com isso do jeito dela, como a Task
> 14 especifica). Toque apenas em `admin/src/renderer/App.tsx` e seu teste; pode importar
> `SetupScreen` da Task 12, mas não a edite.

---

### Task 14 — `HomeScreen`: mapa, lista de territórios, apagar, sair

**Objetivo:** Portar `admin/lib/presentation/home_screen.dart` — a tela principal.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 09, Task 07
**Instrução para o subagente:**
> Spec 0003 — Task 14: Implemente por TDD `admin/src/renderer/screens/HomeScreen.tsx` (+ teste com
> fake de `window.api`, usando o `TerritoryMap` da Task 09). Critérios de aceite, espelhando
> `admin/lib/presentation/home_screen.dart`: mostra o nome e a cidade da congregação no cabeçalho
> depois de carregados; uma ação "Novo território" abre o editor de território (a Task 15 define esse
> componente — nesta task, basta que a ação exista e sinalize a intenção, por exemplo via uma prop de
> callback ou navegação, sem depender do editor estar pronto); cada território na lista lateral
> oferece "Adicionar quadra", "Editar demarcação" e "Apagar território"; apagar pede confirmação
> antes de chamar a API, e o texto da confirmação é diferente conforme o território tem ou não
> quadras (com quadras: avisa que as quadras **e o histórico de trabalho delas** são apagados junto —
> é literal, o servidor faz `ON DELETE CASCADE`; sem quadras: mensagem simples); uma ação "Recarregar"
> força um novo `listWithBlocks`; uma ação "Sair da congregação", atrás de um menu secundário (não no
> topo, ao lado de "Recarregar" — sair é destrutivo e não pode ficar a um clique de distância de uma
> ação inofensiva), pede confirmação com duas informações: que os dados salvos **neste computador**
> serão apagados mas nada é removido do servidor (território, quadras e histórico continuam lá), e que
> será preciso digitar nome/cidade/senha de novo; confirmando, chama `window.api.session.signOut()`;
> tocar no número de uma quadra no mapa (via o `onBlockTap` do `TerritoryMap`) abre um menu com "Ver
> histórico", "Editar contorno ou número" e "Apagar quadra"; apagar quadra também pede confirmação,
> avisando que o histórico de trabalho da quadra é apagado junto; qualquer erro de API ao carregar,
> apagar território, apagar quadra ou sair aparece como uma mensagem visível na tela (não estoura sem
> tratamento). "Ver histórico" e "Editar" podem ficar como callbacks/props que a Task 18/15/16
> preenchem depois — o que importa aqui é que o menu oferece as três opções e cada uma dispara a ação
> certa. Toque apenas em `admin/src/renderer/screens/HomeScreen.tsx` e seu teste.

---

### Task 15 — `TerritoryEditorScreen`

**Objetivo:** Portar `admin/lib/presentation/territory_editor_screen.dart`.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 10, Task 11, Task 07
**Instrução para o subagente:**
> Spec 0003 — Task 15: Implemente por TDD `admin/src/renderer/screens/TerritoryEditorScreen.tsx` (+
> teste, com fakes de `window.api` e do `usePolygonEditor`/`PolygonEditorLayers` conforme necessário).
> Recebe opcionalmente um território existente (modo edição) e a lista de territórios vizinhos (para
> desenhar como contexto não-editável, excluindo o próprio território sendo editado). Usa o
> `usePolygonEditor` da Task 10, semeado com o contorno existente quando em modo edição. Campo de
> nome. Critérios de aceite: "Salvar" fica desabilitado enquanto o anel é inválido
> (`state.problem !== null`), o nome está vazio, ou já existe um salvamento em andamento; "Desfazer"
> fica desabilitado quando `canUndo` é falso; "Apagar tudo" fica desabilitado quando o anel está
> vazio; salvar em modo criação chama `window.api.territories.create({name, boundary: state.points})`,
> em modo edição chama `.update(id, {name, boundary: state.points})`; em caso de sucesso, sinaliza ao
> chamador (prop `onSaved`/navegação) para fechar/atualizar; em caso de rejeição do servidor (ex.
> sobreposição com outro território), mostra a mensagem do erro **verbatim** (o servidor já escreve a
> mensagem pensando no admin, não reescreva). Toque apenas em
> `admin/src/renderer/screens/TerritoryEditorScreen.tsx` e seu teste.

---

### Task 16 — `BlockEditorScreen`

**Objetivo:** Portar `admin/lib/presentation/block_editor_screen.dart`.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 10, Task 11, Task 07
**Instrução para o subagente:**
> Spec 0003 — Task 16: Implemente por TDD `admin/src/renderer/screens/BlockEditorScreen.tsx` (+
> teste), mesmo formato da Task 15 mas para uma quadra dentro de um território: recebe o território
> (obrigatório) e opcionalmente uma quadra existente; desenha o contorno do território e as outras
> quadras dele como contexto não-editável (excluindo a quadra em edição); um campo de número opcional
> — vazio pede ao servidor o próximo número livre (mostre essa explicação como texto de ajuda quando
> em modo criação), preenchido precisa ser um inteiro ≥ 1, senão "Salvar" fica desabilitado com uma
> dica de erro no campo. Mesmas regras de "Salvar"/"Desfazer"/"Apagar tudo" da Task 15. Salvar chama
> `window.api.blocks.create({territoryId, polygon: state.points, number?})` ou
> `.update(id, {polygon: state.points, number?})`. Erro do servidor mostrado verbatim. Toque apenas em
> `admin/src/renderer/screens/BlockEditorScreen.tsx` e seu teste.

---

### Task 17 — `PublishersScreen`

**Objetivo:** Portar `admin/lib/presentation/publishers_screen.dart`.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0003 — Task 17: Implemente por TDD `admin/src/renderer/screens/PublishersScreen.tsx` (+
> teste, fake de `window.api.publishers.*`). Lista publicadores, cada um com uma linha de status
> derivada (use `publisherHasLiveCode`/`publisherIsPending` da Task 03, com `now` injetável para o
> teste): revogado (`isActive === false`) → "Acesso revogado — o histórico de trabalho continua
> guardado."; código vivo → "Código válido, aguardando ser usado."; pendente sem código vivo → "Sem
> código válido. Gere um novo para esta pessoa entrar."; senão → "Ativo neste aparelho.". "Cadastrar"
> pede um nome (não avança com nome vazio), chama `publishers.create(name)`, e em caso de sucesso
> mostra o código recém-gerado num diálogo dedicado com uma ação de copiar e o aviso "vale 24 horas,
> serve uma única vez, e não poderá ser consultado depois de usado" (ou equivalente). Cada publicador
> oferece: "Ver código" (só quando há um código vivo), "Gerar novo código" (chama
> `regenerateCode(id)`, mostra o novo código no mesmo diálogo — deixe claro que isso invalida o
> código anterior), e "Desativar"/"Reativar" (o rótulo muda com o estado atual; a chamada
> `setActive(id, desejado)` envia o estado **desejado**, isto é, a tela inverte o `isActive` atual
> antes de chamar — a API nunca faz essa inversão sozinha). Qualquer erro de API aparece como uma
> mensagem visível (toast/snackbar), não quebra a tela. Toque apenas em
> `admin/src/renderer/screens/PublishersScreen.tsx` e seu teste.

---

### Task 18 — `BlockHistorySheet`

**Objetivo:** Portar `admin/lib/presentation/block_history_sheet.dart`.
**Camadas:** Renderer
**Modo:** TDD
**Depende de:** Task 07
**Instrução para o subagente:**
> Spec 0003 — Task 18: Implemente por TDD `admin/src/renderer/screens/BlockHistorySheet.tsx` (+
> teste, fake de `window.api.workLogs.*`). Recebe um território e uma quadra, carrega
> `workLogs.listFor(block.id)`. Cada registro mostra o nome do publicador e a data/hora em que foi
> trabalhado; quando `workLogWasSyncedLate` (Task 03) é verdadeiro, mostra também "sincronizado em
> {createdAt}" — a lacuna entre `workedAt` e `createdAt` é a fila offline drenando, e sem essa nota uma
> sincronização atrasada pareceria uma data errada. Cada registro oferece remover, com confirmação
> nomeando o publicador e a data, e avisando que a data de "última vez trabalhada" da quadra será
> recalculada; confirmando, chama `workLogs.delete(log.id)` e, em caso de sucesso, recarrega tanto a
> lista de registros quanto os territórios (para o mapa recolorir a quadra — a Task 14 expõe como
> invalidar esse cache/estado; pode ser via um callback prop `onWorkLogDeleted`). Lista vazia mostra
> "Esta quadra nunca foi trabalhada." Erro de carregamento ou de remoção aparece como mensagem
> visível. Toque apenas em `admin/src/renderer/screens/BlockHistorySheet.tsx` e seu teste.

---

### Task 19 — Empacotamento local com electron-builder e remoção do CI antigo

**Objetivo:** Deixar o admin compilável localmente (`npm run build:mac` no mínimo) e documentar como.
**Camadas:** Build/Config
**Modo:** direto
**Depende de:** Task 09, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
**Instrução para o subagente:**
> Spec 0003 — Task 19: Configure `electron-builder` em `admin/` (arquivo `electron-builder.yml` ou
> a chave `build` em `package.json`) com alvos para macOS (`dmg`+`zip`), Windows (`nsis` ou `zip`) e
> Linux (`AppImage`+`tar.gz`), e scripts em `package.json`: `build:mac`, `build:win`, `build:linux`
> (cada um rodando o build do electron-vite e depois o `electron-builder` para aquele alvo). Reescreva
> `admin/README.md` do zero cobrindo: `npm install`, `npm run dev` (janela Electron com hot reload),
> como preencher `admin/.env` a partir de `admin/.env.example` (`API_BASE_URL`, `APP_KEY` — mesmo
> propósito de antes, só que lido pelo main process em vez de `--dart-define`), e os três comandos de
> build local — com uma nota explícita de que compilar Windows/Linux a partir do macOS pode exigir
> ferramentas extra (ex. Wine para o instalador NSIS) e que, se isso não funcionar nesta máquina, o
> caminho é compilar Windows num Windows e Linux num Linux (não há mais CI fazendo isso). Confirme que
> `.github/workflows/admin-release.yml` já não existe (foi removido na Task 01) e não crie um
> substituto. Não toque em `.github/workflows/server.yml`, `.github/workflows/core.yml`, nem em nada
> fora de `admin/`.

---

### Task 20 — Atualizar CLAUDE.md para a nova stack do admin

**Objetivo:** A documentação do projeto para de descrever um admin em Flutter e passa a descrever o
admin em Electron, sem tocar nas partes do documento que não mudaram.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 19
**Instrução para o subagente:**
> Spec 0003 — Task 20: Edite `/Users/dalistor/Documents/Projetos/Territory map/CLAUDE.md` para
> refletir a migração do admin. Atualize, sem reescrever o documento inteiro: (1) a tabela "Stack
> Técnica", trocando a linha do admin de "Flutter desktop... `flutter_secure_storage`" para Electron +
> React + TypeScript + Leaflet + Leaflet-Geoman + `safeStorage`, e mencione a arquitetura de processo
> (main fala com a API, renderer só por IPC via `contextBridge`); (2) o diagrama de estrutura de
> pastas em "Estrutura do Projeto", trocando a árvore de `admin/lib/{data,presentation}/` pela nova
> `admin/src/{main,preload,renderer,shared}/`, com uma frase sobre o que cada uma guarda; (3) a seção
> "Arquitetura de Camadas" → "Admin (Flutter desktop)", renomeando e reescrevendo a tabela de camadas
> para Main/Preload/Renderer/Shared, e adaptando o parágrafo "Por que não existe `domain/` aqui" para
> o equivalente atual (o Main assume o papel que era do antigo `data/`: a regra de negócio continua
> toda no servidor, o Main só repassa; o Renderer é puro Presentation) — mantenha o estilo de
> justificar a decisão, não só descrevê-la; (4) a tabela de Testes, trocando a linha/coluna do admin
> de `flutter_test`/`admin/test/**/*_test.dart` para Vitest + React Testing Library com arquivos
> `admin/src/**/*.test.ts(x)` co-localizados (explique em uma frase por que essa convenção difere do
> `test/` espelhado usado no resto do projeto: é o padrão do ecossistema Vitest); (5) a seção "Como
> Rodar", trocando o bloco do admin (`flutter pub get && flutter run -d chrome`) por `npm install &&
> npm run dev`, e removendo a menção ao Chrome como ambiente de desenvolvimento (não se aplica mais);
> (6) a seção "Como Fazer Deploy" → "Admin", removendo a tabela de matriz de CI por tag/GitHub Release
> e substituindo por uma descrição curta do build local via `electron-builder` (documentado em
> `admin/README.md`), e removendo a menção ao SmartScreen/Gatekeeper **apenas se** não for mais
> aplicável (ainda é — binários não assinados continuam disparando os mesmos avisos em Electron;
> mantenha essa parte, só troque o mecanismo de build ao redor dela); (7) qualquer menção solta a
> `flutter_map_line_editor`, `flutter_map_dragmarker`, DPAPI/libsecret, ou ao runner `macos-latest`
> planejado para o CI do admin (isso foi abandonado, não implementado — remova a entrada correspondente
> em "Pontos em Aberto"/"Resolvidos" se ainda mencionar o plano antigo). Adicione uma frase objetiva
> registrando a decisão e a data ("O admin trocou de Flutter para Electron em 2026-08-08 porque esta
> máquina não compila `flutter build macos` sem o Xcode completo, e o build local em Electron já era
> um caminho validado em outro projeto do autor.") no lugar mais natural (ex. início da seção de stack
> do admin, ou uma nota de rodapé). **Não toque** em nenhuma seção sobre o servidor, `packages/core`,
> o modelo de dados, as regras de negócio, ou o app Android futuro — nada disso muda.

---

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0003
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências. Boa
paralelização aqui: Tasks 02, 03 e 05 rodam em paralelo depois da 01; a Task 08 e a Task 10 podem
rodar em paralelo com o bloco 04→06→07; as Tasks 12, 15, 16, 17, 18 (as seis telas, exceto Home) só
precisam da Task 07 e podem rodar em paralelo entre si (15/16 também esperam 10/11).

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo` da
task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

Execute as tasks na ordem indicada, respeitando as dependências.

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task (`/centaur-driven-tdd` ou
  `/centaur-driven-implement`) ao iniciar a primeira task, ou pelo `/centaur-driven-run` ao montar o
  plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — Scaffold do projeto Electron e remoção do admin Flutter → implements/0039
- [x] Task 02 — Domínio compartilhado: geometria (`shared/geo.ts`) → implements/0041
- [x] Task 03 — Domínio compartilhado: modelos e exceções de API → implements/0040
- [x] Task 04 — Cliente HTTP da API (`main/api-client.ts`) → implements/0044
- [x] Task 05 — Armazenamento seguro de credenciais (`main/credentials-store.ts`) → implements/0042
- [x] Task 06 — Sessão: login e reautenticação silenciosa (`main/session.ts`) → implements/0047
- [x] Task 07 — IPC: handlers, preload e janela principal → implements/0049
- [x] Task 08 — Cor da quadra por tempo sem trabalho → implements/0043
- [x] Task 09 — Componente de mapa: `TerritoryMap` → implements/0046
- [x] Task 10 — Controller de edição de polígono (`usePolygonEditor`) → implements/0045
- [x] Task 11 — Camada visual do editor de polígono com Leaflet-Geoman → implements/0048
- [x] Task 12 — Tela de configuração inicial (`SetupScreen`) → implements/0050
- [x] Task 13 — Roteamento raiz (`App.tsx`) → implements/0056
- [x] Task 14 — `HomeScreen`: mapa, lista de territórios, apagar, sair → implements/0053
- [x] Task 15 — `TerritoryEditorScreen` → implements/0051
- [x] Task 16 — `BlockEditorScreen` → implements/0052
- [x] Task 17 — `PublishersScreen` → implements/0054
- [x] Task 18 — `BlockHistorySheet` → implements/0055
- [x] Task 19 — Empacotamento local com electron-builder e remoção do CI antigo → implements/0057
- [x] Task 20 — Atualizar CLAUDE.md para a nova stack do admin → implements/0058
