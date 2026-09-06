# [0012] App admin Android: designação de territórios e marcação de quadra

**Data:** 2026-08-23
**Status:** Concluída
**Solicitação original:** "Preciso que faça uma versão do admin para android" — em React Native,
"apenas para a designação de territórios", "precisaria fazer login uma única vez como admin neste
app", em projeto novo, com mapa, e incluindo marcar quadra como trabalhada.

## Objetivo

Um segundo app React Native no monorepo, `admin-app/`, que o responsável pelos territórios instala
no próprio celular para fazer **em campo** o que hoje só o admin desktop faz na mesa: ver quem está
com cada território, designar, concluir, corrigir o histórico da designação e lançar que uma quadra
foi trabalhada.

Ao término:

- O app abre pedindo **nome, cidade e senha da congregação uma única vez**, guarda os três no
  keystore do Android e autentica sozinho dali em diante, refazendo o login em silêncio quando o
  JWT de 12h expira.
- A tela principal mostra um **mapa MapLibre com as demarcações** dos territórios e o nome do
  dirigente sobre cada um, mais uma **lista** abaixo para tocar direto.
- Tocar num território abre o **cartão S-13**: designação em vigor, as anteriores com suas datas,
  "Designar a…", "Marcar como concluído" e apagar registro.
- A partir do território o admin abre as **quadras**, vê o status por extenso e a última visita, e
  **lança um registro de trabalho** escolhendo publicador e data.
- Há "Sair da congregação", que apaga as credenciais do aparelho e devolve o app à tela inicial.

## Contexto técnico

### O que já existe e serve de molde

O servidor está pronto: **nenhuma rota nova é necessária nesta spec**. Todos os endpoints que o
app admin vai consumir já existem e já são usados pelo desktop
([admin/src/main/api-client.ts](admin/src/main/api-client.ts)):

| Endpoint | Uso nesta spec |
|----------|----------------|
| `POST /auth/login` | login com nome/cidade/senha, devolve JWT + congregação |
| `GET /admin/territories` | lista de territórios |
| `GET /admin/territories/{id}` | detalhe com as quadras |
| `GET /admin/users` | publicadores, para escolher o dirigente e o autor da marcação |
| `GET /admin/territories/{id}/assignments` | o cartão S-13 do território |
| `POST /admin/territories/{id}/assignments` | designar (`{"user_id"}`) |
| `POST /admin/territories/{id}/assignments/complete` | marcar como concluído |
| `DELETE /admin/territories/{id}/assignments/{assignmentId}` | apagar registro do histórico |
| `GET /admin/blocks/{id}/work-logs` | histórico de trabalho da quadra |
| `POST /admin/blocks/{id}/worked` | lançar trabalho (`{"user_id", "worked_at"}`) |

Dois projetos existentes são a referência direta, e devem ser lidos antes de escrever código:

- **[app/](app/)** — o app do publicador em React Native 0.87, Android apenas. É de onde vêm as
  convenções desta spec: camadas `domain/`/`data/`/`presentation/`, `react-native-config` para o
  `.env` em tempo de build, `react-native-keychain` para credencial, MapLibre em
  [TerritoryMapView.tsx](app/src/presentation/map/TerritoryMapView.tsx), React Navigation
  native-stack, Jest + `@testing-library/react-native`, teste co-localizado.
- **[admin/](admin/)** — o admin desktop. A lógica de sessão a portar é
  [admin/src/main/session.ts](admin/src/main/session.ts) (login silencioso, retry único no 401,
  `CredentialsRejectedException`); o comportamento das telas a espelhar é
  [DesignationsScreen.tsx](admin/src/renderer/screens/DesignationsScreen.tsx),
  [BlockWorkPanel.tsx](admin/src/renderer/screens/BlockWorkPanel.tsx) e
  [MarkWorkedForm.tsx](admin/src/renderer/screens/MarkWorkedForm.tsx).

### Decisões já tomadas (não reabrir durante a execução)

1. **Projeto novo `admin-app/`, não dentro de `app/`.** O app do publicador se autentica por código
   descartável e não tem senha nenhuma; pôr a senha da congregação dentro do binário que o
   publicador instala inverteria a separação que o servidor faz entre `/app/*` e `/admin/*`. São
   dois APKs, dois `applicationId`, dois públicos.
2. **Sem pacote compartilhado com `app/` nem com `admin/`.** É a decisão que o `AGENTS.md` já
   registra duas vezes (`packages/core` removido; `admin/src/shared/` em vez de dependência
   cruzada). `admin-app/` ganha sua própria `src/domain/`.
3. **`admin-app/src/domain/blockColor.ts` será a terceira cópia deliberada da regra de cor.** Hoje
   já existem duas idênticas por decisão (`admin/src/renderer/map/blockColor.ts` e
   `app/src/domain/blockColor.ts`). Esta spec cria a terceira e **estende o aviso do `AGENTS.md`
   para três arquivos** (Task 14). É o custo aceito de não ter pacote compartilhado; quem mexer numa
   precisa mexer nas três.
4. **Fora de escopo, e continua só no desktop:** desenhar ou editar demarcação de território e de
   quadra, apagar território/quadra, cadastrar/apagar/desativar publicador, forçar o
   `status_override` da quadra, apagar registro de trabalho, a página Histórico da congregação
   inteira e todo o import/export S-13 em XLSX/DOCX. O app admin **lê** publicadores para poder
   escolher um; não os gerencia.
5. **O mapa não desenha quadras.** Igual à página Designações do desktop: só as demarcações e o
   nome do dirigente. As quadras aparecem em lista, na tela de marcação.
