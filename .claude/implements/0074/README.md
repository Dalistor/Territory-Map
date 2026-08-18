# [0074] App: scaffold do projeto React Native

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0005/` — Task 16

## Solicitação

Criar o projeto React Native em `app/` (CLI puro, TypeScript, sem Expo, alvo Android apenas), com
as dependências que as tasks seguintes da spec 0005 vão usar (MapLibre, geolocalização, keychain,
AsyncStorage, React Navigation, `react-native-config`, `uuid`), as três pastas de camada
(`presentation/`, `domain/`, `data/`) vazias, ESLint com as mesmas regras de `typescript-eslint`
recommended usadas no admin, `.env.example` documentado num `README.md` novo, e confirmação de que
`npm test` e `npm run lint` passam sem warning. Sem lógica de domínio, tela ou chamada de API — isso
é das tasks seguintes.

## Contexto

A spec 0005 troca o app do publicador de Flutter para React Native (decisão já tomada com o
usuário, registrada no `README.md` da spec). Esta é a primeira das tasks do app (16 a 27): todas as
tasks de domínio, dados e apresentação (17 a 26) dependem deste scaffold existir.

## O que foi feito

- `npx @react-native-community/cli@latest init TerritoryMapApp --directory app --template
  typescript --pm npm --skip-install` — gerou o template padrão (React Native 0.87.0, React
  19.2.3, TypeScript). O CLI cria seu próprio repositório git dentro da pasta; removido (`rm -rf
  app/.git`) porque o projeto é um monorepo com um único git na raiz.
- Removida a pasta `ios/` e o `Gemfile` (CocoaPods) gerados pelo template — alvo é só Android, como
  pedido. Removidos também o script `"ios"` de `package.json` e o devDependency
  `@react-native-community/cli-platform-ios`, que ficariam órfãos sem a pasta `ios/`.
- Adicionadas as dependências de runtime pedidas:
  `@maplibre/maplibre-react-native`, `react-native-geolocation-service`, `react-native-keychain`,
  `@react-native-async-storage/async-storage`, `@react-navigation/native`,
  `@react-navigation/native-stack`, `react-native-screens`, `react-native-config`, `uuid` (mais
  `react-native-safe-area-context`, que o próprio template do RN 0.87 já traz como dependência da
  tela inicial gerada). Como dev dependencies: `@testing-library/react-native` (`jest` já vem no
  template) e, adicionalmente, `test-renderer` — ver "Decisões técnicas".
- `android/app/build.gradle`: adicionada a linha `apply from:
  project(':react-native-config').projectDir.getPath() + "/dotenv.gradle"`, exigida pelo
  `react-native-config` para injetar as variáveis do `.env` como `BuildConfig`/`Config.*` — sem
  essa linha o autolinking registra o módulo nativo, mas o `.env` nunca é lido.
- Criadas as pastas `app/src/presentation/`, `app/src/domain/`, `app/src/data/`, cada uma com um
  `index.ts` vazio (`export {}`) e um comentário curto apontando para as tasks que vão preenchê-la.
- `app/.eslintrc.js`: adicionado um `overrides` para `*.ts`/`*.tsx` que estende
  `plugin:@typescript-eslint/recommended` por cima do que `@react-native/eslint-config` já aplica
  — mesma regra que o admin usa (`admin/eslint.config.mjs`, via `tseslint.configs.recommended`),
  sem trocar a base (`@react-native`) que o template do RN espera.
- `app/.env.example` criado com `API_BASE_URL` e `APP_KEY` (mesmo par do admin); `.env` já cai sob
  as regras `.env`/`.env.*`/`!.env.example` do `.gitignore` da raiz do monorepo, não precisou
  adicionar nada.
- `app/README.md` reescrito (substituindo o README padrão do template): instalação, configuração
  do `.env`, estrutura de camadas, como rodar em desenvolvimento (`npm run android`), testes/lint/
  tipos, como gerar o `.apk` de release, e duas notas de limitação conhecida (ver "Decisões
  técnicas").
- `app/app.json`: `displayName` trocado de `TerritoryMapApp` para `Territory Map`, para bater com
  `android/app/src/main/res/values/strings.xml` (o template já gerou esse arquivo com "Territory
  Map").

## Arquivos modificados

- `app/package.json` — dependências e devDependencies adicionadas; script `ios` e devDependency
  `@react-native-community/cli-platform-ios` removidos.
- `app/package-lock.json` — sincronizado.
- `app/.eslintrc.js` — override de `typescript-eslint` recommended para `.ts`/`.tsx`.
- `app/android/app/build.gradle` — `apply` do `dotenv.gradle` do `react-native-config`.
- `app/app.json` — `displayName`.
- `app/README.md` — reescrito por completo (era o README padrão do template RN).

## Arquivos criados

- `app/` inteiro (projeto novo) — estrutura padrão do template RN (`android/`, `App.tsx`,
  `index.js`, `__tests__/App.test.tsx`, configs de babel/metro/jest/tsconfig/prettier).
- `app/.env.example` — variáveis `API_BASE_URL` e `APP_KEY`.
- `app/src/presentation/index.ts`, `app/src/domain/index.ts`, `app/src/data/index.ts` — placeholders
  vazios das três camadas.

## Decisões técnicas

- **`test-renderer` como dev dependency extra, não pedida explicitamente na task.**
  `@testing-library/react-native@14` (a versão instalada) declara `test-renderer` — um pacote novo,
  substituto moderno do `react-test-renderer` depreciado — como `peerDependency` obrigatória. Sem
  ele, qualquer teste que use `render`/`screen` falha em runtime com "`render` function has not
  been called" (confirmado com um teste descartável, ver "Como validar"). Instalado como dev
  dependency; documentado no `README.md` do app para a Task 22 (primeiro teste real com RTL) não
  tropeçar nisso.
- **RTL 14 é assíncrona por padrão** — `await render(<Componente />)`, não `render(...)` sem
  `await`. Mesma descoberta acima; documentada no `README.md` porque não é óbvia pela mensagem de
  erro (ela não menciona `await` em lugar nenhum).
- **`npm test` fica com o smoke test padrão do template (`__tests__/App.test.tsx`), não vazio.** A
  instrução da task pedia "confirme que passa vazio (sem teste ainda)"; o CLI do React Native,
  porém, sempre gera esse teste junto com o `App.tsx` padrão — é boilerplate do template, não
  lógica escrita nesta task. Removê-lo só para a suíte ficar com zero testes teria um custo maior
  (perder a única verificação de que o Jest + `react-test-renderer` realmente sobem um componente)
  do que o benefício de bater literalmente com "vazio". Mantido; o vazio de fato é `src/domain`,
  `src/data` e `src/presentation`, que é onde a lógica das tasks seguintes entra.
- **ESLint continua na versão 8 (legada, `.eslintrc.js`), não migrado para flat config/ESLint 9.**
  O template do React Native 0.87 já vem fixado em `eslint@^8.19.0` com
  `@react-native/eslint-config`, que é a combinação testada oficialmente pelo time do RN. A task
  pedia "as mesmas regras de `typescript-eslint` recommended usadas no admin", não "o mesmo
  mecanismo de configuração" — atingido com um `overrides` que estende
  `plugin:@typescript-eslint/recommended` (equivalente legado do `tseslint.configs.recommended`
  que o admin usa) só para arquivos `.ts`/`.tsx`, sem arriscar compatibilidade entre
  `@react-native/eslint-config` e ESLint 9.
- **`apply from: .../dotenv.gradle` verificado com `./gradlew projects`**, não com um build
  completo (que exigiria emulador/aparelho, fora do escopo desta task). Confirma que o autolinking
  registra `:react-native-config` como projeto Gradle e que o script do `dotenv.gradle` roda (o log
  mostrou o aviso esperado "*** Missing .env file ****", já que `app/.env` não existe — só o
  `.env.example`).
- **Aviso do Gradle sobre `ksp`/`kotlin` no `react-native-async-storage`.** Ao configurar o projeto
  Android (`./gradlew projects`), apareceu o aviso "`ksp-2.2.0-2.0.2 is too old for
  kotlin-2.2.10`" vindo da biblioteca `@react-native-async-storage/async-storage`. É um aviso de
  compatibilidade interno da lib nessa versão do RN, não um erro — o build de configuração terminou
  com `BUILD SUCCESSFUL`. Documentado no `README.md` do app como limitação conhecida, para não
  surpreender quem rodar `npm run android` depois.

## Como validar

```bash
cd app
npm install
npm test              # 1 suíte, 1 teste (smoke test do template) — passa
npm run lint           # ESLint, zero warnings/erros
npx tsc --noEmit        # zero erros de tipo
cd android && ./gradlew projects   # confirma que os 6 módulos nativos autolinkam e o build.gradle configura sem erro
```

## Resultado da validação

- `npm test`: 1 suíte, 1 teste, passou (`__tests__/App.test.tsx`, smoke test do template).
- `npm run lint` / `npx eslint . --max-warnings=0`: sem saída, zero problemas.
- `npx tsc --noEmit`: sem saída, zero erros.
- `cd android && ./gradlew projects`: `BUILD SUCCESSFUL`, os 8 projetos esperados listados
  (`:app` + os 6 módulos nativos autolinkados + o `gradle-plugin` incluído), confirmando que
  `@maplibre/maplibre-react-native`, `@react-native-async-storage/async-storage`,
  `react-native-config`, `react-native-geolocation-service`, `react-native-keychain`,
  `react-native-safe-area-context` e `react-native-screens` autolinkam corretamente no Android.
- Verificação extra (não pedida, mas necessária para confiar na promessa "confira que
  `@testing-library/react-native` funciona"): um teste descartável em
  `src/presentation/__rtl-smoke.test.tsx` (`await render(<Text>hello</Text>)` +
  `screen.getByText`) passou depois de instalar `test-renderer` e usar `await`; removido em
  seguida — não fica no repositório porque não há tela real ainda para testar (isso é a Task 22).
- `npm run android` **não foi executado** — exige um emulador ou aparelho Android conectado, fora
  do escopo desta task (scaffold).
