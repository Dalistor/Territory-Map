# [0008] Schemas Pydantic (DTOs) do servidor

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0001/` — Task 08

## Solicitação

> Spec 0001 — Task 08: Implemente por TDD os DTOs Pydantic v2 em `server/app/schemas/`, seguindo o
> contrato da API descrito na spec 0001: `geo.py` (`LatLngIn/Out`), `auth.py` (`LoginIn`,
> `TokenOut`, `CongregationOut`), `user.py` (`UserCreateIn`, `UserOut`, `UserPatchIn`,
> `AccessCodeOut`, `ActivateIn`, `ActivateOut`), `territory.py` (`TerritoryCreateIn`,
> `TerritoryPatchIn`, `TerritoryOut`), `block.py` (`BlockCreateIn`, `BlockPatchIn`, `BlockOut`),
> `work_log.py` (`WorkedIn`, `WorkLogOut`). Regras: todo campo de texto usa `str` com
> `min_length`/`max_length` e faz `strip`; `boundary` e `polygon` são `list[LatLngIn]` com
> `min_length=3`; `lat` é `Field(ge=-90, le=90)` e `lng` `Field(ge=-180, le=180)`; `number` é `int`
> `ge=1`; `access_code` chega em maiúsculas (normalize com um validator, aceitando minúsculas do
> usuário); `WorkedIn` tem `log_id: UUID` e `worked_at: datetime` **obrigatoriamente
> timezone-aware** (rejeite naive). `UserOut` **nunca** inclui `token_version`; `CongregationOut`
> **nunca** inclui `password_hash`. Critérios de aceite: cada regra acima tem um teste que passa um
> valor válido e um inválido, verificando que o inválido levanta `ValidationError`; um teste
> garante que `UserOut` construído a partir de um objeto com `password_hash`/`token_version` não
> expõe esses campos. Esta camada valida **forma**, nunca regra de negócio — não consulte banco nem
> chame service. Toque apenas em `app/schemas/` e `tests/schemas/`.

## Contexto

Os routers das Tasks 17–19 e os services das Tasks 11–15 precisam de um contrato estável nas
bordas. Sem os DTOs, cada endpoint reinventaria a validação de forma — e é justamente aí que
`password_hash` e `token_version` vazam para uma resposta, ou que um `worked_at` sem fuso entra no
banco. Esta camada existe para que a resposta a essas perguntas seja escrita uma vez.

## Critérios de aceite

Comportamentos observáveis derivados da instrução da task:

1. `LatLngIn` aceita posições dentro dos limites WGS84 (inclusive polos e antimeridiano) e rejeita
   `lat` fora de [-90, 90] e `lng` fora de [-180, 180].
2. `LatLngOut` é construído a partir do `LatLng` de `app/core/geo.py`.
3. Todo campo de texto tipado (nome, cidade) é *stripado* e rejeita branco e excesso de tamanho.
4. `LoginIn` exige nome, cidade e senha; a senha **não** é *stripada*.
5. `CongregationOut` construído de uma linha com `password_hash` não expõe o hash.
6. `TokenOut` traz `token_type` "bearer" por padrão e aninha a congregação.
7. `UserCreateIn` aceita só o nome — nada de `congregation_id` vindo do cliente.
8. `UserOut` expõe exatamente `{id, name, access_code, access_code_expires_at, activated_at,
   is_active}` e nunca `token_version` nem `password_hash`, mesmo validando um objeto que os tem.
9. `UserPatchIn` exige `is_active` booleano e rejeita valor que não é booleano.
10. `ActivateIn` normaliza para maiúsculas, faz *strip* e rejeita código de tamanho errado.
11. `ActivateOut` devolve token, usuário (só identidade) e congregação.
12. `boundary` e `polygon` exigem no mínimo 3 pontos, inclusive no corpo de PATCH.
13. `number` é inteiro `ge=1` — 0 e negativos são rejeitados.
14. Corpos de PATCH aceitam ausência de campo (edição parcial) sem afrouxar as regras dos campos
    presentes.
15. `WorkedIn` exige `log_id` UUID e `worked_at` **timezone-aware**; naive é rejeitado.
16. `WorkLogOut` nomeia o publicador sem expor estado interno da conta.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | posição dentro/fora dos limites WGS84; `LatLngOut` a partir do `LatLng` do core | `server/tests/schemas/test_geo_schemas.py` | `app/schemas/geo.py` com `LatLngIn`/`LatLngOut` |
| 2 | login *stripa* nome e cidade, preserva a senha, e `CongregationOut` não vaza o hash | `server/tests/schemas/test_auth_schemas.py` | `app/schemas/common.py` (`ShortText`, `Password`, `OutSchema`) e `app/schemas/auth.py` |
| 3 | `UserOut` a partir de objeto com `password_hash`/`token_version` não os expõe; `ActivateIn` normaliza o código | `server/tests/schemas/test_user_schemas.py` | `app/schemas/user.py` com os seis DTOs mais `UserBriefOut` |
| 4 | anel com menos de 3 pontos e `number` abaixo de 1 são rejeitados, no POST e no PATCH | `server/tests/schemas/test_block_schemas.py` | `app/schemas/block.py` e os aliases `RingIn`/`RingOut` em `geo.py` |
| 5 | território exige nome válido e demarcação de 3+ pontos; `TerritoryOut` carrega as quadras | `server/tests/schemas/test_territory_schemas.py` | `app/schemas/territory.py` |
| 6 | `worked_at` naive é rejeitado, com fuso é aceito; `log_id` precisa ser UUID | `server/tests/schemas/test_work_log_schemas.py` | `app/schemas/work_log.py` |

Dois ciclos exigiram correção **do teste**, não do código:

- **Ciclo 2** — o teste pedia que uma senha só de espaços fosse rejeitada. Como a senha
  deliberadamente não é *stripada*, `"   "` é uma senha de três caracteres. O teste foi reescrito
  para exigir rejeição só da senha vazia, e ganhou um caso afirmando que a senha chega intacta.
- **Ciclo 3** — o helper `user_row(**overrides)` colidia com os próprios kwargs
  (`TypeError: got multiple values`). Corrigido para mesclar dicionários.

## O que foi feito

Criados os oito módulos de `app/schemas/` e os seis arquivos de teste correspondentes. Todos os
DTOs de saída herdam de `OutSchema` (`from_attributes=True`), o que permite validar direto de uma
linha do ORM: a proteção contra vazamento é estrutural — o campo simplesmente não é declarado, então
nenhuma refatoração de model consegue empurrar `password_hash` ou `token_version` para uma resposta.

As restrições de texto e o anel de coordenadas moram em um lugar só (`common.ShortText`,
`geo.RingIn`), para que "nome" signifique a mesma coisa em congregação, publicador e território.

## Arquivos criados

- `server/app/schemas/__init__.py` — docstring do pacote delimitando o papel da camada
- `server/app/schemas/common.py` — `OutSchema`, `ShortText` (1–120, *stripado*), `Password` (1–128)
- `server/app/schemas/geo.py` — `LatLngIn`/`LatLngOut`, `RingIn` (mín. 3 pontos), `RingOut`
- `server/app/schemas/auth.py` — `LoginIn`, `CongregationOut`, `TokenOut`
- `server/app/schemas/user.py` — `UserCreateIn`, `UserOut`, `UserBriefOut`, `UserPatchIn`,
  `AccessCodeOut`, `ActivateIn`, `ActivateOut`
- `server/app/schemas/territory.py` — `TerritoryCreateIn`, `TerritoryPatchIn`, `TerritoryOut`
- `server/app/schemas/block.py` — `BlockCreateIn`, `BlockPatchIn`, `BlockOut`
- `server/app/schemas/work_log.py` — `WorkedIn`, `WorkLogOut`
- `server/tests/schemas/test_geo_schemas.py`
- `server/tests/schemas/test_auth_schemas.py`
- `server/tests/schemas/test_user_schemas.py`
- `server/tests/schemas/test_territory_schemas.py`
- `server/tests/schemas/test_block_schemas.py`
- `server/tests/schemas/test_work_log_schemas.py`

## Arquivos modificados

Nenhum. A task é aditiva.

## Decisões técnicas

- **A senha não é *stripada*, apesar da regra geral de que todo campo de texto faz *strip*.** Uma
  senha é uma sequência de bytes secreta, não um texto de exibição: cortar espaços autenticaria
  contra algo diferente do que o admin digitou. O *strip* continua valendo para todo campo que o
  usuário lê na tela (nome, cidade, código). Documentado no próprio `common.Password`.
- **`Password` limitada a 128 caracteres** apenas como guarda contra corpo gigante. O bcrypt lê no
  máximo 72 bytes; o passlib trunca em silêncio em vez de levantar erro (verificado), então o limite
  não quebra nenhuma senha existente.
- **`ActivateIn` exige exatamente `ACCESS_CODE_LENGTH` caracteres**, importado de
  `app/core/security.py` — o `CLAUDE.md` manda não reescrever o alfabeto/código em outro lugar. O
  alfabeto em si **não** é validado aqui: um código com caractere fora do alfabeto é simplesmente um
  código que não existe, e deve receber a mesma resposta genérica dos demais, no service.
- **Saídas herdam `from_attributes=True`, entradas não.** DTO de entrada nunca é construído a partir
  de objeto; deixá-lo assim evita que um model do ORM seja aceito como corpo de requisição.
- **`RingIn` é `Annotated[list[LatLngIn], Field(min_length=3)]`, não `Field(min_length=3)` no
  campo.** Com a anotação na lista, o mínimo continua valendo dentro de `RingIn | None` no corpo de
  PATCH — pondo a constraint no campo, ela recairia sobre o `nullable` e não seria aplicada.
- **`TerritoryOut.blocks` tem default vazio** em vez de existir um `TerritoryDetailOut` separado: a
  única diferença entre listagem e detalhe seria esse campo.
- **`WorkLogOut` aninha `UserBriefOut` em vez de achatar `user_name`.** Dois publicadores podem ter
  o mesmo primeiro nome, e o id ao lado resolve; de quebra, o DTO valida direto de `log.user`.
- **`AwareDatetime` em vez de validator próprio** para `worked_at`: é a ferramenta que o Pydantic v2
  oferece para exatamente essa regra, e rejeita tanto `datetime` naive quanto string ISO sem offset.
- **Sem `extra="forbid"` nos DTOs de entrada.** Não foi pedido e nenhum teste exige; a decisão de
  recusar campo desconhecido pertence ao contrato da API e pode ser tomada depois, de uma vez.
- **Nomes dos arquivos de teste com sufixo `_schemas`** (`test_geo_schemas.py`), porque
  `tests/core/test_geo.py` já existe e o pytest, sem `__init__.py` nas pastas de teste, colide em
  basenames iguais. É a mesma convenção de nomes únicos que a spec usa nas demais tasks.
- **O que ficou deliberadamente sem teste:** nada. A cobertura de `app/schemas/` é 100% de linha e
  de branch. Regras de negócio (`worked_at` no futuro, código expirado, sobreposição de polígono)
  não são testadas aqui porque não pertencem a esta camada.

## Como validar

```bash
cd server
uv run pytest tests/schemas -q
uv run pytest tests/schemas --cov=app.schemas --cov-report=term-missing --cov-branch
uv run ruff check . && uv run ruff format --check .
```

Não precisa de banco: a camada é pura.

## Resultado da validação

- `uv run pytest tests/schemas -q` → **94 passando**, 1.0s
- `uv run pytest -q` (suíte inteira do servidor) → **142 passando**, 2.8s, nenhuma regressão
- Cobertura de `app/schemas/` → **100% de linha e 100% de branch** (119 statements, 0 miss)
- `uv run ruff check .` → All checks passed · `uv run ruff format --check .` → 32 arquivos ok
