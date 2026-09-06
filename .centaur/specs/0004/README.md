# [0004] Corrigir o fluxo de cadastro/edição de território e quadra no admin

**Data:** 2026-08-17
**Status:** Concluída
**Solicitação original:** "Vamos melhorar o sistema de cadastro de quadras. Atualmente ao cadastrar
uma quadra, ele volta para a tela inicial e toda vez tem que voltar na confuguracao para fazer isso
/ A lista de territórios deve ser ordenada por ordem alfabética e deve estar dentro de um div com
overflow-y / Os botões de desfazer nao estão funcionando. / O mapa reseta toda vez que cadastra um
território (reseta a posicao no caso). / Ao clicar em cima de uma quadra para editar, o popup
aparece em baixo do mapa"

## Objetivo

Cinco correções de UX no admin Electron, encontradas testando o app de verdade (fora de qualquer
spec anterior — o fluxo de território/quadra foi implementado ad-hoc em `.centaur/implements/0059`
a `0064`):

1. Salvar uma quadra não navega mais pra `HomeScreen` — o editor continua na tela, pronto pra
   desenhar a próxima quadra do mesmo território.
2. A lista de territórios da `HomeScreen` fica ordenada alfabeticamente e dentro de um contêiner
   com altura limitada e rolagem própria (`overflow-y`).
3. "Desfazer" volta a remover um vértice por vez — inclusive logo depois que o Geoman fecha um
   anel novo — em vez de desfazer o desenho inteiro de uma vez.
4. O mapa da `HomeScreen` mantém a posição (centro e zoom) que o admin deixou, mesmo depois de
   navegar pra outra tela e voltar.
5. O popup de ações de uma quadra aparece **acima** do mapa (tiles, marcadores, tudo), não atrás.

## Contexto técnico

**Diagnóstico já feito nesta conversa, antes de escrever a spec — não precisa ser refeito:**

- **Item 3 (desfazer):** a causa é `PolygonEditorLayers.tsx`, no handler de `pm:create` (o evento
  que o Leaflet-Geoman dispara ao fechar um anel desenhado do zero — Task 11 original, spec 0003,
  reescrita em `.centaur/implements/0061`):
  ```ts
  const handleCreate = (event: L.LeafletEvent): void => {
    const { layer } = event as L.LeafletEvent & { layer: L.Layer }
    setPoints(ringFromDrawnLayer(layer))
    map.removeLayer(layer)
  }
  ```
  `setPoints` (`usePolygonEditor.ts`) troca o anel inteiro numa **única** mutação, com um único
  snapshot de undo — então o primeiro "Desfazer" depois de fechar o anel apaga o desenho inteiro de
  uma vez, voltando ao modo de desenho do zero. Antes de trocar pro modo de desenho nativo do
  Geoman, cada clique chamava `addPoint` (um snapshot por vértice), e é esse granularidade que o
  usuário espera de volta ("ao clicar em desfazer, desfaz o último ponto marcado"). A correção é
  trocar essa única chamada por um laço chamando `addPoint` uma vez por vértice do anel — recria a
  mesma granularidade de undo de antes, sem precisar reimplementar nada em `usePolygonEditor.ts`
  (o snapshot-por-`addPoint` já existe e já está testado). `setPoints` continua existindo na API do
  hook (não precisa remover), só deixa de ser chamado neste ponto específico.
- **Item 5 (popup atrás do mapa):** `.block-actions-modal` e `[role='dialog']` (`index.css`) têm
  `z-index: 50`. As camadas internas do Leaflet (`.leaflet-pane`, incluindo o painel de popup) vão
  até `z-index: 700`, e como `.leaflet-container` não isola um contexto de empilhamento próprio (só
  tem `position: relative`, sem `z-index` explícito), esses `z-index` altos disputam diretamente
  contra qualquer `position: fixed` **fora** do mapa também — inclusive o modal. A correção é só
  subir o `z-index` do modal e dos diálogos pra acima de 700 (ex.: `1000`).
