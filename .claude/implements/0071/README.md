# [0071] Mapa do editor de quadra mostra as quadras já salvas na mesma sessão

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto (com testes adicionados)
**Spec:** — (pedido do usuário testando o fluxo de múltiplas quadras da spec 0004/implements/0070)

## Sintoma

Depois de `implements/0070` (a `BlockEditorScreen` ficando aberta e pronta pra desenhar a próxima
quadra), o usuário reportou que, ao desenhar a segunda quadra, o mapa não mostrava o contorno da
primeira — mesmo já salva no servidor.

## Causa raiz

`contextRings` (os contornos não-editáveis desenhados por baixo — o território e as outras
quadras) era calculado a partir da prop `territory.blocks`, que `AuthenticatedApp` captura **uma
vez** quando a tela abre e nunca atualiza durante a sessão (a tela não navega mais pra fora ao
salvar, então nunca há uma chance de recarregar `territory` do servidor). A quadra recém-criada
existe no banco, mas `territory.blocks` continua congelado no que era antes de ela existir.

## Correção

`admin/src/renderer/screens/BlockEditorScreen.tsx` ganhou um estado `sessionBlocks`, semeado uma
vez a partir de `territory.blocks` e atualizado manualmente logo depois de cada salvamento bem-
sucedido: `setSessionBlocks((previous) => [...previous.filter((other) => other.id !==
saved.id), saved])` — troca a entrada correspondente numa edição, acrescenta numa criação.
`contextRings` passou a usar `sessionBlocks` em vez de `territory.blocks`. O território
(`territory.boundary`) não muda, só as quadras.

Dois testes novos em `BlockEditorScreen.test.tsx`: criar uma quadra faz o contorno dela aparecer
no contexto do próximo desenho; editar uma quadra existente **substitui** a entrada antiga no
contexto (não duplica).

## Arquivos modificados

- `admin/src/renderer/screens/BlockEditorScreen.tsx`
- `admin/src/renderer/screens/BlockEditorScreen.test.tsx`

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
- `npm test` — 308/308 passando (306 antes + 2 testes novos).
- `npm run build` — conclui.
