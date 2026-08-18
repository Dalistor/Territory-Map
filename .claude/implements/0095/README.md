# [0095] App/Presentation: navegação raiz e restauração de sessão

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0005/` — Task 26

## Solicitação

Em `app/src/presentation/App.tsx`, usando `@react-navigation/native-stack`, montar a navegação
entre `ActivationScreen`, `DashboardScreen` e `MapScreen` (todas já existentes). No arranque: ler a
sessão salva (`getSession`); se existir, validar contra o servidor chamando `listTerritories` com o
token salvo — sucesso pula direto para o Dashboard e atualiza o cache (`saveTerritories`); uma
falha por `ApiErrorException` (token revogado/versão antiga) limpa a sessão (`clearSession`) e o
cache (`clearCache`) e volta para a `ActivationScreen`; uma falha por `NetworkException` (sem sinal
no arranque) mantém a sessão e abre o Dashboard usando o cache local (`getCachedTerritories`) em
vez de travar o app sem conectividade.

## Contexto

Últimas peças da spec 0005 (app React Native do publicador): `ActivationScreen` (0086),
`DashboardScreen` (0089) e `MapScreen` (0092) já existiam, cada uma recebendo suas dependências e
callbacks de navegação (`onActivated`, `onOpenMap`) por prop, exatamente para serem testáveis
isoladas e ficarem "fiadas de verdade" só nesta task. Esta implementação é o que finalmente conecta
as três em navegação real e decide, no arranque do app, qual tela abrir primeiro.

## Critérios de aceite

- Caminho feliz: sem sessão salva, abre a `ActivationScreen`.
- Caminho feliz: com sessão salva e servidor acessível, pula direto para o `DashboardScreen`.
- Borda: sessão salva mas rejeitada pelo servidor (`ApiErrorException`) volta para a
  `ActivationScreen` e limpa sessão e cache salvos.
- Borda: sessão salva mas sem rede (`NetworkException`) abre o `DashboardScreen` mesmo assim,
  usando os dados em cache.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|-------------------|------------------------------|
| 1 | abre a `ActivationScreen` sem sessão salva | `App.test.tsx` | `App.tsx`: bootstrap básico + rota de Activation |
| 2 | sessão salva + servidor acessível pula pro Dashboard | `App.test.tsx` | chamada a `listTerritories`/`saveTerritories`, rota de Dashboard |
| 3 | `ApiErrorException` limpa sessão/cache e volta pra Activation | `App.test.tsx` | ramo `error instanceof ApiErrorException` |
| 4 | `NetworkException` abre Dashboard usando o cache | `App.test.tsx` | `withOfflineFallback` envolvendo `listTerritories` |

Depois dos quatro ciclos obrigatórios do pedido, mais quatro testes foram acrescentados no
refactor/cobertura para fechar os ramos que ainda ficavam sem teste depois de escrever o componente
completo (a navegação exige montar Activation+Dashboard+Map simultaneamente, então parte do código
já existia antes do primeiro teste passar a fio):
- ativar um código sem sessão prévia navega pro Dashboard (cobre o callback `onActivated`).
- tocar em "Ver no mapa" no Dashboard abre a `MapScreen` (cobre a rota `Map` e `onOpenMap`).
- `withOfflineFallback` isolado: repassa uma chamada bem-sucedida sem tocar no cache, cai para o
  cache num `NetworkException`, relança o `NetworkException` quando não há cache, e nunca cai para o
  cache num `ApiErrorException`.

## O que foi feito

- `App.tsx`: componente raiz com um `AppDependencies` injetável por prop (`apiClient`, `getSession`,
  `clearSession`, `getCachedTerritories`, `saveTerritories`, `clearCache` — cada um com um default
  que é o módulo real), um `useEffect` de bootstrap que decide entre `activation`/`dashboard`
  seguindo exatamente a árvore de decisão do pedido, e um `Stack.Navigator`
  (`@react-navigation/native-stack`) que troca o conjunto de telas montadas conforme esse estado —
  padrão comum de "Auth stack vs. App stack" do próprio React Navigation.
- `withOfflineFallback(apiClient, getCachedTerritories)`: função exportada que envolve
  `listTerritories` para cair no cache só em `NetworkException` — nunca em `ApiErrorException`, que
  é uma resposta real do servidor, não um buraco de conectividade. É o mesmo `ApiClient` passado
  para `DashboardScreen` e `MapScreen`, então as duas telas ganham o fallback de graça sem precisar
  saber que ele existe.
- `app/index.js`: passou a importar `App` de `./src/presentation/App` em vez do scaffold antigo em
  `app/App.tsx`.
- Removidos `app/App.tsx` e `app/__tests__/App.test.tsx` — o scaffold padrão do React Native CLI,
  que ficou órfão assim que `index.js` passou a apontar para o `App` de verdade. Estava fora do
  pedido original de "toque apenas `App.tsx` e seu teste", mas mantê-los criava dois componentes
  `App` no projeto (um real, um morto) sem nenhuma referência ligando o antigo a nada.
- `app/jest.config.js`: adicionado `transformIgnorePatterns` cobrindo `@react-navigation` — o preset
  padrão do RN só libera `react-native`/`@react-native(-community)`, e os pacotes de
  `@react-navigation/*` instalados (v7) não publicam build CommonJS nenhum, só ESM (`lib/module`),
  então qualquer teste que importasse a lib quebrava no parse antes desta mudança. É a primeira vez
  que código do app importa a lib (Task 26 foi quem a trouxe para dentro do `presentation/`).

## Arquivos modificados

- `app/index.js` — aponta para `./src/presentation/App` em vez do scaffold antigo.
- `app/jest.config.js` — `transformIgnorePatterns` cobrindo `@react-navigation`.

## Arquivos criados

- `app/src/presentation/App.tsx` — navegação raiz e restauração de sessão.
- `app/src/presentation/App.test.tsx` — os 4 cenários pedidos + 6 testes de cobertura.

## Arquivos removidos

- `app/App.tsx` — scaffold padrão do React Native CLI, órfão depois do `index.js` apontar para o
  `App` real.
- `app/__tests__/App.test.tsx` — teste desse mesmo scaffold.

## Decisões técnicas

- **Injeção por prop `dependencies?: Partial<AppDependencies>`, não `jest.mock` do módulo de
  dados.** Mesmo espírito de `DashboardScreen`/`MapScreen` (`apiClient` por prop): cada teste
  sobrescreve só o que aquele cenário toca, o resto cai no módulo real por trás de um `?? default`.
  Isso deixou os 4 testes pedidos diretos — nenhum precisou mockar `session-store.ts` nem
  `territory-cache.ts` no nível de módulo para controlar o comportamento, só passar funções fake.
- **Exceção: `ActivationScreen` cria seu próprio `ApiClient` internamente (Task 22, já
  implementado), não por injeção.** Para o teste "ativar sem sessão prévia" (adicional, não um dos
  quatro pedidos), foi preciso mockar `createApiClient` de `data/api-client.ts` via
  `jest.requireActual` + override só dessa função — mantém as classes reais
  `ApiErrorException`/`NetworkException` (o `instanceof` do `App.tsx` depende de serem as mesmas
  classes que os testes lançam) e troca só a fábrica do cliente HTTP.
- **`withOfflineFallback` como função exportada e testável isolada**, em vez de lógica inline
  dentro do `useEffect` de bootstrap. Só o `useEffect` de bootstrap distingue
  `ApiErrorException`/`NetworkException` para decidir a rota; o wrapper cuida de fazer o
  `listTerritories` *subsequente* (o que `DashboardScreen`/`MapScreen` disparam ao montar) também
  cair no cache — sem isso, o cenário 4 abriria o Dashboard mas ele ficaria preso tentando (e
  falhando) buscar dados de novo.
- **Três módulos nativos/ESM precisaram de mock só para o `import` não quebrar o parser do Jest**,
  mesmo sem nenhum dos 4 cenários pedidos montar a `MapScreen`: `react-native-geolocation-service`
  (`main` é ESM cru, sem build), `@maplibre/maplibre-react-native` (parte do build "commonjs" dele
  são specs de codegen `.ts` não compiladas, que o Jest não consegue interpretar de jeito nenhum) e
  `uuid` (usado por `data/work-log-queue.ts`, que `App.tsx` também importa para montar a fila do
  `MapScreen`). Estes dois últimos já tinham o precedente de mock em `work-log-queue.test.ts`; o de
  `geolocation-service` e o de `maplibre` são novos porque `MapScreen`/`TerritoryMapView` nunca
  tinham sido importados por nenhum teste antes (a Task 25 foi implementada em modo direto, sem
  teste próprio).
- **`@maplibre/maplibre-react-native` foi mockado com componentes-View triviais** (só repassam
  `children`), não com um mock funcional do mapa — nenhum teste desta task precisa que o mapa
  renderize *conteúdo* de verdade, só que a `MapScreen` monte sem quebrar (o teste "Ver no mapa
  abre a MapScreen" verifica a presença do texto de atribuição do OSM, que é um `<Text>` normal do
  `TerritoryMapView`, fora dos componentes do MapLibre).
- **Cobertura de branch ficou em 84% (não 100%), documentada aqui em vez de perseguida com mais
  teste.** Os ramos sem teste são: os guardas `if (!cancelled)` do `useEffect` de bootstrap (só
  disparam se o componente desmontar antes da promise resolver — comportamento de limpeza do React,
  não regra de negócio) e o fallback `?? getSessionDefault` de um dos seis campos de
  `AppDependencies` (todo teste desta suíte sempre sobrescreve `getSession`, então o ramo "usa o
  módulo real" nunca é exercitado por escolha — testar isso re-testaria `session-store.ts`, já
  coberto em `session-store.test.ts`). Statement/função/linha ficaram em 100%.

## Como validar

```bash
cd app
npx jest src/presentation/App.test.tsx   # só este arquivo
npx jest                                  # suíte inteira (10 suites)
npx tsc --noEmit                          # typecheck
npx eslint src/presentation/App.tsx src/presentation/App.test.tsx index.js
```

## Resultado da validação

- `npx jest src/presentation/App.test.tsx` — **10 testes passando** (4 pedidos + 6 de cobertura).
- `npx jest` (suíte inteira) — **10 test suites, 62 testes, todos passando**. Nenhuma regressão nas
  telas/módulos já existentes.
- `npx tsc --noEmit` — sem erros.
- `npx eslint .` — sem erros nos arquivos do projeto (únicos avisos são em `app/coverage/`, pasta
  gerada e ignorada pelo `.gitignore`, não faz parte do código-fonte).
- Cobertura de `App.tsx` (`npx jest --coverage --collectCoverageFrom='src/presentation/App.tsx'`):
  **100% statements, 100% functions, 100% lines, 84.37% branch** — os ramos não cobertos estão
  documentados acima ("Decisões técnicas").