- **Itens 1 e 4** têm a mesma causa raiz: `AuthenticatedApp` (`App.tsx`, Task 13 original spec 0003,
  navegação implementada em `.centaur/implements/0060`) desmonta `HomeScreen` por completo ao navegar
  pra outra tela, e a remonta do zero ao voltar — de propósito, pra forçar um novo fetch de
  territórios (ver comentário em `App.tsx`). O preço colateral é que `TerritoryMap` também remonta,
  perdendo tanto a posição do mapa (item 4) quanto qualquer contexto de "eu estava editando este
  território" (item 1, resolvido de outro jeito — ver Task 04, não precisa desmontar nada).

**Arquivos relevantes e seu estado atual:**
- `admin/src/renderer/App.tsx` — `AuthenticatedApp`, dono do estado `route` (union `home` |
  `territory-editor` | `block-editor` | `publishers` | `block-history`), e do `fallbackCenter`
  (cidade geocodificada da congregação, `implements/0061`).
- `admin/src/renderer/screens/HomeScreen.tsx` — lista de territórios (`<ul>` sem ordenação nem
  limite de altura), `<TerritoryMap>` recebendo `fallbackCenter`.
- `admin/src/renderer/map/TerritoryMap.tsx` — `initialCenter(territories, fallbackCenter)` calcula
  o centro só uma vez (`useMemo`), usado como prop `center` do `MapContainer` do `react-leaflet` —
  que só lê essa prop na **montagem**; mudar depois não move o mapa sozinho.
- `admin/src/renderer/map/usePolygonEditor.ts` — `addPoint`, `movePoint`, `removePoint`, `setPoints`
  (cada um com seu próprio snapshot de undo), `undo`, `clear`. Não precisa mudar nesta spec.
- `admin/src/renderer/map/PolygonEditorLayers.tsx` — liga o modo de desenho do Geoman
  (`map.pm.enableDraw`) ao controller enquanto o anel está vazio; troca pro modo de edição
  (`layer.pm.enable`) assim que há pontos.
- `admin/src/renderer/screens/BlockEditorScreen.tsx` — `onSaved?: (block: Block) => void`, chamado
  uma vez ao salvar; hoje `AuthenticatedApp` usa isso só pra voltar (`goHome`).
- `admin/src/renderer/index.css` — `.block-actions-modal`, `[role='dialog']` com `z-index: 50`.

**Decisões já tomadas com o usuário (não reabrir):**
- Depois de salvar uma quadra: o editor **fica na tela**, mostra uma confirmação rápida (toast) e
  reseta pro modo de criação de uma quadra nova, no mesmo território — sem perguntar a cada vez. O
  admin sai clicando em "← Voltar" (já existe, `PushedScreen` em `App.tsx`) quando quiser.
- O "Desfazer" deve remover um vértice por vez, inclusive logo após fechar um anel novo.

## Tasks

### Task 01 — "Desfazer" remove um vértice por vez, mesmo em anel recém-fechado

