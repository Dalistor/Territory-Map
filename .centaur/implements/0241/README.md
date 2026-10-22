# Implementação 0241: Campanhas no servidor — esquema, regras, rotas admin e marcação pelo app

Spec 0017, Tasks 01–04 (contrato `campanhas@1`, regras CMP-01 a CMP-07 e CMP-10).

## O que foi feito
1. **Esquema (Task 01, TDD).** Migration única `f4a9c2d71e36` (`20261022_1030_f4a9c2d71e36_add_campaigns.py`, revisa `e7b34c1d5a80`), sem backfill:
   - `campaigns` (único `(congregation_id, name)`), `campaign_territories` (PK composta, as duas FKs `CASCADE`), `campaign_designations` (índice único parcial `uq_campaign_designations_open` em `campaign_id WHERE completed_at IS NULL`) e `campaign_designation_publishers` (PK `(campaign_designation_id, user_id)`, `user_id` sem FK, `user_name String(120) NOT NULL`).
   - `territory_assignments.campaign_designation_id` nullable com FK `ON DELETE CASCADE`; `user_id`/`user_name` passam a nullable com o CHECK `ck_territory_assignments_author`.
   - Downgrade funcional: apaga as linhas de campanha do cartão antes de reimpor `NOT NULL` (as designações individuais ficam).
   - Modelos em `models/campaign.py` (`Campaign` + a tabela associativa `campaign_territories`) e `models/campaign_designation.py` (`CampaignDesignation` + `CampaignDesignationPublisher`, que só existe como parte do período). O comentário de `TerritoryAssignment` explica por que a linha de campanha mora no cartão: `uq_territory_assignments_open` passa a garantir “campanha substitui” e “uma campanha ativa por território” sem índice novo.
2. **Regras (Task 02, TDD).** `repositories/campaign.py` e `services/campaign.py` (`CampaignService` com `now_provider`): criar, renomear e reagrupar territórios, apagar (recusa se ativa), designar (≥1 publicador; conclui a designação individual aberta de cada território com a data de hoje e abre a linha da campanha; território em outra campanha ativa é recusado antes de escrever qualquer coisa, nomeando território e campanha), trocar publicadores do período aberto, concluir (período e linhas com a mesma data) e alterar territórios de campanha ativa (adicionado substitui, removido tem a linha concluída). `AssignmentService` recusa designar individualmente território com linha de campanha aberta e recusa editar, concluir ou apagar linha de campanha pelo cartão; `_refresh_assigned_user` deixa a projeção nula quando a aberta é de campanha; novo `open_campaign_by_territory`.
3. **Rotas admin (Task 03).** `schemas/campaign.py`, `routers/admin_campaigns.py` registrado em `main.py`; DTO de designação (`AssignmentOut`/`AssignmentWithTerritoryOut`) com `user` e `campaign` opcionais via `history_dto.with_holder`; `TerritoryOut.campaign` preenchido em `GET /admin/territories` e `GET /admin/territories/{id}`.
4. **App (Task 04, TDD).** `WorkLogService` recebe `TerritoryAssignmentRepository` e `_refuse_unassigned_territory` aceita, depois da checagem de identidade, o publicador listado no período aberto da campanha cuja linha está aberta no território (`campaign_line_admits`, uma consulta). A ordem documentada de `mark_worked` não mudou: o reenvio de `log_id` volta 200 antes de qualquer checagem. `GET /app/campaigns` e `TerritoryOut.campaign` em `GET /app/territories`.

## Contrato HTTP final
Todas sob JWT de admin; campanha, território ou publicador de outra congregação → 404.

