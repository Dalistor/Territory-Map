# [0017] Campanhas: vários territórios designados a vários publicadores

**Data:** 2026-10-22
**Status:** Concluída
**Escopo:** master
**Responsável:** dalistor
**Contrato:** campanhas@1
**Regras:** CMP-01, CMP-02, CMP-03, CMP-04, CMP-05, CMP-06, CMP-07, CMP-08, CMP-09, CMP-10
**Spec mestre:** —
**Specs filhas:** —
**Dependências:** —
**Solicitação original:** “No admin e no app do usuário é necessário ter mais uma feature. Agora é possível criar uma campanha. Campanhas podem agregar mais de um território em um grupo. Campanhas podem ter mais de um publicador designado. Todos os usuários designados em campanhas podem marcar quadras como concluídas. No app dos usuários, quando tiver uma designação de campanha, deve aparecer em uma aba separada na tela inicial para ele abrir no mapa. No mapa deve abrir todos os territórios anexados a campanha. Relação de dados: campaing: id, name; campaing_designation: id; <tabela de designação>: ... campaing_designation.” Respostas da sessão: campanha **substitui** a designação individual; tem **início e conclusão**; território em **no máximo uma** campanha ativa; app admin **só consulta** campanhas.

## Objetivo e demonstração

**Antes:** cada território tem no máximo um dirigente, e só ele marca quadras pelo app.
**Depois:** o admin desktop cria a campanha “Campanha de Celebração” com os territórios N3, N5 e
N8, designa a Ana, o Bruno e a Carla; o cartão S-13 de N5 mostra o dirigente anterior concluído
hoje e uma linha aberta “Campanha: Campanha de Celebração”. No celular da Ana, a aba **Campanhas**
da tela inicial lista a campanha; abri-la mostra os três territórios no mapa, e ela marca a quadra 4
de N8. Bruno marca a quadra 2 de N3. Um publicador fora da campanha toma 403. O app admin mostra a
campanha no lugar do dirigente, sem botões de gestão. O admin conclui a campanha; a próxima marcação
da Ana em N8 toma 403 e os três territórios ficam sem dirigente.

## Impacto previsto

- **Dados (Alembic, uma migration):** `campaigns`, `campaign_territories`, `campaign_designations`
  (índice único parcial de período aberto por campanha), `campaign_designation_publishers` (nome
  copiado, sem FK para `users`) e `territory_assignments.campaign_designation_id` nullable com FK
  `ON DELETE CASCADE`. `territory_assignments.user_id`/`user_name` passam a nullable com CHECK
  (`campaign_designation_id IS NOT NULL OR (user_id IS NOT NULL AND user_name IS NOT NULL)`).
  Sem backfill: linhas existentes já satisfazem o CHECK. **Este é o ponto de maior risco** — é a
  primeira vez que o histórico admite linha sem autor; a migration é destrutiva-zero mas sobe
  sozinha no deploy (`docker-entrypoint.sh`).
- **Por que a linha de campanha mora em `territory_assignments`:** o índice
  `uq_territory_assignments_open` já garante uma designação aberta por território; ao colocar a
  campanha ali, CMP-03 (substitui) e CMP-04 (no máximo uma campanha ativa, nada individual durante
  ela) passam a ser garantidas pelo banco sem índice novo, e o cartão S-13 ganha a linha naturalmente.
- **Servidor:** novo `models/campaign.py` (+ tabelas associadas), `repositories/campaign.py`,
  `services/campaign.py`, `schemas/campaign.py`, `routers/admin_campaigns.py`; mudanças em
  `services/assignment.py` (designar individual recusa território em campanha ativa — 409; `update`
  e `delete` de linha de campanha pelo cartão são recusados com mensagem para usar a campanha),
  `services/work_log.py` (`_refuse_unassigned_territory` aceita publicador do período aberto),
  `routers/app_client.py` (`GET /app/campaigns` e campo `campaign` em `TerritoryOut`),
  `routers/history_dto.py`/`routers/admin_assignments.py` (DTO com `user` opcional e `campaign`
  opcional). `Territory.assigned_user_id` continua projeção e fica nulo em campanha ativa.
- **Rotas novas (`/admin/campaigns`):** `GET ""`, `POST ""` (nome + territory_ids), `PATCH /{id}`
  (nome, territory_ids), `DELETE /{id}` (409 se ativa), `GET /{id}` (com períodos e publicadores),
  `POST /{id}/designations` (user_ids — abre período), `PUT /{id}/designations/current/publishers`
  (troca a lista), `POST /{id}/designations/current/complete`. Nomes finais ficam a critério do
  executor da Task 03, registrados no README.
