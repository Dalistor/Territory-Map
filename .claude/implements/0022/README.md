# [0022] CI/CD: testes, imagem no GHCR e deploy por SSH

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 22

## Solicitação

> Spec 0001 — Task 22: Crie `.github/workflows/server.yml`. Job **test**: dispara em `push` e
> `pull_request` com `paths: server/**` e o próprio workflow; sobe `postgis/postgis:16-3.4` como
> *service container* com healthcheck; instala uv com cache; roda `ruff check` e
> `ruff format --check`; aplica `alembic upgrade head`; roda
> `pytest --cov=app --cov-report=term-missing`; **falha o job se a cobertura de `app/services/`
> ficar abaixo de 100%**. Job **build-and-deploy**: só em `push` na `main`, `needs: test`; constrói
> a imagem com Buildx e cache de layers e publica em **GHCR** com as tags `latest` e o SHA do
> commit, usando `GITHUB_TOKEN`; em seguida conecta por SSH (`appleboy/ssh-action`) e executa no
> diretório de deploy `docker compose pull && docker compose up -d && docker image prune -f`.
> Parametrize com os secrets `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT` e a variável
> `DEPLOY_PATH`. Ajuste `docker-compose.yml` para consumir a imagem do GHCR em vez de construir
> localmente, e faça o serviço `api` rodar `alembic upgrade head` antes do uvicorn no entrypoint.
> Crie `server/README.md` documentando os comandos locais e **listando exatamente quais secrets e
> variables precisam ser cadastrados no GitHub** — você não deve cadastrá-los nem pedir a chave
> privada a ninguém; deixe isso registrado como passo manual do usuário. Toque apenas em
> `.github/workflows/`, `docker-compose.yml`, `server/Dockerfile`, o entrypoint e
> `server/README.md`.

## Contexto

Última task da spec 0001. O servidor estava completo e testado (438 testes, 100% nos services), mas
nada disso rodava fora da máquina do desenvolvedor e o deploy não existia: o `docker-compose.yml`
construía a imagem localmente e ninguém aplicava as migrations em produção.

## O que foi feito

**Workflow `server` em duas etapas.** O job `test` reproduz na CI exatamente o que se roda
localmente — PostGIS real como service container, lint, formatação, migrations e a suíte com
cobertura — e termina com um portão que falha o job se `app/services/` sair de 100%. O job
`build-and-deploy` só existe em `push` na `main`, depende do `test`, publica a imagem no GHCR com
`latest` + SHA e dispara o rollout por SSH.

**Migração passou a ser responsabilidade do container.** O deploy é um `docker compose up -d` puro
contra uma imagem recém-baixada; não há outro lugar de onde rodar `alembic upgrade head`. O novo
`server/docker-entrypoint.sh` aplica as migrations e só então dá `exec` no uvicorn.

**`docker-compose.yml` virou consumidor, não construtor** — puxa a imagem do GHCR.

**`server/README.md`** documenta os comandos locais e lista os secrets/variables que **o usuário**
precisa cadastrar à mão.

## Arquivos modificados

- `docker-compose.yml` — serviço `api` trocou `build:` por
  `image: ${API_IMAGE:-ghcr.io/dalistor/territory-map-server:latest}`; comentário de cabeçalho
  explicando de onde vem a imagem e como fixar um SHA
- `server/Dockerfile` — `RUN chmod +x /app/docker-entrypoint.sh` (ainda como root) e o `CMD` do
  uvicorn virou `ENTRYPOINT ["/app/docker-entrypoint.sh"]`

## Arquivos criados

- `.github/workflows/server.yml` — os jobs `test` e `build-and-deploy`
- `server/docker-entrypoint.sh` — `alembic upgrade head` e depois `exec uvicorn … --proxy-headers`
- `server/README.md` — comandos locais, explicação da CI/CD e a lista dos secrets e variables a
  cadastrar manualmente no GitHub

## Decisões técnicas

**O test database é criado por um step, não pelo script de init.** Um *service container* do
Actions sobe antes do `checkout`, então não há como montar `docker/postgres/init/` nele. O step
`Create the test database with PostGIS` faz por `psql` o que aquele script faz no compose. O
`POSTGRES_DB` do service já é `territory_map`, e a imagem PostGIS habilita a extensão nele
sozinha — o step só garante o `territory_map_test`.

**O portão de cobertura é um step separado, não um `--cov-fail-under`.** `--cov-fail-under` avalia o
total do relatório, e o alvo aqui é uma pasta só. Um segundo passo,
`coverage report --include="app/services/*" --fail-under=100`, lê o `.coverage` que o pytest acabou
de escrever e falha só pelo que interessa — deixando o relatório geral visível e informativo. Foi
verificado nos dois sentidos: passa com 100% e sai com código 1 quando o limiar não é atingido.

