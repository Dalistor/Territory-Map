# [0197] Último trabalho por território no repository

**Data:** 2026-09-05  
**Status:** Concluído  
**Modo:** TDD  
**Spec:** `.centaur/specs/0014/` — Task 01

## Solicitação

Adicionar ao `BlockWorkLogRepository` uma consulta que retorne, por congregação, no máximo um
registro por território: `territory_id`, `user_id`, `user_name` e o maior `worked_at` entre as
quadras do território.

## Contexto

A lista geral de territórios precisa do último trabalho sem consultar cada quadra individualmente.
O nome deve ser o nome preservado no log, e o filtro por congregação deve impedir vazamento entre
tenants.

## Critérios de aceite

- Retorna o trabalho mais recente entre várias quadras do mesmo território.
- Retorna o nome armazenado no log selecionado.
- Retorna no máximo uma linha por território.
- Uma congregação sem registros retorna lista vazia.
- Ignora registros de outra congregação.
- Em empate de `worked_at`, escolhe o log de maior id de forma determinística.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Último trabalho entre quadras e nome preservado | `server/tests/repositories/test_block_work_log.py` | `list_latest_work_by_territory` com ranking por território |
| 2 | No máximo uma linha por território | `server/tests/repositories/test_block_work_log.py` | Filtro `territory_rank == 1` |
| 3 | Congregação sem trabalho | `server/tests/repositories/test_block_work_log.py` | Resultado vazio para a consulta sem linhas |
| 4 | Isolamento entre congregações | `server/tests/repositories/test_block_work_log.py` | Join por `Block`/`Territory` e filtro por `Territory.congregation_id` |
| 5 | Desempate determinístico pelo id do log | `server/tests/repositories/test_block_work_log.py` | Ordenação da janela por `worked_at DESC, id DESC` |

## O que foi feito

Foi adicionada uma consulta com `row_number()` particionado por território. Ela atravessa os joins
`BlockWorkLog → Block → Territory`, restringe a congregação na própria consulta e devolve os quatro
campos da linha vencedora. O id do log é usado apenas como chave interna de desempate.

## Arquivos modificados

- `server/app/repositories/block_work_log.py` — nova consulta agregada por território.
- `server/tests/repositories/test_block_work_log.py` — testes de recência, nome, unicidade, vazio,
  isolamento e desempate.

## Arquivos criados

- `.centaur/implements/0197/README.md` — registro desta implementação.

## Decisões técnicas

Foi usada uma função de janela em vez de agrupar apenas por `worked_at`, porque o retorno precisa
preservar `user_id` e `user_name` da mesma linha que venceu a seleção. O ranking também permite um
desempate explícito e determinístico quando duas visitas têm o mesmo horário.

## Como validar

```bash
cd server
UV_CACHE_DIR=/tmp/territory-map-uv-cache uv run pytest tests/repositories/test_block_work_log.py -q
UV_CACHE_DIR=/tmp/territory-map-uv-cache uv run pytest tests/repositories/test_block_work_log.py --cov=app.repositories.block_work_log --cov-report=term-missing -q
UV_CACHE_DIR=/tmp/territory-map-uv-cache uv run ruff check app/repositories/block_work_log.py tests/repositories/test_block_work_log.py
```

## Resultado da validação

- Suíte relevante: **5 testes passando**.
- Lint Ruff nos arquivos tocados: **limpo**.
- Cobertura do arquivo `app/repositories/block_work_log.py`: **62% de linhas**; a nova consulta foi
  executada pelos cinco testes. As linhas não cobertas pertencem aos métodos anteriores do
  repository, fora do comportamento desta task.
- A suíte completa do servidor não foi executada, conforme solicitado.
