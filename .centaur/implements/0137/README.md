# [0137] `Territory.rotation_days`: modelo e migration

**Data:** 2026-08-19
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0009/` — Task 01

## Solicitação
> Spec 0009 — Task 01: adicione a coluna `rotation_days` ao modelo `Territory` em
> `server/app/models/territory.py`: `Mapped[int | None]`, `Integer`, `nullable=True`, sem default no
> banco. Documente no docstring da coluna (em inglês, como o resto do arquivo) que nulo significa
> "usa o padrão do cliente" — o limiar de 120 dias que os dois clientes já aplicam hoje — e que a
> coluna é o número de dias de um ciclo de rotação do território, depois do qual as quadras voltam a
> aparecer como vencidas no mapa. Gere a migration Alembic correspondente em
> `server/migrations/versions/` seguindo a convenção de nome dos arquivos existentes
> (`AAAAMMDD_HHMM_<rev>_add_territory_rotation_days.py`), com `down_revision` apontando para a
> revisão mais recente (`d3ab774c1b2f`, "add territory assignments") — confira com
> `uv run alembic heads`. A migration só adiciona a coluna e a remove no downgrade: **não** faça
> backfill nem defina server_default, porque nulo já é o valor semanticamente correto para todo
> território existente. Rode `uv run alembic upgrade head` para provar que aplica. Toque apenas nas
> camadas Models e Migrations; não modifique schemas, repositories, services ou routers.

## Contexto
Hoje o limiar que faz uma quadra voltar a aparecer como vencida no mapa é um número fixo de 120 dias,
duplicado nos dois clientes. A spec 0009 torna esse ciclo configurável **por território**, e esta
task é o alicerce: a coluna que guarda o número. Todas as camadas acima (DTOs, service, rotas, os
dois clientes) dependem dela existir no banco e no modelo.

## O que foi feito
- `Territory` ganhou `rotation_days: Mapped[int | None]`, `Integer`, `nullable=True`, sem default —
  posicionada logo depois de `assigned_user_id`, antes dos relacionamentos, seguindo a ordem do
  arquivo (colunas primeiro, `relationship` depois).
- O comentário acima da coluna (em inglês, como o resto do arquivo) diz o que o número significa
  (dias do ciclo de rotação, findo o qual a quadra volta a aparecer vencida) e o que nulo significa
  ("usa o padrão do cliente", os 120 dias de hoje), registrando também que é por isso que não há
  backfill.
- `Integer` acrescentado ao import de `sqlalchemy`.
- Migration nova, com `down_revision = 'd3ab774c1b2f'` — a head confirmada por `uv run alembic heads`
  antes de escrever o arquivo.

## Arquivos modificados
- `server/app/models/territory.py` — coluna `rotation_days` com o comentário explicativo; `Integer`
  adicionado ao import de `sqlalchemy`.

## Arquivos criados
- `server/migrations/versions/20260819_0900_a1c7e4f92b83_add_territory_rotation_days.py` — adiciona a
  coluna no upgrade, remove no downgrade.

## Decisões técnicas
- **Sem `server_default` e sem backfill**, como a task determina. Nulo não é "faltando dado", é um
  valor de domínio de pleno direito: significa "este território usa o padrão do cliente". Um
  `server_default = 120` seria pior do que redundante — congelaria no banco um número que hoje é do
  cliente e faria todo território existente parecer configurado à mão, apagando a distinção que a
  Task 03 vai precisar entre "não mexer", "definir N dias" e "voltar ao padrão".
- **Migration escrita à mão em vez de `alembic revision --autogenerate`**, para controlar o nome do
  arquivo e o timestamp segundo a convenção do diretório, e para não arrastar junto qualquer diff
  incidental do PostGIS (as migrations autogeradas do projeto trazem ruído de índice espacial). O
  resultado foi conferido depois com `alembic check`, que não detectou nenhuma operação pendente —
  ou seja, modelo e banco estão de fato em sincronia.
- **Sem índice na coluna.** Ela é lida junto com a linha do território (dezenas por congregação) e
  nunca é critério de busca; um índice aqui só custaria escrita.
- Escopo respeitado: nada de schemas, repositories, services ou routers — Models e Migrations apenas.

## Como validar
```bash
cd server
uv run alembic heads          # a head passa a ser a1c7e4f92b83
uv run alembic upgrade head   # aplica sem erro
uv run alembic check          # "No new upgrade operations detected."
uv run alembic downgrade -1   # a coluna some; upgrade head devolve
```

## Resultado da validação
- `uv run alembic upgrade head`: aplicou (`d3ab774c1b2f -> a1c7e4f92b83, add territory rotation_days`);
  `alembic heads` passou a apontar `a1c7e4f92b83 (head)`.
- `uv run alembic check`: **"No new upgrade operations detected."** — o modelo bate com o banco, o que
  prova que a migration escrita à mão cobre exatamente a mudança do modelo.
- `uv run ruff check .`: **All checks passed!**
- `uv run ruff format --check .`: 93 arquivos já formatados.
- `uv run pytest -q`: **504 passaram, 1 falhou**. A falha é
  `tests/schemas/test_territory_schemas.py::test_territory_patch_in_tells_an_absent_rotation_from_an_explicit_null`,
  que é um teste da **Task 02** (camada Schemas), em execução paralela e ainda incompleta no momento
  desta validação — fora do escopo desta task, que não toca em `app/schemas/`. Nenhum teste de model
  ou de migration falhou.
