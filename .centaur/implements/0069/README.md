# [0069] O mapa da tela inicial mantém a posição entre navegações

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0004/` — Task 03

## Solicitação

"O mapa reseta toda vez que cadastra um território (reseta a posicao no caso)." — item 4 do
diagnóstico da spec 0004: `react-leaflet`'s `MapContainer` só lê `center`/`zoom` na montagem, e
`AuthenticatedApp` desmonta `HomeScreen` por completo ao navegar pra outra tela (de propósito, pra
forçar um novo fetch de territórios), remontando `TerritoryMap` do zero e perdendo a posição que o
admin tinha deixado.

## Contexto

Tasks 01, 02, 04 e 05 da spec 0004 já tinham sido concluídas (implements/0065, 0067, 0068, 0066).
Esta era a última task pendente, dependente da Task 02 por tocarem o mesmo arquivo
(`HomeScreen.tsx`).

## O que foi feito

A última posição conhecida do mapa (centro e zoom) passou a ser guardada um nível acima de
`HomeScreen`, em `AuthenticatedApp` (`App.tsx`), que não desmonta ao trocar de rota — só
`HomeScreen` desmonta. `TerritoryMap` ganhou uma prop `initialView` (usada como `center`/`zoom`
do `MapContainer` no lugar de `initialCenter(...)`/`FALLBACK_ZOOM`/`TERRITORY_ZOOM` quando
presente) e uma prop `onViewChange`, reportada por um componente interno novo (`ViewTracker`) que
usa `useMapEvents({ moveend, zoomend })` do `react-leaflet` — só pode existir como filho de
`MapContainer`, por isso é um componente próprio em vez de uma chamada de hook direta em
`TerritoryMap`. É renderizado só quando `onViewChange` é passado, pra não registrar listeners à
toa. `HomeScreen` só repassa as duas props (`mapView`/`onMapViewChange`) de `AuthenticatedApp` pra
`TerritoryMap`, sem lógica própria.

Ordem de prioridade pro centro/zoom inicial do mapa, da mais específica pra mais genérica:
posição salva (`initialView`) > média dos territórios > `fallbackCenter` geocodificado > Brasília
— exatamente a ordem que já existia, só com `initialView` entrando na frente de todas.

## Arquivos modificados

- `admin/src/renderer/App.tsx` — `AuthenticatedApp` ganhou o estado `mapView` (`{ center:
  LatLngTuple; zoom: number } | null`) e passa `mapView`/`onMapViewChange={setMapView}` pro
  `<HomeScreen>` no branch `case 'home':`.
- `admin/src/renderer/screens/HomeScreen.tsx` — `HomeScreenProps` ganhou as props opcionais
  `mapView`/`onMapViewChange`, repassadas pro `<TerritoryMap>` como `initialView`/`onViewChange`.
- `admin/src/renderer/map/TerritoryMap.tsx` — `TerritoryMapProps` ganhou `initialView`/
  `onViewChange`; `center`/`zoom` do `MapContainer` usam `initialView` quando presente; novo
  componente `ViewTracker` (filho condicional do `MapContainer`) reporta `moveend`/`zoomend` via
  `useMapEvents`.

## Decisões técnicas

- **Estado vive em `AuthenticatedApp`, não em `HomeScreen`**: é o único componente na cadeia de
  navegação que não desmonta ao trocar de rota — guardar o estado em qualquer lugar dentro de
  `HomeScreen` seria perdido no próximo mount, exatamente o bug que a task corrige.
- **`ViewTracker` como componente separado, não um hook chamado direto em `TerritoryMap`**:
  `useMapEvents` só funciona dentro do contexto de um `MapContainer` (via `useLeafletContext`
  internamente); chamar o hook no corpo de `TerritoryMap` — que é quem *renderiza* o
  `MapContainer`, não um descendente dele — quebraria em runtime. Renderizá-lo como filho do
  `MapContainer` resolve isso sem introduzir estado extra.
- **`ViewTracker` só renderiza quando `onViewChange` está definido**: evita registrar listeners
  Leaflet inertes em qualquer uso futuro de `TerritoryMap` que não precise rastrear a posição
  (ex.: se um dia aparecer um mapa somente-leitura em outra tela).
- **Sem teste unitário dedicado para `TerritoryMap.tsx`** (mesmo motivo documentado desde a Task
  09 original — componente de mapa, sem comportamento observável fora de um Leaflet real rodando
  em DOM verdadeiro). Validado manualmente.

## Como validar

`npm run dev`: arrastar/dar zoom no mapa da Home, abrir o editor de um território (ou "Novo
território"), clicar "← Voltar", e o mapa deve reabrir na mesma posição, sem resetar.

## Resultado da validação

- `npm run typecheck` — sem erros.
- `npm run lint` — sem erros/warnings.
- `npm test` — suíte inteira verde: 18 arquivos de teste, 305 testes passando (nenhum teste
  precisou mudar; as novas props são opcionais e nenhum teste existente as passa).
- Revisão manual do código e da Arquitetura de Camadas do admin: nenhuma regra de negócio
  vazou pro Renderer, `TerritoryMap` continua só desenhando o que recebe via props, sem chamar
  `window.api`.
