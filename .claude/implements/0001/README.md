# [0001] Scaffold do servidor FastAPI, Dockerfile e Compose com PostGIS

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 01

## Solicitação

> Spec 0001 — Task 01: Crie o scaffold do servidor em `server/`. Entregue: (1) `pyproject.toml`
> para uv, Python 3.12, com fastapi, uvicorn[standard], sqlalchemy>=2, psycopg[binary],
> geoalchemy2, alembic, pydantic>=2, pydantic-settings, passlib[bcrypt], python-jose[cryptography],
> shapely, slowapi, apscheduler, e no grupo dev pytest, pytest-cov, httpx, ruff; (2)
> `app/core/config.py` com `Settings` via pydantic-settings lendo `DATABASE_URL`,
> `TEST_DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM` (default HS256), `ADMIN_TOKEN_TTL_HOURS`
> (default 12), `ACCESS_CODE_TTL_HOURS` (default 24), `CORS_ORIGINS`; (3) `app/main.py` criando o
> FastAPI com título "Territory Map API" e um `GET /health` retornando `{"status":"ok"}`; (4)
> `server/Dockerfile` multi-stage baseado em `python:3.12-slim`, instalando via uv, rodando
> uvicorn, com usuário não-root; (5) `docker-compose.dev.yml` na raiz do repositório com apenas o
> serviço `db` usando `postgis/postgis:16-3.4`, porta 5432, volume nomeado, e um script de init que
> cria os databases `territory_map` e `territory_map_test` com a extensão postgis habilitada nos
> dois; (6) `docker-compose.yml` na raiz com `db` + `api`, a api lendo `.env`,
> `restart: unless-stopped` e `depends_on` com healthcheck do banco; (7) `server/.env.example`; (8)
> `.gitignore` na raiz cobrindo Python, uv, Flutter e `.env`; (9) `ruff.toml` ou seção
> `[tool.ruff]` com line-length 100. Critério de sucesso:
> `docker compose -f docker-compose.dev.yml up -d` sobe o banco e `uv run uvicorn app.main:app`
> responde 200 em `/health`. Toque apenas em infraestrutura e `app/core/config.py` e
> `app/main.py`; não crie models, schemas, repositories, services nem outros routers.

## Contexto

Primeira task da spec 0001 e pré-requisito de todas as outras. O repositório só continha
`CLAUDE.md` e `.claude/`. Sem projeto Python instalável e sem PostGIS rodando, nenhuma das tasks
seguintes (Alembic, models geográficos, testes contra banco real) consegue sequer começar.

## O que foi feito

Criado o esqueleto do backend: projeto Python gerenciado por uv com todas as dependências da spec
travadas em `uv.lock`, configuração via pydantic-settings, aplicação FastAPI mínima com `/health`,
imagem Docker multi-stage rodando como usuário não-root, e os dois arquivos de compose (dev só com
o banco, produção com banco + api). O banco de desenvolvimento sobe já com os dois databases
(`territory_map` e `territory_map_test`) e a extensão PostGIS habilitada em ambos.

Nenhum model, schema, repository, service ou router adicional foi criado — o escopo ficou em
infraestrutura, `app/core/config.py` e `app/main.py`.

## Arquivos criados

- `server/pyproject.toml` — dependências de runtime e do grupo `dev`, `requires-python >=3.12,<3.13`,
  `[tool.ruff]` com `line-length = 100`, `[tool.pytest.ini_options]` mínimo
- `server/uv.lock` — lockfile resolvido (965 linhas), consumido pelo `uv sync --frozen` do Dockerfile
- `server/app/__init__.py`, `server/app/core/__init__.py` — pacotes
- `server/app/core/config.py` — `Settings` (pydantic-settings) e `get_settings()` com `lru_cache`
- `server/app/main.py` — app FastAPI "Territory Map API", CORS condicional e `GET /health`
- `server/Dockerfile` — multi-stage `python:3.12-slim`, build com uv, runtime como usuário `app` (uid 1001)
- `server/.dockerignore` — evita copiar `.venv`, caches, `.env` e `tests/` para a imagem
- `server/.env.example` — template das variáveis, com as duas formas de uso documentadas
- `server/tests/.gitkeep` — pasta de testes que as próximas tasks preenchem
- `docker-compose.dev.yml` — só o serviço `db` (`postgis/postgis:16-3.4`), porta 5432, volume nomeado, healthcheck
- `docker-compose.yml` — `db` + `api`, `restart: unless-stopped`, `env_file: .env`, `depends_on` com `condition: service_healthy`
- `docker/postgres/init/20-create-databases.sh` — cria os dois databases e habilita PostGIS em cada um
- `.gitignore` — Python, uv, Flutter (app/admin/packages), IDEs, SO e `.env`

## Decisões técnicas

