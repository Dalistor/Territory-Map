# [0070] Corrigir a fiação de `App.tsx` que ainda navegava pra Home ao salvar uma quadra

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto (com um teste de regressão adicionado)
**Spec:** — (bug real encontrado pelo usuário testando a Task 04 da spec 0004)

## Sintoma

Depois da spec 0004 (Task 04, `implements/0068`), o usuário reportou que salvar uma quadra
continuava voltando pra `HomeScreen` sozinho, em vez de ficar no editor pronto pra desenhar a
próxima — exatamente o comportamento que a Task 04 deveria ter corrigido.

## Causa raiz

A Task 04 corrigiu `BlockEditorScreen.tsx` por dentro (reseta o anel, o número e o modo pra
"criar" depois de salvar com sucesso), mas a própria instrução da task dizia explicitamente pra
**não mexer em `App.tsx`** e "a assinatura de `onSaved` continua sendo chamada... hoje decide
voltar, isso não muda aqui" — presumindo que isso seria inofensivo. Não era: `AuthenticatedApp`
(`App.tsx`) ainda tinha `<BlockEditorScreen ... onSaved={goHome} />`, então assim que
`window.api.blocks.create`/`.update` resolvia, `goHome()` desmontava a tela **antes** do reset
interno da Task 04 chegar a aparecer pro usuário. As duas mudanças, cada uma correta isoladamente,
se cancelavam.

Nenhum teste existente cobria essa fiação: `BlockEditorScreen.test.tsx` não sabe que `App.tsx`
existe, e o teste de navegação em `App.test.tsx` que abre o editor de quadra nunca chegava a
salvar — só verificava que a tela abria.

## Correção

- `admin/src/renderer/App.tsx`: removida a prop `onSaved={goHome}` do `<BlockEditorScreen>` no
  branch `case 'block-editor':` (o `<TerritoryEditorScreen>` continua com `onSaved={goHome}` —
  esse editor não tem o comportamento de "ficar aberto", só o de quadra). Comentário explicando o
  motivo, pra não ser reintroduzido sem querer.
- `admin/src/renderer/App.test.tsx`: o mock de `PolygonEditorLayers` (antes `() => null`) passou a
  expor três botões que chamam `controller.addPoint` de verdade (mesma técnica já usada em
  `BlockEditorScreen.test.tsx`/`TerritoryEditorScreen.test.tsx`), pra dar suporte a um teste de
  ponta a ponta de verdade. Novo teste: abrir "Adicionar quadra" a partir da Home, desenhar um
  triângulo válido, salvar, e confirmar que a tela **continua** mostrando "Nova quadra em
  {território}" (não voltou pra Home) — o teste que teria pego esse bug antes de ele chegar no
  usuário.

## Arquivos modificados

- `admin/src/renderer/App.tsx`
- `admin/src/renderer/App.test.tsx`

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
- `npm test` — 306/306 passando (305 antes + 1 teste de regressão novo).
- `npm run build` — conclui.