| Rota | Corpo | Resposta |
|------|-------|----------|
| `GET /admin/campaigns` | — | 200 `CampaignOut[]` (por nome) |
| `POST /admin/campaigns` | `{"name", "territory_ids": [uuid, ≥1]}` | 201 `CampaignOut` |
| `GET /admin/campaigns/{id}` | — | 200 `CampaignOut` |
| `PATCH /admin/campaigns/{id}` | `{"name"?, "territory_ids"? (≥1)}`, ao menos um | 200 `CampaignOut` |
| `DELETE /admin/campaigns/{id}` | — | 204; 409 `campaign_active` se ativa |
| `POST /admin/campaigns/{id}/designations` | `{"user_ids": [uuid, ≥1]}` | 201 `CampaignOut` |
| `PUT /admin/campaigns/{id}/designations/current/publishers` | `{"user_ids": [uuid, ≥1]}` | 200 `CampaignOut`; 404 se não ativa |
| `POST /admin/campaigns/{id}/designations/current/complete` | — | 200 `CampaignOut`; 404 se não ativa |
| `GET /app/campaigns` (token do app) | — | 200 `[{"id","name","started_at","territory_ids"}]` |

`CampaignOut`: `{"id","name","created_at","territories":[{"id","name"}],"current_designation": CampaignDesignationOut|null,"designations":[CampaignDesignationOut]}` (períodos do mais novo ao mais antigo); `CampaignDesignationOut`: `{"id","started_at","completed_at"|null,"publishers":[{"id","name"}]}`.
Designação (cartão e `GET /admin/assignments`): `{"id","user":{"id","name"}|null,"campaign":{"id","name"}|null,"started_at","completed_at"}` — exatamente um dos dois preenchido. `TerritoryOut` (admin e app) ganhou `"campaign":{"id","name"}|null`.

Códigos novos: `campaign_active` (409), `territory_in_campaign` (409), `campaign_assignment` (409), `campaign_without_publishers` (422); nome repetido usa o `duplicate_name` (409) existente.

## Arquivos Afetados
- Novos: `server/app/models/campaign.py`, `server/app/models/campaign_designation.py`, `server/app/repositories/campaign.py`, `server/app/services/campaign.py`, `server/app/schemas/campaign.py`, `server/app/routers/admin_campaigns.py`, `server/migrations/versions/20261022_1030_f4a9c2d71e36_add_campaigns.py`, `server/tests/services/test_campaign_service.py`, `server/tests/routers/test_admin_campaigns_routes.py`, `server/tests/integration/test_campaign_integration.py`
- Alterados: `server/app/core/exceptions.py`, `server/app/main.py`, `server/app/models/__init__.py`, `server/app/models/territory_assignment.py`, `server/app/repositories/territory_assignment.py`, `server/app/services/assignment.py`, `server/app/services/work_log.py`, `server/app/routers/admin_assignments.py`, `server/app/routers/admin_blocks.py`, `server/app/routers/admin_territories.py`, `server/app/routers/app_client.py`, `server/app/routers/history_dto.py`, `server/app/schemas/assignment.py`, `server/app/schemas/territory.py`, `server/tests/repositories/test_territory_assignment.py`, `server/tests/schemas/test_territory_schemas.py`, `server/tests/services/test_assignment_service.py`, `server/tests/services/test_work_log_service.py`

## Verificação
- Risco vital protegido: integridade do cartão (CHECK e convivência com `uq_territory_assignments_open`, testes de constraint contra PostGIS em `test_territory_assignment.py`), regras de campanha (`test_campaign_service.py`, 23 casos), recusas pelo cartão (`test_assignment_service.py`), autorização de marcação (`test_work_log_service.py` e o roteiro ponta a ponta em `test_campaign_integration.py`: dois designados marcam 201, terceiro e dirigente substituído 403, publicador removido 403, após concluir 403, reenvio 200).
- `uv run pytest --cov=app`: 722 passando; `app/services/` em 100%; total 96%.
- `uv run ruff check .` e `uv run ruff format --check .`: limpos.
- `alembic upgrade head && downgrade -1 && upgrade head` no banco dev, vazio e também com uma campanha ativa gravada (o downgrade remove a linha de campanha e preserva a individual).
- `TerritoryOut.campaign` só é preenchido nas listagens e no detalhe admin, como `assigned_since`; o retorno de `POST`/`PATCH /admin/territories` o deixa nulo.
