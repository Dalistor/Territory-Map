# [0186] App admin: apagar registro de trabalho no cliente HTTP

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0013/` — Task 03

## Solicitação
Implementar por TDD o método `deleteWorkLog(logId: string): Promise<void>` em
`admin-app/src/data/api-client.ts`, acrescentando casos ao `api-client.test.ts` existente. Faz
`DELETE /admin/work-logs/{logId}`, o mesmo caminho já usado por `admin/src/main/api-client.ts`.

## Contexto
A spec 0013 reverte, de propósito, a decisão da spec 0012 de que "apagar registro de trabalho é só
no desktop": quem lança trabalho errado em campo precisa desfazer em campo. A rota já existe no
servidor (204, recalculando `last_worked_at` da quadra a partir do que sobrou); o que faltava era o
método no cliente do `admin-app`, que a Task 05 (painel da quadra) vai consumir.

## Critérios de aceite
- `DELETE` em `/admin/work-logs/{logId}` com o id recebido, levando `X-App-Key`.
- 204 resolve sem tentar ler JSON do corpo.
- Com token aplicado por `setToken`, leva `Authorization: Bearer <token>`.
- 404 lança `ApiError` com `isUnauthorized === false` e a mensagem vinda do corpo.
- 401 lança `ApiError` com `isUnauthorized === true`.
- `fetch` rejeitando lança `NetworkError`, não `ApiError`.

## Ciclos TDD
Um ciclo só de RED→GREEN: os cinco casos foram escritos juntos porque descrevem um único método
novo e falhavam todos pelo mesmo motivo (`client.deleteWorkLog is not a function`) — o RED foi
executado e conferido antes de qualquer linha de produção.

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | DELETEs /admin/work-logs/{logId} com app key, e resolve no 204 sem ler corpo | `admin-app/src/data/api-client.test.ts` | `deleteWorkLog` + entrada em `ApiClient` |
| 2 | manda `Authorization: Bearer <token>` depois do `setToken` | idem | (coberto pelo `request` compartilhado) |
| 3 | 404 vira `ApiError` com a mensagem do corpo e `isUnauthorized === false` | idem | idem |
| 4 | 401 vira `ApiError` com `isUnauthorized === true` | idem | idem |
| 5 | `fetch` rejeitando vira `NetworkError`, não `ApiError` | idem | idem |

## O que foi feito
`deleteWorkLog` acrescentado à interface `ApiClient` e à implementação de `createApiClient`, como um
`await request('DELETE', ...)` sobre o mesmo helper que os métodos vizinhos usam — é ele que injeta
`X-App-Key`, o bearer, o `errorFrom` e o `NetworkError`, e que já trata corpo vazio de 204. O fake de
`ApiClient` em `session.test.ts` ganhou o novo membro, senão o `tsc` recusaria o objeto.

## Arquivos modificados
- `admin-app/src/data/api-client.ts` — `deleteWorkLog` na interface e na implementação
- `admin-app/src/data/api-client.test.ts` — cinco casos novos em `describe('deleteWorkLog')`
- `admin-app/src/data/session.test.ts` — `deleteWorkLog: jest.fn()` no fake de `ApiClient`

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Nenhuma lógica própria no método.** Todo o comportamento exigido pelos critérios (header,
  bearer, 204 sem corpo, `ApiError` vs `NetworkError`) já vive no `request` compartilhado; escrever
  qualquer coisa a mais seria duplicar o que a suíte já cobria pelos outros métodos. Os testes novos
  existem mesmo assim porque descrevem o contrato **desta** rota — o caminho e o verbo — que nenhum
  outro teste garante.
- **Endereçado pelo id do log, não pelo bloco.** É o caminho que o desktop já usa; foi lido de
  `admin/src/main/api-client.ts:451`, não inventado.
- **`session.test.ts` foi tocado.** É camada Data e é consequência direta de alargar a interface —
  sem isso o `npx tsc --noEmit` quebra. Nenhuma asserção existente foi alterada.

## Como validar
```bash
cd admin-app && npx jest src/data/api-client.test.ts
```

## Resultado da validação
- `npx jest src/data/api-client.test.ts` → 39 testes passando (34 antes, 5 novos).
- `npm test` (suíte inteira do `admin-app`) → 13 suítes, todas passando.
- `npx jest src/data --coverage --collectCoverageFrom='src/data/api-client.ts'` → **100% de linhas,
  statements e funções**; branch 92,59%, com as únicas descobertas nas linhas 278-282 — os fallbacks
  de `Config.API_BASE_URL`/`Config.APP_KEY`, pré-existentes e alheios a esta mudança.
- `npx tsc --noEmit` limpo (os erros restantes eram de `src/domain/territoryMap.test.ts`, da Task 02
  em execução paralela, e não deste trabalho).
- `npm run lint` limpo.
