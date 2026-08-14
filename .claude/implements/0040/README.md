# [0040] Domínio compartilhado do admin: modelos e exceções de API (`shared/models.ts`, `shared/api-errors.ts`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0003/` — Task 03

## Solicitação

Implementar `admin/src/shared/models.ts` com as interfaces `Congregation`, `Publisher`,
`PublisherBrief`, `Territory`, `Block`, `WorkLog` e `AdminSession`, espelhando os campos de
`packages/core/lib/models/models.dart`, mais cinco funções derivadas puras
(`publisherHasLiveCode`, `publisherIsPending`, `blockWasNeverWorked`, `blockTimeSinceWorked`,
`workLogWasSyncedLate`) cobertas por TDD, e `admin/src/shared/api-errors.ts` com a hierarquia de
erro (`ApiException`, `ApiErrorException` com `isUnauthorized`, `NetworkException`). A conversão
`fromJson` a partir da resposta HTTP fica para a Task 04.

## Contexto

Task 03 da spec 0003 (migração do admin de Flutter para Electron + React + TypeScript). É a
segunda camada do domínio compartilhado (`shared/`) depois do scaffold da Task 01 — os tipos e
regras derivadas puras que vão alimentar o cliente HTTP (Task 04), a sessão (Task 06) e várias
telas do renderer (Tasks 09, 14, 17, 18). Sem dependência de Electron, Node ou rede — testável em
Vitest puro.

## Critérios de aceite

- `publisherHasLiveCode(publisher, now)`: verdadeiro sse `accessCode` existe **e**
  `accessCodeExpiresAt` existe e é depois de `now` (limite: `now === accessCodeExpiresAt` conta
  como expirado).
- `publisherIsPending(publisher)`: verdadeiro sse `activatedAt` é `undefined`/`null`.
- `blockWasNeverWorked(block)`: verdadeiro sse `lastWorkedAt` é `undefined`/`null`.
- `blockTimeSinceWorked(block, now)`: `null` se nunca trabalhada, senão `now - lastWorkedAt` em ms.
- `workLogWasSyncedLate(log)`: verdadeiro sse `createdAt - workedAt > 5 minutos` (limite: exatamente
  5 minutos não é atrasado).
- `ApiException extends Error`; `ApiErrorException` com `statusCode`, `code`, `detail` e
  `isUnauthorized` (verdadeiro sse `statusCode === 401` ou `code === 'unauthorized'`);
  `NetworkException` sem `statusCode`/`code`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `is pending when activatedAt is undefined` | `src/shared/models.test.ts` | `models.ts` criado com todas as interfaces + `publisherIsPending` |
| 2 | `was never worked when lastWorkedAt is undefined` | `src/shared/models.test.ts` | `blockWasNeverWorked` |
| 3 | 5 casos de `publisherHasLiveCode` (código presente/ausente, expiração ausente, limite exato, já expirado) | `src/shared/models.test.ts` | `publisherHasLiveCode` |
| 4 | `is null when the block was never worked` | `src/shared/models.test.ts` | `blockTimeSinceWorked` |
| 5 | `was synced late when createdAt is more than 5 minutes after workedAt` | `src/shared/models.test.ts` | `workLogWasSyncedLate` |
| 6 | Hierarquia `instanceof`, campos de `ApiErrorException`, `isUnauthorized` (3 casos: por status, por code, nenhum dos dois), `NetworkException` sem `statusCode`/`code` | `src/shared/api-errors.test.ts` | `api-errors.ts` criado |

Cada ciclo seguiu RED (rodei o teste e confirmei falha pelo motivo certo — função/arquivo
inexistente) → GREEN (implementação mínima) → confirmação com a suíte completa. Casos
complementares de um mesmo comportamento (ex. "não está pendente quando `activatedAt` existe") não
abriram novo ciclo RED por não exigirem código novo — foram adicionados e confirmados verdes junto
da implementação já correta, e documentados aqui por completude do critério de aceite.

## O que foi feito

Criei os dois arquivos de domínio compartilhado do admin com os tipos que espelham
`packages/core/lib/models/models.dart` e as cinco funções derivadas puras, mais a hierarquia de
erro da API. Nenhuma lógica de parsing HTTP, IPC ou UI — só tipos e funções puras, como pedido.

