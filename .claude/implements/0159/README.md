# [0159] Admin: o painel de trabalho da quadra

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0010/` — Task 09

## Solicitação
> Spec 0010 — Task 09: implemente por TDD `admin/src/renderer/screens/BlockWorkPanel.tsx`, com teste
> co-localizado `BlockWorkPanel.test.tsx`. Ele é o painel que a Task 10 vai expandir dentro da linha
> da tabela de quadras, então é um componente, não uma tela roteada: recebe o território e a quadra
> por prop, fala só com `window.api`, e avisa quem o chamou por um callback (`onChanged`) sempre que
> algo que muda a cor da quadra acontece. Histórico (reaproveitando `workLogWasSyncedLate` e a
> formatação da `BlockHistorySheet`), adicionar registro pelo `MarkWorkedForm` da Task 08, apagar com
> confirmação, e um controle de status com "Automático", "Vencida (laranja)" e "Nunca trabalhada
> (vermelha)", deixando visível na interface o que o forçado faz e quando ele se desfaz.

## Contexto
A spec 0010 leva a tabela de quadras para a `TerritorySettingsScreen`, e cada linha expande o
histórico daquela quadra. Este painel é o conteúdo dessa expansão. Ele fecha o lado do renderer da
coluna `Block.status_override` criada nas tasks 01–07: até aqui o status forçado existia no banco,
no HTTP, no modelo compartilhado, na regra de cor e no IPC, mas não havia nenhum lugar na interface
onde o admin pudesse escolhê-lo.

O ponto delicado do texto da tela é o override se desfazer sozinho no primeiro registro de trabalho
novo (Task 03). Sem dizer isso na interface, o admin lê o comportamento correto do servidor como o
sistema tendo desfeito a escolha dele sem avisar.

## Critérios de aceite
- Lista os registros da quadra com publicador e data, na ordem que o servidor mandou (mais recente
  primeiro), e mostra "Esta quadra nunca foi trabalhada." quando não há nenhum.
- Marca o registro que chegou tarde ao servidor, e não marca o que chegou em tempo.
- Adicionar chama `workLogs.markWorked` com a quadra, o publicador e a data escolhidos, recarrega a
  lista e dispara `onChanged`; o publicador designado ao território vem pré-selecionado.
- Cancelar o formulário não registra nada e não dispara `onChanged`.
- Apagar pede confirmação nomeando o publicador e a data; cancelar não chama `workLogs.delete`.
- Apagar confirmado chama a API, recarrega e dispara `onChanged`.
- O controle de status mostra a opção correspondente ao `statusOverride` atual, inclusive
  "Automático" quando não há nenhum.
- "Vencida" chama `blocks.update` com `{ statusOverride: 'overdue' }`, "Nunca trabalhada" com
  `'never'` e "Automático" com `null`, e cada um dispara `onChanged`.
- Um erro vindo de qualquer uma dessas chamadas aparece no painel; nenhuma delas dispara `onChanged`
  ao falhar, e um status recusado volta à opção anterior.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | lists each work log with its publisher and date | `admin/src/renderer/screens/BlockWorkPanel.test.tsx` | carga por `workLogs.listFor` e a lista, com `formatDateTime` |
| 2 | keeps the order the server sent, most recent first | idem | render sem reordenar |
| 3 | shows its own message when the block was never worked | idem | estado vazio |
| 4 | notes a record that reached the server well after it was worked | idem | `workLogWasSyncedLate` |
| 5 | does not note a record that reached the server on time | idem | idem |
| 6 | shows the failure when the history cannot be loaded | idem | `role="alert"` com `parseIpcError` |
| 7 | preselects the publisher the territory is assigned to | idem | `MarkWorkedForm` com `preselectedPublisherId` |
| 8 | records the chosen publisher and date, reloads and reports the change | idem | `addWorkLog` |
| 9 | closes the form without recording anything when the admin cancels | idem | `onCancel` do formulário |
| 10 | shows the failure and does not report a change when the marking is refused | idem | `catch` de `addWorkLog` |
| 11 | asks for confirmation naming the publisher and the date | idem | diálogo de confirmação |
| 12 | does not delete anything when the confirmation is cancelled | idem | botão Cancelar do diálogo |
| 13 | deletes, reloads and reports the change once confirmed | idem | `confirmDelete` |
| 14 | shows the failure when the deletion is refused | idem | `catch` de `confirmDelete` |
| 15 | shows "Automático" when the block has no forced status | idem | estado `status` derivado de `block.statusOverride` |
| 16 | shows the option matching the forced status the block already carries | idem | idem |
| 17 | forces the block overdue and reports the change | idem | `changeStatus` → `blocks.update` |
| 18 | forces the block to never worked and reports the change | idem | idem |
| 19 | gives the block back to the automatic colour and reports the change | idem | `'auto'` → `null` |
| 20 | says what the forced colour does and what undoes it | idem | `.block-work-status-note` |
| 21 | shows the failure and keeps the previous option when the change is refused | idem | rollback do `status` no `catch` |

## O que foi feito
Criado o componente `BlockWorkPanel`, com três seções: o controle de status forçado (com a nota que
explica o alcance e o desfazimento automático), o histórico da quadra e o formulário de adicionar,
mais o diálogo de confirmação de remoção. Estilos próprios em `index.css`.

## Arquivos criados
- `admin/src/renderer/screens/BlockWorkPanel.tsx` — o painel de trabalho de uma quadra.
- `admin/src/renderer/screens/BlockWorkPanel.test.tsx` — 21 casos cobrindo os critérios de aceite.

## Arquivos modificados
- `admin/src/renderer/index.css` — classes `.block-work-panel`, `.block-work-status`,
  `.block-work-status-note` e `.block-work-history`.

## Decisões técnicas
- **`onChanged` só dispara em sucesso.** Um erro não mudou a cor de nada, e recarregar a página
  acima nesse caso apagaria a mensagem de erro que o admin ainda não leu.
- **O painel não reordena o histórico.** `BlockWorkLogRepository.list_for_block` já responde por
  `worked_at DESC` (é o índice `ix_block_work_logs_block_id_worked_at`). Ordenar de novo no cliente
  criaria uma segunda fonte de ordem, que divergiria em silêncio se a do servidor mudasse. Há um
  teste fixando que a ordem recebida é a exibida.
- **O `<select>` guarda `'auto'` em vez de `null`.** `<option>` só carrega string; a tradução para
  `null` acontece num ponto só, na chamada a `blocks.update`.
- **Status recusado volta à opção anterior.** Deixar o controle na escolha refusada mostraria ao
  admin um status que a quadra não tem — pior que o erro em si.
- **Formatação e aviso de sincronização tardia vieram da `BlockHistorySheet`**, como a task pediu:
  `workLogWasSyncedLate` é importado de `shared/models`, e `formatDateTime` é a mesma função de duas
  linhas. Não foi extraída para um módulo comum porque isso mexeria na `BlockHistorySheet`, que está
  fora do escopo desta task.
- **Erro exibido é o do servidor, não um genérico.** `parseIpcError` só cai no texto de fallback
  quando o erro não traz mensagem — os testes de falha afirmam a mensagem real que chega ao painel
  (os quatro casos de erro nasceram com a asserção errada, esperando o fallback, e foram corrigidos
  para a asserção mais forte).

## Como validar
```bash
cd admin && npx vitest run src/renderer/screens/BlockWorkPanel.test.tsx
```

## Resultado da validação
- `npx vitest run src/renderer/screens/BlockWorkPanel.test.tsx` — 21 testes passando.
- `npx vitest run` (suíte do admin) — 26 arquivos, 491 testes passando.
- Cobertura de `BlockWorkPanel.tsx`: 100% de linha, 100% de branch, 100% de função.
- `npx eslint src/renderer/screens/BlockWorkPanel.tsx BlockWorkPanel.test.tsx` — limpo (o único
  warning restante em `src/renderer/` é pré-existente em `TerritoryEditorScreen.tsx`, fora do escopo).
- `npx tsc --noEmit -p tsconfig.web.json` — sem erros.
