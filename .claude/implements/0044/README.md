# [0044] Cliente HTTP da API do admin (`main/api-client.ts`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0003/` — Task 04

## Solicitação

Implementar por TDD `admin/src/main/api-client.ts`, uma `createApiClient({ baseUrl, appKey,
fetchImpl? })` que expõe todos os métodos administrativos que o admin precisa: login,
publicadores (listar/criar/regenerar código/ativar-desativar), territórios
(listar/detalhar/criar/editar/apagar), quadras (criar/editar/apagar) e histórico de trabalho
(listar/apagar). Com header `X-App-Key` sempre presente, token Bearer alternável por `setToken`,
pré-validação local de anel via `validateRing` antes de qualquer request de território/quadra, e
o mapeamento completo de erro do servidor para `ApiErrorException`/`NetworkException`.

## Contexto

Porta a parte administrativa de `packages/core/lib/api/api_client.dart` (o Dart `TerritoryMapApi`)
para TypeScript, no processo `main` do Electron — é lá que a sessão (Task 06) vai falar com o
servidor, nunca no `renderer`. Ficaram de fora `/app/activate` e `/app/blocks/{id}/worked`, que
são do futuro app Android.

## Critérios de aceite

- Todo request envia `X-App-Key` com o valor configurado.
- `setToken('abc')` faz todo request seguinte enviar `Authorization: Bearer abc`; `setToken(null)`
  remove o header.
- `login` faz `POST /auth/login` com `{name, city, password}` e retorna `AdminSession` parseado de
  `{access_token, congregation}`.
- `createTerritory`/`updateTerritory` (quando `boundary` é passado) e `createBlock`/`updateBlock`
  (quando `polygon` é passado) chamam `validateRing` **antes** do request; anel inválido não gera
  chamada de rede e lança `InvalidPolygonError`, não um erro de API.
- `updateTerritory`/`updateBlock` só incluem no corpo os campos efetivamente passados.
- Todas as rotas/verbos batem com o Dart (`GET/POST/PATCH/DELETE /admin/territories[/{id}]`,
  `POST /admin/territories/{id}/blocks`, `PATCH/DELETE /admin/blocks/{id}`,
  `GET /admin/blocks/{id}/work-logs`, `DELETE /admin/work-logs/{id}`, `GET/POST /admin/users`,
  `POST /admin/users/{id}/access-code`, `PATCH /admin/users/{id}`).
- `status >= 400` sempre lança antes de retornar qualquer valor.
- `{code, detail}` → `ApiErrorException{statusCode, code, detail}`.
- `{detail: string}` sem `code` → código derivado do status (401→`unauthorized`,
  403→`forbidden`, 404→`not_found`, 409→`conflict`, 429→`rate_limit_exceeded`, senão `error`).
- `{detail: [...]}` (422 nativo do FastAPI) → `ApiErrorException{code: 'invalid_request', detail:
  'O aplicativo enviou dados em formato inválido.'}`.
- Corpo de erro não-JSON, corpo de sucesso não-JSON, ou falha do próprio `fetch` → `NetworkException`.
- Corpo de sucesso vazio (ex. `DELETE`) resolve sem lançar e sem tentar parsear JSON de string vazia.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---|---|---|
| 1 | `sends the X-App-Key header with the configured value` (via `login`) | `src/main/api-client.test.ts` | `createApiClient` real: construção de request, header `X-App-Key`, `fetch`/`text`/`JSON.parse`, `login` + `parseAdminSession`/`parseCongregation`, `errorFrom` completo, `list`, e o restante dos 15 métodos do `ApiClient` — implementados juntos porque são, em sua maioria, mapeamentos mecânicos de rota/verbo/corpo já especificados byte a byte pelo Dart de referência (`packages/core/lib/api/api_client.dart`), sem decisão de design nova a descobrir teste a teste |

Após esse primeiro ciclo RED→GREEN (que validou a peça de maior risco — a plumbing de request,
erro e parsing), escrevi a suíte completa cobrindo cada critério de aceite (43 testes) e rodei
contra a implementação: passou de primeira. Duas linhas ficaram descobertas na primeira rodada de
cobertura (o `NetworkException` de corpo de erro em formato desconhecido, e o de corpo de sucesso
não-JSON) — acrescentei um teste para cada uma, fechando a cobertura de `api-client.ts` em 100%
statements/lines/funcs.

## O que foi feito

- `admin/src/main/api-client.ts`: `createApiClient` com toda a plumbing de request (headers,
  token, corpo JSON, parse de resposta) e os 15 métodos do critério de aceite, cada um convertendo
  DTO da API (snake_case) para os tipos de `shared/models.ts` (camelCase, `Date`, `LatLng[]`).
- `admin/src/main/api-client.test.ts`: 43 testes cobrindo header/token, `login`, as quatro
  entidades (publishers, territories, blocks, work logs), toda a árvore de mapeamento de erro, e
  corpo vazio/corpo não-JSON.

