# [0224] Workspace de territórios no desktop

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 10

## Solicitação

Consolidar `DesignationsScreen` como a seção desktop `Territórios`: tabela ordenada, detalhe
persistente e ações de designação já existentes.

## Critérios de aceite

- Ordem numérica, seleção sincronizada e alternância Lista/Mapa.
- Painel com Visão geral, Designações, Quadras e Mapa.
- Atualização após designar, concluir e apagar; seleção removida fecha o painel.
- Estados loading, vazio, sem resultados, erro e refresh estáveis.
- Enter abre, Escape fecha e devolve o foco; largura estreita empilha o detalhe.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | ordena por número e abre detalhe persistente | `admin/src/renderer/screens/DesignationsScreen.test.tsx` | tabela e painel lateral |
| 2 | mantém seleção e busca ao alternar lista/mapa | `admin/src/renderer/screens/DesignationsScreen.test.tsx` | estado compartilhado de busca, visualização e seleção |
| 3 | Enter abre; Escape fecha e retorna foco | `admin/src/renderer/screens/DesignationsScreen.test.tsx` | comportamento de teclado |
| 4 | refresh fecha detalhe de território removido | `admin/src/renderer/screens/DesignationsScreen.test.tsx` | reconciliação da seleção |

## O que foi feito

- Consolidou `DesignationsScreen` como o workspace `Territórios`, usando os controles compartilhados.
- Preservou exportação/importação e as ações S-13; o detalhe reutiliza `BlockWorkPanel` e `TerritoryMap`.
- Adicionou layout tabela + painel e empilhamento responsivo sem criar outro mapa ou regra no renderer.

## Arquivos modificados

- `admin/src/renderer/screens/DesignationsScreen.tsx` — workspace, abas e preservação de estado.
- `admin/src/renderer/screens/DesignationsScreen.test.tsx` — cobertura do workspace.
- `admin/src/renderer/index.css` — layout e responsividade.

## Decisões técnicas

A data de retirada só é conhecida para o território selecionado porque a listagem não carrega o
histórico de designações. O painel usa a rota por território existente e atualiza a célula sem
introduzir fan-out N+1 na tabela.

## Como validar

```sh
cd admin
npm test -- --run src/renderer/screens/DesignationsScreen.test.tsx
npm test -- --run --coverage src/renderer/screens/DesignationsScreen.test.tsx
npm run typecheck
npx eslint src/renderer/screens/DesignationsScreen.tsx src/renderer/screens/DesignationsScreen.test.tsx
```

## Resultado da validação

- 22 testes da tela passando.
- Cobertura da tela: 91,45% linhas e 78,66% branches (V8, teste focalizado).
- Typecheck Node e Web passaram; ESLint dos arquivos tocados passou.
- A suíte completa registrou 560/561 testes verdes; a falha é em `admin/src/renderer/App.test.tsx`,
  que ainda espera o título antigo `Histórico` após a mudança paralela da Task 12.
