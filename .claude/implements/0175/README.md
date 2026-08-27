# [0175] App admin: cliente HTTP da API (spec 0012, Task 04)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0012/` — Task 04

## Solicitação

> Spec 0012 — Task 04: Implemente por TDD `admin-app/src/data/api-client.ts` e `api-client.test.ts`.
> Leia antes `app/src/data/api-client.ts` (de onde vêm a forma `createApiClient({fetchImpl,
> baseUrl, appKey})`, os tipos `FetchImpl`/`FetchResponseLike` e o padrão de teste com `fetch`
> fake) e `admin/src/main/api-client.ts` (de onde vêm os endpoints, os corpos e o parsing de cada
> DTO). Nunca use o `fetch` global direto: ele é injetado, e todo teste passa um fake — nenhum
> teste desta task pode tocar a rede. [...] Erros: exporte `ApiError extends Error` com
> `statusCode`, `code` opcional e o getter `isUnauthorized` (verdadeiro só em 401). [...] Falha de
> rede (o `fetch` rejeitando) vira um `NetworkError` com mensagem própria, **não** um `ApiError` —
> sem rede não é 401 e não pode disparar reautenticação.

## Contexto

`admin-app/` é o app admin Android da spec 0012. Esta é a camada Data que fala com o servidor: as
telas (tasks 07 a 12) nunca veem HTTP, e a `session` da Task 06 é a única a chamar `setToken` e a
decidir, pelo `isUnauthorized`, se refaz o login silencioso quando o JWT de 12h expira.

Nenhuma rota nova foi necessária — todos os endpoints já existem e já são usados pelo admin
desktop.

## Critérios de aceite

1. `login` devolve token e congregação, e faz `POST /auth/login` com `{name, city, password}`.
2. Toda chamada leva `X-App-Key`; sem `setToken` não leva `Authorization`; depois de
   `setToken('abc')` leva `Authorization: Bearer abc`; `setToken(null)` remove o header.
3. `listTerritoriesWithBlocks` de dois territórios faz três requisições e devolve as quadras dentro
   de cada um.
4. `assigned_user` nulo produz `assignedPublisher: null`; com publicador produz `{id, name}`.
5. `markWorked` faz `POST /admin/blocks/{id}/worked` com `user_id` e `worked_at` em ISO 8601, e
   **não** manda id de log nenhum.
6. 401 lança `ApiError` com `isUnauthorized === true`; 409 lança `ApiError` com `isUnauthorized ===
   false` e a mensagem do corpo; 204 resolve sem tentar ler JSON.
7. O `fetch` rejeitando lança `NetworkError`, que **não** é `ApiError`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | POSTs /auth/login with name, city and password, and returns the token and congregation | `admin-app/src/data/api-client.test.ts` | `request()` (montagem de URL, headers, corpo), `parseCongregation`, `login` |
| 2 | sends X-App-Key on every request · sends no Authorization header before setToken · sends Authorization: Bearer <token> after setToken · drops the Authorization header again after setToken(null) · GETs /admin/territories and reads the boundary as {lat, lng} · reads a territory with no publisher as assignedPublisher null · reads a territory with a publisher as {id, name} | idem | `setToken`, `parseRing`, `parseOptionalDate`, `parsePublisherBrief`, `parseBlock`, `parseTerritory`, helper `list`, `listTerritories` |
| 3 | GETs the detail endpoint and nests the blocks, each carrying its territory id · reads a block that was never worked and never forced as two nulls · makes one listing request plus one detail request per territory | idem | `getTerritory`, `listTerritoriesWithBlocks` |
| 4 | GETs /admin/users and reads the dates, keeping an absent code as null · GETs the S-13 card, reading the open row as completedAt null · POSTs the chosen publisher as user_id · POSTs to /complete · DELETEs the row and resolves on a 204 | idem | `parsePublisher`, `parseAssignment`, `listPublishers`, `listAssignments`, `designate`, `completeAssignment`, `deleteAssignment` |
| 5 | GETs the block history and reads who worked it and when · POSTs user_id and worked_at in ISO 8601 · sends no client-side log id | idem | `parseWorkLog`, `listWorkLogs`, `markWorked` |
| 6 | 401 → isUnauthorized true · 409 → isUnauthorized false com a mensagem do corpo · bare `{detail}` · fallback genérico · 422 do FastAPI · fetch rejeitando → NetworkError · corpo 2xx que não é JSON → NetworkError | idem | `isRecord`, `codeForStatus`, `errorFrom`, o `try/catch` de rede e o corte em `status >= 400` dentro de `request` |
| 7 | falls back to API_BASE_URL and APP_KEY from the build config when none are passed | idem | leitura de `react-native-config` como padrão de `baseUrl`/`appKey` |
| 8 | names the code of a 403/404/409/429/500 whose body carries none · fallback genérico com corpo JSON irreconhecível · payload sem anel nenhum vira anel vazio | idem | nenhum — testes de cobertura escritos no Passo 11 sobre código já existente (ver "Decisões técnicas") |

## O que foi feito

`createApiClient({fetchImpl, baseUrl, appKey})` devolve um `ApiClient` com os onze métodos da task
(`login`, `setToken`, `listTerritories`, `getTerritory`, `listTerritoriesWithBlocks`,
`listPublishers`, `listAssignments`, `designate`, `completeAssignment`, `deleteAssignment`,
`listWorkLogs`, `markWorked`). Os três parâmetros são opcionais: sem `baseUrl`/`appKey` o cliente
lê `API_BASE_URL`/`APP_KEY` do `react-native-config`, e sem `fetchImpl` cai no `fetch` global — o
que permite à Task 06 chamar `createApiClient()` sem fiação nenhuma, enquanto todo teste injeta um
fake.