6. **Nenhum cache offline.** O app do publicador cacheia leitura porque trabalha sem sinal em
   campo; o admin escreve o tempo todo (designar, concluir, marcar), e um cache de escrita é
   exatamente a fila offline que o dono do projeto já rejeitou em 2026-08-18. Sem rede, o app avisa
   e não faz nada.

### Ambiente

⚠️ **Esta máquina não tem JDK instalado** (`java -version` falha; não há binário `java` em
`/Applications`, `/opt`, `/usr/local` nem no home). O Android SDK existe em `~/Android/Sdk`. Isso
**não bloqueia nenhuma task desta spec**: Jest, ESLint e `tsc` rodam sem JDK. O que fica bloqueado é
`npm run android` e `./gradlew assembleRelease` — instalar o JDK 17 é pré-requisito para ver o app
rodando e para gerar o `.apk`, e é passo do operador, não de uma task.

A API de produção responde em `https://territorymap.dalistor.com.br` (verificado: `GET /health` →
`200 {"status":"ok"}`). O aviso do `AGENTS.md` sobre "API exposta em HTTP puro na porta 8000" está
desatualizado — a Task 14 corrige isso.

### Arquitetura de camadas de `admin-app/`

A mesma de `app/`, com um acréscimo em `data/`:

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Presentation | `admin-app/src/presentation/` | Telas, navegação, o componente de mapa MapLibre | Chamada HTTP direta, `react-native-keychain`, regra de negócio |
| Domain | `admin-app/src/domain/` | Entidades e funções puras | Depender de `react-native`, HTTP ou armazenamento |
| Data | `admin-app/src/data/` | `api-client.ts`, `credentials-store.ts` (keychain), `session.ts` (reautenticação silenciosa) | JSX, lógica de apresentação |

**Direção:** `presentation → domain ← data`. A `session` é a única coisa que a presentation chama
para escrever; nenhuma tela conhece token, senha ou `fetch`.

## Tasks

### Task 01 — Scaffold do projeto `admin-app/`

**Objetivo:** O projeto React Native existe, compila com `tsc`, e `npm test`/`npm run lint` passam
num teste de fumaça.
**Camadas:** Projeto/config
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0012 — Task 01: Crie o projeto React Native `admin-app/` na raiz do monorepo
> `Territory map/`, irmão de `app/` e `admin/`. Espelhe a configuração de `app/` — leia
> `app/package.json`, `app/tsconfig.json`, `app/jest.config.js`, `app/jest.setup.js`,
> `app/babel.config.js`, `app/metro.config.js`, `app/.eslintrc.js`, `app/.prettierrc.js`,
> `app/index.js`, `app/app.json` e `app/.env.example` e reproduza a mesma estrutura, ajustando
> nomes. Use React Native 0.87 e TypeScript, **somente Android** (nenhuma pasta `ios/`).
> `applicationId`/`package` deve ser `com.territorymapadmin` (diferente do
> `com.territorymapapp` do publicador, para os dois APKs conviverem no mesmo aparelho), e o nome
> exibido "Territory Map Admin". Dependências: `@maplibre/maplibre-react-native`,
> `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`,
> `react-native-safe-area-context`, `react-native-keychain`, `react-native-config` e
> `@react-native-community/datetimepicker` (o seletor de data da Task 12; `app/` não tem essa
> dependência porque o publicador nunca digita data). **Não** inclua
> `react-native-geolocation-service`, `@react-native-async-storage/async-storage`,
> `react-native-get-random-values` nem `uuid` — o admin não usa localização, não cacheia nada
> offline e não gera id de log no cliente (o servidor gera). Crie as pastas vazias
> `src/domain/`, `src/data/` e `src/presentation/screens/` e `src/presentation/map/`. Crie
> `admin-app/.env.example` com `API_BASE_URL=` e `APP_KEY=` e os mesmos comentários explicativos de
> `app/.env.example`. Configure Jest com `@testing-library/react-native` e um mock de
> `react-native-keychain`, `react-native-config` e `@maplibre/maplibre-react-native` no
> `jest.setup.js`, como `app/jest.setup.js` faz. Adicione os scripts `android`, `start`, `lint`,
> `test` e `typecheck` (`tsc --noEmit`) ao `package.json`. Critério de sucesso: `npx tsc --noEmit`,
> `npm run lint` e `npm test` passam dentro de `admin-app/` (crie um teste trivial de fumaça se
> não houver nenhum ainda, e remova-o na primeira task que trouxer teste de verdade). Não rode
> `npm run android` nem nenhum comando de Gradle — não há JDK nesta máquina, e isso não é falha da
> task. Toque apenas em arquivos dentro de `admin-app/`; não modifique `app/`, `admin/` nem
> `server/`.

---

### Task 02 — Domain: modelos e conversão de coordenadas

