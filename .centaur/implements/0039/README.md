# [0039] Scaffold do projeto Electron e remoção do admin Flutter

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0003/` — Task 01

## Solicitação

Apagar todo o conteúdo Flutter de `admin/` (`lib/`, `test/`, `pubspec.yaml`, `pubspec.lock`,
`analysis_options.yaml`, `linux/`, `windows/`, `web/` e artefatos correlatos) e
`.github/workflows/admin-release.yml`, sem tocar em `server.yml`, `core.yml`, `packages/core/` ou
`server/`. Em seguida criar o esqueleto de um projeto Electron em `admin/` com `electron-vite`
(template React + TypeScript): `package.json` com scripts `dev`/`build`/`test`/`lint`, configuração
de Vite/electron-vite, `tsconfig.json` estrito, ESLint com `typescript-eslint` recomendado + plugin
de React, Vitest com ambiente `jsdom`. Criar as pastas `admin/src/{main,preload,renderer,shared}/`
com um arquivo mínimo cada. Adicionar `admin/.env.example` (`API_BASE_URL`, `APP_KEY`) e
`admin/.gitignore`. Sem lógica de negócio nesta task — só o esqueleto. Confirmar que `npm install`,
`npm run build` e `npm test` rodam sem erro.

## Contexto

Primeira task da spec 0003, que migra o admin de Flutter desktop para Electron + React +
TypeScript + Leaflet. A decisão foi tomada porque a máquina de desenvolvimento não tem o Xcode
completo (só Command Line Tools) e não compila `flutter build macos`; o dono do projeto decidiu
abandonar build via CI também para Windows/Linux e compilar tudo localmente com
`electron-builder`, replicando um fluxo que já usa em outro projeto. Esta task deixa `admin/`
pronto — compilando e com o test runner funcionando — para que as tasks seguintes (02 a 20)
portem a lógica de domínio, o cliente HTTP, a sessão, o IPC e as seis telas.

## O que foi feito

1. **Remoção do Flutter.** Apagados `admin/lib/`, `admin/test/`, `admin/linux/`, `admin/windows/`,
   `admin/web/`, `admin/pubspec.yaml`, `admin/pubspec.lock`, `admin/analysis_options.yaml`,
   `admin/.metadata`, além de artefatos locais não versionados (`admin/.dart_tool/`,
   `admin/.flutter-plugins-dependencies`, `admin/.idea/`, `admin/build/`, `admin/coverage/`,
   `admin/territory_admin.iml`). `admin/README.md` e `admin/.gitignore` antigos (específicos de
   Flutter) também saíram, para serem recriados pelo scaffold/Task 19.
2. **Remoção do CI antigo.** `.github/workflows/admin-release.yml` apagado — ele só sabia compilar
   Flutter (`flutter build windows`/`flutter build linux`) e não há substituto por CI nesta spec.
   `server.yml` e `core.yml` não foram tocados.
3. **Scaffold Electron.** Gerado com `npm create @quick-start/electron@latest admin -- --template
   react-ts` (a ferramenta oficial de scaffold do `electron-vite`), sem plugin de auto-update e sem
   proxy de mirror de download. Isso trouxe `package.json`, `electron.vite.config.ts`,
   `tsconfig.{json,node.json,web.json}`, `eslint.config.mjs`, `electron-builder.yml` e a estrutura
   `src/main/`, `src/preload/`, `src/renderer/src/`.
4. **Achatamento de `src/renderer/`.** O template do `electron-vite` aninha o código do renderer em
   `src/renderer/src/` (convenção comum da ferramenta, porque `src/renderer/` é a raiz do Vite e
   precisa do `index.html` ao lado). A spec 0003, porém, referencia telas futuras diretamente em
   `admin/src/renderer/App.tsx`, `admin/src/renderer/screens/...`, `admin/src/renderer/map/...` —
   sem o nível `src/` extra. Movido o conteúdo de `src/renderer/src/` para `src/renderer/` e
   ajustados `index.html` (script aponta para `/main.tsx`), `electron.vite.config.ts` (alias
   `@renderer` e novo alias `@shared`) e `tsconfig.web.json` (paths/includes).
5. **Simplificação do conteúdo de demonstração.** O `App.tsx` gerado (logo do Electron, componente
   `Versions`, botão de IPC `ping`) foi trocado por um placeholder mínimo (`<div>Territory Map
   Admin</div>`), já que a Task 13 da spec substitui esse arquivo pelo roteamento real. Os assets de
   demonstração (`assets/electron.svg`, `assets/wavy-lines.svg`, `components/Versions.tsx`,
   CSS de demo) foram removidos junto — não sobra código de exemplo para as próximas tasks
   destrincharem. `src/main/index.ts` e `src/preload/index.ts` do scaffold foram mantidos como
   estão (já são um "hello world" funcional de janela Electron + `contextBridge`); a Task 07 os
   reescreve por completo.
6. **Pasta `shared/`.** Criada com `src/shared/index.ts` (uma constante placeholder) e
   `src/shared/index.test.ts` (teste de fumaça), já que o template do `electron-vite` não gera essa
   pasta — ela é específica desta spec (Tasks 02, 03 e 07 usam `shared/` para geometria, modelos e
   contrato de IPC).
7. **Vitest com `jsdom`.** O template do `electron-vite` não inclui test runner. Adicionado
   `vitest.config.ts` (arquivo próprio, separado de `electron.vite.config.ts`, porque este último
   define três builds distintos — main/preload/renderer — e não serve como config de teste único)
   com `environment: 'jsdom'`, `globals: true`, os mesmos aliases `@renderer`/`@shared`, e
   `vitest.setup.ts` importando `@testing-library/jest-dom/vitest`. Instaladas as dependências de
   teste via `npm install -D` (sem fixar versão à mão) para o npm resolver as versões atuais
   compatíveis com o restante do projeto: `vitest`, `jsdom`, `@testing-library/react`,
   `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitest/coverage-v8`.
8. **Scripts do `package.json`.** Adicionados `test` (`vitest run`) e `test:watch` (`vitest`) aos
   scripts já existentes do scaffold (`dev`, `build`, `lint`, mais `typecheck`/`start`/os
   `build:*` do `electron-builder`, que a Task 19 vai configurar por alvo). `name`, `description` e
   `private` do `package.json` foram ajustados para o projeto real (o scaffold gerava um `name:
   "admin"` genérico com `homepage` apontando para `electron-vite.org`).
9. **`.env.example`** documentando `API_BASE_URL` (URL base do servidor) e `APP_KEY` (mesmo valor
   do `APP_SECRET` do servidor, vira o header `X-App-Key`), com nota de que ambos são lidos pelo
   main process via `dotenv` (a partir da Task 07).
10. **`.gitignore`** reescrito para cobrir `node_modules/`, `dist/`, `out/`, `coverage/`, `.env`
    (mantendo `.DS_Store`, `.eslintcache`, `*.log*` do scaffold).

`tsconfig.node.json` e `tsconfig.web.json` continuam com `strict` herdado de
`@electron-toolkit/tsconfig` (checado via `npm run typecheck`, que passou limpo). ESLint já vem com
`@electron-toolkit/eslint-config-ts` (que embrulha `typescript-eslint` recomendado) e
`eslint-plugin-react` (`recommended` + `jsx-runtime`), como pedido.

## Arquivos modificados

- `admin/.gitignore` — reescrito para o projeto Node/Electron (antes cobria artefatos Flutter).
- `admin/README.md` — agora é o README genérico gerado pelo scaffold do `electron-vite`; a Task 19
  da spec 0003 reescreve do zero com as instruções reais do projeto.
- `.centaur/specs/0003/README.md` — checklist da Task 01 marcado (via Passo 9b desta skill).

## Arquivos removidos

- `admin/lib/**` (13 arquivos Dart), `admin/test/**` (12 arquivos de teste Dart), `admin/linux/**`,
  `admin/windows/**`, `admin/web/**`, `admin/pubspec.yaml`, `admin/pubspec.lock`,
  `admin/analysis_options.yaml`, `admin/.metadata` — todo o conteúdo Flutter do admin antigo.
- `.github/workflows/admin-release.yml` — CI que só sabia compilar Flutter.
- Artefatos locais não versionados: `admin/.dart_tool/`, `admin/.flutter-plugins-dependencies`,
  `admin/.idea/`, `admin/build/`, `admin/coverage/`, `admin/territory_admin.iml`.

## Arquivos criados

- `admin/package.json` — scripts `dev`, `build`, `test`, `test:watch`, `lint`, `typecheck`,
  `build:{mac,win,linux,unpack}`.
- `admin/electron.vite.config.ts` — configura main/preload/renderer, com os aliases `@renderer` e
  `@shared`.
- `admin/tsconfig.json`, `admin/tsconfig.node.json`, `admin/tsconfig.web.json` — modo estrito
  (herdado de `@electron-toolkit/tsconfig`).
- `admin/eslint.config.mjs` — `typescript-eslint` recomendado + `eslint-plugin-react`
  (`recommended` + `jsx-runtime`) + `react-hooks` + `react-refresh`, com Prettier por fora.
- `admin/vitest.config.ts`, `admin/vitest.setup.ts` — Vitest com ambiente `jsdom`.
- `admin/.env.example` — documenta `API_BASE_URL` e `APP_KEY`.
- `admin/src/main/index.ts` — main process (ciclo de vida do app, cria a `BrowserWindow`); conteúdo
  do scaffold, será reescrito na Task 07.
- `admin/src/preload/index.ts`, `admin/src/preload/index.d.ts` — `contextBridge` expondo
  `window.electron`/`window.api`; conteúdo do scaffold, será reescrito na Task 07.
- `admin/src/renderer/index.html`, `admin/src/renderer/main.tsx`, `admin/src/renderer/App.tsx`,
  `admin/src/renderer/env.d.ts` — placeholder mínimo do renderer; `App.tsx` será substituído na
  Task 13.
- `admin/src/shared/index.ts`, `admin/src/shared/index.test.ts` — placeholder + teste de fumaça;
  populado a partir da Task 02.
- `admin/electron-builder.yml`, `admin/build/**`, `admin/resources/icon.png`,
  `admin/.editorconfig`, `admin/.prettierignore`, `admin/.prettierrc.yaml`, `admin/.vscode/**` —
  gerados pelo scaffold, sem alteração de conteúdo (a Task 19 configura os alvos do
  `electron-builder`).
- `admin/package-lock.json` — gerado pelo `npm install`.

## Decisões técnicas

- **Scaffold oficial em vez de montar na mão.** `npm create @quick-start/electron@latest` é o
  gerador oficial do `electron-vite` e já entrega a separação main/preload/renderer com
  `contextIsolation`, TypeScript estrito e ESLint corretos — reduz risco de divergir da convenção
  da ferramenta que a spec pede.
- **Achatar `src/renderer/src/` em `src/renderer/`.** Decisão necessária, não cosmética: as
  instruções de Task 02 a Task 18 da spec 0003 referenciam caminhos como
  `admin/src/renderer/App.tsx` e `admin/src/renderer/screens/SetupScreen.tsx` diretamente sob
  `renderer/`, sem o nível `src/` aninhado que o template gera por padrão. Ajustar agora evita que
  a primeira task de renderer (Task 08/09) precise redecidir a estrutura de pastas.
- **Remover o conteúdo de demonstração em vez de deixá-lo.** O `App.tsx`/`Versions.tsx` gerados
  fazem uma chamada IPC (`ping`) e importam assets que não serviriam a nada nesta spec; a
  instrução da task pede "arquivo mínimo... hello world" e "nenhuma lógica de negócio, tela ou
  chamada de API" — manter o demo teria contrariado isso mais do que ajudado.
- **Instalar as libs de teste via `npm install` em vez de fixar versão à mão.** Evita apontar para
  uma versão inexistente ou incompatível com o restante do lockfile; o npm resolveu
  `vitest@^4.1.10`, `jsdom@^30.0.1`, `@testing-library/react@^16.3.2`,
  `@testing-library/jest-dom@^7.0.0`, `@testing-library/user-event@^14.6.3` — todas compatíveis
  com o Vite 7 que o scaffold já trazia.
- **`vitest.config.ts` separado de `electron.vite.config.ts`.** O config do `electron-vite` define
  três ambientes de build distintos (main/preload/renderer) e não é um config de teste único; um
  arquivo próprio para o Vitest é o padrão recomendado pela própria ferramenta.
- **Teste de fumaça em `shared/index.test.ts` em vez de nenhum teste.** `vitest run` sem nenhum
  arquivo de teste correspondente sai com código de erro ("No test files found"); a task pede que
  `npm test` rode sem erro "mesmo que sem testes reais ainda" — um teste trivial (mas real, não um
  `it.skip`) satisfaz isso sem mascarar uma falha futura.
- **Não mexi em `admin/electron-builder.yml`.** A Task 19 da spec possui esse arquivo como escopo
  próprio (alvos mac/win/linux); alterá-lo agora arriscaria conflitar com decisões que ela ainda
  vai tomar.

## Como validar

```bash
cd admin
npm install
npm run build   # typecheck (node + web) + electron-vite build
npm run lint     # eslint --cache .
npm test         # vitest run
npm run dev      # abre a janela Electron com hot reload (verificação manual)
```

## Resultado da validação

- `npm install` — concluído, 0 vulnerabilidades (alguns avisos de scripts de instalação pendentes
  de aprovação do `npm`, típico do `electron`/`esbuild`/`electron-winstaller`, sem impacto aqui).
- `npm run build` — `typecheck:node`, `typecheck:web` e `electron-vite build` passaram sem erro;
  gerou `out/main`, `out/preload`, `out/renderer`.
- `npm run lint` — sem erros nem warnings.
- `npm test` — 1 arquivo de teste, 1 teste, passou (`vitest run`, ambiente `jsdom`).
- Revisão manual: confirmado por `git status` que nenhuma mudança tocou `server/`, `packages/core/`
  ou os workflows `server.yml`/`core.yml` — só `admin/**` e a remoção de
  `.github/workflows/admin-release.yml`.
- Revisão de camadas: não se aplica ainda (esqueleto sem código de domínio); a separação
  main/preload/renderer/shared já está fisicamente presente para as tasks seguintes respeitarem.
