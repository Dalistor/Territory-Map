# [0173] App admin: o mapa das designações em MapLibre (`AssignmentsMapView`)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0012/` — Task 09

## Solicitação

> Spec 0012 — Task 09: Implemente `admin-app/src/presentation/map/AssignmentsMapView.tsx`. Leia
> antes `app/src/presentation/map/TerritoryMapView.tsx` (o setup de
> `@maplibre/maplibre-react-native` com tiles raster do OpenStreetMap, o User-Agent identificado, e
> as convenções de `ShapeSource`/`FillLayer`/`LineLayer`/`SymbolLayer` já usadas neste monorepo) e
> `admin/src/renderer/map/AssignmentsMap.tsx` (o que a página de Designações do desktop desenha:
> **só as demarcações, nenhuma quadra**, com o nome do dirigente sobreposto).
>
> O componente recebe `territories: Territory[]`, um `onSelectTerritory(territory)` e um centro de
> fallback, e desenha: o contorno preenchido de cada território, com cor distinta entre "tem
> dirigente" e "sem dirigente"; um rótulo no centroide de cada um com o nome do território e, na
> linha de baixo, o nome do dirigente (ou "Sem dirigente"). Tocar num território chama
> `onSelectTerritory`. Sem territórios, o mapa centra no fallback. Não desenhe quadras.
>
> Este arquivo é a exceção de teste automatizado já registrada no `CLAUDE.md` para a view nativa do
> MapLibre — **não escreva teste para ele**. Mantenha nele apenas o desenho; qualquer cálculo
> (centroide, escolha de cor, texto do rótulo) vai para uma função pura ao lado, em
> `admin-app/src/domain/`, com teste. Critério de sucesso: `npx tsc --noEmit` e `npm run lint`
> passam, e o arquivo não importa nada de `data/`.

## Contexto

O app admin Android (spec 0012) precisa da mesma leitura que a página **Designações** do desktop
oferece: quem está com cada território, visto no mapa. Como a Task 10 (a tela de Designações) já
depende deste componente, ele entra antes, sozinho, com a interface que a tela vai consumir.

O componente envolve uma view nativa do MapLibre — o mesmo "risco assumido" que o `CLAUDE.md` já
registra para `app/src/presentation/map/TerritoryMapView.tsx` e para o Leaflet-Geoman do desktop.
Por isso a task pediu explicitamente que ele **não** tivesse teste e que fosse o menor arquivo
possível.

## O que foi feito

Duas peças, uma em cada camada:

1. **Domain** — `admin-app/src/domain/territoryMap.ts`, módulo puro com tudo que o mapa *decide*:
   as duas cores (`ASSIGNED_TERRITORY_COLOR` azul / `UNASSIGNED_TERRITORY_COLOR` cinza), o rótulo
   do dirigente (`territoryLeaderLabel`, com `'Sem dirigente'` quando não há designação aberta), o
   centroide médio (`averageCentroid`), a montagem das features desenháveis
   (`territoryMapFeatures`, que fecha o anel via `toGeoJsonRing` e descarta demarcação com menos de
   3 vértices) e o retângulo da câmera (`territoriesBounds`, em `[west, south, east, north]`). Vem
   com `territoryMap.test.ts`, 13 casos.

2. **Presentation** — `admin-app/src/presentation/map/AssignmentsMapView.tsx`, só desenho: tiles
   raster do OSM com o `User-Agent` identificado, um `GeoJSONSource` com camada de preenchimento e
   camada de linha coloridas por `['get', 'color']`, e um `Marker` por território com o rótulo de
   duas linhas (nome do território / nome do dirigente). Tocar no preenchimento ou no rótulo chama
   `onSelectTerritory`. Nenhuma quadra é desenhada. Sem território, a câmera abre no
   `fallbackCenter` recebido (ou em Brasília, o último recurso).

## Arquivos criados

- `admin-app/src/domain/territoryMap.ts` — cálculos puros do mapa de designações
- `admin-app/src/domain/territoryMap.test.ts` — os 13 casos que cobrem esses cálculos
- `admin-app/src/presentation/map/AssignmentsMapView.tsx` — a view MapLibre, só desenho

## Arquivos modificados

- `admin-app/src/presentation/map/index.ts` — comentário-placeholder atualizado (o arquivo da task
  já existe; as telas o importam por caminho, como todo o resto do app, então não há re-export)