## Arquivos criados

- `admin/src/shared/models.ts` — `Congregation`, `Publisher`, `PublisherBrief`, `Territory`,
  `Block`, `WorkLog`, `AdminSession`, e as cinco funções derivadas.
- `admin/src/shared/models.test.ts` — 15 testes.
- `admin/src/shared/api-errors.ts` — `ApiException`, `ApiErrorException`, `NetworkException`.
- `admin/src/shared/api-errors.test.ts` — 6 testes.

## Decisões técnicas

- **`LatLng` importado de `./geo`, não redeclarado.** A Task 02 (mesma spec, rodando em paralelo)
  ainda não tinha criado `admin/src/shared/geo.ts` quando comecei — a instrução previa esse caso e
  autorizava uma interface mínima local (`{ readonly lat: number; readonly lng: number }`). Escrevi
  assim inicialmente. Antes de finalizar, `geo.ts` apareceu (Task 02 concluiu em paralelo) com a
  mesma forma exata; troquei a declaração local por `import type { LatLng } from './geo'` para não
  deixar dois tipos estruturalmente idênticos divergindo com o tempo — é refactor dentro do escopo
  autorizado (só toquei `models.ts`, não editei `geo.ts`) e a suíte seguiu verde depois da troca.
- **Sem `fromJson` aqui.** A conversão da resposta HTTP (`snake_case` → `camelCase`, parsing de
  data, `ringFromJson`) é escopo da Task 04 (`main/api-client.ts`), que já vai ter os testes de
  parsing ao lado do cliente HTTP que os produz — decisão do plano da spec, não peguei essa parte.
- **`isEncryptionAvailable`/`credentials-store.test.ts` fora do escopo.** `npm run typecheck`
  aponta erros de tipo em `src/main/credentials-store.test.ts` (mocks de `safeStorage` incompatíveis
  com a interface `SafeStorageLike`) — é a Task 05 desta mesma spec, rodando em paralelo por outro
  agente, e não faz parte dos arquivos que esta task deveria tocar. Confirmei que nenhum erro de
  `typecheck` está em `shared/models.ts`, `shared/api-errors.ts` ou `shared/geo.ts`.
- **Classes de erro sem `Object.setPrototypeOf`.** `tsconfig` do projeto compila com
  `target: esnext`, onde `class X extends Error` preserva a cadeia de protótipos nativamente — o
  workaround clássico do TypeScript (necessário só em alvos ES5/ES2015 com certas configurações de
  `lib`) não se aplica aqui. Confirmado pelo teste `instanceof` passando.
- **Sem teste de `ApiException` isolado.** A instrução chamava as classes de "estruturais" e pedia
  só um `instanceof` básico "se fizer sentido" — cobri isso dentro dos testes de
  `ApiErrorException`/`NetworkException` (que herdam de `ApiException` e de `Error`), sem duplicar
  um terceiro describe só para a classe base, que não tem comportamento próprio.

## Como validar

```bash
cd admin
npx vitest run src/shared/models.test.ts src/shared/api-errors.test.ts
npx vitest run --coverage src/shared/models.test.ts src/shared/api-errors.test.ts
npx eslint src/shared/models.ts src/shared/models.test.ts src/shared/api-errors.ts src/shared/api-errors.test.ts
```

## Resultado da validação

- `npx vitest run` (suíte completa do projeto, 5 arquivos incluindo os desta task e os de Task 02
  concluída em paralelo): **59 testes passando**, nenhuma falha.
- `npx vitest run src/shared/models.test.ts src/shared/api-errors.test.ts`: **21 testes passando**
  (15 em `models.test.ts`, 6 em `api-errors.test.ts`).
- Cobertura (`--coverage`, restrita aos dois arquivos de teste desta task): **100% statements,
  100% branches, 100% functions, 100% lines**.
- `npx eslint` nos quatro arquivos desta task: **0 erros, 0 warnings**.
- `npm run typecheck`: limpo para `shared/models.ts`, `shared/api-errors.ts` e `shared/geo.ts`;
  erros existentes em `src/main/credentials-store.test.ts` pertencem à Task 05 (fora do escopo
  desta task, em andamento em paralelo).
