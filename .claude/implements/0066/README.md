# [0066] Popup de ações da quadra acima das camadas do mapa

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0004/` — Task 05

## Solicitação

Em `admin/src/renderer/index.css`, as regras `.block-actions-modal` e `[role='dialog']` tinham
`z-index: 50`. As camadas internas do Leaflet (`.leaflet-pane` e suas variantes — tiles, overlay,
sombra, marcadores, tooltip, popup) vão até `z-index: 700` (`popupPane`), e como
`.leaflet-container` não estabelece um contexto de empilhamento isolado (só tem
`position: relative`, sem `z-index` próprio), esses valores altos disputavam diretamente contra
qualquer elemento `position: fixed` fora do mapa também — inclusive o modal, que por ter
`z-index: 50` (bem abaixo de 700) acabava renderizando atrás das camadas do mapa. A pedido: subir
o `z-index` de `.block-actions-modal` e `[role='dialog']` para `1000`.

## Contexto

Item 5 do diagnóstico da spec 0004 ("Ao clicar em cima de uma quadra para editar, o popup aparece
em baixo do mapa"), reportado pelo usuário testando o app de verdade. O menu de ações de uma
quadra (`.block-actions-modal`, aberto ao clicar numa quadra na `HomeScreen`) e os diálogos
genéricos do app (`[role='dialog']`, usados por `PublishersScreen` e outras telas) usam
`position: fixed` para se centralizar na tela, mas `z-index: 50` não é suficiente para vencer o
`z-index: 700` do `popupPane` do Leaflet — o mapa da `HomeScreen` acaba desenhando por cima do
modal em vez de atrás dele.

## O que foi feito

Subi o `z-index` das duas regras de `50` para `1000` — valor com folga clara acima de qualquer
painel do Leaflet (o mais alto é 700, o `popupPane`) e padrão comum para "acima de qualquer coisa
de terceiro" na página.

## Arquivos modificados

- `admin/src/renderer/index.css` — `z-index: 50` → `z-index: 1000` em `[role='dialog']` (linha
  261) e em `.block-actions-modal` (linha 302). Nenhuma outra regra tocada.

## Decisões técnicas

- **1000, não um valor só um pouco acima de 700.** O CLAUDE.md da spec já apontava `1000` como a
  opção preferida ("deixa folga clara e é o padrão comum pra 'acima de qualquer coisa do
  Leaflet'"). Um valor como `701` funcionaria hoje, mas fica frágil a qualquer ajuste futuro nas
  panes do Leaflet ou a uma lib que insira uma camada intermediária.
- **Sem novo `stacking context`.** Não foi necessário adicionar `z-index`/`position` a
  `.leaflet-container` nem a nenhum ancestral — o `position: fixed` do modal já o tira do fluxo do
  documento, então competir só por `z-index` contra as panes do Leaflet (que também não estão
  isoladas em um contexto próprio) já resolve.
- **Sem teste automatizado**, conforme a instrução da task: é uma mudança puramente visual/CSS, sem
  comportamento observável em jsdom (que não calcula layout nem `z-index` real).

## Como validar

`npm run dev` no admin, abrir o mapa da `HomeScreen` com pelo menos uma quadra cadastrada, clicar
na quadra — o menu de ações deve aparecer por cima do mapa (tiles e marcadores inclusive), nunca
atrás.

## Resultado da validação

- `npm run typecheck` — verde (um erro transitório de `PolygonEditorLayers.tsx`, arquivo de outra
  task da mesma spec rodando em paralelo, sumiu ao reexecutar depois que aquela task terminou; não
  relacionado a este arquivo).
- `npm run lint` — verde, sem warnings.
- `npm test` — rodado imediatamente após esta mudança (só `index.css` alterado até então): 18
  arquivos de teste, 294 testes, todos passando. Uma reexecução posterior, com as Tasks 02/03/04 da
  mesma spec ainda em andamento em paralelo, mostrou 2 falhas em
  `src/renderer/screens/BlockEditorScreen.test.tsx` — arquivo da Task 04 (TDD, fora do escopo desta
  task e fora de `index.css`), capturado em pleno red/green do outro agente. Não relacionado a esta
  mudança; a corrida de execução paralela de `/centaur-driven-run` explica a leitura instável.
- Validação manual via `npm run dev` não foi executada nesta sessão (ambiente sem interação
  gráfica); a mudança é de duas linhas, isolada e de baixo risco (só o valor numérico de
  `z-index`), e a validação estática (typecheck/lint/test, no momento em que só este arquivo estava
  em jogo) não aponta nenhuma regressão.