**Objetivo:** As entidades que o app admin manipula, e a única função que converte entre `LatLng` e
o GeoJSON do servidor.
**Camadas:** Domain
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0012 — Task 02: Implemente por TDD `admin-app/src/domain/models.ts` (e
> `models.test.ts` ao lado). Leia antes `app/src/domain/models.ts`, `admin/src/shared/models.ts` e
> `admin/src/shared/geo.ts`, e mantenha os mesmos nomes de campo em camelCase; o que muda é o
> conjunto de entidades, porque o admin precisa de `Assignment` e `Publisher`, que o app do
> publicador não tem. Declare: `LatLng` (`{lat, lng}`), `Congregation` (`{id, name, city}`),
> `Publisher` (`{id, name, accessCode: string | null, accessCodeExpiresAt: Date | null,
> activatedAt: Date | null, isActive: boolean}`), `BlockStatusOverride` (`'overdue' | 'never'`),
> `Block` (`{id, territoryId, number, polygon: LatLng[], lastWorkedAt: Date | null, statusOverride:
> BlockStatusOverride | null}`), `Territory` (`{id, name, boundary: LatLng[], assignedPublisher:
> {id, name} | null, rotationDays: number | null, blocks: Block[]}`), `Assignment` (`{id,
> territoryId, publisher: {id, name}, startedAt: Date, completedAt: Date | null}`) e `WorkLog`
> (`{id, blockId, publisher: {id, name}, workedAt: Date}`).
>
> Implemente também as duas funções de conversão de coordenada, e **elas são o único lugar do
> projeto onde a ordem lat/lng é invertida**: `toLatLngList(coordinates: number[][]): LatLng[]`,
> que recebe o anel externo de um GeoJSON Polygon em `[longitude, latitude]` e devolve
> `{lat, lng}`; e `toGeoJsonRing(points: LatLng[]): number[][]`, o inverso, que fecha o anel
> repetindo o primeiro ponto no fim se ele ainda não estiver fechado.
>
> Critérios de aceite como comportamentos observáveis:
> - `toLatLngList([[-46.6, -23.5], [-46.5, -23.4], [-46.4, -23.6]])` devolve três pontos com
>   `lat` −23.5/−23.4/−23.6 e `lng` −46.6/−46.5/−46.4 — nessa ordem, sem trocar os eixos.
> - `toGeoJsonRing` de três pontos devolve **quatro** pares, o último igual ao primeiro.
> - `toGeoJsonRing` de um anel que já vem fechado (primeiro ponto igual ao último) não acrescenta
>   um quinto par duplicado.
> - `toLatLngList(toGeoJsonRing(pontos))` devolve os pontos originais mais o de fechamento — ida e
>   volta preserva os valores.
> - `toLatLngList([])` devolve `[]`; `toGeoJsonRing([])` devolve `[]` sem estourar ao tentar ler o
>   primeiro ponto.
>
> Este arquivo é código puro: não importe `react-native`, `fetch` nem nada de `data/`. Toque apenas
> na camada Domain de `admin-app/`; não modifique arquivos de outras camadas nem de outros projetos.

---

### Task 03 — Domain: regras puras da designação e do status da quadra

**Objetivo:** As funções que as telas usam para decidir o que mostrar, testáveis sem renderizar
nada.
**Camadas:** Domain
**Modo:** TDD
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0012 — Task 03: Implemente por TDD, em `admin-app/src/domain/`, três arquivos com seus
> testes co-localizados.
>
> **`assignment.ts`** — `assignmentIsOpen(assignment: Assignment): boolean` (aberta é exatamente a
> que tem `completedAt === null`); `openAssignment(assignments: Assignment[]): Assignment | null`,
> a única aberta ou `null`; e `sortAssignments(assignments: Assignment[]): Assignment[]`, que
> devolve uma **nova** lista ordenada por `startedAt` decrescente, com a aberta no topo quando
> empata. Critérios de aceite: lista vazia devolve `[]` e `openAssignment` devolve `null`; com uma
> aberta e duas concluídas, `sortAssignments` põe a aberta primeiro e as concluídas em ordem
> decrescente de início; a lista original não é mutada (compare com uma cópia feita antes);
> `openAssignment` de uma lista só com concluídas devolve `null`.
>
> **`blockColor.ts`** — porte **idêntico em comportamento** ao de `app/src/domain/blockColor.ts`;
> leia esse arquivo e reproduza a regra: `DEFAULT_ROTATION_DAYS = 120`, o tipo
> `BlockColorCategory = 'never' | 'overdue' | 'recent'` e
> `blockColorCategory(block, now, rotationDays?)`. A ordem importa: o `statusOverride` da quadra é
> consultado **antes** do cálculo por data, então `'never'` e `'overdue'` vencem qualquer visita
> recente; ausente, cai na regra de datas. Critérios de aceite: quadra sem `lastWorkedAt` e sem
> override é `'never'`; visita há 10 dias com rotação 120 é `'recent'`; visita há 200 dias é
> `'overdue'`; **exatamente** no limiar (`rotationDays` dias) ainda é `'recent'`, e só
> estritamente acima vira `'overdue'`; `rotationDays` nulo/ausente usa 120; `statusOverride:
> 'never'` numa quadra trabalhada ontem devolve `'never'`; `statusOverride: 'overdue'` numa quadra
> trabalhada ontem devolve `'overdue'`.
>
> **`blockStatusLabel.ts`** — `blockStatusLabel(block, now, rotationDays?): string`, o status por
> extenso que a tela de quadras mostra, derivado de `blockColorCategory`: `'never'` → "Nunca
> trabalhada", `'overdue'` → "Vencida", `'recent'` → "Em dia". Quando o status vem de um
> `statusOverride`, o texto deve dizer que é forçado — sufixo " (forçado)" —, porque o admin
> precisa distinguir o que ele mesmo marcou do que o sistema derivou. Critérios de aceite: os três
> rótulos sem override saem sem sufixo; com override, `'never'` sai "Nunca trabalhada (forçado)" e
> `'overdue'` sai "Vencida (forçado)".
>
> Os três arquivos são código puro: nada de `react-native`, HTTP ou armazenamento. Toque apenas na
> camada Domain de `admin-app/`; não modifique arquivos de outras camadas nem de outros projetos.

---

### Task 04 — Data: cliente HTTP do admin