**Objetivo:** Corrigir o handler de `pm:create` do editor de polígono pra não apagar o desenho
inteiro no primeiro "Desfazer" depois de fechar um anel.
**Camadas:** Renderer (`map/`)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0004 — Task 01: Em `admin/src/renderer/map/PolygonEditorLayers.tsx`, no `useEffect` que
> registra o listener `pm:create` (o efeito que ativa `map.pm.enableDraw('Polygon', DRAW_OPTIONS)`
> enquanto `points.length === 0`), troque a linha `setPoints(ringFromDrawnLayer(layer))` dentro de
> `handleCreate` por um laço que chama `addPoint` uma vez pra cada ponto do anel devolvido por
> `ringFromDrawnLayer(layer)`, na ordem em que aparecem — por exemplo
> `ringFromDrawnLayer(layer).forEach((point) => addPoint(point))`. Isso recria a granularidade de
> undo de antes (um snapshot por vértice, já implementada e testada em `addPoint` dentro de
> `admin/src/renderer/map/usePolygonEditor.ts` — não mexa nesse arquivo), porque `setPoints` fazia
> a troca inteira do anel numa única mutação com um único snapshot, apagando o desenho inteiro no
> primeiro desfazer em vez de remover só o último vértice. Adicione `addPoint` à desestruturação de
> `controller` no topo do componente (hoje é `const { points, state, movePoint, removePoint,
> setPoints } = controller` — inclua `addPoint` nela). Não remova `setPoints` da desestruturação nem
> da API de `usePolygonEditor` — pode continuar sem uso neste arquivo específico, mas é parte
> pública testada do hook e outras chamadas futuras podem precisar dela. Critério de sucesso,
> validável rodando o app de verdade (`npm run dev`) já que este arquivo não tem teste unitário
> dedicado (mesmo motivo documentado desde a Task 11 original — é fiação de UI sobre uma lib de
> terceiro): desenhar um território/quadra novo com 4+ pontos, fechar o anel, clicar "Desfazer" uma
> vez deve remover só o último vértice (o polígono continua visível com um ponto a menos), não o
> desenho inteiro. Rode `npm run typecheck`, `npm run lint` e `npm test` (a suíte inteira precisa
> continuar verde — nenhum teste existente cobre este arquivo, então nenhuma mudança de teste é
> esperada) antes de terminar. Toque apenas em `admin/src/renderer/map/PolygonEditorLayers.tsx`.

---

### Task 02 — Lista de territórios ordenada e com rolagem própria

**Objetivo:** A lista de territórios na `HomeScreen` fica em ordem alfabética e dentro de um
contêiner de altura limitada com `overflow-y`, em vez de crescer a página inteira.
**Camadas:** Renderer (`screens/HomeScreen.tsx`), CSS
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0004 — Task 02: Implemente por TDD a ordenação da lista de territórios em
> `admin/src/renderer/screens/HomeScreen.tsx`. Hoje a `<ul>` que lista `territories.map(...)`
> renderiza na ordem em que a API devolveu (`window.api.territories.listWithBlocks()`, sem ordem
> garantida). Critérios de aceite: os territórios aparecem ordenados por `name` em ordem alfabética
> (`localeCompare` com a opção `{ sensitivity: 'base' }` ou equivalente, pra "Árvore" e "arvore"
> ficarem próximos e a comparação ser correta em português — sem diferenciar maiúsculas/minúsculas
> nem acentos na ordenação); a lista de territórios usada pelo mapa (`<TerritoryMap
> territories={territories} .../>`) e a passada pra `onNewTerritory`/`onEditTerritory` (que hoje
> recebem `territories` cru) devem continuar recebendo a lista **na ordem ordenada** também — não
> ordene só o que a `<ul>` renderiza, ordene o array uma vez (ex. num `useMemo`) e use essa mesma
> lista ordenada em todo o componente, pra `onEditTerritory(territory, neighbours)` (Task
> 15 da spec 0003) continuar recebendo os vizinhos numa lista coerente. Não precisa reordenar no
> servidor nem no `window.api` — é só apresentação. Teste cobrindo: territórios fora de ordem na
> resposta da API aparecem em ordem alfabética na tela (ex. `["Zona Sul", "Bairro Norte", "Centro"]`
> → renderiza `Bairro Norte`, `Centro`, `Zona Sul`, nessa ordem — pode verificar via
> `screen.getAllByText(...)`/ordem dos `data-testid`, ou a ordem dos elementos retornados por
> alguma query de lista). Depois, envolva a `<ul>` (não a lista inteira de `<main>`, só o contêiner
> da lista de territórios) numa `<div>` com uma classe CSS nova, ex. `territory-list`, e adicione a
> regra em `admin/src/renderer/index.css`: altura máxima (ex. `max-height: 360px` ou um valor que
> pareça razoável pra uma barra lateral — o Dart original usava uma largura de 300px pra essa lista,
> puramente decorativo, não precisa bater exato) e `overflow-y: auto`. Não precisa de teste pra essa
> parte CSS (visual, sem comportamento observável em jsdom). Rode `npm run typecheck`, `npm run
> lint` e `npm test` (suíte inteira verde) antes de terminar. Toque apenas em
> `admin/src/renderer/screens/HomeScreen.tsx`, `admin/src/renderer/screens/HomeScreen.test.tsx` e
> `admin/src/renderer/index.css`.