- **Admin desktop:** página **Campanhas** na sidebar, models em `shared/models.ts`, contrato IPC,
  preload, `main/api-client.ts`, handlers; `excel-export.ts` e `docx-handler.ts` tratam linha de
  campanha; cartão S-13 e Histórico exibem “Campanha: <nome>”.
- **App do publicador:** `domain/models.ts` (Campaign), `data/api-client.ts`,
  `data/territory-cache.ts` (cache das campanhas), `domain/assignment.ts` (“posso marcar?” passa a
  considerar campanha), `DashboardScreen` (aba Campanhas), `MapScreen` (modo campanha: enquadra e
  libera marcação em todos os territórios dela).
- **App admin:** models, api-client, rótulo de dirigente na lista/mapa/cartão, tela de consulta da
  campanha; nenhuma ação de gestão.
- **Compatibilidade:** APKs antigos do publicador continuam funcionando (campo novo é aditivo); um
  APK antigo simplesmente não mostra a aba e só consegue marcar quadra da campanha se o próprio
  `isMyTerritory` local deixar — o servidor é quem decide. Admins antigos podem quebrar ao ler
  cartão com `user: null`: publicar servidor e admins juntos.

## Autonomia e decisões

Cláusulas de `campanhas@1` (`boundaries`, `autonomy`). Decisões fechadas na sessão de 2026-10-22,
registradas em `approval.reference`. Nenhuma decisão aberta. Escolhas técnicas desta spec que não
alteram comportamento: modelagem acima, nomes de rotas e DTOs.

## Contexto técnico

- Cada executor carrega a skill `clean-code` (`references/architecture.md`) e confirma as fontes
  atuais; Graphify só sob demanda. Telas novas ou alteradas seguem `DESIGN.md` e `UX-CONTRACT.md`
  (tokens da 0015) e a skill `design-taste-frontend` no modo de telas de app.
- Proteção existente a reutilizar: `server/tests/services/test_assignment_service.py`,
  `test_work_log_service.py`, `tests/integration/` (fluxos ponta a ponta sobre PostGIS real),
  `admin/src/main/excel-export.test.ts`, `docx-handler.test.ts`, testes de tela dos três clientes.
- Gate de CI: `app/services/` em 100% de cobertura — o `CampaignService` entra nesse gate.
- Spec 0015 tem a Task 21 bloqueada (verificação visual); não depende desta, mas as telas novas
  aqui devem usar os controles compartilhados criados lá (Tasks 09 e 15).

## Tasks

### Task 01 — Esquema de campanhas e linha de campanha no histórico
**Regras:** CMP-01, CMP-02, CMP-03, CMP-04
**Modo:** TDD
**Responsável:** a atribuir
**Arquivos:** `server/app/models/campaign.py` (novo), `server/app/models/territory_assignment.py`, `server/app/models/__init__.py`, `server/migrations/versions/<nova>.py`, `server/tests/models/` ou `tests/repositories/` (teste de constraint)
**Depende de:** —
**Verificação:** Risco vital: integridade do histórico e unicidade da designação aberta. Lacuna: o CHECK novo e a convivência da linha de campanha com `uq_territory_assignments_open` não têm proteção. Um teste contra PostGIS real: linha sem autor e sem campanha é recusada; duas linhas abertas no mesmo território (campanha + individual) são recusadas. `alembic upgrade head` e `downgrade -1` num banco com dados.
**Instrução para o executor:**
> Spec master/0017 — Task 01: criar as tabelas de campanhas e a coluna `campaign_designation_id` em `territory_assignments` conforme “Impacto previsto”, numa única migration Alembic sem backfill. Manter os comentários de modelo no estilo dos existentes, explicando por que a linha de campanha vive no histórico. Não mexer em services. Reportar o id da migration e a saída do teste.

### Task 02 — Regras de campanha no service
**Regras:** CMP-01, CMP-02, CMP-03, CMP-04, CMP-05, CMP-06
**Modo:** TDD
**Responsável:** a atribuir
**Arquivos:** `server/app/repositories/campaign.py` (novo), `server/app/services/campaign.py` (novo), `server/app/services/assignment.py`, `server/app/repositories/territory_assignment.py`, `server/tests/services/test_campaign_service.py` (novo), `server/tests/services/test_assignment_service.py`
**Depende de:** Task 01
**Verificação:** Regra de negócio do servidor — TDD obrigatório pelo AGENTS.md e gate de 100% em services. Casos que distinguem resultado: designar substitui dirigente; território em outra campanha ativa → erro nomeando ambos; concluir fecha período e linhas com a mesma data e zera projeção; adicionar/remover território em campanha ativa; apagar ativa recusado; designar individual em território de campanha ativa recusado; renomear com nome repetido recusado. Relógio por `now_provider`.
**Instrução para o executor:**
> Spec master/0017 — Task 02: implementar `CampaignService` com exceções de domínio próprias (mensagens que dizem o que fazer) e ajustar `AssignmentService` para recusar designação individual, edição e exclusão de linha de campanha pelo cartão. `_refresh_assigned_user` deve deixar a projeção nula quando a linha aberta é de campanha. Sem HTTP no service.

