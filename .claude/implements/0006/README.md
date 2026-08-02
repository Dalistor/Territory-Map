# [0006] Segurança: hash de senha, código de acesso e tokens JWT

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 06

## Solicitação

> Spec 0001 — Task 06: Implemente por TDD `server/app/core/security.py`. Funções:
> `hash_password(raw) -> str` e `verify_password(raw, hash) -> bool` com bcrypt via passlib;
> `generate_access_code(length=8) -> str`; `create_admin_token(congregation_id, now) -> str`;
> `create_app_token(user_id, congregation_id, token_version) -> str`; `decode_token(token) -> dict`.
> (…) O tempo é sempre recebido como parâmetro, nunca lido de `datetime.now()` dentro do módulo.
> Toque apenas em `app/core/security.py` e `tests/core/test_security.py`.

## Contexto

São as primitivas de segurança sobre as quais o resto do servidor se apoia: o login do admin
(Task 11), o ciclo de vida do código de acesso (Task 12) e as dependências de autenticação
(Task 16) consomem este módulo. Por isso ele é testado isoladamente e sem banco — não depende de
nenhuma outra camada, só de `app/core/config.py`.

Duas características do projeto moldam o módulo:

- **O token do app não expira.** Ele vive para sempre no aparelho; o que o torna revogável é o
  `token_version`, conferido no banco a cada requisição.
- **O código de acesso é lido em voz alta e digitado à mão.** Legibilidade importa mais que
  tamanho, daí o alfabeto sem caracteres ambíguos.

## Critérios de aceite

- (a) `verify_password` aceita a senha correta e rejeita a errada
- (b) dois hashes da mesma senha diferem entre si (salt) e ambos verificam
- (c) `generate_access_code` devolve 8 caracteres, todos do alfabeto informado, sem `0 O 1 I L`
- (d) 1000 chamadas produzem pelo menos 999 valores distintos
- (e) usa `secrets`, não `random`
- (f) token de admin traz `congregation_id`, `type == "admin"` e `exp` 12h à frente do `now` injetado
- (g) token de admin expirado levanta erro ao decodificar
- (h) token de app traz `user_id`, `congregation_id`, `token_version`, `type == "app"` e **sem** `exp`
- (i) token assinado com outra chave é rejeitado
- (j) string arbitrária é rejeitada
- (k) o tempo é sempre parâmetro, nunca `datetime.now()` dentro do módulo

## Ciclos TDD

Todos em `tests/core/test_security.py`; o código de produção é `app/core/security.py`.

| # | Caso de teste | RED | Código que passou a existir |
|---|---------------|-----|------------------------------|
| 1 | `verify_password` aceita a senha correta | sim (`NotImplementedError`) | `CryptContext` bcrypt, `hash_password`, `verify_password` |
| 2 | `verify_password` rejeita a senha errada | passou de primeira — validado por mutação (`return True` mata o teste) | — |
| 3 | dois hashes da mesma senha diferem e ambos verificam | passou de primeira — validado por mutação (sha256 sem salt mata o teste) | — |
| 4 | código tem 8 caracteres | sim (`ImportError`) | `ACCESS_CODE_ALPHABET`, `ACCESS_CODE_LENGTH`, `generate_access_code` |
| 5 | código usa só o alfabeto inequívoco / nunca emite `0 O 1 I L` | **sim, falha real**: o alfabeto da spec continha `L` | remoção do `L` do alfabeto |
| 6 | `length` customizado é respeitado | passou de primeira | — |
| 7 | 1000 códigos dão ≥ 999 distintos | passou de primeira — validado por mutação (`length=1` mata o teste) | — |
| 8 | a geração passa por `secrets.choice` (espião) | passou de primeira — validado por mutação (`random.choice` mata o teste) | — |
| 9 | o módulo não importa nem chama `random` | passou de primeira — validado pela mesma mutação | — |
| 10 | token de admin traz `congregation_id` e `type == "admin"` | sim (`ImportError`) | `create_admin_token`, `decode_token` |
| 11 | `exp` fica 12h à frente do `now` injetado | passou de primeira — validado por mutação (`now = datetime.now()` mata o teste) | — |
| 12 | token de admin expirado é rejeitado | sim (`ImportError` de `TokenError`) | alias `TokenError = JWTError` |
| 13 | token de app traz user, congregação e versão | sim (`ImportError`) | `create_app_token` |
| 14 | token de app não expira (`exp` ausente) | passou de primeira | — |
| 15 | token assinado com outra chave é rejeitado | passou de primeira | — |
| 16 | string arbitrária é rejeitada (4 casos parametrizados) | passou de primeira | — |
| 17 | o módulo nunca lê o relógio | **sim, falha real**: o teste por texto batia na própria docstring | teste reescrito para inspeção de AST |

**Refactor:** extração de `_encode()` (a chamada a `jwt.encode` estava duplicada nos dois
criadores de token), constantes `ADMIN_TOKEN_TYPE`/`APP_TOKEN_TYPE` no lugar das strings mágicas,
e no teste o helper `_characters_seen()` para o laço de amostragem repetido.

