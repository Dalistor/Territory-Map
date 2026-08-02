# Status das Implementações

Histórico de todas as implementações realizadas neste projeto.

| # | Título | Data | Status | Arquivos Afetados |
|---|--------|------|--------|-------------------|
| [0001](0001/README.md) | Scaffold do servidor FastAPI, Dockerfile e Compose com PostGIS | 2026-08-02 | Concluído | `server/pyproject.toml`, `server/uv.lock`, `server/app/main.py`, `server/app/core/config.py`, `server/Dockerfile`, `server/.dockerignore`, `server/.env.example`, `docker-compose.dev.yml`, `docker-compose.yml`, `docker/postgres/init/20-create-databases.sh`, `.gitignore` |
| [0002](0002/README.md) | Sessão do banco, Alembic e exceções de domínio | 2026-08-02 | Concluído | `server/app/models/base.py`, `server/app/models/__init__.py`, `server/app/core/db.py`, `server/app/core/exceptions.py`, `server/alembic.ini`, `server/migrations/env.py`, `server/migrations/script.py.mako`, `server/migrations/versions/20260802_1320_8f81b08d3642_enable_postgis.py` |
| [0003](0003/README.md) | Models Territory, Block e BlockWorkLog | 2026-08-02 | Concluído | `server/app/models/territory.py`, `server/app/models/block.py`, `server/app/models/block_work_log.py`, `server/app/models/__init__.py` |
| [0004](0004/README.md) | Models Congregation e User | 2026-08-02 | Concluído | `server/app/models/congregation.py`, `server/app/models/user.py`, `server/app/models/__init__.py` |
| [0005](0005/README.md) | Geo: conversão de coordenadas e pré-validação de polígono | 2026-08-02 | Concluído | `server/app/core/geo.py`, `server/tests/core/test_geo.py` |
| [0006](0006/README.md) | Segurança: hash de senha, código de acesso e tokens JWT | 2026-08-02 | Concluído | `server/app/core/security.py`, `server/tests/core/test_security.py` |
| [0007](0007/README.md) | Migration inicial do schema completo | 2026-08-02 | Concluído | `server/migrations/versions/20260802_1342_81019c0977bf_initial_schema.py` |
| [0008](0008/README.md) | Schemas Pydantic (DTOs) do servidor | 2026-08-02 | Concluído | `server/app/schemas/__init__.py`, `server/app/schemas/common.py`, `server/app/schemas/geo.py`, `server/app/schemas/auth.py`, `server/app/schemas/user.py`, `server/app/schemas/territory.py`, `server/app/schemas/block.py`, `server/app/schemas/work_log.py`, `server/tests/schemas/test_geo_schemas.py`, `server/tests/schemas/test_auth_schemas.py`, `server/tests/schemas/test_user_schemas.py`, `server/tests/schemas/test_territory_schemas.py`, `server/tests/schemas/test_block_schemas.py`, `server/tests/schemas/test_work_log_schemas.py` |
| [0009](0009/README.md) | Repositories de Congregation e User | 2026-08-02 | Concluído | `server/app/repositories/__init__.py`, `server/app/repositories/congregation.py`, `server/app/repositories/user.py` |
| [0010](0010/README.md) | Repositories geográficos com PostGIS | 2026-08-02 | Concluído | `server/app/repositories/territory.py`, `server/app/repositories/block.py`, `server/app/repositories/block_work_log.py` |
| [0011](0011/README.md) | Service de autenticação do admin | 2026-08-02 | Concluído | `server/app/services/__init__.py`, `server/app/services/auth.py`, `server/tests/services/test_auth_service.py` |
| [0012](0012/README.md) | Dependências de autenticação: token de admin e token de app | 2026-08-02 | Concluído | `server/app/core/deps.py`, `server/tests/core/test_deps.py` |
| [0013](0013/README.md) | Service de publicador e código de acesso | 2026-08-02 | Concluído | `server/app/services/user.py`, `server/tests/services/test_user_service.py` |
| [0014](0014/README.md) | Service de território | 2026-08-02 | Concluído | `server/app/services/territory.py`, `server/tests/services/test_territory_service.py`, `server/tests/conftest.py` |
| [0015](0015/README.md) | Service de registro de trabalho | 2026-08-02 | Concluído | `server/app/services/work_log.py`, `server/tests/services/test_work_log_service.py` |
| [0016](0016/README.md) | Service de quadra | 2026-08-02 | Concluído | `server/app/services/block.py`, `server/tests/services/test_block_service.py` |
| [0017](0017/README.md) | Rotas de login e de publicadores, com o handler único de DomainError | 2026-08-02 | Concluído | `server/app/main.py`, `server/app/routers/__init__.py`, `server/app/routers/auth.py`, `server/app/routers/admin_users.py`, `server/tests/routers/conftest.py`, `server/tests/routers/test_auth_routes.py`, `server/tests/routers/test_admin_users_routes.py`, `server/tests/test_main.py` |
| [0018](0018/README.md) | Rotas do app cliente: leitura do mapa e marcação de quadra | 2026-08-02 | Concluído | `server/app/routers/app_client.py`, `server/app/main.py`, `server/tests/routers/test_app_client_routes.py` |
| [0019](0019/README.md) | Rotas de território, quadra e histórico de trabalho (admin) | 2026-08-02 | Concluído | `server/app/routers/admin_territories.py`, `server/app/routers/admin_blocks.py`, `server/app/main.py`, `server/tests/routers/test_admin_territories_routes.py`, `server/tests/routers/test_admin_blocks_routes.py` |
| [0020](0020/README.md) | Rate limit por IP e expiração automática de códigos de acesso | 2026-08-02 | Concluído | `server/app/core/rate_limit.py`, `server/app/core/scheduler.py`, `server/app/jobs/__init__.py`, `server/app/jobs/expire_codes.py`, `server/app/main.py`, `server/app/routers/auth.py`, `server/migrations/env.py`, `server/tests/routers/conftest.py`, `server/tests/routers/test_rate_limit_routes.py`, `server/tests/core/test_scheduler.py`, `server/tests/jobs/test_expire_codes_job.py` |
| [0021](0021/README.md) | Testes de integração ponta a ponta | 2026-08-02 | Concluído | `server/tests/integration/conftest.py`, `server/tests/integration/test_full_flow_integration.py`, `server/tests/integration/test_device_swap_integration.py`, `server/tests/integration/test_tenant_isolation_integration.py`, `server/tests/integration/test_demarcation_integrity_integration.py`, `server/tests/integration/test_revocation_integration.py` |
| [0022](0022/README.md) | CI/CD: testes, imagem no GHCR e deploy por SSH | 2026-08-02 | Concluído | `.github/workflows/server.yml`, `server/docker-entrypoint.sh`, `server/Dockerfile`, `docker-compose.yml`, `server/README.md` |

---

_Atualizado automaticamente pelas skills `/centaur-driven-tdd` e `/centaur-driven-implement`_