**Objetivo:** Um cliente com `fetch` injetável que fala todos os endpoints `/auth/*` e `/admin/*`
desta spec e distingue 401 de erro comum.
**Camadas:** Data
**Modo:** TDD
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0012 — Task 04: Implemente por TDD `admin-app/src/data/api-client.ts` e
> `api-client.test.ts`. Leia antes `app/src/data/api-client.ts` (de onde vêm a forma
> `createApiClient({fetchImpl, baseUrl, appKey})`, os tipos `FetchImpl`/`FetchResponseLike` e o
> padrão de teste com `fetch` fake) e `admin/src/main/api-client.ts` (de onde vêm os endpoints, os
> corpos e o parsing de cada DTO). Nunca use o `fetch` global direto: ele é injetado, e todo teste
> passa um fake — nenhum teste desta task pode tocar a rede.
>
> O cliente deve: mandar o header `X-App-Key` com o `APP_KEY` em **toda** requisição; mandar
> `Authorization: Bearer <token>` quando houver token, via `setToken(token: string | null)`;
> montar a URL a partir de `API_BASE_URL`; e converter o JSON do servidor (snake_case) para os
> modelos camelCase da Task 02, transformando datas ISO em `Date` e o GeoJSON em `LatLng[]` com
> `toLatLngList`.
>
> Métodos: `login({name, city, password})` → `{accessToken, congregation}`;
> `listTerritories()`; `getTerritory(id)` (detalhe com quadras); `listTerritoriesWithBlocks()`, que
> lista e busca o detalhe de cada uma; `listPublishers()`; `listAssignments(territoryId)`;
> `designate(territoryId, publisherId)`; `completeAssignment(territoryId)`;
> `deleteAssignment(territoryId, assignmentId)`; `listWorkLogs(blockId)`;
> `markWorked(blockId, publisherId, workedAt)`. Os caminhos e corpos são exatamente os que
> `admin/src/main/api-client.ts` já usa — copie de lá, não invente.
>
> Erros: exporte `ApiError extends Error` com `statusCode`, `code` opcional e o getter
> `isUnauthorized` (verdadeiro só em 401) — é o que a Task 06 usa para decidir se refaz o login. A
> mensagem deve vir do corpo de erro da API quando houver uma, e cair num texto genérico em
> português quando não houver. Falha de rede (o `fetch` rejeitando) vira um `NetworkError` com
> mensagem própria, **não** um `ApiError` — sem rede não é 401 e não pode disparar reautenticação.
>
> Critérios de aceite como comportamentos observáveis:
> - `login` com credenciais aceitas devolve o token e a congregação, e faz `POST` em `/auth/login`
>   com `{name, city, password}` no corpo.
> - Toda chamada leva `X-App-Key`; sem `setToken`, não leva `Authorization`; depois de
>   `setToken('abc')`, leva `Authorization: Bearer abc`; `setToken(null)` remove o header de novo.
> - `listTerritoriesWithBlocks` de duas territórios faz três requisições (a lista e um detalhe por
>   território) e devolve as quadras dentro de cada um.
> - Um território cujo `assigned_user` vem nulo produz `assignedPublisher: null`, e um com
>   publicador produz `{id, name}`.
> - `markWorked` faz `POST /admin/blocks/{id}/worked` com `user_id` e `worked_at` em ISO 8601, e
>   **não** manda id de log nenhum — o servidor gera o dele.
> - Resposta 401 lança `ApiError` com `isUnauthorized === true`; 409 lança `ApiError` com
>   `isUnauthorized === false` e a mensagem que veio do corpo; 204 (as duas rotas de DELETE)
>   resolve sem tentar ler JSON.
> - O `fetch` rejeitando lança `NetworkError`, e `NetworkError` não é `ApiError`.
>
> Toque apenas na camada Data de `admin-app/`; não modifique arquivos de outras camadas nem de
> outros projetos.

---

### Task 05 — Data: credenciais da congregação no keystore

**Objetivo:** Nome, cidade e senha guardados pelo `react-native-keychain`, nunca em texto puro.
**Camadas:** Data
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0012 — Task 05: Implemente por TDD `admin-app/src/data/credentials-store.ts` e
> `credentials-store.test.ts`. Leia antes `app/src/data/session-store.ts` (o padrão de uso do
> `react-native-keychain` com `service` próprio e `username` fixo) e
> `admin/src/main/credentials-store.ts` (o contrato `read`/`write`/`clear` que esta task porta do
> `safeStorage` do Electron para o keystore do Android).
>
> Exporte a interface `Credentials` (`{name, city, password}`) e as funções
> `saveCredentials(credentials)`, `readCredentials(): Promise<Credentials | null>` e
> `clearCredentials()`. Use um `service` de keychain próprio (ex.: `'territory-map-admin/credentials'`),
> distinto do que `app/` usa, e serialize com `JSON.stringify`. Nos testes, `react-native-keychain`
> é mockado — nunca toque no keystore real.
>
> Critérios de aceite como comportamentos observáveis:
> - `saveCredentials` seguido de `readCredentials` devolve os mesmos três campos.
> - `readCredentials` sem nada gravado devolve `null` (o mock devolvendo `false`, que é o que a lib
>   faz quando não há entrada).
> - `clearCredentials` faz `readCredentials` voltar a `null`.
> - `saveCredentials` chama a lib com o `service` desta aplicação, e não com o de `app/`.
> - Um conteúdo gravado que não é JSON válido faz `readCredentials` devolver `null` em vez de
>   estourar — um keystore corrompido devolve o admin à tela de configuração, não a um crash.
> - Nenhum teste, e nenhum caminho do código, escreve a senha num `console.*`.
>
> Toque apenas na camada Data de `admin-app/`; não modifique arquivos de outras camadas nem de
> outros projetos.

---

### Task 06 — Data: sessão com reautenticação silenciosa

