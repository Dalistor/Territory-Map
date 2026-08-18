# [0125] Admin: painel de histórico de designações e exportação para Excel (spec 0007, Task 11)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0007/` — Task 11

## Solicitação

Spec 0007 — Task 11: transformar o diálogo de atribuição da página Designações num **painel de
histórico** (designação atual, histórico de designações concluídas com "Apagar", e as ações
"Designar a…" e "Marcar como concluído"), acrescentar o botão **"Exportar para Excel"** no cabeçalho
da tela, e atualizar os fakes de `window.api` dos testes do renderer que deixaram de compilar quando
a Task 08 removeu `territories.assign` do contrato IPC.

## Contexto

A designação deixou de ser um campo sobrescrito e virou registro histórico (`TerritoryAssignment`,
Tasks 01–07). O renderer era o último cliente do caminho antigo: chamava
`window.api.territories.assign(territoryId, userId | null)`, método que a Task 08 apagou do
`ipc-contract.ts` — o que deixou `npm run typecheck` vermelho de propósito até esta task. As APIs
`window.api.assignments.*` e `window.api.exports.assignments()` já existiam de ponta a ponta
(Tasks 09 e 10).

## Critérios de aceite

- Abrir o painel de um território designado mostra o dirigente atual com a data de início e as
  designações concluídas no histórico (a aberta nunca aparece no histórico).
- Designar a um publicador ativo chama `assignments.designate(territoryId, publisherId)` e recarrega
  **o histórico e a lista de territórios** (a projeção `assignedUser` muda).
- Designar quando já há designação aberta pede confirmação avisando que a atual será **encerrada com
  a data de hoje**; designar um território livre não pergunta nada.
- "Marcar como concluído" confirmado chama `assignments.complete(territoryId)`; recusado na
  confirmação não chama nada.
- "Apagar" numa linha do histórico confirmado chama `assignments.delete(territoryId, assignmentId)`
  com o id daquela linha; recusado não chama nada. A mensagem diz que o registro sai do histórico.
- Território sem designação: mostra "Sem dirigente", não oferece "Marcar como concluído" e ainda
  permite designar.
- Falha de qualquer ação vira `role="alert"` com `parseIpcError`, sem quebrar a tela.
- "Exportar para Excel" com caminho devolvido mostra `role="status"` com o caminho; `null`
  (cancelado) não mostra confirmação nem erro; rejeição vira `role="alert"`.
- Publicadores desativados continuam fora da lista de opções, e a opção "Nenhum" deixou de existir.

## Ciclos TDD

Um ciclo por comportamento; todos no mesmo par de arquivos, o que permitiu um RED coletivo
(13 testes vermelhos pelo motivo certo — painel e exportação inexistentes) seguido do GREEN.

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | mostra o dirigente atual com a data de início e as designações concluídas no histórico | `admin/src/renderer/screens/DesignationsScreen.test.tsx` | painel `role="dialog"` com "Designação atual", lista `Histórico` e `formatDate` |
| 2 | designar chama `designate` com os dois ids e recarrega | idem | `designate` + `reloadAfterAction` (histórico **e** `listWithBlocks`) |
| 3 | avisa que a designação atual será encerrada hoje antes de designar outra pessoa | idem | `replaceConfirmMessage` via `runConfirmed` |
| 4 | "Marcar como concluído" chama `complete` confirmado, nada quando recusado | idem | botão condicional + `completeConfirmMessage` |
| 5 | "Apagar" apaga aquela designação confirmada, nada quando recusada | idem | botão por linha com `aria-label` e `deleteAssignmentConfirmMessage` |
| 6 | falha de ação vira alerta sem quebrar a tela | idem | `runAction` reaproveitado |
| 7 | território sem designação: "Sem dirigente", sem conclusão, ainda designa, sem confirmação | idem | ramo `openAssignment === undefined` |
| 8 | publicadores desativados fora das opções, e sem opção "Nenhum" | idem | filtro `isActive` e remoção do rádio "Nenhum" |
| 9 | falha ao carregar publicadores vira alerta | idem | `try/catch` de `openPanel` |
| 10 | "Fechar" fecha o painel sem chamar nada | idem | botão `Fechar` |
| 11 | exportação mostra onde a planilha foi salva | idem | botão "Exportar para Excel" + `role="status"` |
| 12 | cancelar a exportação não diz nada | idem | ramo `path === null` |
| 13 | falha da exportação vira alerta | idem | `exportToExcel` dentro de `runAction` |

## O que foi feito

