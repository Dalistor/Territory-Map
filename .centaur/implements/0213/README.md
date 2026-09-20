# [0213] Shell contemporâneo do admin desktop

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 08

## Solicitação

> Spec 0015 — Task 08: Implemente o shell desktop do comp aprovado em `App.tsx` e `index.css`:
> sidebar compacta com `Mapa`, `Territórios`, `Publicadores` e `Histórico completo`; identidade da
> congregação no topo; saída isolada no rodapé; conteúdo com largura estável e foco visível. Migre
> `Designações` para a seção `Territórios` e preserve todas as rotas empurradas do Mapa. Crie tokens
> CSS semânticos para superfícies, texto, borda, foco, seleção e intents; preserve as cores de
> domínio das quadras fora do tema. Atualize `App.test.tsx` para navegação e seção ativa. Não crie
> funcionalidades vistas apenas no comp. Toque apenas no shell, stylesheet global e teste do shell.

## Contexto

O shell ainda apresentava a arquitetura anterior de seções. A composição aprovada estabelece as
consultas administrativas como destinos primários, sem retirar o mapa e seus editores empurrados.

## O que foi feito

- Renomeou a navegação primária para `Mapa`, `Territórios`, `Publicadores` e `Histórico completo`.
- Manteve o workspace existente de designações como destino interno de `Territórios` e preservou os
  editores, configurações e histórico de quadra sob a seção `Mapa`.
- Refinou a sidebar compacta, a identidade da congregação e a separação visual da saída.
- Introduziu tokens semânticos de superfície, texto, borda, foco, seleção e intenções, mantendo os
  aliases legados até a migração visual das demais telas.
- Atualizou os testes de ordem, rótulos e seção ativa da navegação.

## Arquivos modificados

- `admin/src/renderer/App.tsx` — destinos e estado ativo do shell.
- `admin/src/renderer/index.css` — tokens semânticos, foco e chrome da sidebar.
- `admin/src/renderer/App.test.tsx` — cobertura da navegação canônica.

## Decisões técnicas

`Territórios` abre o workspace de designações existente, em vez de renomear ou duplicar a tela antes
da Task 10. Assim a nova arquitetura de informação é adotada agora, sem criar uma superfície ou
funcionalidade que o comp não autoriza.

## Como validar

```bash
cd admin
npm test -- --run src/renderer/App.test.tsx
npm run typecheck
npx prettier --check src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/index.css
```

## Resultado da validação

- `npm test` — 28 arquivos e 549 testes passaram.
- `npm test -- --run src/renderer/App.test.tsx` — 24 testes passaram.
- `npm run typecheck` — passou.
- `npx prettier --check ...` e `git diff --check` — passaram.
- `npm run lint` — sem erros; reporta 14 avisos Prettier já existentes em arquivos não tocados
  (`Dialog.tsx`, `HomeScreen.tsx` e `PublishersScreen.tsx`).