**Objetivo:** O "nunca mais pedir login": a sessão faz o login sozinha a partir das credenciais
guardadas e refaz uma única vez quando o JWT de 12h expira.
**Camadas:** Data
**Modo:** TDD
**Depende de:** Task 04, Task 05
**Instrução para o subagente:**
> Spec 0012 — Task 06: Implemente por TDD `admin-app/src/data/session.ts` e `session.test.ts`.
> É o porte de `admin/src/main/session.ts` para o app admin — **leia esse arquivo primeiro** e
> mantenha o mesmo desenho: `createSession({api, store})` devolvendo `isConfigured()`,
> `configure(credentials)`, `run(action)`, `signOut()` e o getter `congregation`. Nos testes, `api`
> e `store` são fakes injetados; não instancie o cliente HTTP real nem o keychain.
>
> Exporte `CredentialsRejectedError extends Error`, lançada quando não há credencial guardada ou
> quando a guardada é recusada pelo servidor — é o sinal que a Task 08 usa para devolver o admin à
> tela de configuração inicial. As duas mensagens devem estar em português e dizer o que fazer.
>
> Critérios de aceite como comportamentos observáveis:
> - `isConfigured()` é falso sem credencial guardada e verdadeiro com.
> - `configure` faz o login **antes** de gravar: se o login falhar, nada é gravado no store (um
>   store fake que registra as escritas prova isso) e o erro do cliente propaga como veio, **não**
>   como `CredentialsRejectedError` — é a tentativa fresca do admin, não uma credencial velha.
> - `configure` bem-sucedido grava as credenciais, aplica o token no cliente e passa a expor a
>   congregação em `session.congregation`.
> - O primeiro `run` sem nada autenticado faz o login a partir do store e só então executa a ação.
> - `run` cuja ação lança um `ApiError` 401 refaz o login e **executa a ação uma segunda vez**;
>   se a segunda também der 401, o erro propaga em vez de entrar em laço infinito.
> - `run` cuja ação lança erro que **não** é 401 (ex.: 409, ou `NetworkError`) propaga direto, sem
>   tentar reautenticar.
> - `run` sem credencial guardada lança `CredentialsRejectedError`, e o login com credencial
>   guardada recusada com 401 também.
> - `signOut` limpa o store, zera o token do cliente e faz `congregation` voltar a `null`.
>
> Toque apenas na camada Data de `admin-app/`; não modifique arquivos de outras camadas nem de
> outros projetos.

---

### Task 07 — Presentation: tela de configuração inicial

**Objetivo:** A única tela em que o admin digita alguma coisa de credencial, e só na primeira
abertura.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 06
**Instrução para o subagente:**
> Spec 0012 — Task 07: Implemente por TDD
> `admin-app/src/presentation/screens/SetupScreen.tsx` e `SetupScreen.test.tsx`. Leia antes
> `admin/src/renderer/screens/SetupScreen.tsx` (o comportamento a espelhar) e
> `app/src/presentation/screens/ActivationScreen.tsx` (as convenções de tela React Native deste
> monorepo: componentes RN, `StyleSheet`, o tema em `theme.ts`, teste com
> `@testing-library/react-native`).
>
> A tela tem três campos — **Nome da congregação**, **Cidade** e **Senha** (esta com
> `secureTextEntry`) — e um botão de confirmar. Ao confirmar, chama `session.configure` (recebida
> por prop, para o teste injetar um fake) e avisa o chamador pelo callback `onConfigured` com a
> congregação devolvida. Escreva no rodapé, em uma linha, que os dados ficam guardados só neste
> aparelho e que o app não vai pedir login de novo.
>
> Critérios de aceite como comportamentos observáveis:
> - Os três campos e o botão aparecem na tela.
> - O botão fica desabilitado enquanto qualquer um dos três campos estiver vazio.
> - Confirmar chama `configure` uma vez com exatamente `{name, city, password}` digitados.
> - Enquanto a chamada está pendente, o botão fica desabilitado e um indicador de carregando
>   aparece — tocar duas vezes não dispara dois logins.
> - Sucesso chama `onConfigured` com a congregação devolvida.
> - Credencial recusada mostra a mensagem de erro numa região acessível ao leitor de tela, e a tela
>   **continua** na configuração, com os campos preservados para correção.
> - Falha de rede mostra a mensagem do erro, distinta da de credencial recusada.
> - A senha digitada não aparece em nenhum lugar da árvore renderizada além do próprio campo, e o
>   campo usa `secureTextEntry`.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

---

### Task 08 — Presentation: navegação, bootstrap e sair da congregação

**Objetivo:** O app decide sozinho, ao abrir, entre a configuração inicial e as designações, e sabe
voltar quando a credencial guardada deixa de valer.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 06, Task 07
**Instrução para o subagente:**
> Spec 0012 — Task 08: Implemente por TDD `admin-app/src/presentation/App.tsx` e `App.test.tsx`.
> Leia antes `app/src/presentation/App.tsx` (o padrão de bootstrap e o `NavigationContainer` com
> native-stack deste monorepo) e `admin/src/renderer/App.tsx` (o comportamento de decidir entre
> setup e app, e o "Sair da congregação").
>
> No mount, o app consulta `session.isConfigured()`: falso leva à `SetupScreen` da Task 07;
> verdadeiro leva direto à tela de designações (que a Task 10 entrega — nesta task, use um
> placeholder mínimo e deixe a Task 10 substituí-lo). Enquanto a consulta não responde, mostre um
> estado de carregando, nunca a tela errada piscando. Exponha um "Sair da congregação" que, depois
> de confirmar num `Alert`, chama `session.signOut()` e devolve o app à `SetupScreen`; o texto da
> confirmação deve dizer que os dados são apagados **deste aparelho** e que nada é apagado no
> servidor. Trate `CredentialsRejectedError` vindo de qualquer tela devolvendo o app à
> `SetupScreen` com uma mensagem explicando que a senha provavelmente mudou no servidor.
>
> Critérios de aceite como comportamentos observáveis:
> - Com `isConfigured` falso, a `SetupScreen` aparece e a tela de designações não.
> - Com `isConfigured` verdadeiro, vai direto para as designações sem passar pela `SetupScreen`.
> - Antes de `isConfigured` resolver, nenhuma das duas aparece — só o carregando.
> - Concluir a configuração na `SetupScreen` leva às designações sem reiniciar o app.
> - "Sair da congregação" pede confirmação; cancelar **não** chama `signOut`; confirmar chama
>   `signOut` e volta à `SetupScreen`.
> - Um `CredentialsRejectedError` lançado pela tela de designações devolve à `SetupScreen` com a
>   mensagem visível.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

