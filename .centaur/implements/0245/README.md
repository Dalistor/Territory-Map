# Implementação 0245: Campanhas no admin desktop — dados, IPC, página e exportações (spec 0017, Tasks 05–06)

## O que foi feito

### Task 05 — dados (main, IPC, preload)
1. `admin/src/shared/models.ts`: novos `CampaignBrief`, `CampaignDesignation` e `Campaign`;
   `Assignment.publisher` passou a opcional e ganhou `campaign` opcional (exatamente um dos dois);
   `Territory.campaign` opcional. Funções puras `campaignIsActive`, `assignmentIsCampaign`,
   `campaignHolderLabel` e `assignmentHolderName` — esta é a grafia única de "Campanha: <nome>"
   usada pelas telas e pelas duas exportações.
2. `shared/ipc-contract.ts`: sete canais `campaigns:*` (list, create, update, delete, designate,
   setPublishers, complete), `CampaignCreateInput`/`CampaignUpdateInput` e o namespace
   `window.api.campaigns`. `preload/index.ts` 1:1 com o contrato.
3. `main/api-client.ts`: as sete chamadas sobre as rotas finais da onda 1 (`/admin/campaigns`,
   `.../designations`, `.../designations/current/publishers` (PUT), `.../designations/current/complete`);
   `parseAssignment` aceita `user: null` + `campaign`; `parseTerritory` lê `campaign`. O filtro do
   histórico legado (array) não quebra mais com linha sem publicador. `GET /admin/campaigns/{id}` não
   ganhou canal: a lista já devolve a campanha inteira e nenhuma tela precisaria dele.
4. `main/ipc-handlers.ts`: um handler por canal, todos via `session.run`. Os erros novos
   (`campaign_active`, `territory_in_campaign`, `campaign_assignment`, `campaign_without_publishers`,
   `duplicate_name`) passam pelo `serializeError` existente e chegam ao renderer com a mensagem do
   servidor.

### Task 06 — telas e exportações
1. Sidebar ganhou **Campanhas** (ícone `flag`) entre Territórios e Publicadores.
2. `CampaignsScreen.tsx`: lista pesquisável à esquerda (nome, nº de territórios, situação: Em
   andamento / Concluída / Não designada) e detalhe à direita com Publicadores (designar, trocar,
   marcar como concluída), Territórios (lista + `AssignmentsMap` só com as demarcações da campanha;
   antes de designar, cada território mostra quem seria substituído) e Períodos (retirada, devolução,
   publicadores). Editar e Apagar no cabeçalho do detalhe.
3. `CampaignEditorDialog.tsx` (criar/editar): nome + territórios por lista pesquisável **ou pelo
   mapa** (`AssignmentsMap` ganhou `selectedIds` opcional, que pinta a seleção em vez do dirigente).
   Território em outra campanha ativa aparece desabilitado com "Na campanha "<nome>"".
4. `CampaignPublishersDialog.tsx` (designar e trocar publicadores): lista pesquisável de
   publicadores ativos (mais quem já está no período), confirmação desabilitada sem ninguém escolhido.
5. Confirmações em `confirmMessages.ts`: designar lista "território — dirigente" de quem será
   substituído (só pergunta quando há alguém); alterar territórios de campanha ativa lista
   substituídos e removidos; concluir diz que os territórios ficam sem dirigente e quem perde a
   marcação; apagar campanha que já foi designada avisa que as linhas somem dos cartões S-13 e que o
   trabalho das quadras fica. Apagar campanha **ativa** vai direto ao servidor e a tela mostra a
   mensagem do 409.
6. Linha/território de campanha nas demais telas: `TerritoryDetailDialog` mostra "Campanha: <nome>"
   como dirigente, "Pela campanha" no lugar de Editar/Apagar na linha, sem "Marcar como concluído", e
   o Designar fica desabilitado com a explicação (conclua a campanha ou tire o território dela);
   `DesignationsScreen` (coluna, situação, busca e contagem de designados), `AssignmentsMap`,
   `HistoryScreen` (sem Apagar na linha de campanha), `HomeScreen`, `TerritorySettingsScreen` e a
   dica de `TerritoryBlocksTab`.
7. `excel-export.ts` e `docx-handler.ts` escrevem "Campanha: <nome>" no lugar do publicador. O import
   S-13-T não mudou.

## Arquivos Afetados
- `admin/src/shared/models.ts`, `admin/src/shared/ipc-contract.ts`, `admin/src/preload/index.ts`
- `admin/src/main/api-client.ts`, `admin/src/main/ipc-handlers.ts`, `admin/src/main/excel-export.ts`,
  `admin/src/main/docx-handler.ts`
- `admin/src/renderer/App.tsx`, `components/Icon.tsx`, `map/AssignmentsMap.tsx`, `index.css`
- `admin/src/renderer/screens/CampaignsScreen.tsx`, `CampaignEditorDialog.tsx`,
  `CampaignPublishersDialog.tsx` (novos), `confirmMessages.ts`, `TerritoryDetailDialog.tsx`,
  `DesignationsScreen.tsx`, `HistoryScreen.tsx`, `HomeScreen.tsx`, `TerritorySettingsScreen.tsx`,
  `TerritoryBlocksTab.tsx`
- Testes: `api-client.test.ts`, `ipc-handlers.test.ts`, `excel-export.test.ts`,
  `docx-handler.test.ts`, `session.test.ts`, `CampaignsScreen.test.tsx` (novo),
  `DesignationsScreen.test.tsx`, `HistoryScreen.test.tsx`, `App.test.tsx` e o fake de `window.api`
  de `BlockEditorScreen`, `HomeScreen`, `SetupScreen` e `TerritoryEditorScreen`

## Verificação
- Risco vital coberto: linha com `user: null` quebrando cartão, Histórico e exportações — um caso de
  campanha em `excel-export.test.ts` (planilha e S-13-T), `docx-handler.test.ts`,
  `DesignationsScreen.test.tsx` (cartão S-13) e `HistoryScreen.test.tsx`; contrato HTTP em
  `api-client.test.ts`; repasse e erro serializado em `ipc-handlers.test.ts`;
  `CampaignsScreen.test.tsx` (criar com território bloqueado, designar com aviso de substituição,
  concluir, apagar ativa com a mensagem do 409).
- `npm run typecheck` sem erros; `npm test`: 32 arquivos, 608 testes passando; `npm run lint` sem
  avisos; `npm run build` (typecheck + electron-vite build) concluído.
- Pendente: demonstração manual em `npm run dev` contra servidor local (nenhuma janela foi aberta).