### Task 03 — Rotas admin de campanha e DTOs de histórico com campanha
**Regras:** CMP-01, CMP-02, CMP-04, CMP-10
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `server/app/schemas/campaign.py` (novo), `server/app/schemas/assignment.py`, `server/app/routers/admin_campaigns.py` (novo), `server/app/routers/admin_assignments.py`, `server/app/routers/history_dto.py`, `server/app/main.py`, `server/tests/routers/`
**Depende de:** Task 02
**Verificação:** Reaproveitar o padrão de teste de router existente para status codes: 404 cross-congregação, 409 de campanha ativa e de território em outra campanha, 201 ao designar. DTO de histórico com `user: null` e `campaign: {id, name}`.
**Instrução para o executor:**
> Spec master/0017 — Task 03: expor as rotas listadas em “Impacto previsto” sob JWT de admin, traduzindo exceções de domínio em status. Registrar no README os paths finais. Atualizar os DTOs de designação (cartão, histórico paginado) para `user` opcional e `campaign` opcional.

### Task 04 — Marcação por designado de campanha e leitura no app
**Regras:** CMP-07, CMP-08
**Modo:** TDD
**Responsável:** a atribuir
**Arquivos:** `server/app/services/work_log.py`, `server/app/routers/app_client.py`, `server/app/schemas/territory.py`, `server/tests/services/test_work_log_service.py`, `server/tests/integration/test_campaign_integration.py` (novo)
**Depende de:** Task 02
**Verificação:** Risco vital: autorização de escrita do app. Lacuna concreta: `_refuse_unassigned_territory` só conhece identidade. Casos: designado da campanha marca (201); não designado 403; após concluir 403; publicador removido da lista 403; reenvio continua 200. Um teste de integração ponta a ponta cobrindo o roteiro da demonstração (dois designados, conclusão, 403).
**Instrução para o executor:**
> Spec master/0017 — Task 04: permitir a marcação quando o território tem linha aberta de campanha cujo período inclui o publicador; manter a ordem de checagens documentada em `mark_worked`. Adicionar `GET /app/campaigns` (campanhas ativas do publicador, com ids dos territórios) e `campaign` em `TerritoryOut`. Mesmo 404 para outra congregação.

### Task 05 — Dados de campanha no admin desktop (main, IPC, preload)
**Regras:** CMP-01, CMP-02, CMP-05, CMP-06, CMP-10
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `admin/src/shared/models.ts`, `admin/src/shared/ipc-contract.ts`, `admin/src/main/api-client.ts`, `admin/src/main/ipc-handlers.ts`, `admin/src/preload/`, testes co-localizados de `api-client` e `ipc-handlers`
**Depende de:** Task 03
**Verificação:** Atualizar os testes existentes de `api-client`/`ipc-handlers` com os canais novos (fake de fetch). `npm run typecheck` e `npm test` em `admin/`.
**Instrução para o executor:**
> Spec master/0017 — Task 05: um método por canal, 1:1 entre contrato IPC e preload; renderer não vê HTTP. Tipos de designação passam a ter `user` opcional e `campaign` opcional.

### Task 06 — Página Campanhas e linha de campanha nas telas e exportações do desktop
**Regras:** CMP-01, CMP-02, CMP-03, CMP-05, CMP-06, CMP-10
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `admin/src/renderer/screens/CampaignsScreen.tsx` (novo) + teste, `admin/src/renderer/App.tsx` (sidebar), `TerritoryDetailDialog.tsx`, `DesignationsScreen.tsx`, `HistoryScreen.tsx`, `confirmMessages.ts`, `admin/src/main/excel-export.ts`, `admin/src/main/docx-handler.ts` e seus testes
**Depende de:** Task 05
**Verificação:** Um teste de tela para `CampaignsScreen` (criar, designar com aviso de substituição listando dirigentes, concluir, apagar ativa mostra mensagem do servidor). Ampliar `excel-export.test.ts`/`docx-handler.test.ts` com uma linha de campanha (risco: export quebrar com `user` nulo). Demonstração manual no `npm run dev`.
**Instrução para o executor:**
> Spec master/0017 — Task 06: carregar `design-taste-frontend` (telas de app) e seguir `DESIGN.md`/`UX-CONTRACT.md`. Página com lista à esquerda e detalhe à direita (territórios num mapa só com as demarcações da campanha, publicadores, períodos). Selecionar territórios pelo mapa e por lista pesquisável; território em outra campanha ativa aparece desabilitado com o nome dela. Cartão S-13 e Designações mostram “Campanha: <nome>” e não oferecem designar/editar/apagar nessa linha.

