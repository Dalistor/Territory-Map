# [0092] App/Presentation: tela de mapa com MapLibre e localização em tempo real

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0005/` — Task 25

## Solicitação

Implementar `app/src/presentation/map/TerritoryMapView.tsx`, o mapa de verdade do publicador com
`@maplibre/maplibre-react-native`: tiles OSM raster, atribuição visível, `User-Agent` identificando
o app, territórios visíveis desenhados como contornos e quadras coloridas por `blockColorCategory`,
localização do publicador em tempo real via `react-native-geolocation-service` +
`PermissionsAndroid`, sem enviar ou persistir a posição. E `app/src/presentation/screens/MapScreen.tsx`,
compondo esse mapa com um controle de filtro (`territoryFilter.ts`) e a confirmação de marcação de
quadra restrita a território designado, usando `enqueue`/`drain` da fila offline já existente.
Componente não testável com Jest (view nativa de terceiro) — sem teste automatizado, verificação
manual documentada em vez disso.

## Contexto

Task 25 da spec 0005 (app do publicador em React Native). Dependia das Tasks 17 (domínio puro —
`blockColorCategory`, `isTerritoryAssignedToMe`), 20 (fila offline `work-log-queue.ts`) e 24 (lógica
pura do filtro do mapa `territoryFilter.ts`), todas já concluídas. É a última peça de UI antes da
Task 26 (navegação raiz), que vai ligar `ActivationScreen` → `DashboardScreen` ↔ `MapScreen` de
verdade.

## O que foi feito

**`TerritoryMapView.tsx`** — o mapa puro, recebe `territories` já filtrados pelo chamador (mesma
divisão de responsabilidade do `TerritoryMap.tsx` do admin: quem filtra é a tela, quem desenha é o
componente):
- `<Map>` com um `mapStyle` vazio (`{version: 8, sources: {}, layers: []}`, constante de módulo) e
  todas as fontes/camadas adicionadas declarativamente como filhos JSX — API do
  `@maplibre/maplibre-react-native@11.3.6` (bem diferente da API v9/v10 documentada por aí:
  `Map`/`GeoJSONSource`/`Layer` genérico em vez de `MapView`/`ShapeSource`/`FillLayer` etc.).
- `<RasterSource tiles={["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]} tileSize={256}>` +
  `<Layer type="raster">` para os tiles.
- `TransformRequestManager.addHeader({name: 'User-Agent', value: ..., match: /tile\.openstreetmap\.org/})`
  para identificar o app nas requisições de tile — o mecanismo real que esta versão da lib oferece
  (não existe prop dedicada em `RasterSource`; a versão instalada suporta perfeitamente, então não
  houve necessidade de documentar limitação nenhuma, ao contrário do que a instrução previa como
  possibilidade).
- Atribuição "© OpenStreetMap contributors" como `<Text>` sobreposto no canto do mapa (visível
  sempre na tela, não só no botão nativo de atribuição que o MapLibre também expõe via a prop
  `attribution` do `RasterSource`).
- Territórios como `GeoJSONSource`/`Layer type="line"`; quadras como `GeoJSONSource`/`Layer
  type="fill"` com `fill-color`/`fill-outline-color` orientados a dado (`['get', 'color']`), cor
  calculada por `blockColorCategory` — mesmas três cores do admin (`#c62828`/`#ef6c00`/`#2e7d32`).
  Um número da quadra sobre um círculo colorido (`circle` + `symbol`) replica o badge do admin.
- Toque numa quadra (`onPress` do `GeoJSONSource` de quadras) resolve o `blockId` clicado contra um
  `Map` local e chama `onBlockTap(territory, block)` — sem nenhuma regra de designação aqui, isso é
  decisão de quem compõe o componente.
- Localização: `PermissionsAndroid.request(ACCESS_FINE_LOCATION)` seguido de
  `Geolocation.watchPosition` (`react-native-geolocation-service`) só depois da permissão concedida;
  `Geolocation.clearWatch` no cleanup do `useEffect`. A posição só alimenta um `<Marker>` local — não
  há chamada de rede nem `AsyncStorage`/keychain envolvidos.

**`MapScreen.tsx`** — compõe o mapa com estado de tela:
- Busca `territories` via `apiClient.listTerritories(session.token)` ao montar (mesmo padrão de
  injeção do `DashboardScreen.tsx`) — precisa da lista **inteira** da congregação para os modos
  "Todos" e "específico" do filtro, não só o que outra tela já tinha carregado.
- `FilterControl` interno: três tipos de opção — "Meu(s) território(s)", "Todos", e um chip por
  território individual — inicializado com `defaultFilter` assim que a lista chega (ou com
  `{mode: 'specific', territoryId: initialTerritoryId}` quando a tela é aberta a partir do botão
  "Ver no mapa" do dashboard).
- `handleBlockTap`: `isTerritoryAssignedToMe` decide entre abrir a folha de confirmação
  ("Marcar quadra N como trabalhada?") ou um modal só de leitura (número da quadra, território,
  última visita) sem opção de marcar.
- Confirmar chama `workLogQueue.enqueue` e aplica uma atualização otimista local
  (`justWorked: Record<blockId, Date>`, mesclada nos territórios antes de calcular o que é visível)
  — a quadra aparece verde na hora, antes de qualquer round-trip, conforme a regra já registrada no
  `AGENTS.md` ("A UI mostra a quadra como concluída na hora"). Em seguida tenta `workLogQueue.drain`;
  uma falha de rede não gera nenhum aviso (o item continua na fila); uma rejeição de regra de negócio
  (`WorkLogDrainError`) aparece como um banner simples no topo da tela.

**`AndroidManifest.xml`** — adicionadas as permissões `ACCESS_FINE_LOCATION` e
`ACCESS_COARSE_LOCATION`. Não estavam declaradas desde o scaffold da Task 16 (só `INTERNET` estava);
sem elas, `PermissionsAndroid.request` no `TerritoryMapView.tsx` seria recusado automaticamente pelo
Android antes mesmo de perguntar ao publicador, então esse ajuste é necessário para a própria
funcionalidade desta task funcionar (não uma refatoração fora de escopo).

**`README.md`** — nova seção "Mapa: verificação manual pendente" documentando o checklist de
verificação visual (tiles, atribuição, cores das quadras, permissão de localização, toque
condicionado à designação) a rodar com `npm run android` depois que a Task 26 ligar a navegação de
verdade, e uma nota curta sobre o mecanismo do `User-Agent` (`TransformRequestManager.addHeader`).

## Arquivos modificados

- `app/README.md` — nova seção "Mapa: verificação manual pendente".
- `app/android/app/src/main/AndroidManifest.xml` — permissões `ACCESS_FINE_LOCATION` e
  `ACCESS_COARSE_LOCATION`.

## Arquivos criados

- `app/src/presentation/map/TerritoryMapView.tsx` — o mapa com MapLibre Native.
- `app/src/presentation/screens/MapScreen.tsx` — a tela que o compõe com filtro e marcação.

## Decisões técnicas

- **API do MapLibre RN v11, não a v9/v10 que a maior parte da documentação online mostra.** A versão
  instalada (`11.3.6`) usa `Map`/`Camera`/`GeoJSONSource`/`RasterSource`/`Layer` genérico
  (discriminado por `type`), em vez de `MapView`/`ShapeSource`/`FillLayer`/`LineLayer` das versões
  antigas. Confirmado lendo os `.d.ts` do pacote instalado antes de escrever qualquer código, em vez
  de confiar em memória de uma API antiga.
- **Filtragem é responsabilidade do `MapScreen`, não do `TerritoryMapView`.** Mesma divisão que o
  admin já usa entre `HomeScreen.tsx` (decide o que mostrar) e `TerritoryMap.tsx` (só desenha) — o
  componente de mapa fica agnóstico de regra de negócio e mais fácil de reaproveitar.
- **`MapScreen` busca sua própria lista de territórios via `apiClient.listTerritories`**, em vez de
  depender de o `DashboardScreen` já ter carregado algo. O filtro "Todos" e a lista de territórios
  individuais exigem a congregação inteira, não só os designados ao publicador (que é tudo que o
  dashboard busca).
- **Atualização otimista local (`justWorked`) em vez de esperar a Task 26 recarregar tudo.** Sem
  isso, a quadra recém-marcada continuaria vermelha/laranja na tela até a próxima busca de
  territórios — contradizendo a regra explícita do `AGENTS.md` sobre a fila offline.
- **Permissões de localização no `AndroidManifest.xml`**: fora da lista de arquivos sugerida pela
  instrução da task, mas sem elas a funcionalidade central desta task (pedir permissão em runtime)
  não tem efeito nenhum — Android nega automaticamente uma permissão não declarada no manifesto,
  antes de qualquer diálogo aparecer ao publicador. Tratado como parte necessária da task, não como
  escopo adicional, e documentado aqui com transparência.
- **Sem teste automatizado**, por instrução explícita da task — é uma *view* nativa de terceiro,
  mesmo "risco assumido" já registrado para o Leaflet-Geoman do admin no `AGENTS.md`. Verificação
  documentada como passo manual pendente no `app/README.md`.

## Como validar

Automatizado (rodado nesta implementação):
```bash
cd app && npx tsc --noEmit   # limpo
cd app && npm run lint       # limpo nos dois arquivos novos (só avisos pré-existentes em coverage/, gitignored)
cd app && npm test           # 10 suites, 53 testes, todos passando (nenhum teste novo — por instrução da task)
```

Manual (pendente, documentado no `app/README.md`): depois que a Task 26 ligar a navegação real,
`npm run android` num emulador ou aparelho Android e conferir tiles, atribuição visível, cores das
quadras, permissão de localização em runtime com marcador acompanhando a posição, e o toque
condicionado à designação do território.

## Resultado da validação

`npx tsc --noEmit`: sem erros. `npm run lint`: sem erros ou avisos nos arquivos tocados (avisos
remanescentes são só em `coverage/`, diretório gerado e gitignorado, não tocado por esta task).
`npm test`: 53/53 testes passando, nenhuma regressão nas suítes existentes.
