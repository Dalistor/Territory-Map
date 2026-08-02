# [0017] Rotas de login e de publicadores, com o handler único de DomainError

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 17

## Solicitação

> Spec 0001 — Task 17: Crie `server/app/routers/auth.py` (com `POST /auth/login` e
> `POST /app/activate`) e `server/app/routers/admin_users.py` (`POST /admin/users`,
> `GET /admin/users`, `POST /admin/users/{id}/access-code`, `PATCH /admin/users/{id}`),
> seguindo o contrato da spec 0001, e registre-os em `app/main.py`. Crie também, em
> `app/main.py`, um **exception handler** único para `DomainError` que traduz:
> `NotFoundError`→404, `InvalidCredentialsError`/`InvalidAccessCodeError`/`InactiveUserError`→401,
> `DuplicateNameError`/`DuplicateBlockNumberError`→409, e as demais `DomainError`→422, sempre
> respondendo `{"code": <code>, "detail": <mensagem>}`. Os routers não contêm regra de negócio:
> montam o service com as dependências de `app/core/deps.py` e `get_session`, chamam um método e
> devolvem o DTO. Nenhum endpoint recebe `congregation_id` no corpo ou na URL — ele vem sempre do
> token. Cubra as rotas com testes de rota usando `httpx.ASGITransport`, verificando os status
> codes acima e que a resposta de `POST /admin/users` traz o `access_code`, enquanto o login
> **nunca** devolve `password_hash`. Toque apenas em `app/routers/auth.py`,
> `app/routers/admin_users.py`, `app/main.py` e os testes correspondentes.

## Contexto

Até aqui o servidor tinha models, DTOs, repositories, services e as dependências de
autenticação, mas nenhuma superfície HTTP além de `/health`. Nada do que já estava pronto era
alcançável por um cliente.

Esta task abre a primeira fatia dessa superfície — identidade — e, junto com ela, o mecanismo
que todas as rotas seguintes vão reaproveitar: a tradução de erro de domínio para status code.
Os services já falham com exceção própria (`InvalidCredentialsError`, `NotFoundError`, …); faltava
o único lugar onde esse vocabulário vira HTTP. As Tasks 18 e 19 dependem desse handler existir.

## O que foi feito

**Rotas públicas (`app/routers/auth.py`)**

| Rota | Entrada | Saída |
|------|---------|-------|
| `POST /auth/login` | `LoginIn` (`name`, `city`, `password`) | 200 `TokenOut` |
| `POST /app/activate` | `ActivateIn` (`access_code`) | 200 `ActivateOut` |

**Rotas de admin (`app/routers/admin_users.py`, prefixo `/admin/users`, todas atrás de
`current_congregation`)**

| Rota | Entrada | Saída |
|------|---------|-------|
| `POST /admin/users` | `UserCreateIn` (`name`) | 201 `UserOut` (com `access_code`) |
| `GET /admin/users` | — | 200 `list[UserOut]` |
| `POST /admin/users/{user_id}/access-code` | — | 200 `AccessCodeOut` |
| `PATCH /admin/users/{user_id}` | `UserPatchIn` (`is_active`) | 200 `UserOut` |

**Handler único em `app/main.py`** — `DOMAIN_ERROR_STATUS` mapeia as exceções que não são 422;
`domain_error_status()` percorre o MRO da exceção (subclasse futura herda o status do pai em vez
de cair calada no 422); `domain_error_handler()` responde `{"code", "detail"}` e, em 401, o
cabeçalho `WWW-Authenticate: Bearer`. Registrado com `app.add_exception_handler(DomainError, …)`.

## Arquivos modificados

- `server/app/main.py` — tabela de status, `domain_error_status`, `domain_error_handler`,
  registro do handler e `include_router` dos dois routers

## Arquivos criados

- `server/app/routers/__init__.py` — docstring da camada (o que um router pode e o que não pode)
- `server/app/routers/auth.py` — as duas rotas públicas, `utc_now` e os provedores de service
- `server/app/routers/admin_users.py` — as quatro rotas de publicador
- `server/tests/routers/conftest.py` — `anyio_backend`, `client` (ASGITransport sobre o app real,
  com `get_session` apontado para a transação de teste) e `make_admin`
