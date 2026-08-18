# [0088] App/Data: fila offline de marcações (`work-log-queue.ts`)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 20

## Solicitação
Implementar por TDD `app/src/data/work-log-queue.ts`, persistindo em `AsyncStorage` uma fila de
marcações de quadra pendentes de sincronização, com `enqueue`, `drain` e `pending`, cobrindo:
caminho feliz, erro de rede (mantém na fila), erro de regra (sai da fila e é reportado como falha
definitiva), duas marcações da mesma quadra gerando dois `logId`, e 200/201 drenando do mesmo jeito.

## Contexto
CLAUDE.md já documenta a regra de negócio: "Marcação feita offline entra numa fila local ... e é
enviada quando houver rede. A UI mostra a quadra como concluída na hora." Esta é a camada Data que
implementa essa fila, usando o cliente HTTP da Task 18 (`api-client.ts`, implementação 0082) para o
envio de fato.

## Critérios de aceite
- `enqueue(blockId, workedAt)` gera um `logId` novo (via `uuid`) e persiste `{logId, blockId, workedAt}`.
- `drain(token)` percorre a fila e chama `apiClient.markBlockWorked` para cada item.
  - Sucesso (o cliente resolve, cobrindo tanto 200 quanto 201 — essa distinção já é absorvida pelo
    `api-client.ts`) → item sai da fila.
  - `NetworkException` → item permanece na fila, `drain` **não** rejeita (é um "tentar depois"
    esperado, não uma falha a reportar).
  - `ApiErrorException` → item sai da fila (reenviar o mesmo `logId` não muda um erro de regra) e é
    reportado ao chamador.
- `pending()` devolve o que ainda não sincronizou.
- Duas marcações da mesma quadra antes de sincronizar geram dois `logId` diferentes na fila.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `pending` resolve `[]` sem nada enfileirado | `work-log-queue.test.ts` | Módulo criado: `createWorkLogQueue`, `readQueue`/`writeQueue` sobre `AsyncStorage`, `pending()` |
| 2 | `enqueue` seguido de `pending()` devolve o item, com `logId` gerado | `work-log-queue.test.ts` | `enqueue()` usando `uuid` v4 |
| 3 | Duas marcações da mesma quadra geram dois `logId` diferentes | `work-log-queue.test.ts` | (já coberto pela geração via `uuid` a cada chamada — teste de borda confirma) |
| 4 | `drain` com sucesso (simulando 201) remove o item | `work-log-queue.test.ts` | `drain()`: laço sobre a fila chamando `apiClient.markBlockWorked` |
| 5 | `drain` com sucesso (simulando 200/resend) remove o item do mesmo jeito | `work-log-queue.test.ts` | Confirma que `drain` não precisa (nem pode) diferenciar 200 de 201 — o `api-client.ts` já absorve isso |
| 6 | `drain` com `NetworkException` mantém o item, não rejeita | `work-log-queue.test.ts` | Branch `instanceof NetworkException` → `remaining.push(item)` |
| 7 | `drain` com `ApiErrorException` remove o item e rejeita com `WorkLogDrainError` | `work-log-queue.test.ts` | `WorkLogDrainError`, branch `instanceof ApiErrorException` → `failures.push(...)`, `throw new WorkLogDrainError(failures)` no fim |
| 8 | Erro inesperado (nem `NetworkException` nem `ApiErrorException`) propaga em vez de ser engolido | `work-log-queue.test.ts` | `else { throw error; }` — branch defensivo para fechar 100% de cobertura |

## O que foi feito
Criado `app/src/data/work-log-queue.ts`, exportando `createWorkLogQueue({ apiClient })` (padrão de
fábrica com injeção de dependência, igual a `createApiClient` em `api-client.ts`), que devolve
`{ enqueue, drain, pending }` sobre uma fila JSON persistida em `AsyncStorage` sob a chave
`territory-map/work-log-queue`.

## Arquivos criados
- `app/src/data/work-log-queue.ts` — a fila offline (`QueuedWorkLog`, `WorkLogDrainError`,
  `WorkLogDrainFailure`, `createWorkLogQueue`).
- `app/src/data/work-log-queue.test.ts` — os 8 ciclos TDD.

## Decisões técnicas

**`drain(token): Promise<void>` continua com essa assinatura, mas passa a poder rejeitar.** O
enunciado da task pede que uma falha de `ApiErrorException` seja "reportada ao chamador como falha
definitiva". `Promise<void>` não impede rejeição — só descreve o valor no caminho de sucesso. Uma
falha de regra (o servidor respondeu e recusou) faz `drain` rejeitar com `WorkLogDrainError`
(`failures: {log, error}[]`), depois de já ter removido esses itens da fila e persistido a fila
restante. Uma falha de rede **não** faz `drain` rejeitar — é o caminho esperado e silencioso de
"tentar de novo depois", coerente com a fila rodar em background sem travar a UI a cada tentativa
sem sinal.

