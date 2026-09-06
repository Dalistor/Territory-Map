# [0082] App/Data: cliente HTTP da API (`api-client.ts`)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0005/` — Task 18

## Solicitação

Criar `app/src/data/api-client.ts`, o único lugar do app que fala com o servidor: `activate`
(`POST /app/activate`), `listTerritories` (`GET /app/territories`), `listWorkedTerritories`
(`GET /app/worked-territories`) e `markBlockWorked` (`POST /app/blocks/{id}/worked`, aceitando
201 e 200 como sucesso). Toda chamada injeta `X-App-Key` (lido de `react-native-config`) e,
quando há token, `Authorization: Bearer <token>`. Erros não-2xx viram `ApiErrorException`
(`code`/`detail`); falha de rede vira `NetworkException`, distinguível da anterior.

## Contexto

É a Task 18 da spec 0005 (app do publicador em React Native). Task 16 (scaffold do projeto) já
estava concluída. A Task 17 (`app/src/domain/models.ts`, tipos e regras puras) estava marcada como
"rodando em paralelo" na instrução original; ao investigar o estado do repositório no início desta
task ela ainda não existia, então o plano era declarar tipos locais mínimos e deixar uma task futura
reconciliar. Antes de finalizar, uma nova checagem mostrou que a Task 17 (e também a Task 19,
`session-store.ts`) já haviam terminado em paralelo — `app/src/domain/models.ts` define exatamente
`LatLng`, `PublisherBrief`, `Congregation`, `Block`, `Territory`, `WorkedTerritory` e `Session` com
os mesmos nomes de campo que este cliente precisava. A reconciliação foi feita na hora, importando
esses tipos em vez de duplicá-los — sem tocar em `domain/models.ts`, só em `api-client.ts`.

## Critérios de aceite

- Caminho feliz de `activate`, `listTerritories`, `listWorkedTerritories` e `markBlockWorked`:
  URL, método HTTP e headers corretos, resposta 2xx decodificada no formato esperado.
- `markBlockWorked` trata 201 e 200 como sucesso, sem lançar erro em nenhum dos dois.
- Resposta não-2xx com corpo `{"code", "detail"}` vira `ApiErrorException` com esses mesmos campos.
- Falha de `fetch` (rejeita) vira `NetworkException`, tipo distinto de `ApiErrorException`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|-------------------|------------------------------|
| 1 | `activate` monta URL/método/corpo e decodifica o resultado; envia `X-App-Key` e nenhum `Authorization` (sem token) | `src/data/api-client.test.ts` | `createApiClient`, `request()`, `parseSession`, hierarquia de exceções |
| 2 | `listTerritories` envia `Authorization: Bearer <token>` e decodifica a lista, inclusive território sem `assigned_user`/sem `blocks` | idem | `parseTerritory`, `parseBlock`, `parseLatLng` |
| 3 | `listWorkedTerritories` envia `Authorization` e decodifica a lista | idem | `parseWorkedTerritory` |
| 4 | `markBlockWorked` monta `{log_id, worked_at}` e resolve tanto em 201 quanto em 200 | idem | corpo de `markBlockWorked`, checagem `status >= 400` em vez de status exato |
| 5 | Resposta não-2xx com `{code, detail}` vira `ApiErrorException` com os mesmos campos | idem | `errorFrom()` |
| 6 | `fetch` rejeitando vira `NetworkException`, distinto de `ApiErrorException` | idem | bloco `try/catch` de `request()` em torno de `fetchImpl` |

Ciclos extras, para fechar cobertura de branch nos mesmos caminhos defensivos que
`admin/src/main/api-client.test.ts` já cobre para o cliente do admin: corpo de erro não-2xx que não
é JSON válido, corpo de erro não-2xx que é JSON mas não tem o formato `{code, detail}`, corpo de
sucesso 2xx que não é JSON válido, e um bloco nunca trabalhado (`last_worked_at: null` →
`lastWorkedAt: undefined`).

## O que foi feito

