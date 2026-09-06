# [0048] Camada visual do editor de polígono do admin Electron com Leaflet-Geoman

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0003/` — Task 11

## Solicitação

Implementar `admin/src/renderer/map/PolygonEditorLayers.tsx`, o único arquivo do projeto que importa
Leaflet-Geoman. Recebe o controller de `usePolygonEditor` (Task 10) e um `context?: LatLng[][]`
(contornos de referência não-editáveis). Clique no mapa em modo de desenho chama `addPoint`; arrastar
um vértice chama `movePoint`; remover um vértice (gesto do Geoman) chama `removePoint` — nunca
mutando o ponto direto, sempre pelo controller, preservando a disciplina de snapshot que o hook já
implementa. Renderiza os contornos de `context` em cinza fino, e o anel atual na cor primária quando
`state.problem` é `null` ou na cor de erro quando não é. Sem teste unitário dedicado além de uma
renderização de fumaça, se fizer sentido.

## Contexto

Task 11 da spec 0003 (migração do admin de Flutter para Electron + React). Porta a parte de
`admin/lib/presentation/map/polygon_editor.dart` (já removido do repo, recuperado do histórico do git
em `12c95fe` para servir de referência exata) que liga `flutter_map_line_editor`/
`flutter_map_dragmarker` ao `PolygonEditorController` — aqui, o equivalente é ligar Leaflet-Geoman ao
`usePolygonEditor` (Task 10, `.centaur/implements/0045/`). Depende também de `shared/geo.ts` (Task 02,
`.centaur/implements/0041/`) para o tipo `LatLng`.

Esta implementação foi iniciada por um subagente da orquestração `/centaur-driven-run 0003` que foi
interrompido pelo usuário a meio da execução (o arquivo já estava escrito e validado quanto a
`typecheck`, mas a validação de lint/build/teste completos e a documentação não tinham sido feitas
nem o checklist da spec marcado). Este registro conclui o que faltava, sem alterar o código já escrito
além de rodar `eslint --fix` para resolver avisos de formatação.

## O que foi feito

- Criado `admin/src/renderer/map/PolygonEditorLayers.tsx`, importando
  `@geoman-io/leaflet-geoman-free` (já adicionada ao `admin/package.json` — `^2.20.0`) e seu CSS.
- `useMapEvents({ click })` chama `controller.addPoint` a cada clique no mapa.
- O `Polygon` do anel em edição recebe um `ref` (`setLayerRef`) que, ao montar, liga os eventos do
  Geoman `pm:markerdragend` (chama `controller.movePoint`) e `pm:vertexremoved` (chama
  `controller.removePoint`) na camada, e ativa o modo de edição (`layer.pm.enable(EDIT_OPTIONS)`).
  Um `useEffect` reativa a edição sempre que `points` muda por um motivo que não foi o próprio Geoman
  (adicionar ponto, desfazer, limpar), para os marcadores de vértice ficarem sincronizados com o anel.
- `EDIT_OPTIONS` desliga arraste do polígono inteiro (`draggable: false` — só vértice individual se
  move, igual ao modelo portado), desliga *snapping* (mesma lacuna documentada no admin Flutter
  original: "*Snapping* continua não existindo"), permite auto-interseção sem o Geoman bloquear ou
  reverter (`allowSelfIntersection(Edit): true` — quem sinaliza isso é `state.problem`, via
  `validateRing`, não a biblioteca), e desativa a inserção de vértice no meio de uma aresta
  (`addVertexValidation: () => false`) porque `usePolygonEditor` só suporta acrescentar ao fim do
  anel — um insert no meio não teria como chegar ao controller e seria descartado na próxima
  sincronização.
- Contornos de `context` desenhados em cinza fino (`CONTEXT_COLOR`), não-interativos, com `pmIgnore`
  para o Geoman nunca os tratar como editáveis.
- Cor do anel em edição: `VALID_COLOR` (verde) quando `state.problem === null`, `INVALID_COLOR`
  (vermelho) caso contrário — mesma sinalização visual do Dart (`scheme.primary`/`scheme.error`).
- `vertexIndexFromPath`: o tipo declarado do Geoman para `indexPath` é `number`, mas em runtime é o
  caminho completo no anel (`[ringIndex, vertexIndex]` para um polígono simples sem buracos, que é o
  único caso que este app edita) — a função extrai sempre a última posição do caminho.

## Arquivos criados

- `admin/src/renderer/map/PolygonEditorLayers.tsx` — o componente.

## Arquivos modificados

- `admin/package.json` — dependência `@geoman-io/leaflet-geoman-free` (já estava presente, adicionada
  durante a mesma execução antes da interrupção).

## Decisões técnicas

- **`draggable: false` no `EDIT_OPTIONS`** — evita que o Geoman ofereça mover o polígono inteiro
  arrastando o preenchimento, gesto que não existe no modelo portado (`usePolygonEditor` só move um
  vértice por vez).
- **Inserção de vértice no meio da aresta desligada de propósito.** O Dart original suportava isso
  (arrastar o ponto vazado intermediário do `flutter_map_line_editor`), mas `usePolygonEditor` (Task
  10, já concluída antes desta task) só expõe `addPoint` (acrescenta ao fim), `movePoint` e
  `removePoint` — não um `insertPointAt(index)`. Deixar o gesto do Geoman ativo sem um destino no
  controller criaria um controle que parece funcionar uma vez e depois nada faz. Documentado no
  próprio arquivo como uma lacuna conhecida, não um bug silencioso.
- **Sem teste unitário dedicado**, conforme a instrução da task — é fiação de UI sobre o modelo de
  eventos de uma biblioteca de terceiro, o mesmo motivo pelo qual o Dart original não testava a
  integração com `flutter_map_line_editor` diretamente (só o controller, testado na Task 10).

## Como validar

```bash
cd admin
npm install
npm run typecheck
npm run lint
npm run build
npm test   # garante que nada mais quebrou
```

## Resultado da validação

- `npm run typecheck` — sem erros.
- `npm run lint` — 0 erros. Havia 4 avisos de formatação (`prettier/prettier`) no arquivo, resolvidos
  com `npx eslint --fix`; lint ficou limpo depois.
- `npm run build` — `electron-vite build` conclui com sucesso (main, preload e renderer).
- `npm test` — 148 testes passando em 9 arquivos (nenhuma regressão).
