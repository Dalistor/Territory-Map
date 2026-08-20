# [0141] Repository e service do território escrevem a rotação

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** TDD
**Spec:** `.claude/specs/0009/` — Task 03

## Solicitação
> Spec 0009 — Task 03: implemente por TDD, com os testes em `server/tests/services/test_territory_service.py`.
> Em `server/app/repositories/territory.py`, estenda `update` (ou acrescente um `set_rotation_days`) para gravar `rotation_days`. Em `server/app/services/territory.py`, `update` ganha um parâmetro `rotation_days` que precisa distinguir três intenções: "não mexer", "definir N dias" e "voltar ao padrão" (nulo). Use um sentinela de módulo em vez de sobrecarregar `None`; documente a escolha num comentário. Mantenha a assinatura compatível com quem já chama `update` hoje, e o valor padrão do novo parâmetro tem que ser "não mexer".

## Contexto
A Task 01 acrescentou `Territory.rotation_days` (nullable, nulo = usa o padrão de 120 dias dos
clientes) e a Task 02 acrescentou o campo em `TerritoryPatchIn`. Faltava o caminho de escrita:
`TerritoryService.update` não sabia alterar a rotação. O ponto delicado é que a coluna é anulável,
então `None` é um valor de domínio ("volta ao ciclo padrão") e não pode significar também "não
mandei este campo" — do jeito que significa para `name` e `points`, cujas colunas são `NOT NULL`.

## Critérios de aceite
- Chamar `update` sem `rotation_days` não altera o valor existente quando ele é 90.
- Chamar `update` sem `rotation_days` não altera o valor existente quando ele é nulo.
- Passar `rotation_days=60` grava 60.
- Passar `rotation_days=None` (o valor de domínio, distinto do sentinela) zera a coluna.
- A rotação muda junto com nome e boundary na mesma chamada.
- Território de outra congregação continua respondendo `NotFoundError`, sem caso especial novo.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_update_with_rotation_days_stores_the_cycle_length` | `server/tests/services/test_territory_service.py` | `TerritoryRepository.set_rotation_days`, o sentinela `UNSET` e o parâmetro `rotation_days` em `TerritoryService.update` |
| 2 | `test_update_without_rotation_days_keeps_the_configured_cycle` | idem | guarda do sentinela (o `if rotation_days is not UNSET`) |
| 3 | `test_update_without_rotation_days_keeps_a_territory_on_the_default_cycle` | idem | idem, no caso em que a coluna já é nula |
| 4 | `test_update_with_a_null_rotation_days_puts_the_territory_back_on_the_default` | idem | o ramo em que `None` é o valor de domínio |
| 5 | `test_update_changes_the_name_the_boundary_and_the_rotation_in_one_call` | idem | convivência com `update` do nome/boundary |
| 6 | `test_update_of_a_territory_of_another_congregation_does_not_set_its_rotation` | idem | nenhum — confirma que o `self.get` já existente barra antes de qualquer escrita |

## O que foi feito
- **Repository:** `set_rotation_days(territory, rotation_days)`, no estilo do vizinho
  `set_assigned_user` — escreve a coluna e dá flush. `update` ficou intacto, e com ele o contrato
  "`None` = não mexer" que só vale porque `name` e `wkt` não são anuláveis.
- **Service:** `update` ganhou `rotation_days: int | None | Literal[_Unset.TOKEN] = UNSET`, no fim
  da lista de keyword-only, então quem já chamava com `name`/`points` não muda. Quando o valor não
  é o sentinela, o service chama `set_rotation_days`; quando é, nem toca na coluna.

## Arquivos modificados
- `server/app/repositories/territory.py` — novo método `set_rotation_days`.
- `server/app/services/territory.py` — `_Unset`/`UNSET`, novo parâmetro em `update`.
- `server/tests/services/test_territory_service.py` — 6 casos novos.

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Sentinela como enum de um membro, não `object()`.** `UNSET = object()` lê igual na chamada, mas
  tipa como `object` — a assinatura aceitaria qualquer coisa e o type checker não ajudaria ninguém.
  Um `Enum` de um membro permite `Literal[_Unset.TOKEN]` no tipo, que é a forma que o ecossistema
  Python reconhece para sentinela tipada. `_Unset` é privado; o que se exporta é `UNSET`, que a
  Task 05 vai importar no router para traduzir `payload.model_fields_set`.
- **`set_rotation_days` separado, em vez de estender `repository.update`.** Estender o `update`
  exigiria o sentinela também no repositório, e aí o router (que precisa dele) importaria de uma
  camada que ele não deve conhecer, ou o service teria que reexportar. Com um método próprio, o
  repositório continua com semântica de dois valores e a distinção de três intenções fica inteira
  na camada que decide o que elas significam — que é o service. O custo é um flush a mais numa
  operação que o admin faz de vez em quando.
- **Comentário de módulo é parte do entregável.** O bloco acima de `UNSET` diz explicitamente para
  não "simplificar" de volta para `None`, com a consequência (todo PATCH de renomear zeraria a
  rotação). É a sutileza que a spec pediu para documentar.
- **Verificação por mutação, não só por teste verde.** Depois do verde, a implementação foi trocada
  de propósito por `rotation_days: int | None = None` com escrita incondicional, para conferir que
  os testes de guarda realmente reprovam essa regressão — `test_update_without_rotation_days_keeps_
  the_configured_cycle` falhou, como devia. A implementação correta foi restaurada em seguida.
- **Nada de teste de repositório separado.** `server/tests/` não tem pasta `repositories/`; o
  repositório é exercido pelos testes de service contra o PostGIS real, como já é o padrão do
  arquivo.

## Como validar
```bash
cd server && uv run pytest tests/services/test_territory_service.py
```

## Resultado da validação
- `uv run pytest tests/services/test_territory_service.py` — **30 coletados, 30 passando**
  (24 que já existiam, mais os 6 casos novos desta task).
- `uv run pytest --cov=app --cov-branch --cov-report=term-missing` — **541 passaram**;
  `app/services/territory.py` **100% de linha e 100% de branch** (70 statements, 16 branches, 0
  faltando) e `app/repositories/territory.py` **100% de linha e branch** (48 statements, 6 branches).
  O portão de CI de 100% em `app/services/` continua fechado.
- `uv run ruff check .` — All checks passed. `uv run ruff format --check .` — 93 arquivos já
  formatados.
