# [0227] Histórico completo paginado no admin Android

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 19

## Solicitação

Criar a tab móvel de Histórico para consultar as designações que se sobrepõem ao período escolhido,
com cartões de território, publicador, retirada, devolução e situação.

## Contexto

O contrato paginado de designações já existe no cliente Android. A tela precisava traduzir as datas
de calendário que o administrador escolhe no aparelho para o intervalo de instantes semiaberto que
o servidor consulta, sem deixar uma resposta tardia substituir um filtro mais novo.

## Critérios de aceite

- Datas selecionadas viram início local do primeiro dia e início local do dia posterior ao último.
- Trocar ou limpar o período retorna à página 1 e descarta respostas obsoletas.
- Linhas mostram Território, Publicador, Retirada, Devolução e `Em andamento` para designação aberta.
- Estados vazio, sem resultados, erro recuperável e paginação têm mensagens distintas.
- A consulta é somente leitura: não há ação de apagar designação.
- A tab preserva a instância enquanto o usuário alterna destinos pelo navegador de tabs.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Fecha o intervalo no próximo início local de dia | `HistoryScreen.test.tsx` | `localDayRange` |
| 2 | Exibe designações devolvida e em andamento em cartões | `HistoryScreen.test.tsx` | `AssignmentCard` e `HistoryScreen` |
| 3 | Limpar período volta à primeira página e serializa o intervalo | `HistoryScreen.test.tsx` | estado de período e `filtersFor` |
| 4 | Resposta antiga não substitui o filtro novo | `HistoryScreen.test.tsx` | proteção por versão de consulta |
| 5 | Diferencia vazio, sem resultados e falha recuperável | `HistoryScreen.test.tsx` | composição com `QueryState` |
| 6 | Paginação mantém o controle de período visível | `HistoryScreen.test.tsx` | composição com `QueryPagination` |

## Validação

- `cd admin-app && npm test -- --runInBand src/presentation/screens/HistoryScreen.test.tsx src/presentation/App.test.tsx` — 22 testes aprovados.
- `cd admin-app && npm test -- --runInBand` — 301 testes aprovados em 17 suítes (há avisos de `act(...)` já emitidos por testes de Publicadores/Setup, sem falhas).
- `cd admin-app && npm run lint` — aprovado.
- `cd admin-app && npm run typecheck` — aprovado.

## Arquivos alterados

- `admin-app/src/presentation/screens/HistoryScreen.tsx`
- `admin-app/src/presentation/screens/HistoryScreen.test.tsx`
- `admin-app/src/presentation/App.tsx`
- `admin-app/src/presentation/App.test.tsx`
- `admin-app/src/presentation/screens/index.ts`

## Arquitetura

A tela permanece na camada `presentation`: recebe somente a interface mínima de sessão e cliente,
delega a consulta ao contrato `data` já existente e não reproduz no aparelho a regra de sobreposição
do servidor.
