# [0065] "Desfazer" remove um vértice por vez, mesmo em anel recém-fechado

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0004/` — Task 01

## Solicitação

> Em `admin/src/renderer/map/PolygonEditorLayers.tsx`, no `useEffect` que registra o listener
> `pm:create`, troque a linha `setPoints(ringFromDrawnLayer(layer))` dentro de `handleCreate` por
> um laço que chama `addPoint` uma vez pra cada ponto do anel devolvido por
> `ringFromDrawnLayer(layer)`, na ordem em que aparecem.

## Contexto

`setPoints` (`usePolygonEditor.ts`) troca o anel inteiro numa única mutação, com um único snapshot
de undo. Como o Leaflet-Geoman entrega o anel inteiro de uma vez ao fechar (`pm:create`), o
primeiro "Desfazer" depois de fechar um anel novo apagava o desenho inteiro, voltando ao modo de
desenho do zero — em vez de remover só o último vértice, que é o que o usuário espera. `addPoint`
já tira um snapshot por chamada (implementado e testado em `usePolygonEditor.ts`), então chamá-lo
uma vez por vértice do anel recria a granularidade de undo de antes, sem precisar mexer no
controller.

## O que foi feito

- `handleCreate` agora chama `ringFromDrawnLayer(layer).forEach((point) => addPoint(point))` em
  vez de `setPoints(ringFromDrawnLayer(layer))`.
- `addPoint` foi adicionado à desestruturação de `controller` no topo do componente.
- `setPoints` permanece na desestruturação (não é mais chamado neste arquivo, mas continua parte
  pública testada da API de `usePolygonEditor`) — como o TypeScript do projeto roda com
  `noUnusedLocals: true` (herdado de `@electron-toolkit/tsconfig`), a variável agora não usada
  precisou de `void setPoints` logo após a desestruturação, para satisfazer o typecheck sem
  removê-la. É o mesmo idioma já usado em outros pontos do admin (`App.tsx`'s `void boot()`,
  `HomeScreen.tsx`'s `void handleDeleteTerritory(...)`) para marcar uma referência como
  intencionalmente não usada.
- O array de dependências do `useEffect` trocou `setPoints` por `addPoint`, refletindo a nova
  chamada.
- Dois comentários do arquivo (o bloco de topo, que descrevia o fluxo antigo com `setPoints`, e o
  corpo de `handleCreate`) foram atualizados para explicar a nova granularidade de undo — evita que
  a documentação inline fique desatualizada e confunda a próxima pessoa a ler o arquivo.

## Arquivos modificados

- `admin/src/renderer/map/PolygonEditorLayers.tsx` — `handleCreate` chama `addPoint` por vértice em
  vez de `setPoints` com o anel inteiro; `addPoint` adicionado à desestruturação; comentários
  atualizados; `void setPoints` para satisfazer `noUnusedLocals`.

## Decisões técnicas

- **`void setPoints` em vez de remover da desestruturação:** a instrução da task foi explícita em
  manter `setPoints` disponível (parte pública testada de `usePolygonEditor`, com uso futuro
  possível), mas o projeto roda `tsc` com `noUnusedLocals: true` — que falha o `typecheck` se uma
  variável desestruturada não for referenciada em lugar nenhum. `void setPoints` resolve as duas
  exigências ao mesmo tempo: mantém a variável na desestruturação e satisfaz o compilador, sem
  mudar nenhum comportamento em runtime. Não havia essa combinação de restrições documentada
  explicitamente na task, mas a resolução foi direta o bastante (idioma já existente no próprio
  projeto) para não justificar pausar a implementação.
- **Comentários atualizados além da linha pedida:** a task pedia só a troca da chamada, mas o bloco
  de comentário no topo do arquivo descrevia o comportamento antigo (`setPoints` em uma única
  chamada) de forma explícita o bastante para induzir a próxima leitura a erro. Atualizá-lo é
  escopo mínimo necessário para não deixar a documentação inline mentindo sobre o próprio código
  que ela descreve.

## Como validar

Este arquivo não tem teste unitário dedicado (fiação de UI sobre uma lib de terceiro — mesmo motivo
documentado desde a implementação original do editor). Validação manual: `npm run dev` no `admin/`,
abrir o editor de um território ou quadra, desenhar um polígono novo com 4+ pontos, fechar o anel
(clique de volta no primeiro vértice ou duplo clique) e clicar "Desfazer" uma vez — deve remover só
o último vértice, com o polígono continuando visível com um ponto a menos, não o desenho inteiro.

## Resultado da validação

- `npm run typecheck` — passou (`tsc --noEmit` para `tsconfig.node.json` e `tsconfig.web.json`).
- `npm run lint` — passou, sem warnings.
- `npm test` — suíte inteira verde: 294 testes em 18 arquivos, nenhuma mudança de teste necessária
  (nenhum teste existente cobre este arquivo, como esperado).
- Revisão manual do diff: confirmado que `ringFromDrawnLayer(layer)` preserva a ordem dos vértices
  do anel devolvido pelo Geoman, então `forEach((point) => addPoint(point))` adiciona os pontos na
  mesma ordem em que apareceriam se o admin tivesse clicado um a um — a granularidade de undo fica
  idêntica à do modo de desenho ponto-a-ponto anterior.
