# [0107] `DesignationsScreen`: a página de Designações do admin

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0006/` — Task 03

## Solicitação
Criar `admin/src/renderer/screens/DesignationsScreen.tsx` e `DesignationsScreen.test.tsx`: cabeçalho
leve com "Designações" e o resumo "N de M territórios designados"; o `AssignmentsMap`
(implements/0103) ocupando o resto, alimentado por `window.api.territories.listWithBlocks()` no
mount com o padrão load/loading/erro do `HomeScreen`; prop `fallbackCenter`; clique num território
abre o diálogo de atribuição migrado do `HomeScreen` (implements/0097).

## Contexto
A designação de território hoje vive escondida no menu "⋮" da Home. A spec 0006 dá a ela uma página
própria, com um mapa só de demarcações e o nome do dirigente por cima de cada território. Esta task
cria a tela; a fiação no `App.tsx` (Task 04) e a remoção do diálogo antigo da Home (Task 05) vêm
depois — por isso a Home não foi tocada.

## Critérios de aceite
- Com territórios carregados, o resumo mostra a contagem certa e o mapa recebe todos os territórios.
- Tocar um território abre o diálogo com os publicadores ativos + "Nenhum", pré-selecionado no
  dirigente atual; confirmar chama `assign` com o id escolhido e recarrega a lista.
- Escolher "Nenhum" confirma `assign(territoryId, null)`.
- `listWithBlocks` rejeitando no mount vira `role="alert"`, e "Recarregar" refaz a busca.
- `assign` rejeitando vira `role="alert"`, sem quebrar a tela (resumo e mapa continuam, sem reload).
- Publicadores desativados não aparecem no diálogo.
- Cancelar fecha o diálogo sem chamar `assign`.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | shows the assignment count in the summary and hands every territory to the map | `admin/src/renderer/screens/DesignationsScreen.test.tsx` | A tela: load no mount (padrão do `HomeScreen`), header com resumo, `AssignmentsMap` |
| 2 | shows the load failure as an alert, and "Recarregar" retries the fetch | idem | `load()` (reset síncrono + fetch) e o botão "Recarregar" |
| 3 | tapping a territory opens the dialog pre-selected on the current leader; confirming assigns and reloads | idem | O diálogo migrado do `HomeScreen`: `assignTarget`/`assignPublishers`/`selectedPublisherId`, `openAssignDialog`, `confirmAssign`, `runAction`, JSX do dialog |
| 4 | choosing "Nenhum" confirms the removal: calls assign with null | idem | (guarda — comportamento veio no ciclo 3) |
| 5 | shows a visible error message when assigning fails, without breaking the screen | idem | (guarda — idem) |
| 6 | does not offer deactivated publishers in the dialog | idem | (guarda — idem) |
| 7 | "Cancelar" closes the dialog without calling assign | idem | (guarda — idem) |
| 8 | shows a visible error message when a reload fails | idem | (guarda de cobertura: o catch de `load()`) |
| 9 | shows a visible error message when loading the publisher options fails | idem | (guarda de cobertura: o catch de `openAssignDialog`) |

Os ciclos 4–7 nasceram verdes porque o diálogo foi migrado como um bloco coeso no ciclo 3 — são os
testes de guarda que a task exige, cada um com asserção específica que falha se o comportamento
migrado quebrar (mesmos casos que o `HomeScreen.test.tsx` cobria para o diálogo original). Os 8–9
fecharam os dois branches de erro que a análise de cobertura apontou descobertos.

## O que foi feito
Tela nova `DesignationsScreen`: carrega os territórios no mount (efeito com guarda de unmount,
mesma forma do `HomeScreen`), mostra "Carregando…"/`role="alert"`/mapa conforme o estado, um header
com o título "Designações", o resumo "N de M territórios designados" (contagem de
`assignedUser !== undefined`) e o botão "Recarregar". O `AssignmentsMap` recebe `territories`,
`fallbackCenter` e `onTerritoryTap`; o tap abre o diálogo de atribuição — comportamento idêntico ao
do `HomeScreen` (implements/0097): busca `publishers.list()` a cada abertura filtrando `isActive`,
pré-seleciona o dirigente atual (ou "Nenhum"), Atribuir fecha na hora, chama
`territories.assign(territoryId, userId | null)` e recarrega; qualquer falha vira `role="alert"`
(`actionError`).

## Arquivos criados
- `admin/src/renderer/screens/DesignationsScreen.tsx` — a página de Designações
- `admin/src/renderer/screens/DesignationsScreen.test.tsx` — os 9 testes da tela

## Decisões técnicas
- **Diálogo copiado, não extraído.** A task manda migrar o comportamento exato; extrair um
  componente compartilhado agora tocaria o `HomeScreen`, que é escopo da Task 05 (que vai *remover*
  o diálogo de lá — a duplicação é transitória por uma task).
- **`AssignmentsMap` mockado com `vi.mock`** (stub que renderiza um botão por território disparando
  `onTerritoryTap`) — react-leaflet não roda em jsdom; mesma convenção do mock de `TerritoryMap` no
  `HomeScreen.test.tsx`.
- **Efeito de mount separado de `load()`** — mesma justificativa documentada no `HomeScreen`: o
  mount não precisa do reset síncrono, e `load()` só roda de event handler.
- **Sem teste:** os guards `!cancelled` do unmount e o guard defensivo `assignTarget === null` em
  `confirmAssign` (o botão Atribuir só renderiza com o diálogo aberto) — inalcançáveis pela UI,
  mesmas lacunas deliberadas do `HomeScreen`.

## Como validar
```
cd admin && npx vitest run src/renderer/screens/DesignationsScreen.test.tsx
npm test && npm run typecheck && npm run lint
```

## Resultado da validação
- `npx vitest run src/renderer/screens/DesignationsScreen.test.tsx` — 9 testes passando.
- `npm test` — suíte inteira do admin: 19 arquivos, **335 testes passando** (uma execução
  intermediária teve 1 falha intermitente sob carga paralela em arquivo não relacionado; duas
  reexecuções completas ficaram 100% verdes).
- Cobertura de `DesignationsScreen.tsx` (v8): **100% linhas, 98.4% statements, 84% branch, 100%
  funcs** — os branches descobertos são os guards de unmount e o guard defensivo documentados acima.
- `npm run typecheck` e `npm run lint` — limpos.