- `DesignationsScreen` reescrita: o diálogo de escolha de publicador virou painel de histórico com
  três seções (Designação atual / Histórico / Designar a…) e quatro ações (designar, concluir,
  apagar registro, fechar), mais o botão de exportação no cabeçalho.
- Os fakes de `window.api` dos testes do renderer perderam `territories.assign` e ganharam os
  namespaces `assignments` e `exports`, devolvendo `npm run typecheck` ao verde.
- CSS do painel em `index.css`, reaproveitando `.assign-options`, `.dialog-actions`,
  `.dialog-subtitle` e `.status-badge`, com duas classes novas para o painel e a lista.

## Arquivos modificados

- `admin/src/renderer/screens/DesignationsScreen.tsx` — painel de histórico, três ações confirmadas
  por `window.confirm`, recarga dupla após cada escrita, botão de exportação.
- `admin/src/renderer/screens/DesignationsScreen.test.tsx` — reescrito para o painel; 16 testes.
- `admin/src/renderer/index.css` — `.assignment-panel`, `.assignment-panel h3` e
  `.assignment-history`.
- `admin/src/renderer/App.test.tsx`, `screens/HomeScreen.test.tsx`, `screens/SetupScreen.test.tsx`,
  `screens/BlockEditorScreen.test.tsx`, `screens/TerritoryEditorScreen.test.tsx` — fakes de
  `window.api` atualizados (sem `territories.assign`, com `assignments` e `exports`).

## Arquivos criados

Nenhum.

## Decisões técnicas

- **Designar um território livre não pede confirmação.** `window.confirm` fica só onde algo é
  destruído ou encerrado: substituir alguém (encerra a designação aberta com a data de hoje),
  concluir (tira o acesso do publicador na hora) e apagar (some do histórico). Perguntar também no
  caso inofensivo treinaria o admin a clicar "OK" sem ler — que é exatamente o que os outros três
  avisos precisam evitar.
- **Toda ação recarrega histórico *e* lista de territórios.** `Territory.assignedUser` é projeção da
  designação aberta no servidor, então designar/concluir/apagar mexe nos dois; recarregar só o
  painel deixaria o mapa e o contador da tela mentindo.
- **`assignmentIsCompleted` como *type predicate*.** Ela é a negação de `assignmentIsOpen`, e dizer
  isso no tipo (`assignment is Assignment & { completedAt: Date }`) elimina do JSX um ramo defensivo
  "e se não tiver data de conclusão?" que nunca poderia rodar — o ramo existia e ficava sem
  cobertura por ser inalcançável.
- **`aria-label` do "Apagar" inclui o nome do publicador** — é o que dá ao teste (e ao leitor de
  tela) como distinguir uma linha do histórico da outra, já que o rótulo visível é igual em todas.
- **Fakes de `window.api` atualizados por script, não à mão**, nos cinco arquivos afetados: a
  remoção de `territories.assign` aparecia 30+ vezes e o risco de divergência manual era maior que
  o do `sed`. O resultado foi conferido com `git diff`, `npm run typecheck` e a suíte inteira.
- **Deliberadamente sem teste:** as guardas `panelTarget === null` / `selectedPublisherId === null`
  no início dos handlers e o fallback `?? 'este publicador'` do nome no aviso de substituição. São
  invariantes de renderização (os botões só existem com o painel aberto, e "Designar" fica
  `disabled` sem seleção) — testá-las exigiria chamar o handler fora da tela, o que testaria o teste.
  São a única fonte dos 14% de branch descoberto do arquivo.

## Como validar

```bash
cd admin
npx vitest run src/renderer/screens/DesignationsScreen.test.tsx   # esta implementação
npm test && npm run typecheck && npm run lint                      # a suíte inteira
```

## Resultado da validação

- `npx vitest run src/renderer/screens/DesignationsScreen.test.tsx` → **16 testes passando**.
- `npm test` → **369 testes passando em 21 arquivos** (era 353 antes; nenhum regrediu).
- `npx vitest run --coverage` em `DesignationsScreen.tsx` → **100% linhas, 100% funções,
  97,22% statements, 85,71% branches** (o descoberto é o listado em "Decisões técnicas").
- `npm run typecheck` → **limpo** (node e web); era vermelho antes desta task, por causa de
  `territories.assign` nos fakes do renderer.
- `npm run lint` → 0 erros. Resta **1 warning pré-existente** de formatação em
  `src/renderer/screens/TerritoryEditorScreen.tsx:103`, arquivo fora do escopo desta task (o mesmo
  warning existe no `HEAD` anterior à mudança) — não foi tocado para respeitar o limite de arquivos
  da task.