**`markBlockWorked` já colapsa 200 e 201.** `api-client.ts` (Task 18) documenta que resolve nos dois
casos — "Resolves on both 201 (new) and 200 (resend)". Este módulo não tem, e não precisa ter,
nenhuma lógica que diferencie os dois: do ponto de vista da fila, ambos são "o servidor aceitou".
Os dois testes ("201" e "200/resend") ficam redundantes na implementação mas documentam a intenção
pedida explicitamente na task — o segundo é o que evidencia que a ausência de diferenciação é
proposital, não uma lacuna.

**Injeção do `ApiClient` via fábrica, não import direto.** Segue o mesmo padrão de
`createApiClient` (`api-client.ts`) em vez de um singleton importado — é o que permite o teste
injetar um fake sem qualquer chamada HTTP real, e é a mesma escolha já usada no restante do `data/`
do app.

**Duas bibliotecas com o mesmo problema de transformação no Jest, resolvidas com o mesmo padrão já
estabelecido no projeto.**
- `@react-native-async-storage/async-storage` — sua própria entrada `/jest` de mock é ESM
  (`export function ...`) e `transformIgnorePatterns` do preset RN não cobre esse pacote. Confirmado
  experimentalmente: `require()` direto do pacote falha em Jest com `SyntaxError: Unexpected token
  'export'`, embora funcione fora do Jest (Node 22 tem "require(esm)" nativo, que mascara o problema
  fora do runner de teste). `session-store.test.ts` e `territory-cache.test.ts` já tinham resolvido
  isso com um fake em memória via `jest.mock`, em vez de mexer no `transformIgnorePatterns` global —
  segui exatamente esse padrão (mesmo formato de mock, mesma razão documentada no comentário).
- `uuid@14` — também ESM-only (`dist-node/index.js` ainda usa `export`), mesmo erro de parsing.
  Como nenhum outro arquivo do projeto ainda importava `uuid`, não havia precedente; apliquei o
  mesmo princípio: `jest.mock('uuid', ...)` com um fake que devolve um id incremental e distinto por
  chamada — suficiente para exercitar "dois `logId` diferentes" sem depender da biblioteca real, que
  o processo de teste não consegue carregar. O código de produção continua importando o pacote real
  (`uuid` de verdade), porque quem processa o app de verdade é o Metro, não o Jest — o mock existe só
  no processo de teste.
- Alternativa descartada: editar `jest.config.js` (`transformIgnorePatterns`) para incluir os dois
  pacotes. Funcionaria, mas (a) contraria a instrução explícita da task de tocar só
  `work-log-queue.ts` e seu teste, e (b) quebraria a consistência com o padrão já em uso no restante
  do `app/src/data/` para o mesmo tipo de problema.

**Erro inesperado (nem `NetworkException` nem `ApiErrorException`) propaga, não é engolido.**
`ApiException` (classe base em `api-client.ts`) só tem essas duas subclasses hoje, então este branch
é defensivo — mas propagar em vez de silenciar é o comportamento mais seguro para um erro fora do
contrato conhecido, e o teste correspondente existe só para fechar cobertura de branch, não porque
o caminho seja esperado em operação normal.

**Mutação manual para validar os testes.** Antes de fechar, quebrei deliberadamente o tratamento de
`ApiErrorException` (fazendo-o cair no mesmo branch de `NetworkException`, "permanece na fila para
sempre") e confirmei que o teste de erro de regra falhava com a mensagem certa — depois revertida.
Não é um passo formal do processo, mas confirma que o teste pega regressão real, não só sintaxe.

## Como validar
```
cd app && npx jest src/data/work-log-queue.test.ts
cd app && npx jest src/data/work-log-queue.test.ts --coverage --collectCoverageFrom='src/data/work-log-queue.ts'
cd app && npx tsc --noEmit -p tsconfig.json
cd app && npx eslint src/data/work-log-queue.ts src/data/work-log-queue.test.ts
```

## Resultado da validação
- `npx jest src/data/work-log-queue.test.ts` → **8 testes passando**.
- `npx jest` (suíte inteira do `app/`) → **53 testes passando** (10 suítes), nenhuma regressão.
- Cobertura de `work-log-queue.ts`: **100% linhas, 100% branches, 100% funções**.
- `tsc --noEmit`: limpo.
- `eslint` nos dois arquivos: limpo.
