# [0059] Corrigir `window.api` ausente no admin Electron (bug real, fora da spec 0003)

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** — (correção pontual, fora de qualquer spec — encontrada rodando o admin de verdade
pela primeira vez após a spec 0003)

## Sintoma relatado pelo usuário

Ao abrir a janela real do Electron (não o preview no navegador) e tentar entrar, o app quebrava
com `Cannot read properties of undefined (reading 'session')` — ou seja, `window.api` não existia
dentro da própria janela Electron, algo que só deveria acontecer fora do Electron (sem preload).

## Causa raiz

`admin/src/preload/index.ts` importava `@electron-toolkit/preload` só para expor `window.electron`
(`electronAPI`) — resquício do scaffold da Task 01 (spec 0003) que nenhuma das 20 tasks seguintes
chegou a usar; o app inteiro só fala com `window.api`.

Com `sandbox: true` em `main/index.ts` (`webPreferences`), o preload roda num contexto restrito
onde `require()` só alcança um punhado de módulos nativos do Electron (`electron`, `events`,
`timers`, `url`) — não pacotes quaisquer de `node_modules`. O bundle do electron-vite para o
preload **não embute** `@electron-toolkit/preload` (fica como `require("@electron-toolkit/preload")`
externo no `out/preload/index.js`), então essa linha lança uma exceção **no topo do script**, antes
de qualquer `contextBridge.exposeInMainWorld` rodar — inclusive antes do próprio `exposeInMainWorld('api', api)`,
que fica dentro de um `try/catch` mais abaixo e nunca chega a executar. Resultado: `window.api`
nunca existiu, silenciosamente (o erro do preload não aparece no terminal do `npm run dev`, só no
DevTools da janela).

## Por que não apareceu antes

A spec 0003 inteira foi validada por testes (Vitest + RTL, que fazem fake de `window.api`, nunca
sobem uma janela Electron real) e por `npm run build:mac` (que só empacota arquivos, não executa o
app). Ninguém tinha rodado `npm run dev` de verdade — com a janela Electron real — até agora.

## O que foi feito

- `admin/src/preload/index.ts`: removida a importação de `@electron-toolkit/preload` e a exposição
  de `window.electron`. Só resta `contextBridge.exposeInMainWorld('api', api)`.
- `admin/src/preload/index.d.ts`: removida a declaração de tipo `electron: ElectronAPI`; só resta
  `api: IpcApi`.
- `admin/package.json`: removida a dependência `@electron-toolkit/preload` (não usada em lugar
  nenhum do código — confirmado por grep antes de remover).
- `npm install` para atualizar `package-lock.json`.

## Arquivos modificados

- `admin/src/preload/index.ts`
- `admin/src/preload/index.d.ts`
- `admin/package.json`
- `admin/package-lock.json`

## Como validar

```bash
cd admin
npm install
npm run lint
npm run typecheck
npm test
env -u ELECTRON_RUN_AS_NODE npm run dev   # abre a janela real; window.api deve existir
```

## Resultado da validação

- `npm run lint` — sem erros.
- `npm run typecheck` — sem erros.
- `npm test` — 262/262 passando (uma falha isolada num run anterior foi confirmada como flake de
  timing do React act()/passive effects, não-relacionada a esta mudança — dois reruns limpos depois).
- `npm run build:mac` (validado na Task 19, `.claude/implements/0057/`) continua funcionando — a
  remoção não afeta o processo main nem o empacotamento.
- `env -u ELECTRON_RUN_AS_NODE npm run dev` — main e preload buildam sem erro (preload caiu de
  2.90 kB para 2.72 kB), a janela abre sem o stack trace anterior. Confirmação visual final pendente
  do usuário (sem acesso a screenshot automatizado nesta sessão — permissão de Gravação de Tela do
  macOS não concedida).

## Nota lateral, sem relação com este bug

A primeira tentativa de abrir `npm run dev` nesta sessão falhou com
`TypeError: Cannot read properties of undefined (reading 'isPackaged')` em
`@electron-toolkit/utils`. Causa: a variável de ambiente `ELECTRON_RUN_AS_NODE=1` estava presente no
shell desta sessão de automação (não é algo do projeto nem do ambiente normal do usuário), fazendo o
binário do Electron rodar como Node puro. Resolvido rodando com `env -u ELECTRON_RUN_AS_NODE` — não
precisou de nenhuma mudança de código.
