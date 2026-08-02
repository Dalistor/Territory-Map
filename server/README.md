# Territory Map — Server

API REST em FastAPI, dona das regras de negócio e da validação geométrica do projeto.
Visão geral, modelo de dados e regras estão no [`CLAUDE.md`](../CLAUDE.md) na raiz do repositório.

- Python 3.12, gerenciado com [uv](https://docs.astral.sh/uv/)
- SQLAlchemy 2.x síncrono + psycopg 3, PostgreSQL 16 + PostGIS
- Alembic para o schema, ruff para lint e formatação, pytest para os testes

---

## Desenvolvimento local

### 1. Banco

O PostGIS é obrigatório — para rodar a API e também para os testes, que usam predicados
geométricos reais e nunca mocks.

```bash
# na raiz do repositório
docker compose -f docker-compose.dev.yml up -d
```

Sobe o PostGIS em `localhost:5432` já com os databases `territory_map` e `territory_map_test`,
com a extensão habilitada nos dois. O script de init (`docker/postgres/init/`) só roda em volume
vazio; para recriar os bancos:

```bash
docker compose -f docker-compose.dev.yml down -v
```

### 2. Servidor

```bash
cd server
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API em `http://localhost:8000`, docs em `/docs`, healthcheck em `/health`.

### 3. Comandos do dia a dia

Todos a partir de `server/`.

| O quê | Comando |
|-------|---------|
| Instalar dependências | `uv sync` |
| Subir a API com reload | `uv run uvicorn app.main:app --reload` |
| Lint | `uv run ruff check .` |
| Corrigir o que o lint conserta sozinho | `uv run ruff check --fix .` |
| Formatar | `uv run ruff format .` |
| Conferir formatação (o que a CI roda) | `uv run ruff format --check .` |
| Rodar todos os testes | `uv run pytest` |
| Rodar um arquivo | `uv run pytest tests/services/test_territory_service.py` |
| Cobertura | `uv run pytest --cov=app --cov-report=term-missing` |
| Cobertura dos services (o portão da CI) | `uv run python -m coverage report --include="app/services/*" --show-missing --fail-under=100` |
| Aplicar migrations | `uv run alembic upgrade head` |
| Nova migration | `uv run alembic revision --autogenerate -m "descrição"` |
| Voltar uma migration | `uv run alembic downgrade -1` |
| Limpar códigos vencidos à mão | `uv run python -m app.jobs.expire_codes` |

**Meta de cobertura:** 100% em `app/services/` (é onde vive a regra de negócio) e 80% no geral.
A CI falha o job se a cobertura dos services cair abaixo de 100%.

---

## Stack completa em container

```bash
# na raiz do repositório
cp server/.env.example .env    # ajuste o host do banco para `db`
docker compose up -d
```

O `docker-compose.yml` **não constrói mais a imagem localmente** — ele consome a imagem publicada
no GHCR pela CI (`ghcr.io/dalistor/territory-map-server:latest`). Para apontar para outra imagem
ou fixar um commit específico, defina `API_IMAGE` no `.env`:

```
API_IMAGE=ghcr.io/dalistor/territory-map-server:<sha-do-commit>
```

Se precisar construir localmente para testar uma mudança no `Dockerfile`:

```bash
docker build -t ghcr.io/dalistor/territory-map-server:latest ./server
```

### Entrypoint

O container roda `alembic upgrade head` antes de subir o uvicorn
(`server/docker-entrypoint.sh`). O deploy é um `docker compose up -d` puro, então não existe outro
lugar de onde rodar a migration; Alembic é idempotente, então um restart sem nada pendente não faz
nada.

O uvicorn sobe com `--proxy-headers`. Atrás de um proxy reverso, defina `FORWARDED_ALLOW_IPS` com
o endereço do proxy na rede do Docker — o padrão confia apenas no loopback. Isso é obrigatório
para o rate limit funcionar: ele é chaveado por `request.client.host`, e sem isso todos os
chamadores dividem um balde só.

---

## CI/CD

`.github/workflows/server.yml`, disparado em `push` e `pull_request` que toquem `server/**` ou o
próprio workflow.

**Job `test`** — roda sempre:

1. sobe `postgis/postgis:16-3.4` como *service container* com healthcheck e cria o
   `territory_map_test` (o service container não tem como montar o script de init do compose);
2. instala o uv com cache das dependências;
3. `ruff check .` e `ruff format --check .`;
4. `alembic upgrade head`;
5. `pytest --cov=app --cov-report=term-missing`;
6. falha se a cobertura de `app/services/` ficar abaixo de 100%.

**Job `build-and-deploy`** — só em `push` na `main`, depois que o `test` passa:

1. constrói a imagem com Buildx, com cache de layers na cache do Actions;
2. publica em GHCR com as tags `latest` e o SHA do commit, autenticando com o `GITHUB_TOKEN`
   (não é preciso cadastrar token nenhum para isso);
3. conecta por SSH na VPS e roda, no diretório de deploy:
   `docker compose pull && docker compose up -d && docker image prune -f`.

---

## Secrets e variables no GitHub

Tudo vive no **Environment `production`**, restrito à branch `main`. O job `build-and-deploy`
declara `environment: production`; sem essa linha os valores chegariam vazios.

### Secrets

| Nome | O que é |
|------|---------|
| `SSH_PRIVATE_KEY` | chave privada SSH completa, incluindo `-----BEGIN…`/`-----END…` e a quebra de linha final |
| `SSH_KNOWN_HOSTS` | saída de `ssh-keyscan -p <porta> <host>` — fixa a host key e impede que o deploy fale com um intermediário |

### Variables

| Nome | O que é | Valor atual |
|------|---------|-------------|
| `SSH_HOST` | IP ou hostname da VPS | `76.13.160.146` |
| `SSH_USER` | usuário do deploy (precisa usar `docker` sem sudo) | `root` |
| `SSH_PORT` | porta do SSH | `22` |
| `DEPLOY_PATH` | diretório na VPS com o `docker-compose.yml` e o `.env` | `/opt/territory-map` |

Host, usuário e porta são **variables**, não secrets, de propósito: eles aparecem no log e é isso
que torna uma falha de conexão legível. Só a chave privada e o known_hosts são sensíveis.

`GITHUB_TOKEN` não entra na lista — o Actions o fornece sozinho, e o workflow já pede
`packages: write` para publicar no GHCR.

### Como gerar e rotacionar o par de chaves

```bash
ssh-keygen -t ed25519 -C "github-actions-territory-map-main" -f ~/.ssh/territory_map_deploy -N ""
ssh-copy-id -i ~/.ssh/territory_map_deploy.pub -p 22 root@SEU_HOST
gh secret set SSH_PRIVATE_KEY -R Dalistor/Territory-Map --env production < ~/.ssh/territory_map_deploy
```

A passphrase precisa ser vazia (`-N ""`): o runner não tem tty para digitá-la.

### Revogar o acesso

```bash
ssh root@76.13.160.146 "grep -v 'github-actions-territory-map-main' ~/.ssh/authorized_keys > /tmp/ak && mv /tmp/ak ~/.ssh/authorized_keys"
```

```bash
gh secret delete SSH_PRIVATE_KEY -R Dalistor/Territory-Map --env production
```

### Preparar a VPS antes do primeiro deploy

1. Docker e o plugin Compose instalados; o usuário do deploy usando `docker` **sem sudo**.
2. Criar o diretório de `DEPLOY_PATH`. O `docker-compose.yml` e o `docker/postgres/init/` são
   enviados pelo próprio workflow — não precisa copiá-los à mão.
3. Criar o `.env` nesse diretório a partir de `server/.env.example`, com o host do banco em `db`,
   um `JWT_SECRET` real e uma `POSTGRES_PASSWORD` real. Este arquivo **nunca** é enviado nem
   sobrescrito pelo deploy; alterá-lo é sempre manual.
4. Se o pacote do GHCR estiver privado, autenticar uma vez na VPS (`docker login ghcr.io`) — ou
   marcar o pacote como público em `Packages → territory-map-server → Package settings`.
