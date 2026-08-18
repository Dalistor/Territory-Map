# [0084] App/Presentation: lógica pura do filtro do mapa (`territoryFilter.ts`)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 24

## Solicitação
Em `app/src/presentation/map/territoryFilter.ts`, definir o tipo `MapFilter` (`'assigned'` | `'all'`
| `'specific'` com `territoryId`) e a função `visibleTerritories(all, filter, myUserId)` que decide
quais territórios o mapa mostra em cada modo, reaproveitando `isTerritoryAssignedToMe` (Task 17).
Adicionar também `defaultFilter(all, myUserId)`, o estado inicial da tela de mapa: `'assigned'`
quando há designação, `'all'` quando não há nenhuma. Sem nenhuma dependência de view nativa
(`@maplibre/maplibre-react-native` ou similar) neste arquivo.

## Contexto
É o Task 24 da spec 0005 (app do publicador em React Native). A tela de mapa (Task 25) precisa
decidir quais territórios desenhar antes de tocar em qualquer código de MapLibre — isolar essa
decisão numa função pura permite testar as três regras de filtro e o cálculo de estado inicial
com Jest puro, sem emulador nem view nativa, e mantém `TerritoryMapView`/`MapScreen` livres de
lógica de negócio (a mesma separação que `admin/src/renderer/map/` já aplica com Leaflet-Geoman
confinado a um arquivo).

## Critérios de aceite
- `visibleTerritories` em modo `'assigned'`: devolve só os territórios com `isTerritoryAssignedToMe`
  verdadeiro para `myUserId`.
- `visibleTerritories` em modo `'all'`: devolve `all` sem filtrar.
- `visibleTerritories` em modo `'specific'`: devolve só o território cujo `id` bate com
  `territoryId`; lista vazia (não erro) quando não existe correspondência.
- `defaultFilter`: `{mode: 'assigned'}` quando existe pelo menos um território designado ao
  publicador; `{mode: 'all'}` quando não há nenhum (inclusive lista vazia de territórios).

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `visibleTerritories` — modo `'assigned'` filtra pelos territórios do usuário | `app/src/presentation/map/territoryFilter.test.ts` | `MapFilter`, `visibleTerritories` (branch `'assigned'`) |
| 2 | `visibleTerritories` — modo `'all'` devolve tudo sem filtro | idem | `visibleTerritories` (branch `'all'`) |
| 3 | `visibleTerritories` — modo `'specific'` devolve só o território do id | idem | `visibleTerritories` (branch `'specific'`, caminho de match) |
| 4 | `visibleTerritories` — modo `'specific'` com id inexistente devolve lista vazia | idem | `visibleTerritories` (branch `'specific'`, caminho sem match) |
| 5 | `defaultFilter` — `'assigned'` quando há designação | idem | `defaultFilter` (ramo com designação) |
| 6 | `defaultFilter` — `'all'` quando não há designação | idem | `defaultFilter` (ramo sem designação) |
| 7 | `defaultFilter` — `'all'` para lista vazia de territórios | idem | confirma que `.some` em array vazio cai no ramo `'all'` (borda) |

Todos os quatro primeiros ciclos foram escritos e confirmados em RED antes da implementação única
que os cobre (a função inteira nasceu junto, já que os três `case` de um `switch` não fazem sentido
implementados em ciclos parciais isolados); a suíte foi então rodada em GREEN para todos de uma vez
e mantida assim pelos ciclos seguintes.

## O que foi feito
Criado `territoryFilter.ts` com o tipo `MapFilter` (union discriminada por `mode`) e as duas funções
puras. `visibleTerritories` usa um `switch` exaustivo sobre `filter.mode`, delegando a checagem de
designação para `isTerritoryAssignedToMe` (`domain/assignment.ts`) em vez de reimplementar a
comparação de `assignedUser.id`. `defaultFilter` reaproveita a mesma função via `.some()`.

## Arquivos modificados
Nenhum — implementação isolada em arquivos novos.

## Arquivos criados
- `app/src/presentation/map/territoryFilter.ts` — tipo `MapFilter` e as funções `visibleTerritories`/`defaultFilter`.
- `app/src/presentation/map/territoryFilter.test.ts` — os 7 casos de teste acima.

## Decisões técnicas
- **`switch` exaustivo em vez de `if/else` encadeado**: o TypeScript aponta em tempo de compilação
  se um novo modo for adicionado ao `MapFilter` e esquecido aqui — mais seguro que uma cadeia de
  `if` que silenciosamente cairia no último ramo.
- **Reaproveitar `isTerritoryAssignedToMe` em vez de reimplementar a comparação de `assignedUser`**:
  é a mesma regra de designação que a Task 17 já testou; duplicar a comparação aqui divergiria se a
  regra mudasse (ex.: designação por múltiplos publicadores no futuro).
- **Sem mock necessário**: função pura, sem I/O — os testes chamam a função direto com fixtures em
  memória, seguindo o mesmo padrão de `assignment.test.ts` (`makeTerritory` com overrides).
- **Nada deixado sem teste**: cobertura de linha e branch em 100% no arquivo, confirmado abaixo.

## Como validar
```bash
cd app && npx jest src/presentation/map/territoryFilter.test.ts
```
Suíte completa: `cd app && npx jest`.

## Resultado da validação
- `npx jest src/presentation/map/territoryFilter.test.ts` → 7 testes passando.
- `npx jest` (suíte inteira do `app/`) → 6 suítes, 32 testes passando, nenhuma regressão.
- `npx jest --coverage --collectCoverageFrom='src/presentation/map/territoryFilter.ts' src/presentation/map/territoryFilter.test.ts`
  → 100% statements, 100% branch, 100% functions, 100% lines em `territoryFilter.ts`.
- `npx eslint src/presentation/map/territoryFilter.ts src/presentation/map/territoryFilter.test.ts`
  → sem warnings.
- `npx tsc --noEmit` → um erro pré-existente e não relacionado em
  `src/data/territory-cache.test.ts` (módulo `./territory-cache` ainda não criado — pertence a outra
  task da mesma spec, em andamento em paralelo); nenhum erro em `territoryFilter.ts` nem no seu
  teste.
