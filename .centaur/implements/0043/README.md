# [0043] Cor da quadra por tempo sem trabalho (`renderer/map/blockColor.ts`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 08

## Solicitação
Implementar por TDD `admin/src/renderer/map/blockColor.ts`, exportando `OVERDUE_AFTER_MS = 120 * 24
* 60 * 60 * 1000` e `blockColorCategory(block, now): 'never' | 'overdue' | 'recent'`, usando
`blockTimeSinceWorked` de `admin/src/shared/models.ts`, espelhando `_blockColor` do antigo
`admin/lib/presentation/map/territory_map.dart` (Flutter, já removido do repositório): sem
`lastWorkedAt` → `'never'`; tempo desde o trabalho estritamente maior que `OVERDUE_AFTER_MS` →
`'overdue'`; igual ou menor → `'recent'`.

## Contexto
Task 08 da spec 0003 (migração do admin de Flutter para Electron). É a regra pura que decide a cor
da quadra no mapa (vermelho/laranja/verde); o componente visual `TerritoryMap` (Task 09) consome
esta função. Depende só da Task 03 (`shared/models.ts`), já concluída.

## Critérios de aceite
- `lastWorkedAt` ausente → `'never'`.
- Tempo desde o trabalho estritamente maior que `OVERDUE_AFTER_MS` → `'overdue'`.
- Tempo desde o trabalho exatamente igual a `OVERDUE_AFTER_MS` → `'recent'` (limite testado
  explicitamente).
- Tempo desde o trabalho menor que `OVERDUE_AFTER_MS` → `'recent'`.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `is "never" when the block was never worked` | `src/renderer/map/blockColor.test.ts` | `blockColorCategory` retornando `'never'` via `blockTimeSinceWorked === null` |
| 2 | `is "overdue" when the time since worked is strictly greater than OVERDUE_AFTER_MS` | idem | ramo `overdue` |
| 3 | `is "recent" when the time since worked is exactly OVERDUE_AFTER_MS` | idem | confirma o limite (`>` estrito, não `>=`) |
| 4 | `is "recent" when the time since worked is less than OVERDUE_AFTER_MS` | idem | ramo `recent` padrão |

Os quatro casos foram escritos juntos no primeiro RED (todos falhando por import ausente do módulo
de produção, motivo correto) e resolvidos num único GREEN, já que a implementação é uma função pura
de poucas linhas sem necessidade de ciclos intermediários artificiais.

## O que foi feito
Criado `admin/src/renderer/map/blockColor.ts` com a constante `OVERDUE_AFTER_MS` e a função
`blockColorCategory`, delegando o cálculo de tempo para `blockTimeSinceWorked` (já implementada e
testada na Task 03) e aplicando só a comparação de limiar.

## Arquivos modificados
_Nenhum._

## Arquivos criados
- `admin/src/renderer/map/blockColor.ts` — constante `OVERDUE_AFTER_MS` e função
  `blockColorCategory(block, now)`.
- `admin/src/renderer/map/blockColor.test.ts` — os quatro casos de teste do limiar de 120 dias.

## Decisões técnicas
- Reaproveitado `blockTimeSinceWorked` de `shared/models.ts` em vez de reimplementar o cálculo de
  diferença de tempo — mesma fonte de verdade usada pelo restante do admin, sem duplicar a leitura
  de `lastWorkedAt`.
- Comparação `>` estrita para `'overdue'`, com `'recent'` como ramo padrão (cobre tanto igual quanto
  menor), espelhando exatamente `_blockColor` do Dart removido.
- Nenhum mock necessário: função pura, `Date` passada explicitamente como parâmetro (`now`), sem
  leitura de relógio real dentro da função.

## Como validar
```bash
cd admin
npx vitest run src/renderer/map/blockColor.test.ts   # arquivo isolado
npx vitest run                                        # suíte completa
npm run lint
npm run typecheck
```

## Resultado da validação
- `npx vitest run src/renderer/map/blockColor.test.ts`: 4 testes, todos verdes.
- `npx vitest run` (suíte completa do admin): 6 arquivos de teste, 66 testes, todos verdes — sem
  regressão.
- Cobertura (`--coverage`) de `src/renderer/map/blockColor.ts`: 100% linhas, 100% branches, 100%
  funções, 100% statements.
- `npm run lint`: sem erros.
- `npm run typecheck` (node + web): sem erros.