- **Script de init em `docker/postgres/init/`, montado nos dois composes.** Um arquivo só,
  reaproveitado por dev e produção, em vez de duplicar SQL. O prefixo `20-` garante que ele rode
  depois do `10_postgis.sh` da própria imagem `postgis/postgis`. `POSTGRES_DB` é `postgres` para que
  os dois databases da aplicação sejam criados explicitamente pelo script, e não implicitamente pelo
  entrypoint.
- **`CORS_ORIGINS` como lista de verdade, alimentada por string separada por vírgula.** Para um campo
  `list[str]`, pydantic-settings tenta decodificar o valor da env como JSON e falha com
  `CORS_ORIGINS=a,b`. Usei `Annotated[list[str], NoDecode]` mais um `field_validator(mode="before")`
  que faz o split — o tipo continua `list[str]` (consumível direto pelo `CORSMiddleware`) e o `.env`
  continua legível. Exige `pydantic-settings>=2.3`, refletido na dependência.
- **`cryptography>=44,<49`.** A partir da 49 o projeto publica wheel de macOS só para arm64. Sem o
  teto, o `uv sync` na máquina de desenvolvimento (Intel/x86_64) tenta compilar via Rust + OpenSSL e
  quebra. O Linux tem wheel em todas as versões, então o teto não custa nada em produção — e foi
  confirmado no build da imagem.
- **`bcrypt>=4.0,<5`.** `passlib` 1.7.4 lê `bcrypt.__about__`, atributo removido no bcrypt 5.x.
  Fixar aqui evita que a Task 06 (segurança) esbarre nisso.
- **`[tool.uv] package = false`.** A aplicação roda a partir da árvore de código
  (`uvicorn app.main:app`), nunca é instalada como distribuição — assim não é preciso build backend
  e o Dockerfile copia o código como camada separada da camada de dependências.
- **Venv em `/opt/venv` na imagem, via `UV_PROJECT_ENVIRONMENT`.** Mantém o venv fora de `/app`, que
  é sobrescrito pelo `COPY` do código, e permite `COPY --from=builder` de um caminho estável.
- **`.env` único na raiz para o docker compose.** O compose já lê a raiz para interpolação
  (`POSTGRES_PASSWORD`), então usar o mesmo arquivo em `env_file` evita duas fontes de verdade. O
  `server/.env.example` documenta os dois destinos: `server/.env` para desenvolvimento local e `.env`
  na raiz para o compose. `POSTGRES_PASSWORD` usa a forma `${VAR:?mensagem}` — o compose recusa subir
  sem senha definida em vez de silenciosamente usar um default.
- **`server/tests/` com `.gitkeep`, sem `__init__.py`.** Sem o pacote, cada task seguinte cria seus
  subdiretórios de teste sem precisar lembrar de adicionar `__init__.py` em cada nível.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d
cd server && cp .env.example .env && uv sync
uv run uvicorn app.main:app          # -> http://localhost:8000/health
uv run ruff check . && uv run ruff format --check .
```

Imagem de produção:

```bash
cd server && docker build -t territory-map-api .
```

## Resultado da validação

- `docker compose -f docker-compose.dev.yml up -d` — subiu; healthcheck `healthy`. `pg_database`
  lista `territory_map` e `territory_map_test`, e `pg_extension` reporta `postgis 3.4.3` **nos dois**.
- `uv sync` — 100% das dependências resolvidas por wheel, sem compilação.
- `uv run uvicorn app.main:app` — `GET /health` → **HTTP 200** com `{"status":"ok"}`;
  `/docs` → 200; `openapi.json` traz `info.title == "Territory Map API"`. **Critério de sucesso da
  task atendido.**
- `Settings` — carrega as 7 variáveis do `.env`; defaults conferidos (`HS256`, `12`, `24`);
  `CORS_ORIGINS="http://localhost:3000, https://admin.example.com"` vira
  `['http://localhost:3000', 'https://admin.example.com']`.
- `ruff check` — "All checks passed"; `ruff format --check` — 4 arquivos já formatados.
- `docker build` — imagem construída; container responde 200 em `/health` e `id` dentro dele retorna
  `uid=1001(app) gid=1001(app)`, confirmando o usuário não-root.
- `docker compose config` — dev e produção válidos; sem `POSTGRES_PASSWORD` o compose de produção
  falha com a mensagem esperada.
- `git check-ignore` — `.env` e `server/.env` ignorados, `server/.env.example`, `server/uv.lock` e o
  script de init rastreados; `server/.venv/`, `app/build/` e `packages/core/.dart_tool/` ignorados.
- Testes automatizados: **não há ainda** — a Task 01 é infraestrutura e não introduziu comportamento
  testável. `pytest` roda e coleta zero testes. As tasks seguintes preenchem `server/tests/`.
