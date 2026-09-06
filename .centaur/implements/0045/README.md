# [0045] Controller de edição de polígono (`renderer/map/usePolygonEditor.ts`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 10

## Solicitação

Implementar por TDD `admin/src/renderer/map/usePolygonEditor.ts`, portando `PolygonEditorController`
de `admin/lib/presentation/map/polygon_editor.dart` (o admin Flutter, removido nesta mesma spec) sem
nenhuma dependência de Leaflet ou Leaflet-Geoman — só estado. Aceita um anel inicial opcional
(`LatLng[]`) e expõe `points`, `addPoint`, `movePoint(index, point)`, `removePoint(index)`, `undo()`,
`canUndo`, `clear()`, e um `state` derivado com `points`, `problem` (via `validateRing`/`isValidRing`
de `shared/geo.ts`) e um `hint` em português por tipo de problema — `tooFewPoints` como dica neutra,
não como erro. `addPoint`, `movePoint` e `removePoint` precisam tirar um snapshot do estado **antes**
de mutar, para que `undo` funcione depois de um arraste ou de uma remoção, não só depois de um
`addPoint` — é o comportamento não-trivial que o Dart original documentava. Pilha de snapshots com
teto de 50 entradas.

## Contexto

Esta é a Task 10 da spec 0003 (migração do admin de Flutter para Electron + React + TypeScript). O
Dart original (`PolygonEditorController`, em `admin/lib/presentation/map/polygon_editor.dart`, git
history) precisava desse truque de snapshot porque `PolyEditor` (biblioteca de terceiro,
`flutter_map_line_editor`) não expõe gancho de início de arraste nem de remoção — cada `DragMarker`
que ela produz era reconstruído ali com o snapshot encadeado antes do callback original, senão
desfazer depois de arrastar pulava para antes do último ponto *adicionado*, perdendo o arraste e um
vértice junto.

No port para TypeScript não existe biblioteca de terceiro nesta camada (isso é a Task 11,
`PolygonEditorLayers.tsx`, que ainda não existe) — este arquivo é só estado, movido inteiramente por
chamadas explícitas (`addPoint`/`movePoint`/`removePoint`), então o problema do gancho ausente não se
repete. A disciplina de "snapshot antes de cada mutação" foi mantida de propósito mesmo assim, porque
é ela quem garante que `undo()` restaure o estado de antes de um arraste, não de antes do último ponto
adicionado — o mesmo comportamento observável do Dart, só que sem precisar contornar uma lib.

## Critérios de aceite

- Aceita um anel inicial opcional (`LatLng[]`); sem mutação alguma, `canUndo` é falso.
- `addPoint(point)`, `movePoint(index, point)` e `removePoint(index)` tiram um snapshot do estado
  **antes** de mutar.
