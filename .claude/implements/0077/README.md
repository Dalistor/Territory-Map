# [0077] Mapear `TerritoryNotAssignedError` para 403 no servidor

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0005/` — Task 10

## Solicitação

Em `server/app/main.py`, importar `TerritoryNotAssignedError` de `app.core.exceptions` e adicionar
a entrada `TerritoryNotAssignedError: status.HTTP_403_FORBIDDEN` em `DOMAIN_ERROR_STATUS`, seguindo
o padrão das entradas já existentes na tabela.

## Contexto

A Task 01 da spec 0005 (implementação 0075) já criou `TerritoryNotAssignedError` em
`server/app/core/exceptions.py` — a exceção lançada quando um publicador tenta marcar uma quadra de
um território que não está designado a ele. Sem uma entrada em `DOMAIN_ERROR_STATUS`, essa exceção
cairia no default de 422 (`DOMAIN_ERROR_DEFAULT_STATUS`), que é reservado para conteúdo inválido
(geometria, sobreposição, data). Este caso não é conteúdo malformado — é permissão sobre um recurso
que o publicador já sabe que existe (o bloco está visivelmente dentro da congregação dele), o que
pede 403, não 404 (que confirmaria/negaria existência) nem 422.

## O que foi feito

- Adicionado `TerritoryNotAssignedError` à lista de imports de `app.core.exceptions` em
  `server/app/main.py`.
- Adicionada a entrada `TerritoryNotAssignedError: status.HTTP_403_FORBIDDEN` em
  `DOMAIN_ERROR_STATUS`.
- Estendido o comentário que documenta a tabela para explicar o raciocínio do 403 (mesmo estilo já
  usado para justificar o 404 de `NotFoundError` e o 401 compartilhado pelas três falhas de
  autenticação).

## Arquivos modificados

- `server/app/main.py` — import de `TerritoryNotAssignedError`, nova entrada em
  `DOMAIN_ERROR_STATUS` e comentário explicando o porquê do 403.

## Decisões técnicas

- Nenhuma decisão nova: a task já veio com a decisão de status (403) e o motivo definidos na spec.
  Segui o padrão exato das entradas existentes (mapeamento direto classe → `status.HTTP_*`).
- `domain_error_status()` resolve por MRO, então nenhuma subclasse futura de
  `TerritoryNotAssignedError` (se vier a existir) cairia sem status por engano — mas isso já era
  verdade para o mecanismo antes desta mudança, não é algo introduzido aqui.

## Como validar

```bash
cd server && uv run ruff check app/main.py && uv run ruff format --check app/main.py
uv run pytest tests/test_main.py -q
```

## Resultado da validação

- `ruff check` e `ruff format --check`: sem problemas.
- `pytest tests/test_main.py`: 16 testes, todos passando.
- Rodei a suíte completa (`uv run pytest -q`) por precaução: 457 passaram, 1 falhou
  (`tests/schemas/test_territory_schemas.py::test_territory_out_carries_the_boundary_and_the_blocks_inside_it`).
  Essa falha é **pré-existente e fora do escopo desta task** — vem do trabalho em andamento de
  outras tasks da mesma spec (Task 03/04, que já tocaram `schemas/territory.py` e
  `repositories/` em paralelo, conforme `git status` mostrava `server/app/schemas/territory.py` e
  `server/app/repositories/territory.py` modificados antes desta implementação começar). A
  instrução desta task restringia a mudança a `server/app/main.py`, então não toquei nesses
  arquivos.
