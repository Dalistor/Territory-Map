# [0060] Corrigir mensagens de erro mangled do IPC, tiles do mapa bloqueados por CSP, e navegação nunca conectada

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto (com um módulo novo testado por TDD dentro do escopo)
**Spec:** — (correções encontradas rodando o admin de verdade, fora de qualquer spec — sequência
imediata de `implements/0059`)

## Contexto

Depois de `implements/0059` corrigir `window.api` ausente, o usuário conseguiu logar de verdade
(confirmado por screenshot: cabeçalho "Oeste — Cambé" renderizado). Três problemas novos apareceram
em sequência, todos reais, todos fora do que qualquer task da spec 0003 cobria:

1. Toda mensagem de erro vinda do IPC real chegava como um blob de JSON mangled pelo prefixo do
   próprio Electron, em vez do texto em português desenhado para o admin.
2. Os tiles do OpenStreetMap não carregavam — o mapa aparecia cinza.
3. Nenhum botão de navegação da `HomeScreen` levava a lugar nenhum — `App.tsx` nunca foi conectado
   às outras cinco telas, e não havia sequer um botão para abrir Publicadores.

## Bug 1 — Mensagens de erro do IPC chegavam mangled

**Causa:** `main/ipc-handlers.ts` (Task 07) serializa o erro certo (`SerializedIpcError`
JSON-encoded dentro de `Error#message`, porque o Electron só preserva `message` através da ponte).
Mas nenhuma das seis telas (Tasks 12–18) nem o `App.tsx` (Task 13) jamais decodificava esse JSON de
volta — cada uma lia `error.message` cru, assumindo (correto nos próprios testes, que fakeiam
`window.api` diretamente com `{name, message}` já limpo) que já vinha pronto. Contra a ponte real, o
Electron ainda envolve a mensagem com `Error invoking remote method '<canal>': Error: <json>`, então
o admin via essa linha inteira em vez de, por exemplo, "Não foi possível entrar."

**Correção:** novo módulo `admin/src/shared/ipc-error.ts`, exportando `parseIpcError(error,
fallbackMessage)` — testado por TDD, 13 casos, 100% de cobertura (statements/branches/funções/
linhas). Recupera `{name, message, code?, statusCode?}` de três formatos possíveis: um `Error` real
da ponte (acha o primeiro `{` na mensagem e tenta `JSON.parse` a partir dali), um `Error` comum sem
JSON embutido (usa a mensagem como está), e o objeto plano `{name, message}` que os testes já usavam
como fake. Preserva `name` mesmo quando não há `message` própria (necessário para
`CredentialsRejectedException` sem mensagem customizada continuar identificável em `App.tsx`).

Cada tela trocou sua função local `errorMessage`/`errorName` ad-hoc por uma chamada a
`parseIpcError`: `SetupScreen.tsx`, `App.tsx`, `HomeScreen.tsx`, `TerritoryEditorScreen.tsx`,
`BlockEditorScreen.tsx`, `PublishersScreen.tsx`, `BlockHistorySheet.tsx`.

Um teste em `BlockEditorScreen.test.tsx` esperava que uma rejeição não-Error (`'boom'`) aparecesse
**verbatim** na tela — comportamento acidental do `String(error)` antigo, não um design intencional.
Atualizado para esperar a mensagem genérica em português, consistente com o resto do app.

## Bug 2 — Tiles do OpenStreetMap bloqueados pelo CSP

**Causa:** o CSP em `admin/src/renderer/index.html` (`img-src 'self' data:`) nunca incluiu o host
dos tiles. As chamadas de API rodam como `fetch` do Node no processo main (fora do CSP), mas os
tiles do Leaflet são `<img>` carregadas pelo próprio renderer — e essas o CSP governa de verdade.

**Correção:** `img-src 'self' data: https://tile.openstreetmap.org` adicionado ao CSP.

## Bug 3 — Nenhuma navegação entre telas

**Causa:** a Task 13 (spec 0003) só decidia entre `SetupScreen`/`HomeScreen`. Nenhuma task cobriu
conectar os callbacks que `HomeScreen` já expunha (`onNewTerritory`, `onEditTerritory`, `onAddBlock`,
`onShowHistory`, `onEditBlock`) a `TerritoryEditorScreen`/`BlockEditorScreen`/`BlockHistorySheet` —
cada tela foi construída e testada isolada contra um chamador fake. `HomeScreen` também nunca ganhou
um botão para abrir `PublishersScreen` (a Task 14 não pediu isso). Resultado: clicar em "Novo
território" literalmente não fazia nada (`onNewTerritory?.(...)` com a prop `undefined`).

**Correção:**
- `admin/src/renderer/screens/HomeScreen.tsx`: nova prop `onOpenPublishers?: () => void` e botão
  "Publicadores" no cabeçalho.
- `admin/src/renderer/App.tsx`: nova `AuthenticatedApp`, dona de um estado `route` (`home` |
  `territory-editor` | `block-editor` | `publishers` | `block-history`) que decide o que renderizar
  depois do login. Cada tela "empurrada" ganha uma barra "← Voltar" (`PushedScreen`, componente novo
  e pequeno) sem tocar no componente da tela em si — nenhuma das seis telas nem seus testes mudou de
  comportamento próprio. Voltar para `home` desmonta e remonta `HomeScreen`, cujo próprio efeito de
  montagem já busca os territórios de novo — não precisou de invalidação manual depois de salvar.
- `admin/src/renderer/index.css`: regras `.pushed-screen`/`.back-bar` para a barra de voltar.
- 4 testes novos em `App.test.tsx` (`describe('AuthenticatedApp navigation', ...)`) cobrindo: abrir
  o editor de território e voltar, abrir o editor de quadra a partir de "Adicionar quadra", abrir o
  histórico a partir de "Ver histórico" no menu de uma quadra, e abrir/fechar Publicadores.

## Arquivos modificados

- `admin/src/shared/ipc-error.ts` (novo), `admin/src/shared/ipc-error.test.ts` (novo)
- `admin/src/renderer/screens/SetupScreen.tsx`
- `admin/src/renderer/App.tsx`, `admin/src/renderer/App.test.tsx`
- `admin/src/renderer/screens/HomeScreen.tsx`
- `admin/src/renderer/screens/TerritoryEditorScreen.tsx`
- `admin/src/renderer/screens/BlockEditorScreen.tsx`, `BlockEditorScreen.test.tsx`
- `admin/src/renderer/screens/PublishersScreen.tsx`
- `admin/src/renderer/screens/BlockHistorySheet.tsx`
- `admin/src/renderer/index.html` (CSP)
- `admin/src/renderer/index.css` (`.pushed-screen`/`.back-bar`)

## Como validar

```bash
cd admin
npm run lint
npm run typecheck
npm test
npm run build
env -u ELECTRON_RUN_AS_NODE npm run dev
```

## Resultado da validação

- `npm run lint` — sem erros.
- `npm run typecheck` — sem erros.
- `npm test` — 279/279 passando (era 262 antes desta correção; 17 novos: 13 de `ipc-error.test.ts`
  + 4 de navegação em `App.test.tsx`).
- `npm run build` — `electron-vite build` conclui (main, preload, renderer).
- `env -u ELECTRON_RUN_AS_NODE npm run dev` — sobe sem erro. Confirmação visual do usuário: login
  funcionando de ponta a ponta (screenshot com "Oeste — Cambé" no cabeçalho); mapa e navegação
  pendentes de reteste após esta correção.
