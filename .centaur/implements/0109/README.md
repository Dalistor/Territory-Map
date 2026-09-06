# [0109] `HomeScreen` enxuta: sem header duplicado e sem diálogo de atribuição

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0006/` — Task 05

## Solicitação
Remover da `HomeScreen` do admin: o botão "Publicadores", o menu "Mais opções" com "Sair da
congregação" (e a constante `SIGN_OUT_CONFIRM_MESSAGE`, já copiada para o `App.tsx` na Task 04),
os props `onOpenPublishers`/`onSignedOut`, o item "Atribuir a publicador em X" do menu "⋮" e todo
o diálogo de atribuição — a designação agora vive na `DesignationsScreen` (Task 03 /
implements/0107). O header da Home fica só com o título da congregação e "Recarregar". Mantém a
indicação "Designado a {nome}", o menu "⋮" com três itens, o modal da quadra e todo o resto.

## Contexto
Com o shell de sidebar (implements/0108), navegação para Publicadores e o sign-out passaram a ser
responsabilidade da sidebar no `App.tsx`, e a atribuição de dirigente ganhou página própria
(implements/0107). O header da Home e o diálogo de atribuição viraram duplicação morta.

## Critérios de aceite
- O menu "⋮" de um território mostra exatamente três ações (Adicionar quadra, Editar demarcação,
  Apagar território), e cada uma continua funcionando.
- A linha do território ainda mostra "Designado a {nome}" quando há dirigente (informativo).
- Não existe mais botão "Publicadores", menu "Mais opções" nem "Sair da congregação" na tela.
- Carregamento, erro com Recarregar, apagar território/quadra e o modal da quadra continuam como
  antes.
- Nenhum outro arquivo referencia os props removidos (typecheck limpo).

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | the "⋮" menu offers exactly three actions: add block, edit boundary and delete territory | `admin/src/renderer/screens/HomeScreen.test.tsx` | Remoção do item "Atribuir a publicador em X" e de todo o diálogo de atribuição (`assignTarget`/`assignPublishers`/`selectedPublisherId`/`openAssignDialog`/`confirmAssign`), que ficou inalcançável sem o item |
| 2 | offers neither a "Publicadores" button nor a "Mais opções" menu -- navigation and sign-out moved to the sidebar | `admin/src/renderer/screens/HomeScreen.test.tsx` | Remoção dos botões do header, de `isMoreMenuOpen`/`handleSignOut`, de `SIGN_OUT_CONFIRM_MESSAGE` e dos props `onOpenPublishers`/`onSignedOut` |

Adaptações sem ciclo red (comportamento preservado, cobertura realocada):
- Novo teste `shows "Designado a {name}" on the territory row when a publisher is designated` —
  esse comportamento era coberto só de carona pelos testes do diálogo de atribuição, que saíram.
- Removidos os describes "HomeScreen signing out" e "HomeScreen assigning a territory to a
  publisher" (recriados no destino de cada comportamento: `App.test.tsx` na Task 04 e
  `DesignationsScreen.test.tsx` na Task 03), mais os helpers `openAssignDialog` e `makePublisher`.

## O que foi feito
A `HomeScreen` virou só mapa + lista de territórios: header com título e "Recarregar", menu "⋮"
com três ações, indicação read-only "Designado a {nome}", modal de ações da quadra. Todo o código
de navegação/sign-out/atribuição saiu, junto com os testes correspondentes.

## Arquivos modificados
- `admin/src/renderer/screens/HomeScreen.tsx` — remoções descritas acima; comentário de cabeçalho
  atualizado para o papel da tela dentro do shell.
- `admin/src/renderer/screens/HomeScreen.test.tsx` — dois testes novos (menu com três itens; sem
  Publicadores/Mais opções), um teste de adaptação ("Designado a {nome}"), remoção dos describes e
  helpers obsoletos.

## Decisões técnicas
- O diálogo de atribuição inteiro saiu no GREEN do ciclo 1: sem o item de menu ele é código
  inalcançável, e mantê-lo quebraria lint/typecheck por símbolos não usados.
- O teste "Designado a {nome}" cobre também o negativo (linha sem dirigente não mostra o texto),
  porque os testes que garantiam isso indiretamente foram removidos.
- Branches descobertos remanescentes em `HomeScreen.tsx` (guarda `cancelled` do fetch de mount e o
  toggle fechar do menu "⋮") são pré-existentes a esta task — nenhuma linha nova ficou sem teste;
  a task só removeu código.

## Como validar
```
cd admin && npx vitest run src/renderer/screens/HomeScreen.test.tsx
npm test && npm run typecheck && npm run lint
```

## Resultado da validação
- `npx vitest run src/renderer/screens/HomeScreen.test.tsx` — 29 testes passando.
- `npm test` — 19 arquivos, **333 testes passando** (suíte inteira do admin).
- Cobertura de `HomeScreen.tsx`: 100% linhas/statements/funções, 88.23% branch (os branches
  descobertos são pré-existentes, listados acima).
- `npm run typecheck` e `npm run lint` — limpos; nenhuma referência restante a
  `onOpenPublishers`/`onSignedOut`/`SIGN_OUT_CONFIRM_MESSAGE` fora do `App.tsx` (que tem a sua
  própria cópia da mensagem, por design da Task 04).