**Migração no entrypoint, não num job separado no runner.** O runner do GitHub não alcança o banco
da VPS (nem deveria — abrir o Postgres para a internet por causa do deploy é pior que o problema).
Rodar no container é o único ponto que tem rede para o banco e a versão certa do código ao mesmo
tempo. Alembic é idempotente, então restart sem nada pendente é no-op. O risco conhecido é várias
réplicas subindo juntas; a stack tem um `api` só.

**`--proxy-headers` com `FORWARDED_ALLOW_IPS` configurável e padrão restrito.** O `CLAUDE.md` exige
`--proxy-headers` em produção porque o rate limit é chaveado por `request.client.host`. Mas confiar
em `X-Forwarded-For` de qualquer origem seria pior que não ter proxy header nenhum: qualquer cliente
forjaria o IP e escaparia do limite. O padrão é o loopback e o operador aponta explicitamente para
o proxy — está documentado no `server/README.md`.

**Nome da imagem resolvido em runtime.** O GHCR recusa maiúscula no caminho e o repositório é
`Dalistor/Territory-Map`, então um step passa `github.repository` por `tr '[:upper:]' '[:lower:]'`
em vez de deixar a string fixa no workflow — assim um fork ou uma renomeação não quebra o push.

**`API_IMAGE` com default no compose, em vez de variável obrigatória.** A task não permite tocar em
`.env.example`, e uma variável obrigatória sem lugar documentado para declará-la quebraria o
`docker compose up` de quem não soubesse. O default aponta para a imagem oficial do projeto e o
override continua disponível para fixar um SHA.

**`set -eu` no script remoto, sem `pipefail`.** O shell de login da VPS não é garantidamente bash.

**Nada foi cadastrado no GitHub.** Nenhum secret criado, nenhuma chave gerada, nenhuma chave privada
pedida a ninguém — a task pede explicitamente que isso fique como passo manual do usuário, e é o
tratamento correto para material de credencial. O que existe é a lista do que cadastrar e o comando
de `ssh-keygen` para o usuário rodar na máquina dele.

## Como validar

Localmente, tudo a partir de `server/` (o banco de dev precisa estar de pé):

```bash
uv run ruff check . && uv run ruff format --check .
uv run alembic upgrade head
uv run pytest --cov=app --cov-report=term-missing
uv run python -m coverage report --include="app/services/*" --show-missing --fail-under=100
```

Imagem e entrypoint:

```bash
docker build -t territory-map-server:check ./server
docker run --rm -p 18000:8000 \
  -e DATABASE_URL='postgresql+psycopg://territory:territory@host.docker.internal:5432/territory_map' \
  -e TEST_DATABASE_URL='postgresql+psycopg://territory:territory@host.docker.internal:5432/territory_map_test' \
  -e JWT_SECRET=local-check territory-map-server:check
curl -s http://localhost:18000/health
```

Compose apontando para o GHCR: `docker compose config` deve mostrar
`image: ghcr.io/dalistor/territory-map-server:latest`, e com `API_IMAGE=…:<sha>` no ambiente deve
mostrar o SHA.

Na primeira execução real da CI, o job `build-and-deploy` só roda depois que os secrets e a variable
do `server/README.md` estiverem cadastrados.

## Resultado da validação

- `ruff check .` — All checks passed
- `ruff format --check .` — 79 files already formatted
- `alembic upgrade head` — limpo
- `pytest --cov=app --cov-report=term-missing` — **438 passed**, cobertura total 98%
- Portão de cobertura — `app/services/` em **100%** (255 statements, 0 miss), exit 0; com o limiar
  artificialmente elevado o comando sai com código 1, confirmando que o portão realmente barra
- YAML do workflow e dos dois compose parseiam; `docker compose config` resolve a imagem do GHCR e
  respeita o override `API_IMAGE`
- `sh -n server/docker-entrypoint.sh` — sintaxe válida
- Imagem construída com sucesso; container contra um banco **vazio** aplicou as duas migrations
  (`enable postgis`, `initial schema`), criou as cinco tabelas e respondeu `200 {"status":"ok"}` em
  `/health`; segundo boot contra o banco já migrado não fez nada e subiu igual (idempotência
  confirmada)
- O workflow em si não pode ser executado desta máquina — depende de runner do GitHub, do GHCR e da
  VPS. A validação local cobriu cada comando que ele roda, exceto o push para o registry e o step
  de SSH.

## Pendência do usuário (não executada de propósito)

Cadastrar em `Settings → Secrets and variables → Actions`:

- **Secrets:** `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT`
- **Variable:** `DEPLOY_PATH`

`GITHUB_TOKEN` não precisa ser cadastrado. Detalhes, geração do par de chaves e preparação da VPS
estão em `server/README.md`.
