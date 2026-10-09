# [0232] Endpoints de atualização e download de APK no servidor FastAPI

**Data:** 2026-10-09
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0016/` — Task 01

## Solicitação

Implementar no servidor FastAPI os endpoints para consulta de atualização e download de APKs das releases dos aplicativos Android (`app/` e `admin-app/`).

## Contexto

Os clientes Android em campo necessitam verificar se há nova versão disponível ao inicializar e, caso haja, baixar o APK diretamente da VPS. O servidor precisava de endpoints protegidos por `X-App-Key` e independentes de autenticação por token JWT de congregação, para permitir verificação antes do login.

## O que foi feito

- Configuração de `RELEASES_DIR` em `server/app/core/config.py`.
- Schema Pydantic `AppReleaseOut` em `server/app/schemas/update.py` para metadados de versão (`version_code`, `version_name`, `min_version_code`, `download_url`, `changelog`, `published_at`).
- Router `server/app/routers/updates.py`:
  - `GET /updates/latest?app={app|admin-app}`: lê o arquivo de manifesto `version.json` do app solicitado. Retorna 404 estruturado caso não haja versão cadastrada.
  - `GET /updates/download/{app}`: transmite o binário `.apk` apontado pelo manifesto com cabeçalhos MIME de pacote Android.
- Registro do router em `server/app/main.py`.
- Cobertura com testes automatizados em `server/tests/routers/test_updates_routes.py` cobrindo sucesso, 404 e parâmetros inválidos.

## Arquivos modificados

- `server/app/core/config.py` — parâmetro de configuração `RELEASES_DIR`.
- `server/app/schemas/update.py` — DTO `AppReleaseOut`.
- `server/app/routers/updates.py` — rotas de consulta e download.
- `server/app/main.py` — inclusão do router.
- `server/tests/routers/test_updates_routes.py` — testes de integração dos endpoints.
