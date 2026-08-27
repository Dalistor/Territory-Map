# [0170] Scaffold do app admin Android (`admin-app/`)

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0012/` — Task 01

## Solicitação

Criar o projeto React Native `admin-app/` na raiz do monorepo, irmão de `app/` e `admin/`,
espelhando a configuração de `app/`. React Native 0.87 + TypeScript, **somente Android**;
`applicationId`/`package` `com.territorymapadmin` (para conviver no mesmo aparelho com o
`com.territorymapapp` do publicador) e nome exibido "Territory Map Admin". Dependências:
`@maplibre/maplibre-react-native`, `@react-navigation/native`, `@react-navigation/native-stack`,
`react-native-screens`, `react-native-safe-area-context`, `react-native-keychain`,
`react-native-config` e `@react-native-community/datetimepicker`. **Sem**
`react-native-geolocation-service`, `@react-native-async-storage/async-storage`,
`react-native-get-random-values` e `uuid`. Pastas `src/domain/`, `src/data/`,
`src/presentation/screens/` e `src/presentation/map/`; `.env.example` com `API_BASE_URL` e
`APP_KEY`; Jest com `@testing-library/react-native` e mocks de keychain, config e MapLibre no
`jest.setup.js`; scripts `android`, `start`, `lint`, `test` e `typecheck`. Critério de sucesso:
`npx tsc --noEmit`, `npm run lint` e `npm test` passando dentro de `admin-app/`. Não rodar
`npm run android` nem Gradle (não há JDK nesta máquina). Tocar apenas em `admin-app/`.

## Contexto

Primeira task da spec 0012, que entrega um segundo app React Native no monorepo: o responsável
pelos territórios passa a designar, concluir, corrigir o histórico da designação e lançar trabalho
de quadra **em campo**, pelo celular, o que hoje só existe no admin desktop.

O projeto é novo, e não uma tela dentro de `app/`, por decisão já registrada na spec: o app do
publicador se autentica por código descartável e não tem senha nenhuma; pôr a senha da congregação
dentro do binário que o publicador instala inverteria a separação que o servidor faz entre `/app/*`
e `/admin/*`. Todas as tasks 02–12 dependem deste scaffold existir.

## O que foi feito

- `npx @react-native-community/cli@20.2.0 init TerritoryMapAdmin --directory admin-app --version
  0.87.0 --pm npm --skip-install --skip-git-init` — gerou o template padrão (React Native 0.87.0,
  React 19.2.3, TypeScript), a mesma versão de `app/`. O nome `TerritoryMapAdmin` já produz o
  `applicationId`/`namespace`/`package` `com.territorymapadmin` pedido, sem renomeação manual.
- Removidos `ios/`, `Gemfile` e `.bundle` (alvo é só Android), o script `ios` do `package.json` e o
  devDependency `@react-native-community/cli-platform-ios`, que ficariam órfãos — mesmo tratamento
  que a Task 16 da spec 0005 deu a `app/`.
- Removidos `App.tsx` e `__tests__/App.test.tsx` do template e o `README.md` padrão (a Task 13
  escreve o README de verdade).
- `package.json`: as oito dependências de runtime pedidas; `@testing-library/react-native`,
  `test-renderer` e `@types/react-test-renderer` como dev; script `typecheck` (`tsc --noEmit`)
  acrescentado aos quatro que o template já traz.
- `app.json`: `displayName` "Territory Map Admin"; `android/app/src/main/res/values/strings.xml`
  com o mesmo texto, que é o rótulo do launcher.
- `android/app/build.gradle`: `apply from: project(':react-native-config').projectDir.getPath() +
  "/dotenv.gradle"`, exigido pelo `react-native-config` para injetar o `.env` como
  `BuildConfig`/`Config.*` — sem essa linha o autolinking registra o módulo nativo, mas o `.env`
  nunca é lido.
- `jest.config.js`: `transformIgnorePatterns` liberando `@react-navigation/*` (ESM puro, sem build
  CommonJS) e `setupFiles` apontando para o `jest.setup.js`.
- `jest.setup.js`: mock oficial do `react-native-safe-area-context` mais mocks de
  `react-native-keychain`, `react-native-config` e `@maplibre/maplibre-react-native`.
- `.eslintrc.js`: `overrides` estendendo `plugin:@typescript-eslint/recommended` para `.ts`/`.tsx`
  por cima de `@react-native`, e `ignorePatterns: ['coverage/']` — cópia do de `app/`.
- `.env.example` com `API_BASE_URL` e `APP_KEY`, com os mesmos comentários explicativos de
  `app/.env.example`.
- `index.js` sem o `import 'react-native-get-random-values'` que `app/index.js` tem: aquele import
  existe só porque o publicador gera o `id` do log de trabalho no cliente, e o admin não gera — o
  servidor gera o dele.
- Pastas de camada criadas com um `index.ts` placeholder cada (`export {}` mais um comentário
  apontando as tasks que as preenchem), porque o git não versiona pasta vazia.

## Arquivos criados

- `admin-app/` inteiro — projeto React Native 0.87 novo, só Android.
- `admin-app/package.json`, `package-lock.json` — dependências e os cinco scripts.
- `admin-app/app.json`, `index.js`, `tsconfig.json`, `babel.config.js`, `metro.config.js`,
  `.prettierrc.js`, `.gitignore`, `.watchmanconfig` — configuração base do template, ajustada.
- `admin-app/.eslintrc.js` — ESLint com `typescript-eslint` recommended por cima de
  `@react-native`.
- `admin-app/jest.config.js`, `admin-app/jest.setup.js` — Jest e os quatro mocks de módulo nativo.
- `admin-app/.env.example` — `API_BASE_URL` e `APP_KEY`.
- `admin-app/android/**` — projeto nativo Android com `com.territorymapadmin`.
- `admin-app/src/domain/index.ts`, `src/data/index.ts`, `src/presentation/index.ts`,
  `src/presentation/screens/index.ts`, `src/presentation/map/index.ts` — placeholders das camadas.
- `admin-app/src/presentation/App.tsx` — raiz **placeholder**, para o `index.js` resolver; a Task 08
  a substitui pelo bootstrap de verdade.
- `admin-app/src/smoke.test.tsx` — teste de fumaça do scaffold, **para ser apagado** pela primeira
  task que trouxer teste de verdade.

## Decisões técnicas

- **Projeto gerado pelo CLI oficial, não copiado de `app/`.** Copiar `app/android/` e renomear
  pacote traria junto o `.cxx/`, o `build/` e as permissões de localização do publicador, e deixaria
  o `gradle-wrapper.jar` binário sem procedência clara. O CLI pinado em `--version 0.87.0` dá
  exatamente a mesma versão que `app/` usa, e o nome `TerritoryMapAdmin` já produz o
  `applicationId` pedido.
- **`AndroidManifest.xml` ficou como o template gerou: só `INTERNET`.** As duas permissões de
  localização que `app/` declara existem para o publicador ver a própria posição no mapa; o admin
  não usa localização (decisão 4 do contexto da spec), então declará-las seria pedir acesso que o
  app não exerce.
- **`index.js` aponta para `src/presentation/App`, e um placeholder foi criado ali.** A alternativa
  — deixar o import apontando para um módulo inexistente até a Task 08 — deixaria o projeto sem
  conseguir bundlar por sete tasks, e o erro só apareceria em quem rodasse `npm run android` no
  meio do caminho. O placeholder tem um comentário dizendo que a Task 08 o substitui.
- **O placeholder usa `SafeAreaProvider` do `react-native-safe-area-context`, não o `SafeAreaView`
  do `react-native`.** O segundo está depreciado no RN 0.87 e emitia um `warnOnce` durante o
  `npm test`; a suíte passava, mas nascer com aviso é ruim para um projeto que ainda não tem
  nenhuma linha própria. É também a convenção que `app/src/presentation/App.tsx` já segue.
- **Mocks de keychain, config e MapLibre são globais no `jest.setup.js`, não por arquivo de teste.**
  Foi o que a instrução da task pediu, e os três são módulos nativos alcançados por mais de uma
  camada (o keychain pela `data/` e pela `presentation/`; o `Config` pelo cliente HTTP e por
  qualquer tela que o importe; o MapLibre por toda tela que compõe o mapa). O mock do keychain
  devolve `false` em `getGenericPassword` por padrão — é o que a lib devolve quando não há entrada,
  ou seja, o estado "nada configurado ainda", que é o mais comum. Os testes da Task 05 mandam nos
  retornos deles.
- **`test-renderer` como dev dependency extra.** `@testing-library/react-native@14` a declara como
  `peerDependency` obrigatória; sem ela, qualquer `render`/`screen` falha em runtime. Mesma
  descoberta já registrada na implementação 0074 para `app/`.
- **`@react-native/new-app-screen` foi mantido nas dependências.** Vem do template e hoje não é
  importado por nada — igual ao que acontece em `app/`. Mantido pelo espelhamento que a task pediu;
  é candidato a remoção numa limpeza futura dos dois projetos ao mesmo tempo, não de um só.
- **ESLint continua na versão 8 com `.eslintrc.js`**, não migrado para flat config. Mesma razão da
  implementação 0074: é a combinação que o time do RN testa com `@react-native/eslint-config`, e a
  task pediu as mesmas *regras* do admin, não o mesmo mecanismo de configuração.

## Como validar

```bash
cd admin-app
npm install
npx tsc --noEmit     # zero erros de tipo
npm run lint          # zero erros e zero warnings
npm test              # 1 suíte, 1 teste (o smoke test do scaffold)
```

`npm run android` e `./gradlew assembleRelease` **não foram executados e não são critério desta
task**: esta máquina não tem JDK instalado, o que a spec já registra na seção Ambiente. Jest,
ESLint e `tsc` rodam sem JDK.

## Resultado da validação

- `npx tsc --noEmit`: sem saída, exit 0.
- `npx eslint . --max-warnings=0`: sem saída, exit 0.
- `npm test`: 1 suíte, 1 teste, passou, sem aviso nenhum.
- **Verificação extra dos mocks** (não pedida, mas necessária para confiar que o `jest.setup.js`
  não está só sintaticamente correto): um teste descartável importou `react-native-config`,
  `react-native-keychain` e `@maplibre/maplibre-react-native`, conferiu os valores devolvidos pelos
  dois primeiros e renderizou um `MapView`/`ShapeSource`/`FillLayer` com um filho — passou, e foi
  removido em seguida.
- `applicationId`, `namespace` e o pacote Kotlin conferidos como `com.territorymapadmin`;
  `getMainComponentName()` conferido como `TerritoryMapAdmin`, batendo com o `name` do `app.json`.
- Nada fora de `admin-app/` foi tocado (`git status` mostra só `admin-app/` como novo, além dos
  arquivos da própria spec, que já existiam).
