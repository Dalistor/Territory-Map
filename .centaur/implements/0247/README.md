# Implementação 0247: Aba Campanhas e mapa da campanha no app do publicador (spec 0017, Task 07)

**Regras:** CMP-07, CMP-08 (`campanhas@1`). **Modo:** direto, com testes nos pontos vitais.

## O que foi feito
1. **Domínio.** `Campaign` (`id`, `name`, `startedAt`, `territoryIds`) e `CampaignBrief` em
   `domain/models.ts`; `Territory.campaign` opcional. Em `domain/assignment.ts`, a nova
   `canMarkBlocksOf(territory, userId, myCampaigns)` responde "posso marcar quadras aqui?": designação
   individual **ou** território de uma campanha ativa do publicador — os mesmos dois caminhos que o
   servidor aceita. `isTerritoryAssignedToMe` ficou como estava (só designação individual: lista
   "Território(s) designado(s)", selo "Designado a você", filtro "Meu(s) território(s)").
   `myCampaignHolding` diz qual campanha do publicador contém o território. A lista de campanhas vem
   de `GET /app/campaigns`, que só devolve campanhas ativas do próprio publicador — estar nela já é a
   permissão. `formatDate` (dd/mm/aaaa, à mão por causa do Intl do Hermes) passou a ser exportada de
   `lastWorked.ts` para o "desde" dos cartões.
2. **Dados.** `api-client.ts`: `listCampaigns` (`GET /app/campaigns`) e `campaign` lido em cada
   território (`null`/ausente → `undefined`). `territory-cache.ts`: `saveCampaigns`/`getCachedCampaigns`
   numa chave própria; `clearCache` limpa as duas.
3. **App.tsx.** No arranque, depois de `listTerritories` confirmar o token, as campanhas são buscadas e
   cacheadas — em melhor esforço: falha aqui nunca derruba a sessão. `withOfflineFallback` agora cobre
   `listCampaigns` também (helper `readWithCacheFallback`), então a aba e o mapa da campanha abrem sem
   rede. Rota `Map` ganhou `campaignId`.
4. **DashboardScreen.** Terceira aba **Campanhas** entre "Meus Territórios" e "Histórico" (o rótulo
   "Histórico de Trabalho" da aba encurtou para "Histórico" para três segmentos caberem na largura do
   celular; o título da seção continua "Histórico de Trabalho"). Abas extraídas em `TabButton`, com
   `accessibilityRole="tab"`, estado selecionado anunciado e alvo de 44 dp. Cartão por campanha: nome,
   "N territórios · desde dd/mm/aaaa", os nomes dos territórios quando o mapa os tem, e "Ver no mapa".
   Estado vazio explica o que é campanha; erro fica dentro da aba, sem travar o resto da tela.
5. **MapScreen / map.** Novo modo de filtro `{mode: 'campaign', campaignId}` em `territoryFilter.ts`
   (função pura `visibleTerritories` + `showsBlocks`), com um chip "Campanha: <nome>" por campanha
   ativa. O enquadramento é o que o `TerritoryMapView` já fazia — `fitBounds` sobre os territórios
   visíveis —, então abrir a campanha enquadra todos os territórios dela. No modo campanha as quadras
   aparecem e os nomes dos territórios continuam visíveis (prop nova `showTerritoryLabels`), porque são
   vários grupos de quadras ao mesmo tempo. Tocar numa quadra usa `canMarkBlocksOf`; o contorno "meu"
   no mapa também. Cartão flutuante da campanha (nome, contagem, desde) e, quando a campanha já não
   está entre as do publicador, a frase "Esta campanha não está mais ativa para você".
6. **403 `territory_not_assigned` na marcação** (campanha ou designação concluída entre o carregamento
   e o toque): mensagem clara ("este território não está mais designado a você — a designação ou a
   campanha pode ter sido concluída. O mapa foi atualizado.") e recarga de territórios e campanhas.
   Outros erros da API continuam mostrando o `detail` do servidor. Sem fila offline: marcar sem rede
   avisa e não marca, como antes.

## Arquivos afetados
- `app/src/domain/models.ts`, `assignment.ts` (+ teste), `lastWorked.ts`
- `app/src/data/api-client.ts` (+ teste), `territory-cache.ts` (+ teste)
- `app/src/presentation/App.tsx` (+ teste), `screens/DashboardScreen.tsx` (+ teste),
  `screens/MapScreen.tsx` (+ teste), `map/territoryFilter.ts` (+ teste), `map/TerritoryMapView.tsx`
- `app/src/presentation/screens/ActivationScreen.test.tsx` (só o fake ganhou `listCampaigns`)

## Verificação
- Risco vital: liberar na interface a marcação que o servidor recusa, ou esconder a que ele aceita.
  Proteção em `assignment.test.ts` (individual; campanha minha sem dirigente; território de campanha
  alheia; território de outro fora das minhas campanhas) e em `MapScreen.test.tsx` (marcar quadra de
  território de campanha sem dirigente; 403 recarrega o mapa). Cache das campanhas e fallback offline
  em `territory-cache.test.ts` e `App.test.tsx`; aba em `DashboardScreen.test.tsx` (lista, vazio, abrir).
- `npm test` em `app/`: 15 suítes, **146 testes passando** (eram 130).
- `npx tsc --noEmit`: sem erros.
- `npm run lint`: 2 erros **pré-existentes** (`no-explicit-any` em `src/data/update-client.ts:22` e
  `src/domain/appUpdate.ts:23`, arquivos não tocados; mesma contagem com as mudanças guardadas). Nada
  nos arquivos alterados.

## Passo manual pendente
`TerritoryMapView`/MapLibre segue sem teste automatizado (risco assumido do AGENTS.md), e não há JDK 17
nesta máquina. Verificar em emulador/aparelho (`npm run android`) contra servidor com uma campanha
ativa: (1) aba Campanhas lista a campanha; (2) "Ver no mapa" enquadra todos os territórios dela, com
quadras numeradas e nomes dos territórios; (3) tocar numa quadra de qualquer um deles oferece
"Confirmar" e grava; (4) concluir a campanha no admin e tocar de novo mostra a mensagem do 403 e o mapa
recarrega sem a campanha; (5) sem rede, a aba e o mapa abrem do cache e marcar avisa sem marcar.
