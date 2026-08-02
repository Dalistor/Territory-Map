# [0007] Migration inicial do schema completo

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0001/` — Task 05

## Solicitação

> Spec 0001 — Task 05: Gere a migration Alembic com todas as tabelas de `app/models/`
> (`congregations`, `users`, `territories`, `blocks`, `block_work_logs`). Use
> `alembic revision --autogenerate` como ponto de partida, mas **revise o arquivo à mão**: o
> autogenerate do GeoAlchemy2 costuma duplicar a criação do índice espacial e emitir `DROP INDEX`
> espúrio para `idx_*_geom` — remova as duplicatas e garanta que os índices GIST das colunas
> geométricas existam exatamente uma vez. Confira também que o índice único parcial de
> `users.access_code` saiu com o `WHERE access_code IS NOT NULL`. Implemente `downgrade()` de
> verdade. Critério de sucesso: contra um banco limpo, `alembic upgrade head` seguido de
> `alembic downgrade base` e `alembic upgrade head` novamente roda sem erro, e um segundo
> `--autogenerate` não detecta diferença alguma. Toque apenas em `migrations/`.

## Contexto

As implementações 0003 e 0004 mapearam todas as entidades em `app/models/`, mas o banco só tinha a
migration que habilita o PostGIS (implementação 0002). Sem o schema versionado, nada das camadas
seguintes (repositories, services, testes de integração contra PostGIS real) consegue rodar — a
spec 0001 põe as Tasks 09 e 10 diretamente atrás desta.

## O que foi feito

Gerada a revision `81019c0977bf` (`initial_schema`), filha de `8f81b08d3642` (`enable_postgis`),
com as cinco tabelas do domínio, suas FKs, constraints únicas e índices. O arquivo foi gerado por
`alembic revision --autogenerate` e depois reescrito à mão: docstring explicando as decisões,
reordenação para agrupar cada tabela com seus índices, formatação no estilo do projeto (aspas
duplas, 100 colunas) e comentários nos três pontos que a task mandou conferir.

Os três riscos apontados na task foram verificados no banco, não assumidos:

1. **Índice GIST duplicado** — não ocorreu. O `migrations/env.py` (feito na Task 02) já tinha
   `alembic_helpers.writer` e `alembic_helpers.include_object` do GeoAlchemy2 ligados, então o
   autogenerate emitiu `create_geospatial_table` com `spatial_index=False` na coluna e um
   `create_geospatial_index` separado — o padrão correto. Confirmado por `pg_indexes`:
   `idx_territories_boundary` e `idx_blocks_polygon` existem exatamente uma vez cada, ambos `gist`.
2. **`DROP INDEX` espúrio** — não ocorreu, pelo mesmo motivo. Um segundo `--autogenerate` gerou
   `upgrade()` vazio.
3. **Índice único parcial** — saiu correto. Verificado no `indexdef` real:
   `CREATE UNIQUE INDEX uq_users_access_code ON public.users USING btree (access_code) WHERE (access_code IS NOT NULL)`.

## Arquivos criados

- `server/migrations/versions/20260802_1342_81019c0977bf_initial_schema.py` — a migration do schema
  completo, com `upgrade()` e `downgrade()`.

## Arquivos modificados

Nenhum. Nada fora de `migrations/versions/` foi tocado.

## Decisões técnicas

**Uma revision só para as cinco tabelas.** Elas não fazem sentido separadas: toda tabela menos
`congregations` tem FK subindo o grafo de posse. Dividir criaria estados intermediários que nunca
existem na prática.

**`create_geospatial_table` + `create_geospatial_index` separados, em vez de `spatial_index=True`
na coluna.** É o que impede a duplicata: se o índice viesse como efeito colateral da coluna *e*
como comando explícito, o PostGIS teria dois índices e o autogenerate seguinte proporia um
`DROP INDEX` a cada execução. Mantive a estrutura que o writer do GeoAlchemy2 produziu porque ela
já é a correta — a revisão manual confirmou isso em vez de reescrever às cegas.

**`downgrade()` derruba filho antes de pai** (`block_work_logs` → `blocks` → `territories` →
`users` → `congregations`), para que nenhuma FK bloqueie o `DROP`. As duas tabelas com geometria
usam `drop_geospatial_table`, que limpa os metadados do PostGIS junto.

**O `downgrade()` não remove a extensão PostGIS** — isso é responsabilidade (deliberadamente
no-op) da revision `enable_postgis`, que já documenta o porquê: a extensão pode ser compartilhada
com outros schemas do mesmo banco.

**Ordem de criação: `users` antes de `territories`.** Diferente da saída do autogenerate, mas
igualmente válida (ambas só dependem de `congregations`) e deixa o arquivo agrupado por assunto:
identidade primeiro, geografia depois, log por último.

**A revision id gerada foi mantida** (`81019c0977bf`), já que a migration foi aplicada ao banco de
desenvolvimento durante a validação — trocar o id agora criaria divergência de `alembic_version`.

## Como validar

```bash
docker compose -f docker-compose.dev.yml up -d
cd server

# ciclo completo contra banco limpo
uv run alembic downgrade base
uv run alembic upgrade head
uv run alembic downgrade base
uv run alembic upgrade head

# não deve detectar diferença nenhuma
uv run alembic revision --autogenerate -m "drift check"   # upgrade() deve sair vazio; apague o arquivo

# índices espaciais: exatamente um por coluna geométrica
docker exec territory_map_db_dev psql -U territory -d territory_map \
  -c "SELECT tablename, indexname FROM pg_indexes WHERE indexdef LIKE '%gist%';"

# índice parcial do access_code
docker exec territory_map_db_dev psql -U territory -d territory_map \
  -c "SELECT indexdef FROM pg_indexes WHERE indexname='uq_users_access_code';"
```

## Resultado da validação

- **Ciclo up/down/up**: executado duas vezes seguidas em `territory_map` e uma vez em
  `territory_map_test` (banco que nunca tivera essas tabelas). Sem erro em nenhuma passagem.
- **Drift**: dois `--autogenerate` posteriores (um antes e um depois da revisão manual do arquivo)
  geraram `upgrade()` e `downgrade()` vazios. Os arquivos de teste foram apagados.
- **Índices**: 16 índices em `pg_indexes` para as cinco tabelas, sem duplicata. Os dois GIST
  (`idx_territories_boundary`, `idx_blocks_polygon`) aparecem uma vez cada.
- **`uq_users_access_code`**: `UNIQUE ... WHERE (access_code IS NOT NULL)`, confirmado no banco.
- **Lint**: `ruff check .` passou; `ruff format --check .` reporta 21 arquivos já formatados.
  (`migrations/versions` está em `extend-exclude`, mas o arquivo foi escrito no estilo do projeto
  mesmo assim.)
- **Testes**: `pytest` com 48 testes passando. Durante a execução, `tests/schemas/` apresentou
  erros intermitentes de coleção — a Task 08 (Schemas Pydantic) estava escrevendo esses arquivos em
  paralelo no mesmo momento. Fora do escopo desta task, que só tocou `migrations/`.
