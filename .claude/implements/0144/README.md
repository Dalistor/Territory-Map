# [0144] Admin: main e IPC ganham a rotação do território e a marcação de quadra

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 08

## Solicitação
> Spec 0009 — Task 08: implemente por TDD em `admin/src/main/api-client.ts`,
> `admin/src/shared/ipc-contract.ts`, `admin/src/main/ipc-handlers.ts` e
> `admin/src/preload/index.ts`, com os testes em `admin/src/main/api-client.test.ts` e
> `admin/src/main/ipc-handlers.test.ts` (arquivos existentes; acrescente casos).
>
> No `api-client`: `parseTerritory` passa a ler `rotation_days` para `rotationDays` (ausente ou
> nulo → `undefined`); `updateTerritory` aceita `rotationDays` no input e o serializa como
> `rotation_days`, preservando a distinção entre "não mandei" e "mandei nulo"; e surge
> `markBlockWorked(blockId, { userId, workedAt })`, que faz `POST /admin/blocks/{id}/worked`.
>
> No contrato de IPC: `TerritoryUpdateInput` ganha `rotationDays?: number | null`, e o namespace
> `workLogs` ganha `markWorked(blockId, publisherId, workedAt)` com um canal novo. Handler dentro
> de `session.run`, repasse no preload.
>
> Toque apenas em `admin/src/main/`, `admin/src/preload/` e `admin/src/shared/ipc-contract.ts`
> (mais os testes de main); não modifique nenhuma tela do renderer.

## Contexto
A Task 05 abriu no servidor a rota `POST /admin/blocks/{block_id}/worked` e o `rotation_days` no
`PATCH /admin/territories/{id}`; a Task 07 (implementação 0138) pôs `rotationDays` no
`shared/models.ts` e na regra de cor do admin. Faltava o caminho que liga os dois: o processo main
não sabia ler nem escrever a rotação, não conhecia a rota de marcação, e o renderer não tinha por
onde alcançar nenhuma das duas. Sem esta task, a `TerritorySettingsScreen` (Task 09) e a marcação
pela `HomeScreen` (Task 10) não teriam `window.api` para chamar.

## Critérios de aceite
1. Um território vindo da API com `rotation_days: 60` vira `rotationDays: 60`.
2. Um território com `rotation_days: null` (ou sem a chave) vira `rotationDays: undefined`.
3. `updateTerritory` com `rotationDays: 60` manda `rotation_days: 60` no corpo.
4. `updateTerritory` com `rotationDays: null` manda `rotation_days: null` — o jeito de voltar ao
   padrão.
5. `updateTerritory` sem `rotationDays` no input não manda a chave no corpo.
6. `markBlockWorked` faz `POST /admin/blocks/{id}/worked` com `{user_id, worked_at}` em ISO e
   devolve o `WorkLog` parseado.
7. O handler de IPC novo repassa os três argumentos ao cliente e devolve o log.
8. Um erro do servidor nessa chamada chega ao renderer como erro serializado, com `code` e
   `statusCode`.
9. Um 401 nessa chamada dispara a reautenticação silenciosa do `session.run` uma vez, e a segunda
   tentativa vale.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `listTerritories parses rotation_days into rotationDays` | `admin/src/main/api-client.test.ts` | `rotationDays` em `parseTerritory` |
| 2 | `listTerritories parses a territory whose rotation_days is null as undefined` | `admin/src/main/api-client.test.ts` | (verde de imediato — guarda o ramo `?? undefined`) |
| 3 | `updateTerritory sends rotation_days when rotationDays is a number` | `admin/src/main/api-client.test.ts` | `rotationDays` na assinatura e no corpo de `updateTerritory` |
| 4 | `updateTerritory sends rotation_days: null when rotationDays is explicitly null` + `omits rotation_days entirely when not in the input` | `admin/src/main/api-client.test.ts` | (verde pelo `'rotationDays' in input` do ciclo 3) |
| 5 | `markBlockWorked POSTs /admin/blocks/{id}/worked with the publisher and an ISO date` | `admin/src/main/api-client.test.ts` | `markBlockWorked` na interface e na implementação |
| 6 | `forwards the block, the publisher and the date to the API client, through the session` | `admin/src/main/ipc-handlers.test.ts` | canal `workLogsMarkWorked`, `markWorked` no `IpcApi`, handler e preload |
| 7 | `propagates a rejected marking as a serialized error, code and status included` | `admin/src/main/ipc-handlers.test.ts` | (verde pelo `handle()` compartilhado) |
| 8 | `re-authenticates once and retries when the server answers 401` | `admin/src/main/ipc-handlers.test.ts` | (verde por o handler estar dentro de `session.run`) |

## O que foi feito
- `parseTerritory` lê `rotation_days`, colapsando ausente e `null` em `undefined` — o mesmo
  tratamento que `parseBlock` já dá a `last_worked_at`.
