# [0207] Diálogos acessíveis e ações descobríveis no admin desktop

**Data:** 2026-09-06
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0014/` — Task 10

## Solicitação

Implementar diálogos customizados acessíveis no admin desktop, preservando confirmações destrutivas,
deixando Quadras/Configurações mais descobríveis na Home e garantindo navegação por teclado nos menus.

## Critérios de aceite

- Diálogos usam `role="dialog"`, `aria-modal` e título associado.
- O foco entra no diálogo, fica contido, retorna ao elemento que abriu e `Escape` fecha.
- O backdrop impede interação acidental com o conteúdo atrás.
- Confirmações destrutivas e seus textos permanecem preservados.
- Home mantém apagar no menu e oferece ações rápidas para Quadras e Configurações.
- Menus da Home e de Publicadores têm foco visível e navegação por teclado.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Dialog expõe semântica acessível, contém foco e fecha por Escape | `admin/src/renderer/components/Dialog.test.tsx` | `Dialog` compartilhado |
| 2 | Home mantém ações rápidas sem remover o menu | `admin/src/renderer/screens/HomeScreen.test.tsx` | Ações rápidas de território |
| 3 | Menu da Home percorre itens e devolve foco ao gatilho | `admin/src/renderer/screens/HomeScreen.test.tsx` | Navegação por setas/Home/End/Escape |
| 4 | Modais de designações e publicadores preservam abertura/fechamento | testes existentes de `DesignationsScreen` e `PublishersScreen` | Migração para `Dialog` |

## O que foi feito

Foi criado um componente `Dialog` com foco inicial, focus trap, restauração de foco, `Escape`, título
associado e backdrop. Os modais existentes do desktop foram migrados para ele. O modal de ações da
quadra deixou de usar semântica de menu. A Home ganhou ações rápidas e os menus de Home/Publicadores
passaram a suportar teclado.

## Arquivos afetados

- `admin/src/renderer/components/Dialog.tsx` e `Dialog.test.tsx` — comportamento compartilhado.
- `admin/src/renderer/screens/HomeScreen.tsx` e `HomeScreen.test.tsx` — modal, menus e ações rápidas.
- `admin/src/renderer/screens/DesignationsScreen.tsx` e teste — modais S-13-T e designações.
- `admin/src/renderer/screens/PublishersScreen.tsx` — modais e menu de ações.
- `admin/src/renderer/screens/BlockHistorySheet.tsx` e `BlockWorkPanel.tsx` — confirmações em diálogo.
- `admin/src/renderer/index.css` — backdrop, foco visível e ações rápidas.

## Decisões técnicas

O backdrop é um elemento fixo que cobre a janela, em vez de depender apenas de `box-shadow`; assim,
eventos de ponteiro não alcançam o conteúdo atrás. O foco inicial usa o primeiro controle habilitado,
mantendo entradas de formulário prontas para uso e preservando os textos e ações existentes.

## Como validar

```text
cd admin
npm test -- --run src/renderer/components/Dialog.test.tsx src/renderer/screens/HomeScreen.test.tsx src/renderer/screens/DesignationsScreen.test.tsx src/renderer/screens/PublishersScreen.test.tsx src/renderer/screens/BlockHistorySheet.test.tsx src/renderer/screens/BlockWorkPanel.test.tsx
npm run typecheck:web
```

## Resultado da validação

Os seis arquivos de teste relevantes passaram: **135 testes passando**. `npm run typecheck:web` também
passou. A suíte completa e a cobertura não foram executadas nesta finalização, conforme solicitado.