---

### Task 03 — O mapa da tela inicial mantém a posição entre navegações

**Objetivo:** Pan/zoom que o admin deixou no mapa da `HomeScreen` sobrevive a navegar pra outra
tela (ex. editor de território) e voltar — hoje `HomeScreen` remonta do zero a cada volta, e o
`TerritoryMap` junto com ela, perdendo a posição.
**Camadas:** Renderer (`App.tsx`, `screens/HomeScreen.tsx`, `map/TerritoryMap.tsx`)
**Modo:** direto
**Depende de:** Task 02 (mesmo arquivo, `HomeScreen.tsx` — rode depois, não em paralelo, pra não
colidir edições)
**Instrução para o subagente:**
> Spec 0004 — Task 03: O `react-leaflet` `MapContainer` só lê as props `center`/`zoom` na
> **montagem** — mudar essas props depois não move o mapa sozinho, e como `AuthenticatedApp`
> (`App.tsx`) desmonta `HomeScreen` por completo ao navegar pra outra tela e a remonta do zero ao
> voltar (de propósito, pra forçar um novo fetch de territórios — não mude esse comportamento), o
> `TerritoryMap` também remonta e perde a posição que o admin tinha deixado. A correção é guardar a
> última posição conhecida um nível **acima** de `HomeScreen`, em `AuthenticatedApp`, que não
> desmonta ao trocar de rota.
>
> Em `admin/src/renderer/App.tsx`, adicione a `AuthenticatedApp` um estado
> `const [mapView, setMapView] = useState<{ center: LatLngTuple; zoom: number } | null>(null)`
> (`LatLngTuple` já é importado de `leaflet` neste arquivo). Passe `mapView` e `onMapViewChange=
> {setMapView}` como novas props pro `<HomeScreen>` no branch `case 'home':`.
>
> Em `admin/src/renderer/screens/HomeScreen.tsx`, adicione as props opcionais `mapView?: { center:
> LatLngTuple; zoom: number }` e `onMapViewChange?: (view: { center: LatLngTuple; zoom: number }) =>
> void` à interface `HomeScreenProps` e repasse ambas pro `<TerritoryMap>` (que já recebe
> `fallbackCenter` — mantenha essa prop como está).
>
> Em `admin/src/renderer/map/TerritoryMap.tsx`, adicione as mesmas duas props opcionais
> (`initialView?: { center: LatLngTuple; zoom: number }`, `onViewChange?: (view) => void`) à
> `TerritoryMapProps`. Quando `initialView` está presente, use `initialView.center`/`initialView
> .zoom` como as props `center`/`zoom` do `MapContainer` em vez do resultado de `initialCenter(...)`
> /`FALLBACK_ZOOM`/`TERRITORY_ZOOM` (a ordem de prioridade fica: posição salva > média dos
> territórios > `fallbackCenter` geocodificado > Brasília — exatamente a ordem em que essas fontes
> já existem hoje, só com `initialView` entrando na frente de todas quando presente). Para capturar
> mudanças de posição, crie um componente interno pequeno (algo como `function ViewTracker({
> onViewChange }: { onViewChange?: (view) => void })`) que usa `useMapEvents({ moveend: () => {...},
> zoomend: () => {...} })` do `react-leaflet` (o hook só funciona dentro de um `MapContainer`, por
> isso precisa ser um componente próprio renderizado como filho do `MapContainer`, não uma chamada
> direta em `TerritoryMap`) chamando `onViewChange?.({ center: [map.getCenter().lat, map
> .getCenter().lng], zoom: map.getZoom() })` (pegue o `map` via `useMap()` do `react-leaflet` dentro
> desse mesmo componente, ou via o argumento do handler de `useMapEvents`, o que for mais direto).
> Renderize esse componente dentro do `MapContainer` só quando `onViewChange` for passado, pra não
> adicionar listeners à toa quando ninguém está ouvindo. Este arquivo não tem teste unitário
> dedicado (mesmo motivo do `TerritoryMap.tsx`/Task 09 original: componente de mapa, sem
> comportamento testável fora de um Leaflet real) — valide rodando `npm run dev`: arrastar/dar zoom
> no mapa da Home, abrir o editor de um território (ou "Novo território"), voltar, e o mapa deve
> reabrir na mesma posição, não resetar. Rode `npm run typecheck`, `npm run lint` e `npm test`
> (suíte inteira verde) antes de terminar. Toque apenas em `admin/src/renderer/App.tsx`,
> `admin/src/renderer/screens/HomeScreen.tsx` e `admin/src/renderer/map/TerritoryMap.tsx` — não
> mexa nos testes de `HomeScreen` além do necessário pra eles continuarem passando com as novas
> props opcionais (que não devem quebrar nenhum teste existente, já que são opcionais e nenhum
> teste atual as passa).

