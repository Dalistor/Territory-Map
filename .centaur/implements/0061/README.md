# [0061] Desenho de território com fechamento explícito, e mapa abrindo na cidade da congregação

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto (com módulos novos testados por TDD dentro do escopo)
**Spec:** — (pedidos do usuário testando o app de verdade, fora de qualquer spec — sequência
imediata de `implements/0060`)

## Pedido 1 — Fechamento explícito do polígono

**O que o usuário pediu:** marcar um ponto, desenhar linhas a partir dele, e só considerar a
demarcação válida quando a linha se conecta de volta ao ponto inicial, fechando a área.

**O que existia antes:** `PolygonEditorLayers.tsx` (Task 11, spec 0003) escutava clique no mapa e
só chamava `controller.addPoint` — nunca usava o modo de desenho nativo do Leaflet-Geoman
(`map.pm.enableDraw('Polygon')`). Como o React sempre renderiza um `<Polygon>` do `react-leaflet`
(que o Leaflet fecha e preenche sozinho a partir do 3º ponto), a área aparecia "fechada" desde o
início do desenho, sem nenhum gesto de fechamento — daí o comportamento estranho no screenshot do
usuário.

**Correção:** `PolygonEditorLayers.tsx` reescrito com duas fases distintas:
- **Anel vazio** (nada desenhado ainda): o próprio modo de desenho do Geoman
  (`map.pm.enableDraw('Polygon', DRAW_OPTIONS)`) assume o mapa — clique marca vértice, uma linha
  acompanha o cursor, e o anel só é considerado terminado quando o admin clica de volta no primeiro
  vértice (gesto nativo do Geoman) ou dá duplo clique. O resultado (`pm:create`) é entregue ao
  controller de uma vez via um novo método `setPoints`.
- **Anel não-vazio** (recém-fechado, ou território/quadra existente sendo reformado): o
  `<Polygon>` do React assume, com o modo de edição do Geoman já existente (arrastar vértice,
  remover vértice) — comportamento inalterado.

`usePolygonEditor.ts` ganhou `setPoints(points)`: substitui o anel inteiro numa única mutação,
com um snapshot próprio de undo (diferente de `addPoint`, que empilha um snapshot por ponto — um
desenho terminado no Geoman chega pronto, não ponto a ponto). Testado por TDD: 3 novos casos (troca
o anel, é desfazível mesmo partindo do vazio, o snapshot é do anel anterior — não do novo).

Mínimo de 3 vértices continua sendo a regra (`shared/geo.ts`, espelhando a validação do servidor) —
não foi alterado.

## Pedido 2 — Mapa abrindo na cidade da congregação, não em Brasília

**O que o usuário pediu:** por padrão, o mapa deveria carregar na cidade onde a congregação está,
não na posição fixa (Brasília) usada como último recurso quando não há território nenhum.

**Correção:**
- `admin/src/main/geocode.ts` (novo): `createGeocoder()` consulta a API de geocodificação Nominatim
  do OpenStreetMap (o mesmo provedor dos tiles) para achar um ponto aproximado de uma cidade. Roda
  no **processo main**, não no renderer — a política de uso do Nominatim
  (https://operations.osmfoundation.org/policies/nominatim/) pede um `User-Agent` identificando o
  app, e um `fetch` de navegador/renderer não pode setar esse header (o próprio spec do Fetch
  proíbe); o `fetch` do Node pode. Uma falha (sem resultado, rede fora, resposta malformada) vira
  `null`, nunca uma exceção — é um refinamento de UX, não algo que deveria travar o mapa. Testado
  por TDD: 12 casos, 100% de cobertura.
- Canal IPC novo `geo:geocodeCity` (`shared/ipc-contract.ts`, `main/ipc-handlers.ts`,
  `preload/index.ts`) — sem passar por `session.run()`, porque não é uma chamada ao servidor da
  própria congregação, não tem token pra anexar nem 401 pra repetir.
- `admin/src/renderer/App.tsx` (`AuthenticatedApp`): geocodifica a cidade da congregação **uma vez**
  ao autenticar, guarda o resultado em estado, e passa como `fallbackCenter` para `HomeScreen` e
  `TerritoryEditorScreen`.
- `TerritoryMap.tsx` e `TerritoryEditorScreen.tsx`: nova prop opcional `fallbackCenter`, usada no
  lugar de Brasília quando não há território (nem vizinho, no caso do editor) para se ancorar.
  Brasília continua sendo o último recurso final, se a geocodificação falhar ou ainda não tiver
  resolvido.

## Arquivos modificados

- `admin/src/main/geocode.ts` (novo), `admin/src/main/geocode.test.ts` (novo)
- `admin/src/shared/ipc-contract.ts`, `admin/src/main/ipc-handlers.ts`, `admin/src/main/index.ts`,
  `admin/src/preload/index.ts`
- `admin/src/renderer/map/usePolygonEditor.ts`, `usePolygonEditor.test.ts`
- `admin/src/renderer/map/PolygonEditorLayers.tsx`
- `admin/src/renderer/map/TerritoryMap.tsx`
- `admin/src/renderer/screens/HomeScreen.tsx`
- `admin/src/renderer/screens/TerritoryEditorScreen.tsx`
- `admin/src/renderer/App.tsx`, `App.test.tsx` (incluindo correção de uma race condition pré-existente
  no helper `renderHome` dos testes de navegação, exposta pela nova espera assíncrona da
  geocodificação)

## Como validar

```bash
cd admin
npm run lint
npm run typecheck
npm test
npm run build
env -u ELECTRON_RUN_AS_NODE npm run dev
```

## Resultado da validação

- `npm run lint` — sem erros.
- `npm run typecheck` — sem erros.
- `npm test` — 294/294 passando (era 279 antes; 15 novos: 12 de `geocode.test.ts` + 3 de
  `usePolygonEditor.test.ts` para `setPoints`).
- `npm run build` — conclui (main, preload, renderer).
- `PolygonEditorLayers.tsx` não tem teste unitário dedicado (mesmo motivo documentado desde a Task
  11: é fiação de UI sobre o modelo de eventos de uma lib de terceiro — o que é testável,
  `usePolygonEditor`, está 100% coberto).
- Confirmação visual do usuário pendente após esta correção — o app real estava rodando com uma
  versão anterior do `PolygonEditorLayers.tsx` na hora do pedido; precisa relançar.