### Task 07 — Aba Campanhas e mapa da campanha no app do publicador
**Regras:** CMP-07, CMP-08
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `app/src/domain/models.ts`, `app/src/domain/assignment.ts` (+ teste), `app/src/data/api-client.ts`, `app/src/data/territory-cache.ts` (+ testes), `app/src/presentation/App.tsx`, `app/src/presentation/screens/DashboardScreen.tsx` (+ teste), `app/src/presentation/screens/MapScreen.tsx`, `app/src/presentation/map/`
**Depende de:** Task 04
**Verificação:** Risco vital no cliente: liberar marcação na interface para quem o servidor recusa (ou o contrário). Atualizar `assignment.test.ts` com casos de campanha e `territory-cache.test.ts` com campanhas cacheadas; teste de tela da aba (lista, vazio, abrir). `MapScreen` segue sem teste automatizado (risco assumido do AGENTS.md) — verificação manual em emulador/aparelho anotada.
**Instrução para o executor:**
> Spec master/0017 — Task 07: carregar `design-taste-frontend`. Terceira aba “Campanhas” na `DashboardScreen` (ao lado das existentes), com cartão por campanha (nome, quantidade de territórios, desde quando). Abrir navega ao mapa em modo campanha: enquadra todos os territórios dela e permite marcar quadras de qualquer um. Sem fila offline.

### Task 08 — Campanhas em modo consulta no app admin
**Regras:** CMP-09, CMP-10
**Modo:** direto
**Responsável:** a atribuir
**Arquivos:** `admin-app/src/domain/models.ts`, `admin-app/src/domain/assignment.ts` (+ teste), `admin-app/src/data/api-client.ts` (+ teste), `admin-app/src/presentation/screens/` (lista de territórios, `AssignmentPanel`, nova `CampaignsScreen` de consulta + teste), `admin-app/src/presentation/App.tsx`
**Depende de:** Task 03
**Verificação:** Atualizar os testes das telas tocadas para o rótulo “Campanha: <nome>” e a ausência de ações de designar na linha de campanha; teste da tela de consulta. `npm test`, `npm run lint`, `npm run typecheck`.
**Instrução para o executor:**
> Spec master/0017 — Task 08: só leitura. O `AssignmentPanel` de território em campanha ativa explica que ele está na campanha e que designar individualmente exige concluir a campanha no computador; marcar quadra continua disponível (rota do admin).

### Task 09 — Documentação e gates
**Regras:** CMP-01 a CMP-10
**Modo:** direto
**Responsável:** coordenador
**Arquivos:** `AGENTS.md` (Modelo de Dados, Regras de Negócio, App Android, App Admin), `.centaur/state/campanhas.json`, evidências
**Depende de:** Tasks 01–08
**Verificação:** `pytest` com cobertura (services 100%), `ruff`, `npm test`/`lint`/`typecheck` nos três clientes; evidências por regra via `record-evidence.py`; `validate-lifecycle.py --ready` em cada regra.
**Instrução para o executor:**
> Spec master/0017 — Task 09: documentar campanhas no AGENTS.md no mesmo tom das seções existentes (o porquê da linha de campanha no histórico, o CHECK, a substituição), consolidar estado e evidências.

## Validação e integração

Roteiro da demonstração executado contra servidor local (PostGIS) com admin `npm run dev` e app em
emulador quando houver JDK/dispositivo; sem dispositivo, o passo do app fica registrado como manual
pendente, como na 0015. Integração na `main` por commit autorizado pelo usuário; publicação (deploy
do servidor e APKs) é separada e exige servidor + admins publicados juntos.

## Diferença entre plano e resultado

### Onda 1 — servidor (Tasks 01–04, implements/0241)