---

### Task 09 — Presentation: o mapa das designações em MapLibre

**Objetivo:** O componente que desenha as demarcações e o nome do dirigente sobre cada território.
**Camadas:** Presentation
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0012 — Task 09: Implemente `admin-app/src/presentation/map/AssignmentsMapView.tsx`. Leia
> antes `app/src/presentation/map/TerritoryMapView.tsx` (o setup de
> `@maplibre/maplibre-react-native` com tiles raster do OpenStreetMap, o User-Agent identificado, e
> as convenções de `ShapeSource`/`FillLayer`/`LineLayer`/`SymbolLayer` já usadas neste monorepo) e
> `admin/src/renderer/map/AssignmentsMap.tsx` (o que a página de Designações do desktop desenha:
> **só as demarcações, nenhuma quadra**, com o nome do dirigente sobreposto).
>
> O componente recebe `territories: Territory[]`, um `onSelectTerritory(territory)` e um centro de
> fallback, e desenha: o contorno preenchido de cada território, com cor distinta entre "tem
> dirigente" e "sem dirigente"; um rótulo no centroide de cada um com o nome do território e, na
> linha de baixo, o nome do dirigente (ou "Sem dirigente"). Tocar num território chama
> `onSelectTerritory`. Sem territórios, o mapa centra no fallback. Não desenhe quadras.
>
> Este arquivo é a exceção de teste automatizado já registrada no `AGENTS.md` para a view nativa do
> MapLibre — **não escreva teste para ele**, pelo mesmo motivo de
> `app/src/presentation/map/TerritoryMapView.tsx`: só um emulador provaria alguma coisa. Mantenha
> nele apenas o desenho; qualquer cálculo (centroide, escolha de cor, texto do rótulo) vai para uma
> função pura ao lado, em `admin-app/src/domain/`, com teste — é o que torna a parte não testável o
> menor arquivo possível. Critério de sucesso: `npx tsc --noEmit` e `npm run lint` passam, e o
> arquivo não importa nada de `data/`. Toque apenas na camada Presentation e, se precisar da função
> pura, na Domain de `admin-app/`; não modifique arquivos de outros projetos.

---

### Task 10 — Presentation: a tela de Designações (mapa + lista)

**Objetivo:** A tela principal do app: quem está com cada território, no mapa e em lista.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 06, Task 08, Task 09
**Instrução para o subagente:**
> Spec 0012 — Task 10: Implemente por TDD
> `admin-app/src/presentation/screens/DesignationsScreen.tsx` e `DesignationsScreen.test.tsx`, e
> substitua nela o placeholder que a Task 08 deixou em `App.tsx`. Leia antes
> `admin/src/renderer/screens/DesignationsScreen.tsx` — é o comportamento a espelhar, menos a
> exportação para Excel e menos o import/export S-13, que ficam fora do escopo desta spec.
>
> A tela carrega os territórios com `session.run(() => api.listTerritoriesWithBlocks())` (as duas
> recebidas por prop ou contexto, para o teste injetar fakes), mostra no topo um resumo de quantos
> territórios têm dirigente, o `AssignmentsMapView` da Task 09 e, abaixo, a lista de territórios
> com nome e dirigente atual. Tocar num território — no mapa ou na lista — abre o painel S-13 da
> Task 11. Há um "Recarregar" e um caminho para a tela de quadras da Task 12.
>
> Critérios de aceite como comportamentos observáveis:
> - Enquanto carrega, aparece o indicador de carregando e nenhuma lista.
> - Carregado, cada território aparece na lista com seu nome e o nome do dirigente; um sem
>   designação aparece como "Sem dirigente".
> - O resumo do topo diz quantos dos quantos têm dirigente, e bate com os dados carregados.
> - Sem território nenhum, aparece um texto explicando que os territórios são criados no admin do
>   computador — e não uma lista vazia sem explicação.
> - Falha ao carregar mostra a mensagem do erro numa região acessível ao leitor de tela e oferece
>   "Recarregar"; tocar em "Recarregar" chama a API de novo.
> - Tocar num território da lista abre o painel daquele território, e não de outro.
> - Depois de uma ação do painel que muda a designação, a lista reflete o novo dirigente sem
>   precisar sair e voltar da tela.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

---

### Task 11 — Presentation: o painel S-13 do território