- `server/tests/routers/test_auth_routes.py` — 13 testes das rotas públicas
- `server/tests/routers/test_admin_users_routes.py` — 15 testes das rotas de admin
- `server/tests/test_main.py` — 16 testes do handler de `DomainError` e do `/health`

## Decisões técnicas

**O handler é uma função nomeada, não um decorator anônimo.** `domain_error_handler` e
`domain_error_status` são públicos em `app/main.py` para que o teste monte um app descartável e
faça cada exceção passar pelo handler real — inclusive as de território e quadra, cujas rotas só
existem na Task 18. Testar a tradução direto, e não através de uma rota, é o que permite cobrir a
tabela inteira agora.

**A tabela é consultada pelo MRO, não pela classe exata.** Um `dict[type, int]` com lookup direto
faria uma futura subclasse de `NotFoundError` responder 422 sem ninguém perceber. Percorrer
`type(error).__mro__` custa nada e transforma o default em decisão explícita.

**401 leva `WWW-Authenticate: Bearer`.** RFC 9110 exige um desafio no 401, e é o mesmo cabeçalho
que `app/core/deps.py` já devolve — as duas famílias de 401 (token ruim e credencial ruim) saem
consistentes.

**`utc_now` mora no router.** O `CLAUDE.md` proíbe `datetime.now()` dentro de service; o router é
a raiz de composição, então é ali que o relógio é lido e injetado como `now_provider`. Nenhum
service ganhou acesso ao relógio real.

**`get_user_service` é importado por `admin_users.py` a partir de `auth.py`.** O ciclo de vida do
publicador é um service só, seja o chamador o admin ou o celular; duplicar a montagem criaria dois
pontos de construção e dois relógios. É import entre irmãos da mesma camada, não travessia de
camada.

**`POST /admin/users` responde 201 e `POST .../access-code` responde 200.** O primeiro cria um
recurso; o segundo altera um recurso existente e devolve a nova representação do código. A spec
não fixa código de sucesso para nenhum dos dois.

**A congregação do `ActivateOut` sai de `user.congregation`, não de uma segunda consulta.** O
código de acesso já identifica o tenant; ler o relacionamento do usuário resolvido é serialização,
não uma decisão sobre quem é o chamador.

**Os testes de rota usam `httpx.ASGITransport` com o `app` real.** Só a sessão é substituída (pela
transação revertida do fixture `session`); routers, dependências de autenticação e handler de erro
são código de produção. O plugin pytest do `anyio` já vem instalado com o starlette, então não foi
preciso adicionar dependência de teste — daí o `anyio_backend` fixado em `asyncio`.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d
cd server && uv run pytest -q
uv run ruff check . && uv run ruff format --check .
```

Manualmente, com o servidor no ar (`uv run uvicorn app.main:app --reload`):

```bash
curl -s -X POST localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"name":"Central","city":"São Paulo","password":"..."}'
# 200 com access_token; senha errada devolve 401 {"code":"invalid_credentials", ...}

curl -s -X POST localhost:8000/admin/users \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Irmão João"}'
# 201 com access_code de 8 caracteres

curl -s -X POST localhost:8000/app/activate \
  -H 'Content-Type: application/json' -d '{"access_code":"XXXXXXXX"}'
# 200 com o token do app; repetir o mesmo código devolve 401 invalid_access_code
```

`GET /docs` lista as seis rotas (`/auth/login`, `/app/activate`, `/admin/users` GET e POST,
`/admin/users/{user_id}/access-code`, `/admin/users/{user_id}`, além de `/health`).

## Resultado da validação

- `uv run pytest -q` → **339 passed** (295 antes desta task, +44 novos)
- `uv run ruff check .` → All checks passed
- `uv run ruff format --check .` → 59 arquivos formatados
- `app.openapi()` gera o schema sem erro e registra exatamente as rotas esperadas
- Revisão de camadas: os routers não têm `if` de domínio nem query; toda falha sai como
  `DomainError` do service e é traduzida em um único lugar; nenhum endpoint aceita
  `congregation_id` no corpo ou na URL
