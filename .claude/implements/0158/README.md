# [0158] Admin: main e IPC levam o status forçado da quadra (spec 0010, Task 07)

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0010/` — Task 07

## Solicitação
> Spec 0010 — Task 07: implemente por TDD em `admin/src/main/api-client.ts`,
> `admin/src/shared/ipc-contract.ts`, `admin/src/main/ipc-handlers.ts` e
> `admin/src/preload/index.ts`. No `api-client`: `parseBlock` lê `status_override` para
> `statusOverride` (ausente ou nulo → `undefined`); `updateBlock` aceita `statusOverride` no input e
> o serializa como `status_override`, preservando a distinção entre "não mandei" e "mandei nulo".
> Espelhe a solução que `updateTerritory` já usa para `rotationDays`. No contrato de IPC:
> `BlockUpdateInput` ganha `statusOverride?: BlockStatusOverride | null`.

## Contexto
A Task 04 já publicou o `status_override` nas rotas do servidor e a Task 06 já o colocou no
`Block` de `admin/src/shared/models.ts` e na regra de cor. Faltava o caminho entre os dois: o
processo main não lia o campo das respostas e não sabia escrevê-lo, então a tabela de quadras
(Tasks 09 e 10) não teria como forçar nem desfazer um status pelo `window.api`.

O detalhe que carrega a regra é a distinção entre **"não mandei"** e **"mandei nulo"**: o PATCH do
servidor lê a presença da chave no corpo, e `null` é o jeito de devolver a quadra ao cálculo
automático. É a mesma questão já resolvida para `rotationDays` na spec 0009 (Task 08), e a solução
foi espelhada literalmente — `'statusOverride' in input` decide a chave, e `?? null` impede que um
`undefined` explícito seja apagado pelo `JSON.stringify` e lido como "não sent".

## Critérios de aceite
- Uma quadra vinda da API com `status_override: "overdue"` vira `statusOverride: 'overdue'`.
- Com `status_override: null` vira `undefined`.
- Sem `status_override` nenhum, também `undefined`.
- `updateBlock` sem `statusOverride` no input não manda a chave no corpo.
- `updateBlock` com `null` manda `status_override: null`.
- `updateBlock` com `'never'` manda `status_override: "never"`.
- A chamada continua funcionando quando só `number` ou só `polygon` é enviado.
- Um 401 em `blocks:update` continua disparando a reautenticação de `session.run` uma vez.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | parses status_override into statusOverride when the admin forced a status | `admin/src/main/api-client.test.ts` | `parseBlock` lê `status_override` |
| 2 | parses a status_override of null as undefined, leaving the status automatic | `admin/src/main/api-client.test.ts` | o `?? undefined` do mesmo parse (borda verificada por mutação) |
| 3 | parses a block with no status_override at all as undefined | `admin/src/main/api-client.test.ts` | idem |
| 4 | updateBlock sends status_override: null when statusOverride is explicitly null | `admin/src/main/api-client.test.ts` | `'statusOverride' in input && { status_override: input.statusOverride ?? null }` |
| 5 | updateBlock sends the forced status as status_override | `admin/src/main/api-client.test.ts` | idem |
| 6 | updateBlock omits status_override entirely when statusOverride is not in the input | `admin/src/main/api-client.test.ts` | idem |
| 7 | blocks:update forwards the forced status to the API client, through the session | `admin/src/main/ipc-handlers.test.ts` | `BlockUpdateInput.statusOverride` no contrato de IPC |
| 8 | blocks:update forwards a null statusOverride untouched | `admin/src/main/ipc-handlers.test.ts` | idem |
| 9 | blocks:update re-authenticates once and retries when the server answers 401 | `admin/src/main/ipc-handlers.test.ts` | nada novo — guarda de que a chamada segue dentro de `session.run` |

## O que foi feito
- `parseBlock` passou a ler `status_override`, colapsando ausente e `null` em `undefined`.
- A assinatura e a implementação de `updateBlock` ganharam `statusOverride`, serializado por
  presença de chave, exatamente como `updateTerritory` faz com `rotationDays`.
- `BlockUpdateInput` (contrato de IPC) ganhou `statusOverride?: BlockStatusOverride | null`.
- `ipc-handlers.ts` e `preload/index.ts` **não precisaram mudar**: ambos já repassam o
  `BlockUpdateInput` inteiro e opaco pelo canal `blocks:update`, que já existia. Os testes novos do
  handler são a garantia de que ele continua repassando sem destruturar — foi essa a mutação usada
  para conferir que eles pegam a regressão.

## Arquivos modificados
- `admin/src/main/api-client.ts` — `parseBlock` lê `status_override`; `updateBlock` aceita e
  serializa `statusOverride` preservando "ausente" vs. "nulo".
- `admin/src/main/api-client.test.ts` — seis casos novos no `describe('blocks')`.
- `admin/src/shared/ipc-contract.ts` — `statusOverride` em `BlockUpdateInput`.
- `admin/src/main/ipc-handlers.test.ts` — `describe('blocks:update')` novo, com os três casos.

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Presença de chave, não valor**, para decidir o que vai no corpo: é o que o PATCH do servidor
  distingue, e `null` é uma instrução ("volte ao automático"), não a ausência de uma. O `?? null`
  existe só para o caso do chamador passar `undefined` de propósito — sem ele o `JSON.stringify`
  apagaria a chave e a intenção viraria silêncio.
- **`updateBlock` deixou de destruturar o input na assinatura** (`{ number, polygon }` virou
  `input`) porque `in` precisa do objeto inteiro. Mesma forma que `updateTerritory` já tinha.
- **Os testes do handler tipam o input com `satisfies BlockUpdateInput`.** Sem isso o `invoke` do
  teste recebe `unknown[]` e o contrato de IPC não seria exigido por nada dentro do escopo desta
  task (quem o exigiria de verdade é o renderer, nas Tasks 09 e 10) — o RED do ciclo 7 foi
  justamente o `tsc --noEmit -p tsconfig.node.json` recusando a propriedade desconhecida.
- **Nada do renderer foi tocado**, como a task pediu.
- **Os ciclos 2, 3 e 9 passaram sem código novo** (o comportamento nasceu no ciclo anterior ou já
  existia). Em vez de aceitá-los de graça, a significância de cada um foi verificada por mutação:
  tirar o `?? undefined` do parse derruba o ciclo 2, e destruturar o input no handler derruba os
  ciclos 7 e 8.

## Como validar
```bash
cd admin && npx vitest run src/main/api-client.test.ts src/main/ipc-handlers.test.ts
cd admin && npm run typecheck && npm run lint
```

## Resultado da validação
- `npx vitest run` (suíte inteira do admin): **470 testes passando, 25 arquivos**.
- `npx vitest run src/main/api-client.test.ts src/main/ipc-handlers.test.ts`: 73 passando.
- Cobertura dos arquivos tocados: `api-client.ts` **100% de linha e 98.5% de branch** (a única
  branch descoberta é o fallback `globalThis.fetch` da linha 280, pré-existente e sem relação com
  esta task). Em `ipc-handlers.ts`, as linhas do handler `blocks:update` (150-151) passaram de
  descobertas a cobertas; os demais canais seguem sem teste próprio, situação anterior a esta task.
- `npm run typecheck`: limpo nos dois projetos (node e web).
- `npm run lint`: sem erros. Resta um único warning de formatação em
  `src/renderer/screens/TerritoryEditorScreen.tsx`, pré-existente e fora do escopo.