- `updateTerritory` passou a receber o `input` inteiro em vez de desestruturá-lo na assinatura,
  para poder decidir por `'rotationDays' in input`: é a única forma de distinguir "não mandei" de
  "mandei nulo", já que os dois valem `undefined`/`null` num teste por valor.
- `markBlockWorked(blockId, { userId, workedAt })` no `ApiClient`, montando o corpo em snake_case
  e serializando a data com `toISOString()`.
- Canal `workLogs:markWorked` no `IPC_CHANNELS`, `markWorked` no namespace `workLogs` do `IpcApi`,
  `rotationDays?: number | null` no `TerritoryUpdateInput`, handler dentro de `session.run` e
  repasse de uma linha no preload.

## Arquivos modificados
- `admin/src/main/api-client.ts` — `rotationDays` em `parseTerritory`, `rotationDays` no input de
  `updateTerritory`, `markBlockWorked`
- `admin/src/main/api-client.test.ts` — 5 casos novos (parsing da rotação, as três formas do corpo
  do `PATCH`, a marcação)
- `admin/src/shared/ipc-contract.ts` — `rotationDays` em `TerritoryUpdateInput`, canal
  `workLogsMarkWorked`, `workLogs.markWorked` no `IpcApi`
- `admin/src/main/ipc-handlers.ts` — handler de `workLogsMarkWorked`
- `admin/src/main/ipc-handlers.test.ts` — `WORK_LOG`, `markBlockWorked` no `fakeApi()` e o
  `describe('workLogs:markWorked')` com os três casos
- `admin/src/main/session.test.ts` — `markBlockWorked` no `fakeApiClient()` exaustivo
- `admin/src/preload/index.ts` — `workLogs.markWorked`

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`'rotationDays' in input`, não `!== undefined`.** O servidor distingue os dois casos por
  `payload.model_fields_set`, então o cliente precisa de uma distinção equivalente. Um teste por
  valor mandaria `rotation_days` sempre que o chamador passasse `null`, o que funciona, mas
  também mandaria a chave para um `{ rotationDays: undefined }` explícito. A checagem de presença
  é a que espelha a semântica do outro lado.
- **`?? null` no valor enviado.** Depois do `in`, o valor só pode ser `number` ou `null`; o `??`
  normaliza um `undefined` explícito para `null`, que é o pedido de "volta ao padrão" — nunca
  `undefined`, que `JSON.stringify` apagaria da requisição, transformando silenciosamente um
  "limpa" num "não mexe".
- **O 401 testado com uma `session` de verdade.** Os outros casos do arquivo usam o `fakeSession()`
  que só repassa a ação; ele não provaria nada sobre reautenticação. O caso do 401 monta uma
  `createSession` real com `api` e `store` falsos — é o único jeito de o teste falhar se o handler
  sair de dentro de `session.run`, o que foi confirmado por mutação antes de fechar o ciclo.
- **Ciclos 2, 4, 7 e 8 ficaram verdes de imediato.** Cada um foi investigado antes de ser mantido:
  os dois primeiros guardam ramos que a implementação do ciclo anterior já cobria (e uma mutação
  confirmou que o caso do `null` falha contra a implementação ingênua); o 7 caracteriza o
  `handle()` compartilhado, que a Task pede explicitamente ("propaga o erro serializado como os
  outros"); e o 8 falha se o handler sair do `session.run`, o que também foi verificado por
  mutação.
- **Nenhum arquivo do renderer foi tocado**, conforme o escopo da task — ver a ressalva de
  validação abaixo.

## Como validar
```
cd admin && npx vitest run
```

## Resultado da validação
- `npx vitest run` — **22 arquivos, 410 testes passando** (eram 402 antes; 8 casos novos).
- Cobertura (`npx vitest run --coverage src/main`) de `api-client.ts`: **100% de statements,
  linhas e funções, 98,36% de branch** — o único ramo descoberto é o `options.fetchImpl ??
  globalThis.fetch` do construtor, pré-existente e não tocado aqui. Todas as linhas e ramos novos
  estão cobertos. Em `ipc-handlers.ts`, as linhas do handler novo (176–177) estão cobertas; a
  cobertura baixa do arquivo (55,91%) é pré-existente e vem dos demais handlers de uma linha, que
  nunca tiveram teste próprio.
- `npm run typecheck:node` — **limpo**.
- `npm run typecheck:web` — acusa apenas os oito fakes de `window.api` nos testes de tela do
  renderer, todos pela mesma causa: falta `workLogs.markWorked` no fake. É exatamente o mesmo
  efeito colateral que a implementação 0133 documentou na spec 0008, e se fecha nas Tasks 09/10,
  que são as que podem tocar o renderer.
- `npm run lint` — **0 erros**, 1 warning de prettier pré-existente em
  `admin/src/renderer/screens/TerritoryEditorScreen.tsx:103` (arquivo não tocado por esta task).
