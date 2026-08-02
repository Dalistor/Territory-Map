# [0012] Dependências de autenticação: token de admin e token de app

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 16

## Solicitação

> Implemente por TDD `server/app/core/deps.py` com as dependências FastAPI
> `current_congregation` (token de admin) e `current_app_user` (token de app), ambas lendo
> `Authorization: Bearer`. (…) Escreva os testes com um app FastAPI mínimo montado no próprio
> teste, expondo duas rotas protegidas. Toque apenas em `app/core/deps.py` e
> `tests/core/test_deps.py`.

## Contexto

O `CLAUDE.md` define dois tokens com poderes muito diferentes: o JWT do admin, que expira em 12h e
pode tudo dentro da congregação, e o token do app, que **não expira** e só lê e registra trabalho.
Os dois chegam pelo mesmo header `Authorization: Bearer`, então a separação real entre `/admin/*` e
`/app/*` acontece aqui — não no roteamento.

Duas consequências de projeto que esta task materializa:

1. **O token do app não é stateless.** Como vale para sempre, a única forma de revogar acesso
   (desativar publicador) e de trocar de aparelho (novo resgate incrementa `token_version`) é
   conferir a linha do banco a cada requisição.
2. **Um 401 que explica o motivo é um oráculo.** "expirado" versus "assinatura inválida" revela que
   a chave está certa; "usuário inativo" confirma que o usuário existe. Todas as recusas respondem
   igual.

## Critérios de aceite

- (a) Token de admin válido resolve a congregação.
- (b) Token de admin expirado, malformado, ausente ou assinado com outra chave → 401.
- (c) Token de app **não** é aceito por `current_congregation`, e token de admin **não** é aceito
  por `current_app_user` — o campo `type` do payload é conferido.
- (d) Token de app válido resolve o usuário e a congregação dele.
- (e) Token de app com `token_version` menor que o do banco → 401 (aparelho antigo).
- (f) Token de app de usuário com `is_active=False` → 401.
- (g) O corpo do 401 é sempre a mesma mensagem genérica, sem dizer qual condição falhou.
- (h) A checagem de `is_active`/`token_version` bate no banco a cada chamada.

Bordas derivadas destes critérios: congregação/usuário que não existem mais no banco, e token
assinado por nós mas sem um claim de identificação utilizável.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `admin_token_resolves_the_congregation_of_the_token` | `tests/core/test_deps.py` | `current_congregation` lendo o bearer, decodificando e buscando a congregação pelo repositório |
| 2 | `admin_route_without_an_authorization_header_is_unauthorized` | idem | `HTTPBearer(auto_error=False)` + `_unauthorized()` com a mensagem genérica |
| 3 | `untrustworthy_admin_token_is_unauthorized` (malformado, outra chave, expirado) | idem | `_payload()` traduzindo `TokenError` no mesmo 401 |
| 4 | `app_token_is_not_accepted_on_an_admin_route` | idem | `_payload_of_type()` conferindo o claim `type` |
| 5 | `admin_token_of_a_congregation_no_longer_in_the_database_is_unauthorized` + `admin_token_without_a_usable_congregation_claim_is_unauthorized` | idem | `_uuid_claim()` e a recusa quando o repositório devolve `None` |
| 6 | `app_token_resolves_the_user_and_the_congregation_of_that_user` | idem | `current_app_user` resolvendo o usuário pelo `UserRepository` |
| 7 | `admin_token_is_not_accepted_on_an_app_route` | idem | (nenhum — cobre o mesmo `_payload_of_type` do ciclo 4; ver Decisões técnicas) |
| 8 | `app_token_whose_version_does_not_match_the_row_is_unauthorized` (menor e maior) | idem | comparação de `token_version` com o valor da linha |
| 9 | `app_token_of_a_deactivated_user_is_unauthorized` (+ usuário inexistente) | idem | checagem de `is_active` |
| 10 | `every_app_request_rereads_is_active_and_token_version_from_the_database` | idem | (nenhum — guarda de regressão contra qualquer cache futuro) |
| 11 | `every_rejection_answers_with_the_same_generic_body` + `the_generic_message_names_none_of_the_conditions` | idem | (nenhum — fixa o contrato do corpo do 401) |

## O que foi feito

`app/core/deps.py` passou a existir com duas dependências FastAPI e três helpers privados:

- `current_congregation` — exige `type == "admin"`, lê `congregation_id` do payload e devolve a
  `Congregation` do banco.
