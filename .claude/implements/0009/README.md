# [0009] Repositories de Congregation e User

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 09

## Solicitação

> Spec 0001 — Task 09: Crie `server/app/repositories/congregation.py` e `user.py`. Cada repositório é
> uma classe que recebe a `Session` no construtor. `CongregationRepository`:
> `get_by_name_and_city(name, city)`, `get(id)`, `create(...)`. `UserRepository`: `get(id)`,
> `get_by_access_code(code)` (ignora código nulo), `list_by_congregation(congregation_id)`,
> `create(...)`, `set_access_code(user, code, expires_at)`, `redeem_code(user, now)` — que numa única
> operação zera `access_code`/`access_code_expires_at`, grava `activated_at` e incrementa
> `token_version` —, `set_active(user, is_active)`, `expire_codes(now)` que limpa em lote os códigos
> vencidos e devolve a quantidade afetada. Nenhum método decide regra de negócio, valida credencial ou
> levanta exceção de domínio: quem não achou devolve `None`. Nenhum método faz `commit` — a transação
> é da sessão. Toque apenas em `app/repositories/`; não altere models, services nem routers.

## Contexto

Primeira camada de repositories do projeto. Os models de identidade já existiam (implements/0004) e o
schema já estava versionado (implements/0007), mas nada ainda lia ou escrevia neles. As Tasks 11
(`AuthService`), 12 (`UserService`) e 16 (deps de autenticação) dependem desta camada.

O ponto delicado da task é o ciclo de vida do `access_code`: ele é credencial descartável, some da
linha ao ser resgatado e o resgate precisa ser atômico com o incremento de `token_version` — é o que
sustenta a regra "um usuário, um aparelho ativo".

## O que foi feito

Criada a pasta `app/repositories/` com duas classes, cada uma recebendo a `Session` no construtor e
guardando-a em `self._session`.

**`CongregationRepository`** — `get(congregation_id)`, `get_by_name_and_city(name, city)` e
`create(*, name, city, password_hash)`.

**`UserRepository`** — `get`, `get_by_access_code`, `list_by_congregation`, `create`,
`set_access_code`, `redeem_code`, `set_active` e `expire_codes`.

Nenhum método importa `app/core/exceptions.py`, nenhum chama `commit`, e nenhum recebe ou compara
senha/credencial. Quem não achou devolve `None`; `list_by_congregation` devolve lista vazia.

## Arquivos criados

- `server/app/repositories/__init__.py` — docstring da camada: o contrato de que repositório não
  decide regra, não levanta `DomainError` e não faz commit, e a distinção entre `flush` e `commit`
- `server/app/repositories/congregation.py` — `CongregationRepository`
- `server/app/repositories/user.py` — `UserRepository`

## Arquivos modificados

Nenhum. A task é aditiva: models, schemas e core ficaram intactos.

## Decisões técnicas

**`create` faz `flush`, não `commit`.** O `id` vem de `uuid4` como default Python, aplicado só no
flush — sem ele o chamador recebe um objeto com `id = None` e a Task 12 não consegue montar o
`UserOut`. `flush` escreve dentro da transação aberta e continua sendo desfeito por um rollback, então
a transação segue sendo da sessão, como a task exige.

**`redeem_code` é um `UPDATE` só, com o incremento feito no banco.** Os quatro campos são atribuídos
no objeto e um único flush os escreve juntos. O `token_version` é atribuído como expressão SQL
(`User.token_version + 1`), não como `user.token_version + 1` em Python: assim a aritmética acontece
sobre o valor corrente da linha, e não sobre um número que a sessão pode ter lido antes. Verificado
com um listener de `before_cursor_execute` — o statement emitido é

```
UPDATE users SET access_code=..., access_code_expires_at=..., activated_at=...,
       token_version=(users.token_version + 1) WHERE users.id = ...
```

Um resgate meio aplicado deixaria um código vivo para trás ou emitiria um token de versão já defasada.