**Objetivo:** O cartão de designação na tela: quem tem agora, quem teve antes, e as três ações.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 03, Task 06
**Instrução para o subagente:**
> Spec 0012 — Task 11: Implemente por TDD
> `admin-app/src/presentation/screens/AssignmentPanel.tsx` e `AssignmentPanel.test.tsx`. Leia antes
> o painel de histórico dentro de `admin/src/renderer/screens/DesignationsScreen.tsx` — é o
> comportamento a espelhar, incluindo os textos de confirmação, que devem dizer a consequência e
> não só a ação.
>
> O painel recebe um `Territory`, carrega `listAssignments(territory.id)` e `listPublishers()` por
> `session.run`, e mostra: a designação **em vigor** com o nome e a data de início; abaixo, as
> anteriores em ordem decrescente (use `sortAssignments` da Task 03), cada uma com início e
> conclusão e um botão de apagar. As ações são "Designar a…" (escolher entre os publicadores),
> "Marcar como concluído" (só quando há designação aberta) e apagar registro. Toda ação destrutiva
> ou que encerra uma designação pede confirmação num `Alert` antes.
>
> Critérios de aceite como comportamentos observáveis:
> - Território sem histórico mostra "Sem designação" e oferece "Designar a…", mas **não** oferece
>   "Marcar como concluído".
> - Com uma designação aberta, o nome do dirigente e a data de início aparecem, e "Marcar como
>   concluído" aparece.
> - As designações concluídas aparecem com as duas datas, mais recente primeiro.
> - Designar quando **já há** uma aberta avisa antes, na confirmação, que a designação atual será
>   encerrada com a data de hoje; cancelar não chama a API.
> - Confirmar "Designar a…" chama `designate(territoryId, publisherId)` com o publicador escolhido
>   e recarrega o cartão.
> - Confirmar "Marcar como concluído" chama `completeAssignment(territoryId)`, e a confirmação diz
>   que o publicador perde na hora o acesso para marcar quadras nele.
> - Apagar um registro pede confirmação dizendo que não há como desfazer; confirmar chama
>   `deleteAssignment(territoryId, assignmentId)` com o id daquela linha, e não de outra.
> - Um erro em qualquer das três ações aparece numa região acessível ao leitor de tela e **não**
>   fecha o painel.
> - Uma mudança bem-sucedida avisa o chamador por callback, para a Task 10 atualizar a lista.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

---

### Task 12 — Presentation: quadras do território e marcar como trabalhada

**Objetivo:** A tela em que o admin lança, em campo, que uma quadra foi trabalhada.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 03, Task 06
**Instrução para o subagente:**
> Spec 0012 — Task 12: Implemente por TDD
> `admin-app/src/presentation/screens/BlocksScreen.tsx` e `BlocksScreen.test.tsx`. Leia antes a
> tabela de quadras de `admin/src/renderer/screens/TerritorySettingsScreen.tsx`,
> `admin/src/renderer/screens/BlockWorkPanel.tsx` e `admin/src/renderer/screens/MarkWorkedForm.tsx`
> — é o comportamento a espelhar, **menos** apagar registro e **menos** forçar status, que ficam
> fora do escopo desta spec e continuam só no desktop.
>
> A tela recebe um `Territory`, lista as quadras dele **ordenadas por número**, cada uma com o
> número, o status por extenso (use `blockStatusLabel` da Task 03, passando o `rotationDays` do
> território) e a data da última visita. Tocar numa quadra expande o histórico de trabalho dela
> (`listWorkLogs`) e o formulário de marcar: um seletor de publicador (de `listPublishers`) e um
> seletor de data com `@react-native-community/datetimepicker`, começando em hoje. Confirmar chama
> `markWorked(blockId, publisherId, workedAt)` por `session.run`.
>
> Duas regras do servidor que a tela precisa respeitar e explicar: **data no futuro é recusada**, e
> o publicador escolhido **não** precisa ser o dirigente do território — diferente do app do
> publicador, o admin lança trabalho de qualquer um. Escreva na tela que um registro novo desfaz um
> status que tenha sido forçado no computador.
>
> Critérios de aceite como comportamentos observáveis:
> - As quadras aparecem ordenadas por número crescente, mesmo que a API devolva fora de ordem.
> - Cada quadra mostra o status por extenso; uma sem visita mostra "Nunca trabalhada" e nenhuma
>   data; uma com visita mostra a data da última.
> - Território sem quadra nenhuma mostra um texto explicando que as quadras são desenhadas no admin
>   do computador.
> - Tocar numa quadra carrega e mostra o histórico de trabalho dela, com nome e data de cada
>   registro, mais recente primeiro; tocar de novo fecha.
> - O botão de marcar fica desabilitado enquanto nenhum publicador estiver escolhido.
> - A data começa em hoje, e escolher uma data no futuro desabilita o marcar com uma explicação
>   visível — sem depender de o servidor recusar.
> - Confirmar chama `markWorked` uma vez, com o id da quadra tocada, o publicador escolhido e a
>   data escolhida; enquanto pendente, o botão não dispara uma segunda chamada.
> - Sucesso recarrega a quadra, e o status e a última visita passam a refletir o registro novo.
> - Erro do servidor aparece numa região acessível ao leitor de tela, e o formulário mantém o que
>   foi digitado.
>
> Toque apenas na camada Presentation de `admin-app/`; não modifique arquivos de outras camadas nem
> de outros projetos.

---

### Task 13 — `admin-app/README.md`