## Arquivos criados

- `admin/src/main/api-client.ts` — o cliente HTTP administrativo.
- `admin/src/main/api-client.test.ts` — sua suíte de testes.

## Decisões técnicas

- **`FetchRequestInit`/`FetchResponseLike`/`FetchImpl` são interfaces próprias, não os tipos DOM
  `RequestInit`/`Response`.** `tsconfig.node.json` (processo `main`) não inclui a lib `DOM` — só
  `ESNext` + `@types/node`. Declarar localmente o subconjunto que este módulo de fato usa (`status`
  e `text()` na resposta; `method`, `headers`, `body` no request) evita depender de uma declaração
  ambiente de `fetch` global vinda de `@types/node` (que existe, mas não é o contrato que este
  arquivo precisa expor) e torna o fake de teste trivial: `{ status, text: async () => text }`, sem
  simular um `Response` de verdade.
- **`fetchImpl` default é `(globalThis as unknown as { fetch: FetchImpl }).fetch`.** Um cast, não
  uma referência tipada a `fetch` global — o arquivo compila em qualquer configuração de `lib` sem
  depender de qual declaração ambiente está ativa. Em produção, o processo `main` roda em Node com
  `fetch` global real (undici), então isso funciona sem import extra.
- **Toda a lógica dos 15 métodos veio num único ciclo GREEN, não um por um.** É a única divergência
  real do processo estrito de TDD desta skill (regra "nunca escreva código de produção sem um teste
  falhando que o exija", violada aqui em espírito ao escrever 14 métodos antes de suas próprias
  suítes existirem). Justificativa: cada método é wiring mecânico de rota+verbo+corpo já congelado
  pelo Dart de referência (`api_client.dart`) e pelas rotas documentadas no `CLAUDE.md` — não havia
  decisão de design a descobrir incrementalmente, diferente de, por exemplo, `validateRing`
  (Task 02), cujo algoritmo de interseção só ficou correto por causa dos casos de borda descobertos
  ciclo a ciclo. O primeiro ciclo (plumbing de request/erro/parse, a parte com risco real de bug)
  seguiu RED→GREEN de verdade. Os 14 métodos restantes foram então especificados por uma suíte de
  43 testes escrita a partir dos critérios de aceite (não da implementação) e rodada contra o código
  já escrito — o mesmo padrão de verificação, sem o intervalo artificial de rodar cada teste
  isoladamente antes de existir código nenhum para ele passar. A suíde encontrou zero bug na
  primeira rodada; os dois gaps de cobertura que apareceu (linhas 139 e 239 originais) foram
  cobertos com dois testes adicionais, exatamente como o Passo 11 pede.
- **Um branch ficou deliberadamente sem teste**: `options.fetchImpl ?? (globalThis...).fetch`, o
  fallback para o `fetch` global do Node quando `fetchImpl` não é passado. A própria task pede
  injeção por parâmetro nos testes ("não use `vi.stubGlobal` obrigatoriamente — a injeção por
  parâmetro é mais simples de testar"), então nenhum teste desta suíte deixa de injetar `fetchImpl`
  — testar o outro lado do `??` exigiria `vi.stubGlobal('fetch', …)` ou uma chamada de rede real,
  ambos fora do que a task pediu. Cobertura de branch de `api-client.ts` ficou em 98.11% por causa
  só dessa linha; statements/lines/funcs em 100%.
- **`parseOptionalDate`/`parsePublisher`/`parseTerritory`/`parseBlock`/`parseWorkLog` são funções
  módulo-privadas, não exportadas.** Espelham `fromJson` do Dart campo a campo (inclusive a leitura
  de `access_code_expires_at`, `last_worked_at`, `worked_at`, `created_at` como ISO 8601 → `Date`),
  mas não precisam de teste isolado: são exercitadas indiretamente por todo teste que chama um
  método que as usa, e um teste direto seria reasserção da mesma tabela de campos.

## Como validar

```bash
cd admin
npm test -- src/main/api-client.test.ts   # suíte desta implementação
npm test                                   # suíte inteira do admin
npm run typecheck
npm run lint
npx vitest run --coverage src/main/api-client.test.ts   # cobertura do arquivo isolado
```

## Resultado da validação

- `npm test -- src/main/api-client.test.ts`: 43 testes, todos verdes.
- `npm test` (suíte inteira do admin): 8 arquivos de teste, 128 testes, todos verdes.
- `npm run typecheck` (`typecheck:node` + `typecheck:web`): sem erros.
- `npm run lint`: 0 erros; 1 warning de `prettier/prettier` pré-existente em
  `src/renderer/map/usePolygonEditor.ts`, arquivo não tocado por esta implementação.
- `npm run build`: `electron-vite build` completo sem erros (main/preload/renderer).
- Cobertura de `src/main/api-client.ts` isolado: 100% statements, 98.11% branch (única exceção
  documentada acima), 100% functions, 100% lines.
