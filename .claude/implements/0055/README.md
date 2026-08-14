# [0055] `BlockHistorySheet` do admin Electron

**Data:** 2026-08-08
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0003/` — Task 18

## Solicitação

Implementar por TDD `admin/src/renderer/screens/BlockHistorySheet.tsx` (+ teste, fake de
`window.api.workLogs.*`), portando `admin/lib/presentation/block_history_sheet.dart` (removido junto
com o resto do admin Flutter na Task 01 da spec 0003, ainda legível no histórico do git em `9165f19`).
Recebe um território e uma quadra, carrega `workLogs.listFor(block.id)`. Cada registro mostra o nome
do publicador e a data/hora em que foi trabalhado; quando `workLogWasSyncedLate` é verdadeiro, mostra
também "sincronizado em {createdAt}". Cada registro oferece remover, com confirmação nomeando o
publicador e a data, e avisando que a data de "última vez trabalhada" da quadra será recalculada;
confirmando, chama `workLogs.delete(log.id)` e, em caso de sucesso, recarrega a lista de registros e
chama uma prop `onWorkLogDeleted?: () => void`. Lista vazia mostra "Esta quadra nunca foi
trabalhada." Erro de carregamento ou de remoção aparece como mensagem visível.

## Contexto

Última das seis telas portadas do admin Flutter para Electron + React nesta spec. A app só pode
*adicionar* um `BlockWorkLog` — apagar um é privilégio exclusivo do admin, e apagar reescreve
`Block.lastWorkedAt` a partir do que sobrar no servidor. Por isso a nota "sincronizado em ..." importa:
a lacuna entre `workedAt` (relógio do celular) e `createdAt` (quando chegou ao servidor) é a fila
offline drenando, não um relógio errado; sem a nota, uma sincronização atrasada pareceria uma data
incorreta. E por isso a tela nunca busca territórios sozinha para recolorir o mapa — isso é
responsabilidade de quem a usa, sinalizada só por um callback.

## Critérios de aceite

1. Mostra um estado de carregamento enquanto `workLogs.listFor` está pendente.
2. Lista vazia mostra "Esta quadra nunca foi trabalhada."
3. Cada registro mostra o nome do publicador e a data/hora de `workedAt`.
4. Quando `workLogWasSyncedLate(log)` é verdadeiro, mostra também "sincronizado em {createdAt}".
5. Quando é falso, a nota não aparece.
6. Erro ao carregar (rejeição com `Error`) mostra a mensagem do erro; rejeição sem `Error` cai num
   texto genérico.
7. Clicar em "Remover" abre uma confirmação nomeando o publicador e a data, sem chamar
   `workLogs.delete` ainda.
8. Cancelar a confirmação fecha o diálogo sem chamar `workLogs.delete`.
9. Confirmar chama `workLogs.delete(log.id)`, recarrega a lista (`listFor` é chamado de novo) e
   chama `onWorkLogDeleted`.
10. Erro ao remover mostra a mensagem visível e **não** chama `onWorkLogDeleted`.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `shows a loading state while the work logs load` | `BlockHistorySheet.test.tsx` | Componente completo (`load`, estados de loading/erro/lista vazia, diálogo de confirmação, `confirmDelete`) — o primeiro ciclo já exigiu a maior parte da estrutura, porque o estado de carregamento depende do fluxo inteiro de `useEffect`/`useState` |
| 2 | `shows the empty state message when the block was never worked` | idem | confirma o ramo `logs.length === 0` |
| 3 | `shows the publisher name and the worked-at date for each log` | idem | confirma a renderização de `log.publisher.name` e `formatDateTime(log.workedAt)` |
| 4 | `shows a "synced late" note when...` | idem | confirma o ramo `workLogWasSyncedLate(log)` verdadeiro |
| 5 | `does not show a "synced late" note when...` | idem | confirma o ramo falso |
| 6 | `shows a visible error message when loading the history fails` | idem | confirma `errorMessage` com `Error` |
| 7 | `falls back to a generic error message when loading fails without an Error message` | idem | confirma o fallback de `errorMessage` |
| 8 | `asks for confirmation naming the publisher and the date before removing a record` | idem | confirma o diálogo (`role="dialog"`) e que `delete` não é chamado antes da confirmação |
| 9 | `does not call workLogs.delete when the removal is cancelled` | idem | confirma "Cancelar" fechando o diálogo sem chamar `delete` |
| 10 | `deletes the log, reloads the list and calls onWorkLogDeleted when confirmed` | idem | confirma `confirmDelete`: `delete`, `load` de novo, `onWorkLogDeleted` |
| 11 | `shows a visible error message and does not call onWorkLogDeleted when removal fails` | idem | confirma o `catch` de `confirmDelete` |

O primeiro ciclo (RED de verdade, rodado antes de qualquer código de produção existir: falha por
`Failed to resolve import "./BlockHistorySheet"`) já cobriu quase toda a estrutura porque o estado de
carregamento é o comportamento mais externo do componente — os ciclos seguintes checaram os demais
ramos sobre a mesma implementação, sem exigir mudança estrutural nova a cada um (todos passaram já na
primeira execução depois de escritos, o que é esperado quando os ramos já estavam cobertos pela forma
geral do componente).

## O que foi feito

- Componente `BlockHistorySheet` com estados `logs`, `isLoading`, `error`, `pendingDeleteId`.
- `load()` (memoizado com `useCallback`, chamado no `useEffect` de montagem) busca
  `window.api.workLogs.listFor(block.id)`.
- `formatDateTime` — `dd/mm/aaaa hh:mm` em horário local, mesma forma de `_formatDate` do Dart.
- `errorMessage` — usa `error.message` quando é um `Error` com mensagem, senão um texto genérico
  (curinga entre carregamento e remoção, cada um com seu próprio fallback).
- Diálogo de confirmação (`role="dialog"`) só aparece quando `pendingDeleteId` aponta para um log
  presente na lista atual; "Remover" no diálogo dispara `confirmDelete(log)`, que fecha o diálogo
  antes de chamar `workLogs.delete` — mesma ordem do Dart (`Navigator.pop(true)` primeiro, chamada de
  API depois), o que evita um diálogo pendurado em caso de erro de rede.

## Arquivos criados

- `admin/src/renderer/screens/BlockHistorySheet.tsx` — a tela.
- `admin/src/renderer/screens/BlockHistorySheet.test.tsx` — 11 testes com React Testing Library e um
  fake de `window.api.workLogs`.

## Decisões técnicas

- **`onWorkLogDeleted` em vez de a própria tela invalidar territórios.** Mesma divisão de
  responsabilidade da spec: quem usa este componente (a `HomeScreen`, Task 14, já concluída) decide o
  que fazer com o mapa; esta tela só sinaliza que algo mudou.
- **Diálogo fecha antes da chamada de rede, não depois.** Copia o comportamento do
  `_BlockHistorySheet` em Dart, onde a confirmação já retornou `true` e o `AlertDialog` já foi
  descartado antes de `api.deleteWorkLog` ser chamado — um erro de rede na exclusão vira uma mensagem
  na tela principal, não um diálogo travado.
- **`eslint-disable-next-line react-hooks/set-state-in-effect`** no `useEffect` de carregamento, com
  o mesmo comentário-justificativa já usado em `PublishersScreen.tsx` e `HomeScreen.tsx` (Tasks 14 e
  17, concluídas em paralelo): a regra assume um modelo de dados com Suspense, que este projeto não
  usa — o padrão real é "carrega ao montar, atualiza estado quando a promise resolve". Segui a
  convenção já estabelecida em vez de inventar uma nova.
- **Sem teste dedicado para "duas execuções concorrentes de `load`"** (ex. remover duas vezes rápido)
  — fora do critério de aceite pedido, e o Dart original também não trata isso; não simular
  comportamento que a spec não pediu.
- **Mock de `window.api`**: fake completo de `IpcApi['workLogs']` (com `vi.fn()` para os dois
  métodos), atribuído a `window.api` a cada teste — nunca o IPC real, seguindo a mesma convenção de
  `PublishersScreen.test.tsx`/`HomeScreen.test.tsx`.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/BlockHistorySheet.test.tsx
npx vitest run src/renderer/screens/BlockHistorySheet.test.tsx --coverage --coverage.include='src/renderer/screens/BlockHistorySheet.tsx'
npm run lint
npm run typecheck
npm test
```

## Resultado da validação

- `npx vitest run src/renderer/screens/BlockHistorySheet.test.tsx` → **11 testes passando**.
- Cobertura do arquivo tocado (`BlockHistorySheet.tsx`): **100% statements, 100% branches, 100%
  functions, 100% lines** (32/32, 16/16, 12/12, 30/30).
- `npm run lint` → limpo (o único apontamento real, `react-hooks/set-state-in-effect`, foi resolvido
  com o mesmo `eslint-disable` documentado já usado nas telas irmãs).
- `npm run typecheck` (node + web) → limpo.
- `npm test` (suíte inteira do admin, incluindo o que as Tasks 12–17 mergearam em paralelo) →
  **251 testes passando em 15 arquivos**, sem regressão.