- `undo()` restaura o snapshot mais recente; não faz nada se não houver nenhum.
- `canUndo` é verdadeiro sse há pelo menos um snapshot.
- `clear()` tira um snapshot antes de esvaziar; não faz nada (nem tira snapshot) se já estava vazio.
- A pilha de snapshots tem teto de 50 entradas, descartando a mais antiga quando excede.
- `state.problem` vem de `validateRing`/`isValidRing` (`null` quando o anel é válido).
- `state.hint` em português por tipo de problema; `tooFewPoints` é uma dica neutra ("toque no mapa
  para marcar ao menos 3 pontos"), não um erro alarmante.
- Sequência "adicionar 3 pontos, arrastar um (`movePoint`), desfazer" restaura o estado de **antes do
  arraste** (os 3 pontos originais), não de antes do último ponto adicionado.
- `movePoint`/`removePoint` com índice fora do intervalo são no-op e não empilham snapshot.
- Um erro de `validateRing` que não seja `InvalidPolygonError` propaga em vez de ser engolido.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Suíte completa de 21 casos (estado inicial, ring inicial, `addPoint` tornando o anel válido no 3º ponto, ordem dos pontos, hint neutro de `tooFewPoints`, `selfIntersecting`, `offGlobe`, hint nulo quando válido, `undo` — vazio, remove o último, volta ao vazio, undoable após `removePoint`, undoable após `movePoint` preservando o estado pré-arraste, undoable após `clear`, `clear` vazio não empilha, `canUndo` reativo, teto de 50 snapshots, `movePoint`/`removePoint` válidos e fora do intervalo) escrita de uma vez (RED confirmado por erro de import do módulo inexistente) | `admin/src/renderer/map/usePolygonEditor.test.ts` | `admin/src/renderer/map/usePolygonEditor.ts` — hook `usePolygonEditor` sobre `useReducer` |
| 2 | Correção de dois bugs de teste descobertos no GREEN: um `while (result.current.canUndo)` dentro de um único `act()` nunca via `canUndo` mudar (React só re-renderiza ao fim do `act`), causando loop infinito e estourando a heap; e os dois testes de índice fora do intervalo comparavam `canUndo` contra `false` quando já havia 4 snapshots da montagem do quadrado | mesmo arquivo | Nenhuma mudança de produção — só os testes, reescritos para dirigir um número fixo de `undo()` em vez de depender de leitura de estado no meio do batch |
| 3 | Cobertura: `case null` de `hintFor` era morto (só é chamado a partir do `catch` de `deriveState`, que nunca recebe `problem: null`) | mesmo arquivo (sem teste novo — remoção de código morto) | `hintFor` passou a receber `PolygonProblem` (não mais `\| null`) |
| 4 | `deriveState` propaga um erro que não é `InvalidPolygonError` em vez de escondê-lo atrás de um estado calmo | mesmo arquivo — teste com `vi.spyOn(geo, 'validateRing')` lançando um `Error` genérico | Nenhuma mudança de produção — o `throw error` do `catch` já existia; faltava só o teste |

## O que foi feito

Implementado `admin/src/renderer/map/usePolygonEditor.ts` como um hook React (`usePolygonEditor`)
sobre `useReducer`: o estado interno (`{ points, undoStack }`) é todo transicionado dentro de um único
reducer puro, o que evita qualquer problema de leitura de estado obsoleto entre despachos síncronos —
cada ação (`add`/`move`/`remove`/`undo`/`clear`) lê o estado anterior corretamente mesmo quando várias
são despachadas na mesma volta de render. `movePoint`/`removePoint` com índice fora do intervalo
retornam o estado inalterado (sem novo array, sem snapshot). O `state` derivado (`points`, `problem`,
`hint`) é recomputado com `useMemo` a partir de `validateRing`/`InvalidPolygonError` de `shared/geo.ts`
(Task 02, já implementada).

## Arquivos criados

- `admin/src/renderer/map/usePolygonEditor.ts` — o hook.
- `admin/src/renderer/map/usePolygonEditor.test.ts` — 22 testes (`@testing-library/react`'s
  `renderHook`/`act`).

## Decisões técnicas

- **Hook React sobre `useReducer`, não uma classe.** A task deixava a escolha em aberto. Um hook
  encaixa diretamente no jeito que as Tasks 15/16 (`TerritoryEditorScreen`/`BlockEditorScreen`) vão
  consumir isso ("Usa o `usePolygonEditor` da Task 10, semeado com o contorno existente") — chamado
  dentro de um componente, sem precisar de uma camada extra de adaptação. `useReducer` em vez de dois
  `useState` (um para `points`, outro para a pilha de undo) porque cada mutação precisa ler o estado
  anterior de forma atômica para tirar o snapshot correto; com dois `useState` separados, várias
  chamadas seguidas na mesma volta de render (ex. testes que despacham repetidamente dentro de um só
  `act()`) arriscariam ler uma pilha desatualizada. Um reducer único elimina essa classe de bug.
- **`initial` só é lido na montagem**, via a forma de inicialização preguiçosa do `useReducer`
  (terceiro argumento) — o mesmo contrato do construtor `PolygonEditorController(initial: ...)` do
  Dart: mudar a prop depois não reresseta o editor. Está documentado no comentário do arquivo.
- **`movePoint`/`removePoint` com índice fora do intervalo são no-op silencioso**, sem lançar. A task
  não especificava esse caso; escolhido por defesa razoável (um índice fora do intervalo só pode vir
  de um bug de quem chama, e um crash no meio de uma sessão de desenho é pior que um no-op) e coberto
  por teste explícito, incluindo a verificação de que nenhum snapshot espúrio é empilhado.
- **`hintFor` não aceita `problem: null`** — removido depois de aparecer como branch morta na
  cobertura: `deriveState` só chama `hintFor` dentro do `catch` de um `InvalidPolygonError`, e o caso
  válido (`problem: null`) já retorna `hint: null` direto, sem passar por `hintFor`. Simplificar a
  assinatura em vez de deixar um branch inalcançável foi a correção, não um teste a mais.
- **Bug descoberto durante o GREEN, não na implementação:** o primeiro rascunho do teste "undo walks
  all the way back to empty" usava `while (result.current.canUndo) { result.current.undo() }` dentro
  de um único `act()`. Como o React só recalcula `result.current` quando o `act()` termina de
  flushar, a condição do `while` nunca via a mudança e o teste entrava em loop infinito — a suíte
  estourou a heap do Node (`JavaScript heap out of memory`) na primeira tentativa de rodar. Corrigido
  disparando um número fixo de `undo()` (4, o número de snapshots conhecido) dentro do `act()`, e os
  dois testes de índice fora do intervalo, que por engano assumiam `canUndo === false` logo depois de
  montar um quadrado de 4 pontos (que já deixa 4 snapshots empilhados), foram reescritos para verificar
  que nenhum snapshot extra foi empilhado (desfazendo uma vez e conferindo que o resultado é o estado
  de antes do 4º ponto, não o quadrado inalterado).
- **`deriveState` propagando erros não-`InvalidPolygonError`** é coberto com `vi.spyOn` no módulo
  `shared/geo` para forçar `validateRing` a lançar um `Error` genérico — o mesmo padrão do Dart
  original, que só captura o tipo específico (`on core.InvalidPolygonException catch`) e deixa
  qualquer outra exceção propagar sem tratamento especial.

## Como validar

```bash
cd admin
npx vitest run src/renderer/map/usePolygonEditor.test.ts   # só este arquivo
npx vitest run                                              # suíte inteira
npm run lint
npm run typecheck
npx vitest run --coverage --coverage.include='src/renderer/map/usePolygonEditor.ts' src/renderer/map/usePolygonEditor.test.ts
```

## Resultado da validação

- `npx vitest run src/renderer/map/usePolygonEditor.test.ts` — **22 testes passando**.
- `npx vitest run` (suíte inteira do admin) — **131 testes passando** em 8 arquivos (inclui arquivos
  de outras tasks da spec em andamento em paralelo; nenhum tocado por esta implementação além dos dois
  listados acima).
- `npm run lint` — limpo, 0 erros, 0 warnings (depois de rodar `prettier --write` no arquivo novo).
- `npm run typecheck` — limpo (`typecheck:node` e `typecheck:web`).
- Cobertura isolada de `usePolygonEditor.ts` (`--coverage.include`) — **100% statements, 100%
  branches, 100% functions, 100% lines** (45/45, 25/25, 13/13, 35/35).
