# [0138] Admin: `rotationDays` no modelo compartilhado e na regra de cor da quadra

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0009/` — Task 07

## Solicitação
> Spec 0009 — Task 07: `Territory` ganha `readonly rotationDays?: number` — ausente significa "usa
> o padrão", documentado no próprio campo. `blockColorCategory(block, now)` ganha um terceiro
> parâmetro opcional `rotationDays?: number`: o limiar de "vencida" passa a ser
> `(rotationDays ?? 120)` dias em milissegundos, e a constante exportada hoje como
> `OVERDUE_AFTER_MS` continua existindo como o padrão (renomeie para `DEFAULT_ROTATION_DAYS` mais
> um derivado em ms se ficar mais legível, atualizando quem importa). Mantenha a semântica de borda
> que já existe: exatamente no limiar ainda é `'recent'`, só estritamente acima vira `'overdue'`.
> Toque apenas em `admin/src/shared/models.ts` e `admin/src/renderer/map/blockColor.ts` (mais os
> testes deles).

## Contexto
A spec 0009 dá a cada território um tempo de rotação próprio em dias — o intervalo depois do qual
uma quadra volta a aparecer como vencida no mapa. Até aqui o limiar era uma constante fixa de 120
dias enterrada na regra de cor. Esta task é a peça pura do lado do admin: o modelo compartilhado
passa a carregar o número, e a função que decide a cor passa a aceitá-lo, sem que nada da tela,
do main ou do preload mude ainda (isso é das Tasks 08 e 10).

## Critérios de aceite
- Sem `rotationDays`, o comportamento é idêntico ao de hoje (120 dias).
- Com `rotationDays: 30`, uma quadra trabalhada há 45 dias é `'overdue'` e uma de 10 dias é `'recent'`.
- Com `rotationDays: 365`, uma quadra de 200 dias é `'recent'` — o mesmo caso que hoje seria `'overdue'`.
- Exatamente no limiar da rotação configurada é `'recent'`.
- Quadra nunca trabalhada é `'never'` seja qual for a rotação.
- `rotationDays` ausente e `undefined` se comportam igual.
- `Territory` carrega `rotationDays` como campo opcional e somente-leitura.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `Territory` carrega a rotação configurada e a deixa `undefined` quando não há | `admin/src/shared/models.test.ts` | `Territory.rotationDays?: number`, documentado no campo |
| 2 | `'overdue'` quando a quadra passou da rotação mais curta do território (45 dias com rotação de 30) | `admin/src/renderer/map/blockColor.test.ts` | terceiro parâmetro `rotationDays?`, limiar `(rotationDays ?? DEFAULT_ROTATION_DAYS) * DAY_MS`, `OVERDUE_AFTER_MS` renomeado |
| 3 | `'recent'` dentro da rotação mais curta (10 dias com rotação de 30) | idem | — (caso de aceite já coberto pela generalização mínima do ciclo 2) |
| 4 | `'recent'` com rotação de 365 no mesmo caso que o padrão chamaria de `'overdue'` (200 dias) | idem | — |
| 5 | `'recent'` exatamente no limiar da rotação configurada | idem | — |
| 6 | `'never'` seja qual for a rotação, quando nunca foi trabalhada | idem | — |
| 7 | `undefined` explícito se comporta igual ao parâmetro ausente | idem | — |

## O que foi feito
- `Territory` ganhou `readonly rotationDays?: number`, com docstring dizendo que ausente significa
  "usa o padrão" (`DEFAULT_ROTATION_DAYS`) — o comportamento de todo território antes da opção existir.
- `blockColorCategory(block, now, rotationDays?)` calcula o limiar a partir da rotação recebida,
  caindo no padrão quando ela é ausente ou `undefined`. A comparação continua estritamente maior
  que o limiar, então exatamente no limiar ainda é `'recent'`.
- `OVERDUE_AFTER_MS` virou `DEFAULT_ROTATION_DAYS` (120) mais o derivado `DEFAULT_OVERDUE_AFTER_MS`
  (o mesmo valor em ms), e o `DAY_MS` que os dois usam. Nenhum arquivo de produção importava a
  constante antiga — só o próprio teste, que foi atualizado.

## Arquivos modificados
- `admin/src/shared/models.ts` — campo `rotationDays` em `Territory`
- `admin/src/shared/models.test.ts` — fábrica `makeTerritory` e o bloco `Territory rotation`
- `admin/src/renderer/map/blockColor.ts` — parâmetro `rotationDays`, constantes renomeadas
- `admin/src/renderer/map/blockColor.test.ts` — bloco `blockColorCategory with a configured rotation`, imports atualizados

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`rotationDays` como terceiro parâmetro opcional, não como objeto de opções.** A função tem dois
  parâmetros posicionais já estabelecidos e um único eixo novo de configuração; um objeto obrigaria
  a mexer em todos os chamadores por nada.
- **`?? DEFAULT_ROTATION_DAYS`, não `|| `.** `0` não é rotação válida, mas `||` também engoliria um
  `rotationDays` legítimo se o domínio mudasse; `??` trata só ausente/nulo, que é exatamente a
  semântica documentada. O servidor já valida `ge=1` (Task 02), então a função não revalida —
  regra de negócio é do servidor, e duplicá-la aqui criaria uma segunda fonte de verdade.
- **Duas constantes em vez de uma.** `DEFAULT_ROTATION_DAYS` é o número que a interface vai exibir
  como padrão (Task 09), e `DEFAULT_OVERDUE_AFTER_MS` é o mesmo em milissegundos, unidade da
  comparação. Manter as duas evita que a tela reimplemente a multiplicação por 86_400_000.
- **A borda foi preservada de propósito**, com teste explícito: exatamente no limiar é `'recent'`.
  Era o comportamento anterior e mudá-lo faria quadras piscarem de cor no dia exato do aniversário
  da visita.
- **Não foi tocado o `app/src/domain/blockColor.ts`**, que tem a mesma constante duplicada: é a
  Task 11 da mesma spec, e os dois clientes não compartilham pacote por decisão registrada no
  `AGENTS.md`.

## Como validar
```bash
cd admin && npx vitest run src/shared/models.test.ts src/renderer/map/blockColor.test.ts
cd admin && npm run typecheck && npx eslint src/shared/models.ts src/renderer/map/blockColor.ts
```

## Resultado da validação
- `npx vitest run` (suíte inteira do admin): **22 arquivos, 401 testes passando**.
- `npx vitest run --coverage --coverage.provider=v8 --coverage.all=false src/renderer/map/blockColor.test.ts src/shared/models.test.ts`:
  **100% de statements (30/30), branches (36/36), funções (9/9) e linhas (26/26)** nos dois arquivos tocados.
- `npm run typecheck` (node + web): limpo.
- `npx eslint` nos quatro arquivos: sem warning.