Criado `app/src/data/api-client.ts` com `createApiClient(options)`, que aceita um `fetchImpl`
injetável (por padrão o `fetch` global do React Native) e devolve um `ApiClient` com os quatro
métodos pedidos. Internamente, uma função `request()` única monta headers, injeta `X-App-Key` e
`Authorization`, chama `fetchImpl`, e distingue três desfechos: `fetch` que nunca voltou (
`NetworkException`), resposta `>= 400` (`errorFrom()` → `ApiErrorException` quando o corpo é
`{code, detail}`, `NetworkException` quando o corpo não é esse contrato), e sucesso decodificado
como JSON. `markBlockWorked` não trata 200/201 como casos especiais — qualquer status `< 400` já é
sucesso, o que cobre os dois de graça.

Os tipos de domínio (`LatLng`, `PublisherBrief`, `Congregation`, `Block`, `Territory`,
`WorkedTerritory`, `Session`) são importados de `../domain/models` (Task 17), não duplicados.

## Arquivos modificados

Nenhum (arquivos novos apenas).

## Arquivos criados

- `app/src/data/api-client.ts` — o cliente HTTP do app.
- `app/src/data/api-client.test.ts` — os testes, com `react-native-config` mockado via
  `jest.mock('react-native-config', ...)` inline no arquivo de teste e um `FetchImpl` fake
  injetado em cada teste — nenhuma chamada de rede real.

## Decisões técnicas

- **Hierarquia de exceção local, não importada do admin.** `ApiException`/`ApiErrorException`/
  `NetworkException` replicam a forma de `admin/src/shared/api-errors.ts`, mas são declaradas
  dentro de `api-client.ts` -- o app não importa código do admin (linguagens/pacotes separados), e
  a task pediu para tocar só este arquivo.
- **Token passado por parâmetro, não guardado no cliente.** Diferente do cliente do admin (que tem
  `setToken()`/estado interno), aqui cada método recebe o `token` explicitamente, exatamente como a
  assinatura pedida na task -- quem guarda o token é `session-store.ts` (Task 19); este módulo é sem
  estado.
- **`errorFrom` também devolve `NetworkException` para corpos de erro fora do contrato.** O
  `AGENTS.md` garante que o servidor sempre responde `{code, detail}` em erro, mas replicar a mesma
  rede de segurança do cliente do admin (corpo não-JSON, corpo JSON sem esse formato) custa poucas
  linhas e mantém os dois clientes com o mesmo comportamento defensivo -- é o mesmo padrão que
  `admin/src/main/api-client.test.ts` testa.
- **Reconciliação com `domain/models.ts` feita nesta task, não adiada.** A instrução previa
  declarar tipos locais mínimos caso a Task 17 ainda não tivesse terminado. Como ela (e a Task 19)
  terminaram durante a execução desta task, os tipos foram importados de `../domain/models` em vez
  de duplicados -- evita que uma task de reconciliação precise existir depois, e `session-store.ts`
  (Task 19) já espera que `activate()` devolva exatamente o formato de `Session`.
- **Branches deliberadamente sem teste:** o `fetchImpl` padrão (`globalThis.fetch`, nunca exercido
  porque todo teste injeta um fake) e os fallbacks `Config.APP_KEY ?? ''` / `Config.API_BASE_URL ??
  ''` (nunca exercidos porque o mock de `react-native-config` sempre tem valor) -- mesmos pontos que
  o cliente do admin também deixa sem teste, por serem defaults de infraestrutura e não regra de
  negócio.

## Como validar

```bash
cd app
npx jest src/data/api-client.test.ts
npx jest --coverage --collectCoverageFrom='src/data/api-client.ts'
npx tsc --noEmit
npm run lint
```

## Resultado da validação

- `npx jest src/data/api-client.test.ts`: **17 testes, todos verdes** (mais os 8 já existentes de
  `session-store.test.ts`, `blockColor.test.ts`, `assignment.test.ts` e `App.test.tsx` continuam
  passando — suíte completa do projeto: **25 testes, 5 suites, todos verdes**).
- Cobertura de `src/data/api-client.ts`: **100% linhas, 97.95% statements, 100% funções, 79.41%
  branches** — os branches restantes são os fallbacks defensivos documentados acima.
- `npx tsc --noEmit`: sem erros.
- `npm run lint`: sem warnings nem erros.