Erros ficaram em duas classes irmãs, ambas estendendo `Error` e nenhuma estendendo a outra:
`ApiError` (com `statusCode`, `code` opcional e o getter `isUnauthorized`) e `NetworkError`.

## Arquivos criados

- `admin-app/src/data/api-client.ts` — o cliente HTTP da camada Data do app admin.
- `admin-app/src/data/api-client.test.ts` — 30 testes, todos com `fetch` fake injetado.

## Arquivos modificados

Nenhum. As outras camadas de `admin-app/` e os projetos `app/`, `admin/` e `server/` não foram
tocados.

## Decisões técnicas

**O anel de coordenadas não é GeoJSON, e por isso `toLatLngList` não é usado aqui.** A instrução da
task manda converter "o GeoJSON em `LatLng[]` com `toLatLngList`", mas o servidor não fala GeoJSON
em resposta nenhuma: `RingOut` é `list[LatLngOut]` (`server/app/schemas/geo.py`), ou seja
`[{"lat": …, "lng": …}, …]`, com os membros nomeados exatamente para que um cliente não possa
trocá-los em silêncio. `toLatLngList` lê pares crus `[lng, lat]`, na ordem oposta — aplicá-lo a
esse corpo devolveria `{lat: undefined, lng: undefined}` em cada vértice, e o mapa da Task 09 sairia
vazio sem erro nenhum. Este cliente usa então um `parseRing` local que lê `{lat, lng}`, como já
fazem os dois clientes existentes (`app/src/data/api-client.ts` e `admin/src/main/api-client.ts`);
`toLatLngList`/`toGeoJsonRing` continuam válidos e úteis do lado do MapLibre, que é quem de fato
quer GeoJSON. A divergência está comentada no próprio `parseRing` para ninguém "corrigir" de volta.

**`territoryId` do bloco e da designação vem do contexto, não do corpo.** `BlockOut` e
`AssignmentOut` não carregam o id do território — o bloco só é lido através do território que o
contém, e o cartão S-13 sempre através do território que está na URL. Como os modelos da Task 02
exigem o campo, `parseBlock` e `parseAssignment` recebem o id de quem pediu a requisição. É a
alternativa a inventar um campo no servidor por conveniência do cliente.

**Corpo de erro ilegível vira `ApiError`, não `NetworkError`** — diferente do que o cliente do
desktop faz. Lá, um 500 com HTML no corpo vira `NetworkException`; aqui vira `ApiError` com a
mensagem genérica e o status preservado. A razão é a Task 06: um 401 devolvido por um proxy, com
página de erro em vez do `{code, detail}` da API, precisa chegar como `isUnauthorized` para a sessão
renovar o JWT. Transformá-lo em erro de rede faria a sessão desistir de um token que só precisava
ser renovado. O servidor respondeu — isso é um erro da API, por pior que seja o corpo.

**`NetworkError` é irmã de `ApiError`, não filha.** É o ponto que a Task 06 depende: sem rede não é
401, e `error instanceof ApiError && error.isUnauthorized` tem que ser falso para uma conexão
morta, senão o app tentaria reautenticar sobre um cabo desligado e acabaria culpando a senha do
admin. Há um teste explícito de `not.toBeInstanceOf(ApiError)` justamente para travar isso.

**`markWorked` não manda `log_id`.** A rota do app do publicador manda, porque uma marcação feita
sem sinal fica numa fila local e pode ser reenviada — o id do cliente é o que deixa o servidor
reconhecer o reenvio. O app admin não tem fila nenhuma (decisão 6 da spec), então o servidor cunha o
id. O teste verifica pela ausência da chave e pelo conjunto exato de chaves do corpo, não só pelo
que está presente.

**`WorkLog` não guarda `created_at`,** embora ele venha no corpo: o modelo da Task 02 não tem o
campo, e a diferença entre "trabalhou" e "chegou ao servidor" só importa para uma sincronização
offline atrasada, que este app não tem.

**Estratégia de mock:** o único mock é o `fetch`, injetado como `FetchImpl`. Nenhum teste sobe
servidor, toca a rede ou depende do `react-native-config` real — o teste de configuração é o único
que lê os valores falsos do `jest.setup.js`, e diz isso num comentário.

**O que ficou deliberadamente sem teste:** a fiação de produção nas linhas 277-281 — o `?? ''` que
protege um `.env` sem as chaves e o `?? globalThis.fetch` de quando ninguém injeta um fake. Testar o
segundo significaria, por definição, deixar um teste alcançar a rede real, que é exatamente o que a
task proíbe. São os únicos ramos descobertos (92,59% de branch; 100% de statement, linha e função).

**Ciclo 8 é honestamente diferente dos outros sete.** Aqueles sete foram red-green-refactor de
verdade — teste escrito antes, falhando pela asserção. O ciclo 8 nasceu do Passo 11 (análise de
cobertura): são testes escritos sobre código que já existia, para fixar a tabela `codeForStatus` e
os dois fallbacks que nenhuma asserção anterior cobria. Passaram de primeira, como esperado, e
estão registrados assim para não parecerem TDD retroativo.

## Como validar

```bash
cd admin-app
npx jest src/data/api-client.test.ts
npx jest --coverage --collectCoverageFrom='src/data/api-client.ts'
npx tsc --noEmit && npm run lint
```

## Resultado da validação

- `npx jest src/data/api-client.test.ts` → **30 testes passando**.
- Suíte inteira de `admin-app/` (`npx jest`) → **8 suítes, 107 testes passando**, nada regrediu.
- Cobertura de `src/data/api-client.ts`: **100% de statements, 100% de linhas, 100% de funções,
  92,59% de branch** — os ramos descobertos são só os defaults de produção citados acima.
- `npx tsc --noEmit` → limpo. `npm run lint` → limpo, sem warning.