---

### Task 04 — Cadastro de quadra continua no editor depois de salvar

**Objetivo:** Salvar uma quadra não navega mais pra `HomeScreen` — o editor mostra uma confirmação
e reseta pronto pra desenhar a próxima quadra do mesmo território, sem precisar navegar de novo.
**Camadas:** Renderer (`screens/BlockEditorScreen.tsx`)
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0004 — Task 04: Implemente por TDD a mudança de comportamento pós-salvamento em
> `admin/src/renderer/screens/BlockEditorScreen.tsx`. Hoje, `handleSave` chama `onSaved?.(saved)`
> depois de `window.api.blocks.create`/`.update` ter sucesso, e `AuthenticatedApp` (`App.tsx`) usa
> esse callback só pra voltar pra `HomeScreen` (`goHome`) — não mude `App.tsx` nesta task, a
> assinatura de `onSaved?: (block: Block) => void` continua existindo e continua sendo chamada (quem
> a usa que decide o que fazer; hoje decide voltar, isso não muda aqui). O que muda é que a tela não
> deve mais depender de ser desmontada pra "limpar" — ela mesma precisa voltar ao estado de "criar
> uma quadra nova" depois de um salvamento bem-sucedido, porque o admin pode continuar nela.
>
> Critérios de aceite: depois de `handleSave` ter sucesso (chamando `create` ou `update`), além de
> continuar chamando `onSaved?.(saved)` (não remova essa chamada — quem usa a tela pode querer saber
> que salvou, mesmo sem navegar), a tela deve: (1) mostrar uma confirmação visível e temporária —
> use o mesmo padrão de banner das outras telas (`role="status"` ou um texto simples, algo como "
> Quadra {número} salva.") que desaparece na próxima interação ou depois de alguns segundos (a
> critério da implementação — se usar um timeout, teste com fake timers do Vitest); (2) resetar
> `editor` (o `usePolygonEditor`) pra um anel vazio (use `editor.clear()` se o anel ainda tiver
> pontos, ou construa um novo estado — o importante é o resultado: depois de salvar, `editor.points`
> fica vazio e a tela volta a aceitar um novo desenho); (3) resetar o campo de número (`numberText`)
> pra vazio, mesmo que a task tenha sido editar uma quadra existente — depois de salvar, a tela
> sempre volta ao modo de **criar uma quadra nova** no mesmo território (`isNew` deixa de fazer
> sentido travado no valor inicial da prop `block` — se a tela foi aberta em modo edição
> `block` continua definido como prop, então derive o "modo atual" de um estado próprio em vez de só
> da prop `block`, ex. um estado local que começa como `isNew ? 'create' : 'edit'` mas vira
> `'create'` depois do primeiro salvamento bem-sucedido, e o título/texto de ajuda da tela passam a
> refletir esse estado, não só a prop original). O território (`territory`) nunca muda — continua o
> mesmo território o tempo todo, só a quadra sendo desenhada é que reseta. Cubra em teste: salvar
> uma quadra nova mostra a confirmação, `editor.points` fica vazio depois (verificável indiretamente
> — ex. o botão "Apagar tudo" volta a ficar desabilitado, ou o hint volta a pedir 3 pontos), e o
> campo de número volta a ficar vazio; salvar uma edição de quadra existente (prop `block` definida)
> também reseta pro modo de criação depois (o título muda de "Editar quadra N" pra "Nova quadra em
> {território}", ou equivalente) — a tela não fica presa editando a mesma quadra pra sempre depois
> de salvar uma vez. Toque apenas em `admin/src/renderer/screens/BlockEditorScreen.tsx` e
> `admin/src/renderer/screens/BlockEditorScreen.test.tsx`. Rode `npm run typecheck`, `npm run lint`
> e `npm test` (suíte inteira verde) antes de terminar.

---

### Task 05 — Popup de ações da quadra acima das camadas do mapa

**Objetivo:** O modal de ações de uma quadra (e os diálogos do app em geral) sempre renderizam por
cima do mapa, nunca atrás.
**Camadas:** CSS
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0004 — Task 05: Em `admin/src/renderer/index.css`, as regras `.block-actions-modal` e
> `[role='dialog']` têm `z-index: 50`. As camadas internas do Leaflet (`.leaflet-pane` e suas
> variantes — tiles, overlay, sombra, marcadores, tooltip, popup) vão até `z-index: 700`
> (`popupPane`), e como `.leaflet-container` não estabelece um contexto de empilhamento isolado (só
> tem `position: relative`, sem `z-index` próprio), esses valores altos disputam diretamente contra
> qualquer elemento `position: fixed` fora do mapa também — inclusive o modal, que por ter
> `z-index: 50` (bem abaixo de 700) acaba renderizando atrás das camadas do mapa. Suba o `z-index`
> de `.block-actions-modal` e `[role='dialog']` para `1000` (ou outro valor acima de 700, mas 1000
> deixa folga clara e é o padrão comum pra "acima de qualquer coisa do Leaflet"). Não precisa de
> teste (mudança puramente visual/CSS, sem comportamento observável em jsdom) — valide rodando `npm
> run dev`: abrir o mapa da Home com pelo menos uma quadra cadastrada, clicar na quadra, o menu de
> ações deve aparecer por cima do mapa (tiles e marcadores), nunca atrás. Rode `npm run typecheck`,
> `npm run lint` e `npm test` (suíte inteira verde) antes de terminar. Toque apenas em
> `admin/src/renderer/index.css`.

---

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0004
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências. Tasks
01, 02, 04 e 05 são independentes entre si e podem rodar em paralelo; Task 03 depende da Task 02
(as duas tocam `HomeScreen.tsx`).

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo` da
task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

Execute as tasks na ordem indicada, respeitando as dependências.

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task (`/centaur-driven-tdd` ou
  `/centaur-driven-implement`) ao iniciar a primeira task, ou pelo `/centaur-driven-run` ao montar o
  plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — "Desfazer" remove um vértice por vez, mesmo em anel recém-fechado → implements/0065
- [x] Task 02 — Lista de territórios ordenada e com rolagem própria → implements/0067
- [x] Task 03 — O mapa da tela inicial mantém a posição entre navegações → implements/0069
- [x] Task 04 — Cadastro de quadra continua no editor depois de salvar → implements/0068
- [x] Task 05 — Popup de ações da quadra acima das camadas do mapa → implements/0066
