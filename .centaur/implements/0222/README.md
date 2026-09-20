# [0222] Histórico de territórios por publicador no desktop

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 11

## Solicitação

Implementar em `PublishersScreen` o padrão lista + detalhe: selecionar uma pessoa consulta o
histórico de territórios retirados e devolvidos, sem confundir designações com logs de quadra.

## Contexto

A consulta por pessoa precisava expor o cartão histórico de territórios diretamente da lista de
Publicadores, mantendo as ações de designar e concluir exclusivamente em Territórios.

## Critérios de aceite

- Selecionar uma pessoa consulta `assignments.listAll` com `publisherId` e mostra território,
  nome histórico, retirada e devolução ou `Em andamento`.
- Pessoa sem designações recebe estado vazio explícito; páginas seguintes são anexadas ao detalhe.
- Renomear ou ativar/desativar conserva a seleção e a busca local; apagar fecha o detalhe.
- Falha oferece tentativa novamente, e fechar devolve o foco ao gatilho da pessoa.
- O detalhe não apresenta logs de quadra como saída de campo.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Seleciona pessoa e mostra somente histórico de designações | `admin/src/renderer/screens/PublishersScreen.test.tsx` | Consulta paginada e painel de histórico |
| 2 | Pessoa sem histórico | `admin/src/renderer/screens/PublishersScreen.test.tsx` | Estado vazio do painel |
| 3 | Carrega página seguinte sem descartar a anterior | `admin/src/renderer/screens/PublishersScreen.test.tsx` | Paginação incremental |
| 4 | Renomear/alterar atividade preserva seleção e busca | `admin/src/renderer/screens/PublishersScreen.test.tsx` | Seleção por id estável |
| 5 | Falha, retry, fechamento e exclusão | `admin/src/renderer/screens/PublishersScreen.test.tsx` | Estado de erro, foco de retorno e limpeza de detalhe |

## O que foi feito

Adicionado um painel de consulta de designações por publicador, com tabela de território,
publicador no momento do registro, retirada e devolução. A lista preserva as capacidades já
existentes de cadastro e gestão.

## Arquivos modificados

- `admin/src/renderer/screens/PublishersScreen.tsx` — seleção, consulta, paginação e painel local.
- `admin/src/renderer/screens/PublishersScreen.test.tsx` — fakes da consulta e cenários de interação.

## Decisões técnicas

O painel usa o nome copiado em `AssignmentWithTerritory.publisher`, não o nome atual da lista:
renomeações posteriores não reescrevem um registro histórico. A busca é estado local da lista e
não é alterada por paginação ou reload de uma escrita.

## Como validar

```bash
cd admin && npm test -- --run src/renderer/screens/PublishersScreen.test.tsx --coverage
```

## Resultado da validação

O comando acima passou com 44 testes. Para `PublishersScreen.tsx`, a cobertura medida foi 93,29%
de linhas e 87,87% de branches. `npm run typecheck:web` foi executado, mas permanece vermelho por
erros preexistentes/contemporâneos em `DesignationsScreen.tsx` e `HistoryScreen.tsx`, fora do
escopo desta task.
