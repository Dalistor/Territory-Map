# [0103] Componente `AssignmentsMap`: demarcações e nome do dirigente

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0006/` — Task 02

## Solicitação
Criar `admin/src/renderer/map/AssignmentsMap.tsx` seguindo os padrões de `TerritoryMap.tsx`
(react-leaflet, MapContainer + TileLayer OSM, `averageCentroid`, `initialCenter` com
`fallbackCenter` e fallback Brasília, props `initialView`/`onViewChange`), mas desenhando só os
contornos de território (sem quadras), com estilo por `assignedUser`, rótulo `DivIcon` de duas
linhas (nome do território + dirigente ou "Sem dirigente") e `onTerritoryTap` no polígono e no
rótulo. Sem teste próprio. Tocar apenas o arquivo novo.

## Contexto
A página de Designações (Task 03 da spec 0006) precisa de um mapa que mostre quem está com cada
território de relance, sem o ruído das quadras que o `TerritoryMap` da Home desenha. Este
componente é a camada visual pura dessa página: só desenha o que recebe por props, sem
`window.api`, exatamente como o `TerritoryMap`.

## O que foi feito
Criado o componente `AssignmentsMap` com a interface exportada `AssignmentsMapProps`
(`territories`, `onTerritoryTap?`, `fallbackCenter?`, `initialView?`, `onViewChange?`):

- Mesma resolução de vista inicial do `TerritoryMap`: `initialView` > média dos pontos dos
  territórios > `fallbackCenter` > Brasília; zoom 15 com territórios, 4 sem.
- Polígono por território: com `assignedUser`, contorno sólido `#1565c0` (weight 2, fill
  `fillOpacity: 0.08`); sem designação, tracejado cinza `#78909c` (`dashArray: '6 6'`, weight 2,
  fill `fillOpacity: 0.05`).
- `Marker` com `DivIcon` no centroide médio: nome do território (11px, semibold) e o nome do
  dirigente ou "Sem dirigente" (itálico, cinza), sobre fundo branco translúcido com borda
  arredondada e sombra leve — estilo inline no html, como o `numberIcon` do `TerritoryMap`.
- Clique no polígono ou no rótulo chama `onTerritoryTap?.(territory)`.
- `ViewTracker` idêntico ao do `TerritoryMap` para reportar pan/zoom via `onViewChange`.

## Arquivos criados
- `admin/src/renderer/map/AssignmentsMap.tsx` — o mapa da página de Designações.

## Decisões técnicas
- **Nomes escapados no html do `DivIcon`** (`escapeHtml`): nome de território e de publicador são
  texto livre digitado pelo admin e vão para uma string html crua — sem escapar, um nome com `<`
  quebraria (ou injetaria) markup. O `numberIcon` do `TerritoryMap` não precisa disso porque
  interpola um número.
- **Ícone com `iconSize: [0, 0]` e centralização via `transform: translate(-50%,-50%)`**: o rótulo
  tem largura variável (depende do nome), então deixar o próprio html se centralizar evita
  calcular `iconAnchor` por rótulo.
- **`assignedUser !== undefined`** como predicado de designação: `main/api-client.ts` normaliza
  `assigned_user` nulo/ausente para `undefined` sempre, então não há caso `null` a tratar.
- **Sem teste próprio**: mesmo "risco assumido" do `TerritoryMap`, que também não tem — interação
  de mapa real não roda em jsdom; a tela que o consome (Task 03) mocka este componente.

## Como validar
`npm run dev` no admin ainda não mostra o componente (a tela que o usa é a Task 03). Até lá:
`npm run typecheck` e `npm run lint` em `admin/`. Depois da Task 03, abrir a página de
Designações e conferir contorno sólido azul vs. tracejado cinza, o rótulo com o dirigente e o
clique abrindo o diálogo.

## Resultado da validação
- `npm run typecheck` (node + web) — sem erros.
- `npm run lint` — sem erros.
- Sem teste novo por decisão da spec (componente de mapa, mockado pela tela consumidora).