- `current_app_user` — exige `type == "app"`, lê `user_id`, carrega o `User` e só o devolve se a
  linha disser que ele está ativo e que o `token_version` do token é o atual.
- `UNAUTHORIZED_DETAIL` — a única mensagem que qualquer recusa produz, exportada para que os
  routers e os testes se refiram a uma fonte só.

Os testes montam um app FastAPI descartável com `/admin/whoami` e `/app/whoami`, uma rota por
dependência, e dirigem tudo por HTTP com `TestClient`.

## Arquivos criados

- `server/app/core/deps.py` — as dependências de autenticação das rotas.
- `server/tests/core/test_deps.py` — 24 testes de comportamento sobre um app FastAPI mínimo.

## Decisões técnicas

- **Sessão dublê em vez do PostGIS real.** A task restringe o escopo a dois arquivos, e não existe
  ainda fixture de banco em `tests/` (`conftest.py` não existe; as tasks 09/10 foram diretas). O
  teste substitui `get_session` por um `FakeSession` que registra cada leitura — os **repositórios
  exercitados são os reais**, e o dublê é a fronteira do banco, como o `CLAUDE.md` prescreve para
  teste não geométrico. Esse dublê é justamente o que torna o critério (h) observável: o teste
  afirma a lista exata de leituras feitas. As Tasks 19 e 21 cobrem as mesmas dependências contra
  banco real, ponta a ponta.
- **`token_version` é comparado por igualdade, não por "menor que".** A spec pede 401 para versão
  menor; o `CLAUDE.md` pede que a versão "bata com a da linha". Igualdade satisfaz os dois e é mais
  estrita — o contador só cresce, então uma versão maior que a da linha não pode ter sido emitida
  por este servidor. Há teste para os dois sentidos.
- **A congregação do app vem da linha do usuário, não do claim.** O token carrega
  `congregation_id`, mas quem manda é `user.congregation_id`. É a regra do `CLAUDE.md` de nunca
  aceitar o tenant de fora, aplicada até ao próprio payload assinado.
- **`HTTPBearer(auto_error=False)`.** Com `auto_error=True` o Starlette responderia `{"detail":
  "Not authenticated"}` no caso de header ausente — um corpo diferente dos demais, que já
  distinguiria essa condição das outras. Desligar o erro automático é o que mantém as doze recusas
  idênticas.
- **`_uuid_claim` existe para não transformar payload estranho em 500.** Um token assinado sem
  `congregation_id`/`user_id` não sai de `create_admin_token`/`create_app_token`, mas se aparecer, a
  resposta certa é o mesmo 401 — não um erro de servidor. Coberto por teste.
- **Dois testes passaram sem exigir código novo** (ciclos 7, 10 e 11). Foram investigados em vez de
  aceitos: cada um foi validado por **mutação** — removendo o check de `type` e depois as checagens
  de `is_active`/`token_version` do código de produção, e confirmando que exatamente esses testes
  ficam vermelhos. O teste do ciclo 7 **falhou** nessa verificação na primeira versão (um token de
  admin comum não tem `user_id`, então ele era recusado por um claim faltando, não pelo `type`) e
  foi reescrito para carregar todos os claims do app e diferir apenas no `type`.
- **Sem alias `Annotated` de conveniência para os routers.** Nada nos testes exigiu, e as tasks 17
  a 19 podem declarar `Depends(current_congregation)` diretamente.
- **Deliberadamente sem teste:** um payload cujo `token_version` seja um booleano JSON (`true == 1`
  em Python). Forjar isso exige a chave de assinatura — quem a tem produz qualquer token, e nenhuma
  checagem aqui ajuda.

## Como validar

```bash
cd server && uv run pytest tests/core/test_deps.py -v
cd server && uv run pytest tests/core/test_deps.py --cov=app.core.deps --cov-branch --cov-report=term-missing
```

## Resultado da validação

- `uv run pytest tests/core/test_deps.py -q` → **24 passed**.
- `uv run pytest tests/core tests/schemas -q` → **166 passed** (nenhuma regressão).
- Cobertura de `app/core/deps.py`: **100% de linha e 100% de branch** (48 statements, 10 branches,
  0 partial).
- `uv run ruff check` e `uv run ruff format --check` nos dois arquivos: limpos.
- A suíte inteira (`uv run pytest`) tinha 15 falhas no momento da validação, **todas** em
  `tests/services/` — as Tasks 11 e 12 estavam em ciclo RED em paralelo. Nenhuma falha em
  `tests/core/` ou `tests/schemas/`.