## O que foi feito

`app/core/security.py` com seis funções públicas, um alias de exceção e três constantes:

- `hash_password` / `verify_password` — bcrypt via `passlib.CryptContext`, salt por hash.
- `generate_access_code(length=8)` — `secrets.choice` sobre `ACCESS_CODE_ALPHABET`.
- `create_admin_token(congregation_id, now)` — `exp = now + ADMIN_TOKEN_TTL_HOURS`.
- `create_app_token(user_id, congregation_id, token_version)` — sem `exp`, sem relógio.
- `decode_token(token)` — valida assinatura e expiração; levanta `TokenError`.
- `TokenError`, `ADMIN_TOKEN_TYPE`, `APP_TOKEN_TYPE`, `ACCESS_CODE_ALPHABET`, `ACCESS_CODE_LENGTH`.

## Arquivos criados

- `server/app/core/security.py` — as primitivas de segurança
- `server/tests/core/test_security.py` — 21 testes

## Decisões técnicas

**O `L` saiu do alfabeto — a spec se contradizia.** O critério (c) dava o alfabeto literal
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` e, na mesma frase, exigia que o código não tivesse
`0 O 1 I L` — mas aquela string **contém `L`**. Os dois critérios só são satisfeitos ao mesmo
tempo removendo o `L`: a saída continua sendo um **subconjunto** do alfabeto informado e não
contém nenhum caractere proibido. Ficam 31 símbolos, ou 31⁸ ≈ 8,5·10¹¹ combinações — de sobra
para uma credencial de uso único que vive 24 horas. `ACCESS_CODE_ALPHABET` é exportada, então
quem precisar validar um código deve usar a constante, nunca reescrever a string.
Vale notar que o `CLAUDE.md` lista os ambíguos como `0/O` e `1/I/l` — com `l` **minúsculo**, que
num alfabeto só de maiúsculas não se aplica. Se o `L` maiúsculo for desejável de volta, é uma
linha em `ACCESS_CODE_ALPHABET` e o teste do critério (c) acompanha.

**`TokenError` é um alias de `jose.JWTError`, e não uma `DomainError`.** Duas razões: nenhum outro
módulo precisa importar `jose` (trocar a biblioteca de JWT fica confinado a este arquivo), e um
token recusado é falha de autenticação tratada pela dependência da Task 16 com um 401 genérico,
não violação de regra de negócio. Criar uma exceção nova em `app/core/exceptions.py` também
sairia do escopo desta task.

**Configuração lida em tempo de chamada, não de import.** `get_settings()` é chamada dentro das
funções, então um teste pode limpar o cache e trocar `JWT_SECRET` sem recarregar o módulo.

**`create_app_token` não recebe `now`** — de propósito. Não há relógio envolvido, porque o token
não tem `exp`; um parâmetro de tempo ali seria inútil e sugeriria uma expiração que não existe.

**Sem `iat` nos tokens.** Nenhum critério pediu, e a regra é não escrever código que teste algum
não exija. Se a auditoria vier a precisar, entra com o teste correspondente.

**Os critérios (e) e (k) são verificados por AST, não por texto.** Não existe forma black-box de
distinguir um CSPRNG de um PRNG pela saída, nem de provar que o módulo não lê o relógio. A
primeira versão do teste procurava substrings no fonte e falhou batendo na **própria docstring**
que dizia "nunca `datetime.now()`" — em vez de afrouxar a asserção, o teste foi reescrito para
percorrer a árvore sintática e olhar só chamadas reais. O critério (e) tem ainda uma verificação
de comportamento: um espião em `secrets.choice` confirma que a geração passa por lá em tempo de
execução, não só que a palavra aparece no arquivo.

**Testes que passaram de primeira foram validados por mutação.** Sete casos passaram sem RED
porque a implementação de um ciclo anterior já os cobria. Para não reportar cobertura falsa, cada
um foi checado quebrando deliberadamente a implementação e confirmando que o teste falha; as
mutações estão na coluna RED da tabela acima. Nenhuma mutação ficou no código.

## Como validar

```bash
cd server
uv run pytest tests/core/test_security.py -v
uv run pytest tests/core/test_security.py --cov=app.core.security --cov-report=term-missing --cov-branch
uv run ruff check app/core/security.py tests/core/test_security.py
```

## Resultado da validação

- `uv run pytest tests/core/test_security.py` → **21 passed**
- Cobertura de `app/core/security.py`: **100% de linha e 100% de branch** (30 statements, 0 miss,
  0 branch parcial)
- `uv run pytest tests/` (suíte completa do servidor) → **48 passed**, nenhuma regressão
- `uv run ruff check` → All checks passed · `uv run ruff format --check` → 2 files already formatted

Aviso conhecido e não relacionado: `DeprecationWarning: 'crypt' is deprecated`, emitido pelo
`passlib` no Python 3.12. O `pyproject.toml` já fixa `>=3.12,<3.13` por causa disso.
