# [0188] App admin: o mapa desenha as quadras e responde ao toque (spec 0013, Task 04)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0013/` — Task 04

## Solicitação
Alterar `admin-app/src/presentation/map/AssignmentsMapView.tsx` para desenhar as quadras: polígonos
coloridos por status num `GeoJSONSource` próprio acima das demarcações, número como `Marker` com
`<Text>`, rótulos de território escondidos quando houver quadra à vista, e uma prop
`onSelectBlock(block, territory)` disparada ao tocar no polígono inteiro da quadra.

## Contexto
A spec 0012 decidiu que este mapa não desenharia quadras, espelhando a página Designações do
desktop. No celular o mapa é todo o contexto que o admin tem, então a spec 0013 reverte a decisão.
Junto vem a correção do problema relatado pelo usuário: os balões de nome do território sentavam em
cima dos números das quadras.

## O que foi feito
- Prop `onSelectBlock?: (block, territory) => void` e prop opcional `now?: Date` (o relógio das
  cores, injetável; sem ela, `new Date()` recalculado quando os territórios mudam).
- `blockMapFeatures(territories, now)` (Task 02) memoizado; nenhum cálculo novo dentro do componente.
- `GeoJSONSource id="blocks"` **depois** do de demarcações, com `fill` translúcido (0.35) e `line`
  sólida, ambos com `['get', 'color']`, mais `hitbox` de 22px — cópia do tratamento do publicador.
- Um `Marker` por quadra ancorado no `center`, com `Pressable` + `<Text>` mostrando o número sobre
  um badge circular na cor do status. Nada de `symbol`/`text-field`.
- Rótulos de território renderizados só quando `shouldShowTerritoryLabels(blocks)` é `true`.
- `handleBlockPress` resolve `blockId` da feature por um `Map` id → `{block, territory}` e chama
  `onSelectBlock`. O `onPress` da fonte de demarcações continua intocado, então tocar no território
  fora de qualquer quadra segue chamando `onSelectTerritory`.
- Comentário do topo do arquivo atualizado: dizia "No blocks", que deixou de ser verdade.

## Arquivos modificados
- `admin-app/src/presentation/map/AssignmentsMapView.tsx` — desenho das quadras, números, contenção
  dos rótulos de território, `onSelectBlock`, `now`, estilos `blockLabel`/`blockLabelText`.

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Sem teste para este arquivo**, por instrução da task e pela exceção já registrada no `CLAUDE.md`
  para a view nativa do MapLibre. Todo o cálculo já vive em `domain/territoryMap.ts`, coberto.
- **`now` como prop opcional** em vez de `new Date()` solto no corpo: mantém o componente
  determinístico para quem quiser fixar o relógio, sem obrigar o chamador atual a passar nada.
- **Fill + line em vez de `fill-outline-color`** (que é o que o publicador usa): `fill-outline-color`
  não aceita largura, e uma linha de 1.5px separa quadras vizinhas de mesma cor, que é o caso comum.
- **O `onPress` da fonte de territórios não foi desligado** com quadras à vista, ao contrário do
  publicador: aqui tocar no território ainda tem destino próprio (`onSelectTerritory`), e a fonte
  das quadras está acima, então um toque dentro de uma quadra vai para ela.
- **Números continuam tappable** além do polígono, porque o badge cobriria um ponto morto bem onde o
  admin mira.

## Como validar
`npm run android` em emulador/aparelho: as quadras aparecem coloridas e numeradas, os balões de nome
do território somem quando há quadra na tela, tocar numa quadra dispara `onSelectBlock` (a ligação
com o painel é a Task 06) e tocar no território fora das quadras segue abrindo o que abria.

## Resultado da validação
`npx tsc --noEmit` sem erros, `npm run lint` limpo, `npm test` com 13 suítes e 225 testes passando.
O arquivo não importa nada de `data/`.
