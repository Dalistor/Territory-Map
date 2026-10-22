# Implementação 0248: Campanhas em modo consulta no app admin (spec 0017, Task 08)

## O que foi feito
1. **Domínio** (`admin-app/src/domain/`): `models.ts` ganhou `CampaignBrief`, `Campaign` e `CampaignDesignation`; `Assignment.publisher` passou a `PublisherBrief | null` e ganhou `campaign?: CampaignBrief | null` (exatamente um dos dois, como no contrato); `Territory` ganhou `campaign?: CampaignBrief | null`. `assignment.ts` ganhou `campaignLabel`, `isCampaignAssignment` e `assignmentHolderLabel` ("Campanha: <nome>" no lugar do dirigente). `territoryMap.ts` ganhou `territoryIsHeld` (dirigente **ou** campanha ativa) e `territoryLeaderLabel` passou a dizer "Campanha: <nome>" — o mapa herda o rótulo e a cor azul sem tocar no componente nativo.
2. **Dados** (`data/api-client.ts`): `listCampaigns()` (`GET /admin/campaigns`) e `getCampaign(id)` (`GET /admin/campaigns/{id}`), só leitura; o parser de designação aceita `user: null` + `campaign`, e o de território lê `campaign`. As telas chamam as duas por `session.run`, como as demais leituras.
3. **Cartão S-13** (`AssignmentPanel`): linha de campanha mostra "Campanha: <nome>" e não tem Editar/Apagar; com campanha ativa (linha aberta de campanha, ou `territory.campaign` antes de o cartão carregar) o bloco de designar e o "Marcar como concluído" são substituídos por um aviso (`campaignLockMessage`) dizendo que designar individualmente exige concluir a campanha no computador e que marcar quadras continua disponível. Se o território entrou em campanha depois de carregado, o 409 `territory_in_campaign` aparece com a mensagem do servidor (caminho de erro já existente, agora testado).
4. **Lista/mapa de territórios** (`DesignationsScreen`): "Campanha: <nome>" no lugar do dirigente, selo "Em campanha", inicial da campanha no avatar, busca pelo rótulo, e o território em campanha conta como designado no resumo. O atalho "Marcar como concluído" continua só para dirigente individual (`assignedPublisher` é null em campanha). `TerritoryDetailScreen` mostra "Campanha: <nome>" no resumo; `HistoryScreen` mostra o rótulo da campanha nas linhas sem publicador.
5. **Consulta de campanhas**: nova aba **Campanhas** (ícone próprio em `TabIcon`) com `CampaignsScreen` (nome, "Ativa desde …"/"Ainda não designada"/"Concluída", nº de territórios) e a tela de pilha `CampaignDetailScreen` (territórios por número, publicadores designados, períodos com datas e publicadores). Nenhum botão de criar, editar, designar, concluir ou apagar campanha; as duas telas dizem que isso é feito no admin do computador.

## Arquivos Afetados
- `admin-app/src/domain/models.ts`, `assignment.ts` (+ teste), `territoryMap.ts` (+ teste), `models.test.ts`, `appUpdate.ts`
- `admin-app/src/data/api-client.ts` (+ teste), `session.test.ts`
- `admin-app/src/presentation/App.tsx` (+ teste), `components/TabIcon.tsx`
- `admin-app/src/presentation/screens/AssignmentPanel.tsx` (+ teste), `DesignationsScreen.tsx` (+ teste), `TerritoryDetailScreen.tsx`, `HistoryScreen.tsx`, `index.ts`
- Novos: `admin-app/src/presentation/screens/CampaignsScreen.tsx`, `CampaignDetailScreen.tsx`, `CampaignsScreen.test.tsx`

## Desvios
- `domain/appUpdate.ts`: `tsc --noEmit` já falhava antes desta task (`String(payload.app)` atribuído a `'app' | 'admin-app'`); corrigido com um cast tipado para o gate de typecheck ficar verde. Sem mudança de comportamento.
- Detalhe da campanha é tela de pilha separada (`CampaignDetailScreen`), no mesmo padrão Publicadores → histórico do publicador da 0015.

## Verificação
- `npm test` no `admin-app/`: 23 suítes, 341 testes passando (eram 328).
- `npm run lint`: sem erros nem avisos. `npm run typecheck`: limpo.
- Sem Gradle (sem JDK 17): nenhuma tela vista em emulador.