Migration `f4a9c2d71e36`. Desvios: modelos em `models/campaign.py` + `models/campaign_designation.py`;
`WorkLogService` recebe `TerritoryAssignmentRepository` (consulta `campaign_line_admits`);
`POST .../assignments/complete` também recusa linha de campanha; apagar campanha concluída leva junto
as linhas dela nos cartões S-13 (CASCADE) — o trabalho das quadras fica.

**Contrato HTTP final (fonte para Tasks 05–08):**

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /admin/campaigns` | — | 200 `CampaignOut[]` por nome |
| `POST /admin/campaigns` | `{name, territory_ids: [uuid≥1]}` | 201 `CampaignOut` |
| `GET /admin/campaigns/{id}` | — | 200 `CampaignOut` |
| `PATCH /admin/campaigns/{id}` | `{name?, territory_ids?}` (≥1 campo) | 200 `CampaignOut` |
| `DELETE /admin/campaigns/{id}` | — | 204; 409 `campaign_active` |
| `POST /admin/campaigns/{id}/designations` | `{user_ids: [uuid≥1]}` | 201 `CampaignOut` |
| `PUT /admin/campaigns/{id}/designations/current/publishers` | `{user_ids}` | 200 `CampaignOut`; 404 se não ativa |
| `POST /admin/campaigns/{id}/designations/current/complete` | — | 200 `CampaignOut`; 404 se não ativa |
| `GET /app/campaigns` (token app) | — | 200 `[{id, name, started_at, territory_ids}]` |

- `CampaignOut = {id, name, created_at, territories: [{id, name}], current_designation: CampaignDesignationOut|null, designations: [CampaignDesignationOut]}` (períodos do mais novo ao mais antigo).
- `CampaignDesignationOut = {id, started_at, completed_at|null, publishers: [{id, name}]}`.
- Designação (cartão e itens de `GET /admin/assignments`): `{id, user: {id,name}|null, campaign: {id,name}|null, started_at, completed_at}` — exatamente um de `user`/`campaign`; histórico mantém `territory`.
- `TerritoryOut.campaign: {id,name}|null` em `GET /admin/territories[/{id}]` e `GET /app/territories`; em campanha ativa `assigned_user` é null e `assigned_since` = início da campanha.
- Erros 409: `campaign_active`, `territory_in_campaign` (detail nomeia território e campanha), `campaign_assignment` (editar/concluir/apagar linha de campanha pelo cartão); 422 `campaign_without_publishers`; nome repetido `duplicate_name` (409).

### Onda 2 — clientes (Tasks 05–08) e Task 09

- Desktop (0245): diálogos `CampaignEditorDialog`/`CampaignPublishersDialog` em arquivos próprios; sem canal IPC para `GET /admin/campaigns/{id}` (a lista já traz tudo); escolha de territórios também pelo mapa (`AssignmentsMap.selectedIds`); `Assignment.publisher` mantido com esse nome, agora opcional.
- App (0247): `listCampaigns` (não `getCampaigns`); aba "Histórico de Trabalho" encurtada para "Histórico" para caberem três abas; 403 `territory_not_assigned` tem mensagem própria e recarrega.
- App admin (0248): detalhe da campanha em tela de pilha (`CampaignDetailScreen`); corrigido um erro de tipo pré-existente em `domain/appUpdate.ts` que quebrava o typecheck.
- Gates: servidor 722 testes (services 100%), admin 608, app 146, admin-app 341. Lint do `app/` mantém 2 erros pré-existentes fora do escopo.
- Integrada em `main` no commit `a01054d` (autorizado pelo usuário em 2026-10-22); `--complete` verde. Verificação manual em `npm run dev` e em emulador Android (JDK 17 ausente) segue pendente, registrada nas notas de CMP-08/09. Não publicada.

## Checklist de conclusão
- [x] Task 01 — Esquema de campanhas e linha de campanha no histórico → implements/0241
- [x] Task 02 — Regras de campanha no service → implements/0241
- [x] Task 03 — Rotas admin de campanha e DTOs de histórico com campanha → implements/0241
- [x] Task 04 — Marcação por designado de campanha e leitura no app → implements/0241
- [x] Task 05 — Dados de campanha no admin desktop (main, IPC, preload) → implements/0245
- [x] Task 06 — Página Campanhas e linha de campanha nas telas e exportações do desktop → implements/0245
- [x] Task 07 — Aba Campanhas e mapa da campanha no app do publicador → implements/0247
- [x] Task 08 — Campanhas em modo consulta no app admin → implements/0248
- [x] Task 09 — Documentação e gates → implements/0249

## Execução
$run master/0017

## Estado
O ciclo normativo define o estado. Checkboxes não concluem a spec.