## Decisões técnicas

- **API v11 do MapLibre, não os nomes citados na instrução.** A task menciona
  `ShapeSource`/`FillLayer`/`LineLayer`/`SymbolLayer`, mas o
  `@maplibre/maplibre-react-native@11.3.7` instalado (e o
  `app/src/presentation/map/TerritoryMapView.tsx` que serve de molde) expõe `Map`, `GeoJSONSource`,
  `Layer` e `RasterSource`. Segui o código real do monorepo, não os nomes da instrução — usar a API
  antiga nem compilaria.
- **Rótulo como `Marker` com `<Text>`, não `symbol` layer.** Mesma razão já documentada no app do
  publicador: o MapLibre desenha texto de camada a partir de glifos SDF baixados da `glyphs` do
  estilo, e este estilo é raster puro. Adicionar `glyphs` significaria depender de um servidor de
  fontes — exatamente o que a escolha por OSM + MapLibre evita.
- **Preenchimento translúcido em vez de só contorno.** Uma linha de 2px é impossível de acertar com
  o polegar; o `fill` é o que torna o território inteiro tocável. Mesma decisão do mapa do app.
- **Sem `line-dasharray` para "sem dirigente", ao contrário do desktop.** O Leaflet aceita
  `dashArray` por polígono; no MapLibre `line-dasharray` não é *data-driven*, então distinguir por
  traço exigiria uma segunda fonte só para os não designados. A distinção de cor (azul/cinza) já é
  o critério que a task pede, e o rótulo diz "Sem dirigente" por extenso logo abaixo do nome.
- **`fitBounds` chaveado pelo valor dos bounds, não pela identidade do array.** Portado do app do
  publicador: os territórios chegam da API depois da montagem, então só o `initialViewState`
  deixaria a câmera parada no fallback para sempre; e recarregar a lista (o que a tela de
  Designações faz a cada designação) não pode fazer o mapa saltar sob o dedo do admin.
- **Centroide médio, não centroide geométrico.** Mesmo atalho que os outros dois clientes já tomam:
  para posicionar um rótulo sobre uma área do tamanho de um território, a média dos vértices basta,
  e evita trazer uma dependência de geometria para o cliente.
- **O `fallbackCenter` é um `LatLng`, não um par solto.** Regra do `CLAUDE.md` ("nada de coordenada
  como float solto"); a conversão para `[lng, lat]` do MapLibre acontece num único helper local.

## Como validar

```bash
cd admin-app
npx tsc --noEmit
npx eslint src/domain/territoryMap.ts src/domain/territoryMap.test.ts \
           src/presentation/map/AssignmentsMapView.tsx
npx jest src/domain/territoryMap.test.ts
```

O desenho em si só se verifica a olho, com `npm run android` num emulador ou aparelho — o que
depende do JDK 17, ausente nesta máquina (registrado no Contexto da spec 0012). É a mesma exceção
de `app/src/presentation/map/TerritoryMapView.tsx`.

## Resultado da validação

- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos três arquivos desta task — limpo.
- `npx jest src/domain/territoryMap.test.ts` — 13 testes, todos passando.
- `npm run lint` no projeto inteiro acusa 2 erros e 1 warning em `src/data/api-client.ts` e
  `src/data/api-client.test.ts` — arquivos da **Task 04**, que rodava em paralelo enquanto esta era
  executada. Não são desta task, e a instrução proíbe tocá-los (camada Data). Os arquivos desta
  task passam no lint isoladamente.
- Os testes cobrem os cálculos porque a task exige teste para a função pura; eles foram escritos ao
  lado do código, não por TDD — este é um modo `direto`.

## Observação para as tasks seguintes

O `admin-app/jest.setup.js` mocka `@maplibre/maplibre-react-native` com os nomes da API antiga
(`MapView`, `ShapeSource`, `FillLayer`, …), que não existem na v11 instalada. Isso não afeta esta
task (o componente não é testado), mas a **Task 10** — que renderiza a tela contendo o mapa — vai
precisar ou mockar o `AssignmentsMapView` inteiro, ou corrigir o mock global para os nomes reais
(`Map`, `Camera`, `GeoJSONSource`, `Layer`, `RasterSource`, `Marker`, `TransformRequestManager`).