**Objetivo:** Quem for rodar ou empacotar o app admin encontra o caminho sem adivinhar.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 12
**Instrução para o subagente:**
> Spec 0012 — Task 13: Escreva `admin-app/README.md`, espelhando a estrutura de `app/README.md`
> (leia esse arquivo antes). Cubra: instalar (`npm install`), copiar `.env.example` para `.env` e
> preencher `API_BASE_URL` e `APP_KEY`, o fato de o `.env` ser lido em tempo de **build** pelo
> `react-native-config` (editar exige rodar de novo, não há hot reload dele), rodar
> (`npm run android`, exigindo emulador ou aparelho), testar (`npm test`) e empacotar
> (`cd android && ./gradlew assembleRelease`, com o `.apk` em
> `android/app/build/outputs/apk/release/`). Registre três coisas que quem chegar depois precisa
> saber: (1) **é preciso JDK 17**, e esta máquina de desenvolvimento não o tem hoje — Jest e `tsc`
> rodam sem ele, mas nenhum build Android roda; (2) o app **não é assinado**, então o Android vai
> avisar de "fonte desconhecida" na instalação, igual ao app do publicador; (3) este APK é do
> **admin**, `com.territorymapadmin`, e convive no mesmo aparelho com o do publicador
> (`com.territorymapapp`) — são apps diferentes, com credenciais diferentes. Diga também o que o
> app **não** faz, e que para isso o caminho é o admin do computador: desenhar território e quadra,
> cadastrar publicador, forçar status de quadra, apagar registro de trabalho e o import/export
> S-13. Toque apenas em `admin-app/README.md`; não modifique código nem outros projetos.

---

### Task 14 — Documentar o app admin no `AGENTS.md`

**Objetivo:** O `AGENTS.md` passa a descrever quatro partes em vez de três, e corrige dois pontos
que ficaram desatualizados.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 13
**Instrução para o subagente:**
> Spec 0012 — Task 14: Atualize o `AGENTS.md` da raiz. (1) Na tabela da Visão Geral, acrescente a
> quarta parte, **App Admin (Android)**, dizendo para quem é (o responsável pelos territórios, em
> campo) e o que faz — designar, concluir, corrigir o histórico da designação e lançar trabalho de
> quadra —, e dizendo explicitamente o que ela **não** faz, que continua só no desktop: desenhar
> demarcação, gerir publicadores, forçar status, apagar registro de trabalho e import/export S-13.
> (2) Acrescente `admin-app/` à árvore da Estrutura do Projeto e uma linha à seção Arquitetura de
> Camadas com as três camadas dele (`presentation`/`domain`/`data`, com `data/` contendo
> `api-client.ts`, `credentials-store.ts` e `session.ts`), e à tabela de Testes. (3) Registre em
> Restrições e Cuidados que a regra de cor da quadra agora vive em **três** arquivos idênticos —
> `admin/src/renderer/map/blockColor.ts`, `app/src/domain/blockColor.ts` e
> `admin-app/src/domain/blockColor.ts` —, atualizando o aviso que hoje fala em dois. (4) Registre
> que o app admin guarda nome, cidade e senha da congregação no keystore do Android, com o mesmo
> cuidado que o desktop tem com o `safeStorage`: nunca em log, nem em debug. (5) Corrija dois
> pontos desatualizados que **não** vieram desta spec, mas que a execução dela verificou: a API de
> produção responde em `https://territorymap.dalistor.com.br` sobre HTTPS, então o aviso "a API está
> exposta em HTTP puro na porta 8000" deve ser reescrito para refletir o proxy com TLS que já
> existe (mantendo o que continua verdade, como a ausência de backup externo do volume
> `postgis_data`); e o admin desktop ganhou import/export S-13/T em DOCX e XLSX
> (`admin/src/main/docx-handler.ts`, `excel-export.ts`) e uma geocodificação de cidade
> (`geocode.ts`) que a documentação ainda não menciona. Não invente comportamento: leia os arquivos
> antes de descrevê-los. Toque apenas em `AGENTS.md`; não modifique código.

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0012
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo`
da task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

Execute as tasks na ordem indicada, respeitando as dependências.

### Ordem e paralelismo

```
01 ─┬─ 02 ─┬─ 03 ─┬──────────────┬─ 11 ─┐
    │      │      │              │      ├─ 13 ─ 14
    │      ├─ 04 ─┼─ 06 ─┬─ 07 ─ 08 ─ 10 ┤
    │      │      │      │              │
    │      └─ 09 ─┘      └──────────────┴─ 12 ─┘
    └─ 05 ─────────────┘
```

- **05** roda em paralelo com **02**.
- Depois de **02**: **03**, **04** e **09** são independentes entre si.
- Depois de **06**: **07** precede **08**, que precede **10**; **11** e **12** dependem só de
  **03** + **06** e podem correr em paralelo com **10**.

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task (`/centaur-driven-tdd` ou
  `/centaur-driven-implement`) ao iniciar a primeira task, ou pelo `/centaur-driven-run` ao montar
  o plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — Scaffold do projeto `admin-app/` → implements/0170
- [x] Task 02 — Domain: modelos e conversão de coordenadas → implements/0172
- [x] Task 03 — Domain: regras puras da designação e do status da quadra → implements/0174
- [x] Task 04 — Data: cliente HTTP do admin → implements/0175
- [x] Task 05 — Data: credenciais da congregação no keystore → implements/0171
- [x] Task 06 — Data: sessão com reautenticação silenciosa → implements/0176
- [x] Task 07 — Presentation: tela de configuração inicial → implements/0177
- [x] Task 08 — Presentation: navegação, bootstrap e sair da congregação → implements/0181
- [x] Task 09 — Presentation: o mapa das designações em MapLibre → implements/0173
- [x] Task 10 — Presentation: a tela de Designações (mapa + lista) → implements/0183
- [x] Task 11 — Presentation: o painel S-13 do território → implements/0178
- [x] Task 12 — Presentation: quadras do território e marcar como trabalhada → implements/0179
- [x] Task 13 — `admin-app/README.md` → implements/0180
- [x] Task 14 — Documentar o app admin no `AGENTS.md` → implements/0182