**`refresh` depois do flush no `redeem_code`.** A expressão SQL deixa `token_version` expirado na
instância; sem o refresh o chamador leria um objeto `BinaryExpression`, não um `int`. O token de app é
cunhado a partir desse número, então ele precisa estar concreto na volta. Custa um SELECT por resgate
— irrelevante no volume do projeto.

**`get_by_access_code` faz curto-circuito em código nulo ou vazio.** `WHERE access_code = NULL` nunca
é verdadeiro em SQL, então a proteção já existiria; o `if not code: return None` torna a intenção
explícita e evita a ida ao banco. A maioria das linhas tem `access_code IS NULL` justamente porque o
código é apagado no resgate.

**`expire_codes` limpa `access_code_expires_at` junto com o código.** A task só pede "limpa os códigos
vencidos", mas uma validade apontando para um código que não existe mais é dado morto — e o
`UserOut` expõe os dois campos, então o admin veria uma data de expiração de um código já inexistente.
O `redeem_code` zera os dois pelo mesmo motivo; manter os dois caminhos consistentes.

**`expire_codes` usa `synchronize_session="fetch"`.** O `UPDATE` em lote é uma statement só,
independente de quantos códigos estejam vencidos, mas por padrão ele não atualizaria os objetos já
carregados na sessão. Com `fetch`, um chamador que segurava uma instância não lê um código que o banco
acabou de apagar. O `rowcount` continua correto — confirmado no smoke test.

**Comparação de expiração é `access_code_expires_at < now`, estrita.** Exatamente no instante da
validade o código ainda vale; a Task 12 descreve expirado como "`now` além da validade".

**`list_by_congregation` ordena por `name` e desempata por `created_at`.** Ordenação não é regra de
negócio, e sem ela o Postgres não garante ordem estável entre chamadas. Alfabético é o que a tela do
admin quer.

**Escopo por congregação não é filtrado aqui em `get`.** `get(user_id)` devolve o usuário
independentemente da congregação — checar se o chamador é dono da linha é autorização, proibida nesta
camada pela tabela do `CLAUDE.md`. A Task 12 já prevê `NotFoundError` no service para usuário de outra
congregação.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d
cd server
DATABASE_URL="postgresql+psycopg://territory:territory@localhost:5432/territory_map_test" \
  uv run alembic upgrade head
uv run ruff check . && uv run ruff format --check .
uv run pytest -q
```

Esta task não tem testes próprios (é acesso a dados sem regra; o `CLAUDE.md` pede TDD em regra de
negócio). A camada é exercitada de verdade pelas Tasks 11, 12 e 16, que rodam por TDD contra PostGIS
real.

## Resultado da validação

- **Smoke test contra PostGIS real** (script descartável, tudo em transação com rollback, não versionado):
  confirmou `create` devolvendo `id` preenchido; `get`/`get_by_name_and_city` achando e devolvendo
  `None` quando não acha; `get_by_access_code` resolvendo o código certo e devolvendo `None` para
  código inexistente, `None` e `""`; `list_by_congregation` alfabético e isolado por congregação;
  `redeem_code` zerando os dois campos do código, gravando `activated_at` e levando `token_version`
  de 0 → 1 → 2 em dois resgates, com o valor voltando como `int`; `set_access_code` substituindo o
  código anterior; `set_active` nos dois sentidos; `expire_codes` devolvendo exatamente 2 com dois
  vencidos e um válido, preservando o válido e o usuário já ativado, sincronizando as instâncias
  carregadas, e devolvendo 0 na segunda execução seguida (idempotente).
- **SQL do `redeem_code` inspecionado** com listener de `before_cursor_execute`: um único `UPDATE`
  com `token_version=(users.token_version + 1)`, mais o SELECT do refresh.
- `uv run ruff check .` — All checks passed
- `uv run ruff format --check .` — 3 files already formatted
- `uv run pytest -q` — **142 passed** (nenhuma regressão nas suítes de core e schemas)

## Revisão de camadas

`app/repositories/` importa apenas `sqlalchemy` e `app/models/`. Sem `DomainError`, sem `commit`, sem
FastAPI, sem `HTTPException`, sem decisão de autorização. Direção `service → repository → model`
preservada.
