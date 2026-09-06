# [0046] Componente de mapa do admin Electron: `TerritoryMap`

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0003/` — Task 09

## Solicitação

Implementar `admin/src/renderer/map/TerritoryMap.tsx` usando `react-leaflet`: um `MapContainer` com
um `TileLayer` do OSM (com a política de uso documentada em comentário), um polígono de contorno
(não preenchido, borda fina) por território, um polígono preenchido por quadra colorido segundo
`blockColorCategory`, e um marcador numerado no centróide simples (média dos vértices) de cada
quadra, que chama `onBlockTap(territory, block)` ao ser clicado. Centro inicial: média de todos os
pontos de todos os territórios, ou Brasília `(-15.78, -47.93)` com zoom 4 se não houver nenhum;
zoom 15 quando há território. O componente só recebe dados via props — nenhuma chamada a
`window.api`.

## Contexto

Task 09 da spec 0003 (migração do admin de Flutter para Electron + React). Porta
`admin/lib/presentation/map/territory_map.dart` (já removido do repo, recuperado do histórico do git
em `38eccd6` para servir de referência exata) para o novo stack. Depende da Task 08
(`blockColorCategory`, `.centaur/implements/0043/`) e da Task 03 (`shared/models.ts`,
`.centaur/implements/0040/`), ambas já concluídas.

## O que foi feito

- Criado `admin/src/renderer/map/TerritoryMap.tsx`, componente de apresentação puro (props:
  `territories: Territory[]`, `now: Date`, `onBlockTap?: (territory, block) => void`).
- `MapContainer` do `react-leaflet` com `TileLayer` apontando para
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, comentário no topo do arquivo explicando a
  política de uso dos tiles do OSM (User-Agent identificado, sem *bulk download*, sem pré-busca),
  mesma justificativa que o Dart já documentava.
- Um `Polygon` por território (contorno azul, `fill: false`, `weight: 2`) e um `Polygon` por quadra
  (preenchido, cor derivada de `blockColorCategory` via `CATEGORY_COLOR`: vermelho/`'never'`,
  laranja/`'overdue'`, verde/`'recent'`).
- Um `Marker` numerado por quadra, usando `DivIcon` (badge circular com o número), posicionado no
  centróide simples (`averageCentroid`, média aritmética dos vértices — não centróide geométrico
  real, replicando a mesma aproximação do `_centroid` do Dart). `eventHandlers.click` chama
  `onBlockTap?.(territory, block)`.
- `initialCenter`: média de **todos os pontos de `territory.boundary`** de todos os territórios
  (mesma fonte que o Dart usava — só o contorno, não os vértices das quadras); Brasília como
  fallback com zoom 4; zoom 15 quando existe ao menos um território. `center`/`zoom` são só o estado
  inicial do `MapContainer` (o `react-leaflet` não os re-lê depois da montagem), que é exatamente o
  comportamento pedido ("centro inicial").
- Adicionadas as dependências `leaflet`, `react-leaflet` e `@types/leaflet` a
  `admin/package.json` — na prática já estavam presentes quando a implementação começou, porque a
  Task 11 (rodando em paralelo pela mesma orquestração da spec) as havia adicionado primeiro (junto
  de `@geoman-io/leaflet-geoman-free`, que não é usada por este arquivo). `npm install` já tinha sido
  executado; nada a instalar de novo.

## Arquivos criados

- `admin/src/renderer/map/TerritoryMap.tsx` — o componente.

## Arquivos modificados

- `admin/package.json` — dependências `leaflet`, `react-leaflet` (dependencies) e `@types/leaflet`
  (devDependencies); já estavam lá por causa da Task 11 concorrente, confirmadas presentes.

## Decisões técnicas

- **Cores em hexadecimal fixo, não do tema.** O admin Electron ainda não tem um sistema de tema
  centralizado (diferente do `Theme.of(context).colorScheme` do Flutter); optei por constantes
  simples (`CATEGORY_COLOR`, `TERRITORY_OUTLINE_COLOR`) em vez de inventar um sistema de tema fora do
  escopo desta task. Fácil de trocar por tokens de tema depois, sem mudar a estrutura do componente.
- **Marcador via `DivIcon` com HTML inline**, não o ícone padrão do Leaflet — evita o problema clássico
  do `react-leaflet`/Vite com o caminho dos PNGs padrão do Leaflet quebrando no bundle, e dá controle
  total sobre o badge numerado colorido, que é o que a tela pede.
- **`import 'leaflet/dist/leaflet.css'` dentro do próprio arquivo**, não em `main.tsx` — mantém a
  dependência do Leaflet inteiramente confinada a este componente, seguindo o mesmo princípio de
  isolamento que o `AGENTS.md` já usa para a lib de edição de polígono.
- **`style={{ height: '100%', width: '100%' }}` no `MapContainer`** — o Leaflet exige que o contêiner
  tenha tamanho explícito; como o componente não recebe prop de estilo, ele preenche o pai por
  padrão, e quem o usa controla o tamanho através do contêiner externo.
- **Sem teste automatizado**, conforme a instrução da task (modo "direto": componente estrutural/
  visual). Validado por `npm run typecheck`, `npm run lint` e `npm run build`.

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
- `npm run lint` — 0 erros; only 1 warning pré-existente em `admin/src/main/session.test.ts`
  (arquivo de outra task, não tocado aqui). O próprio `TerritoryMap.tsx` ficou limpo depois de
  `npx prettier --write`.
- `npm run build` — `electron-vite build` conclui com sucesso (main, preload e renderer).
- `npm test` — 148 testes passando em 9 arquivos (nenhuma regressão).
