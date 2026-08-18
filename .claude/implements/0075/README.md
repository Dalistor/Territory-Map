# [0075] Exceção de domínio `TerritoryNotAssignedError`

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** [0005](../../specs/0005/README.md), Task 01

> Esta implementação foi originalmente escrita em `implements/0071/`, mas colidiu em paralelo com
> outra implementação não relacionada (correção no editor de quadra do admin) que reivindicou o
> mesmo número ao mesmo tempo — só uma das duas pastas sobreviveu no disco, e não foi esta. Este
> README reconstrói o conteúdo original a partir do relatório do subagente, renumerado para 0075
> (o próximo número livre no momento da correção).

## O que foi feito

Adicionada a classe `TerritoryNotAssignedError(DomainError)` em `server/app/core/exceptions.py`,
seguindo o padrão das classes já existentes no arquivo: docstring curta explicando quando é
lançada, `code = "territory_not_assigned"`, e `default_message` em português voltado ao
publicador: "Este território não está designado a você. Peça a quem cuida dos territórios na
congregação para atribuí-lo antes de marcar quadras."

Nenhuma outra classe do arquivo foi alterada. É a exceção que a Task 06 da spec 0005 lança em
`WorkLogService.mark_worked` quando o publicador tenta marcar uma quadra de um território que não
está designado a ele.

## Arquivos modificados

- `server/app/core/exceptions.py`

## Como validar

```bash
cd server
uv run python -c "from app.core.exceptions import TerritoryNotAssignedError, DomainError; e = TerritoryNotAssignedError(); assert e.code == 'territory_not_assigned'; assert isinstance(e, DomainError); print(e.default_message)"
uv run ruff check .
uv run ruff format --check .
```

## Resultado da validação

- Instanciação confirma `code`, `default_message` e `isinstance(..., DomainError)`.
- `ruff check` e `ruff format --check` passam.
- Não há `test_exceptions.py` dedicado no projeto (as exceções de domínio são exercitadas
  indiretamente pelos testes de service/router, padrão já existente para todas as outras classes
  deste arquivo) — esta classe será exercitada pelos testes da Task 06.
