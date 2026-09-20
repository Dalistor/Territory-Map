# [0223] Histórico completo paginado no desktop

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 12

## Solicitação

Transformar `HistoryScreen` em “Histórico completo”, com tabela de designações por período,
paginação do servidor e exclusão confirmada.

## Critérios de aceite

- Tabela semântica com território, publicador, retirada, devolução, situação e ação.
- Datas locais convertidas para início do primeiro dia e início do dia posterior ao último.
- Designações abertas exibidas como “Em andamento”.
- Filtros e limpeza voltam à página 1; paginação exibe faixa e total do servidor.
- Resposta antiga não substitui filtro novo; cabeçalho permanece no loading.
- Empty, no-results e erro possuem mensagens e ações próprias.
- Exclusão confirmada recarrega a primeira página.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Tabela semântica e designação aberta | `admin/src/renderer/screens/HistoryScreen.test.tsx` | Colunas e situação da página completa |
| 2 | Intervalo local semiaberto | `admin/src/renderer/screens/HistoryScreen.test.tsx` | Conversão de dias locais e consulta paginada |
| 3 | Reset de página | `admin/src/renderer/screens/HistoryScreen.test.tsx` | Mudança e limpeza de período recarregam página 1 |
| 4 | Resposta atrasada | `admin/src/renderer/screens/HistoryScreen.test.tsx` | Versão monotônica de requisição |
| 5 | Estados da tabela | `admin/src/renderer/screens/HistoryScreen.test.tsx` | Busy, empty e no-results estáveis |
| 6 | Erro e nova tentativa | `admin/src/renderer/screens/HistoryScreen.test.tsx` | Retry preservando o período |
| 7 | Exclusão | `admin/src/renderer/screens/HistoryScreen.test.tsx` | Confirmação e recalibração para página 1 |

## O que foi feito

- Substituída a consulta agrupada pela tabela paginada do histórico completo.
- Adicionado filtro de período com rótulos explícitos, limpeza e conversão local correta.
- Preservados confirmação destrutiva e uso exclusivo de `window.api`.
- Adicionada proteção contra resposta fora de ordem.

## Arquivos modificados

- `admin/src/renderer/screens/HistoryScreen.tsx` — nova consulta, tabela, filtros, paginação e estados.
- `admin/src/renderer/screens/HistoryScreen.test.tsx` — cobertura dos critérios observáveis.

## Decisões técnicas

O renderer não reordena itens: a ordem inicial vem integralmente do servidor. A compatibilidade
com uma lista legada evita queda do renderer se uma atualização abrir momentaneamente com preload
antigo; o contrato normal permanece a página tipada.

## Como validar

```bash
cd admin && npx vitest run src/renderer/screens/HistoryScreen.test.tsx
cd admin && npx vitest run --coverage src/renderer/screens/HistoryScreen.test.tsx
cd admin && npm run typecheck
```

## Resultado da validação

- `npx vitest run src/renderer/screens/HistoryScreen.test.tsx` — 7 testes passando.
- Cobertura do arquivo tocado: 93,90% de linhas e 89,47% de branches.
- `npm run typecheck` — concluído sem erros.
- A suíte completa rodou durante trabalho paralelo: 553 testes passaram e 6 falharam em `App`,
  `PublishersScreen` e `DesignationsScreen` por mudanças concorrentes. O lint global também apontou
  erros concorrentes em `DesignationsScreen.tsx` e `Dialog.tsx`; os arquivos desta implementação
  foram formatados e não tiveram erro próprio de lint.
