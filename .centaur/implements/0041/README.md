# [0041] Domínio compartilhado do admin: geometria (`shared/geo.ts`)

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0003/` — Task 02

## Solicitação

Implementar por TDD `admin/src/shared/geo.ts` (+ `geo.test.ts`), portando o comportamento de
`packages/core/lib/geo/lat_lng.dart` para TypeScript: o tipo de ponto (`{lat, lng}` sem classe),
`isOnGlobe`, `pointsEqual`, `ringToJson`/`ringFromJson`, `toGeoJson`/`fromGeoJson`, e `validateRing`/
`isValidRing` com o erro tipado `InvalidPolygonError` (`problem: 'offGlobe' | 'tooFewPoints' |
'selfIntersecting'`, mensagens em português). Tocar apenas nesses dois arquivos.

## Contexto

O admin está migrando de Flutter para Electron + React + TypeScript (spec 0003). A Task 01 já
criou o esqueleto do projeto; esta task porta a primeira peça de domínio compartilhado entre `main`
e `renderer` — a validação geométrica de anel de polígono usada pelo editor de território/quadra e
pelo cliente HTTP (Tasks futuras 04, 10, 15, 16 dependem deste módulo).

## Critérios de aceite

- `isOnGlobe(point)`: verdadeiro sse `lat ∈ [-90, 90]` e `lng ∈ [-180, 180]` (limites inclusivos).
- `pointsEqual(a, b)`: igualdade por valor de `lat`/`lng`.
- `ringToJson(ring)`: abre o anel (remove o ponto de fechamento se repetir o primeiro).
- `ringFromJson(json)`: lê uma lista de `{lat, lng}` da API.
- `toGeoJson`/`fromGeoJson`: conversão para/de `[lng, lat]`.
- `validateRing(ring)`: lança `InvalidPolygonError` nesta ordem — `offGlobe` (qualquer ponto fora
  do globo) → `tooFewPoints` (menos de 3 pontos distintos depois de abrir e colapsar duplicatas
  consecutivas, inclusive a nova duplicata que o colapso pode expor no fechamento) →
  `selfIntersecting` (aresta não-adjacente cruzando outra, incluindo sobreposição colinear).
- `isValidRing(ring)`: `true`/`false` sem lançar, só engolindo `InvalidPolygonError` — qualquer
  outro erro propaga.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `isOnGlobe` aceita polos/antimeridiano e rejeita além do limite; `pointsEqual` compara por valor | `geo.test.ts` | Tipo `LatLng`, constantes de limite WGS84, `isOnGlobe`, `pointsEqual` |
| 2 | Conversão GeoJSON de/para, round trip; `ringFromJson`/`ringToJson` (anel aberto e já fechado), round trip do anel | `geo.test.ts` | `toGeoJson`, `fromGeoJson`, `ringFromJson`, `openRing` (privado), `ringToJson` |
| 3 | `validateRing` aceita quadrado simples, anel já fechado, contorno côncavo de 5+ pontos | `geo.test.ts` | `InvalidPolygonError`, `PolygonProblem`, `cleanRing`, `distinctPointCount`, `cross`/`isBetween`/`segmentsCross`/`hasSelfIntersection`, `validateRing` |
| 4 | `tooFewPoints`: menos de 3 pontos, corner repetido não conta como 3, tolera duplicata quando sobram 3 distintos | `geo.test.ts` | (mesma implementação do ciclo 3 — casos de aceite adicionais) |
| 5 | `selfIntersecting`: figura oito, aresta com sobreposição colinear (spike) | `geo.test.ts` | (idem) |
| 6 | `offGlobe`: mensagem cita a coordenada; checado antes do problema de forma | `geo.test.ts` | (idem) |
| 7 | Mensagens em português para os três problemas; erro é instância de `InvalidPolygonError` com `problem` tipado | `geo.test.ts` | (idem) |
| 8 | `isValidRing` responde `true`/`false` sem lançar | `geo.test.ts` | `isValidRing` |
| 9 | Cobertura de branch: duplicata exposta no fechamento (`(a,b,a,a)` → `(a,b,a)` → `(a,b)`); `isValidRing` repassa erro que não é `InvalidPolygonError`; as quatro combinações de sinal do cruzamento de arestas e os quatro casos de toque em T (`d1`/`d2`/`d3`/`d4` == 0) | `geo.test.ts` | (nenhum código novo — só fechou os ramos que a implementação dos ciclos 3–7 já cobria por completo, mas os testes anteriores não exercitavam) |

**Nota sobre o ciclo 9:** os ramos de sinal de `segmentsCross` (a função privada que decide se duas
arestas se cruzam) não são todos alcançáveis a partir de casos "óbvios" como a figura oito — a
combinação exata de sinais depende de qual lado cada ponto cai, então a cobertura de branch exigiu
desenhar geometria especificamente para cada ramo (script descartável em
`/private/tmp/.../scratchpad/probe.mjs`, usado só para calcular os produtos vetoriais e escolher
coordenadas — apagado ao final, não faz parte do código do projeto).

## O que foi feito

Port linha a linha de `packages/core/lib/geo/lat_lng.dart` para `admin/src/shared/geo.ts`, trocando
a classe `LatLng` por uma interface estrutural (`{readonly lat, readonly lng}`, sem construtor nem
métodos) conforme pedido — é um DTO, não uma entidade com identidade. A API pública replica 1:1 as
funções do Dart (`isOnGlobe` virou função livre em vez de getter, já que não há classe para carregar
o getter). O algoritmo de auto-interseção (`cleanRing`, `distinctPointCount`, `cross`, `isBetween`,
`segmentsCross`, `hasSelfIntersection`) é uma tradução direta das funções privadas do Dart,
incluindo os comentários que explicam por que a ordem das checagens e o colapso de duplicatas
importam.

## Arquivos criados

- `admin/src/shared/geo.ts` — tipo `LatLng`, constantes WGS84/`MIN_RING_POINTS`, `isOnGlobe`,
  `pointsEqual`, `toGeoJson`, `fromGeoJson`, `ringFromJson`, `ringToJson`, `PolygonProblem`,
  `InvalidPolygonError`, `validateRing`, `isValidRing`.
- `admin/src/shared/geo.test.ts` — 29 testes cobrindo todos os critérios de aceite.

## Decisões técnicas

- **`LatLng` como `interface`, não `class`**: pedido explícito da task ("sem classe, é um DTO").
  Igualdade por valor fica em `pointsEqual`, já que não há `==` sobrecarregável em TS/JS para
  objetos simples.
- **`InvalidPolygonError extends Error`**: usa o campo nativo `message` do `Error` em vez de
  duplicar um campo próprio, e adiciona só `problem` (tipado como union de string literals, não
  enum — mais idiomático em TS e serializável direto por IPC nas tasks futuras, sem depender de
  runtime enum do TypeScript).
- **`distinctPointCount` por chave de string** (`"${lat},${lng}"`) em vez de comparação par a par: é
  a forma mais direta de replicar `cleaned.toSet().length` do Dart (que usa a igualdade por valor de
  `LatLng`) sem reimplementar um `Set` com comparador customizado.
- **Nada mockado**: o módulo é puro (sem I/O, sem tempo, sem aleatoriedade), então todos os 29 testes
  são unitários diretos sobre a função pública, sem fakes.
- **Deixado deliberadamente fora**: nenhuma serialização de erro para IPC (isso é da Task 07,
  `ipc-contract.ts`/`ipc-handlers.ts`) e nenhuma integração com Leaflet/Leaflet-Geoman (Tasks 09/11) —
  este módulo não deve importar nada de `renderer/` nem de bibliotecas de mapa, conforme a barreira de
  camadas que a spec estabelece para `shared/`.

## Como validar

```bash
cd admin
npx vitest run src/shared/geo.test.ts          # suíte deste módulo
npx vitest run --coverage src/shared/geo.test.ts  # cobertura
npx eslint src/shared/geo.ts src/shared/geo.test.ts
npm run typecheck:web
```

## Resultado da validação

- `npx vitest run src/shared/geo.test.ts` → **29 testes, todos passando**.
- `npx vitest run --coverage src/shared/geo.test.ts` → **100% statements, 100% branch, 100%
  functions, 100% lines** em `geo.ts` (72/72 statements, 62/62 branches, 19/19 funções, 60/60
  linhas).
- `npx eslint src/shared/geo.ts src/shared/geo.test.ts` → sem erros nem avisos.
- `npm run typecheck:web` → sem erros (o `tsconfig.web.json` inclui `src/shared/**/*`).
- `npx vitest run` (suíte inteira do projeto `admin/`) → **5 arquivos, 61 testes, todos passando** —
  inclui os módulos das Tasks 03 e 05 da mesma spec, que terminaram em paralelo; nenhuma regressão
  causada por esta task.

Nenhum outro arquivo do repositório foi tocado além dos dois listados acima, conforme pedido.
