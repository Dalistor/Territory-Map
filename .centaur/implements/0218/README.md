# [0218] Integração do histórico paginado de designações

**Data:** 2026-09-20
**Status:** Concluído com validação de banco pendente
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 03

## Solicitação

Cobrir `GET /admin/assignments` em uma integração FastAPI/PostGIS real, com períodos controlados,
paginação, filtros por publicador e território e isolamento entre congregações.

## Contexto

Os testes de repositório e rota já provam as camadas isoladas. Faltava a evidência de que o caminho
HTTP inteiro persiste designações concluídas e abertas e as devolve na consulta por sobreposição.

## Critérios de aceite

- Uma designação iniciada antes do intervalo e devolvida dentro dele aparece.
- Uma designação aberta aparece no intervalo e preserva `completed_at` nulo.
- O total não é paginado e as páginas não repetem itens.
- `publisher_id` e `territory_id` restringem a consulta correta.
- A consulta não expõe designações de outra congregação.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Consulta por intervalo inclui designações concluídas e abertas, pagina e isola congregações | `server/tests/integration/test_assignment_history_query_integration.py` | Fluxo HTTP real com relógio controlado |
| 2 | Integração de exclusão de publicador lê a página paginada | `server/tests/integration/test_publisher_deletion_integration.py` | Adaptação da asserção ao contrato `items`/`total` |

## O que foi feito

- Adicionado fluxo de integração que cria quatro designações por HTTP, em duas congregações e com
  datas controladas no relógio da rota.
- Coberta a regra de sobreposição, paginação/total, filtro por publicador, filtro por território e
  isolamento de tenant.
- Atualizado o fluxo já existente de exclusão de publicador para consumir a resposta paginada.
- Não houve mudança produtiva: a implementação da consulta já havia sido concluída pela Task 02.

## Arquivos modificados

- `server/tests/integration/test_publisher_deletion_integration.py` — lê a primeira linha em
  `items` e confere `total`.

## Arquivos criados

- `server/tests/integration/test_assignment_history_query_integration.py` — integração do histórico
  por sobreposição.

## Decisões técnicas

O teste altera somente `admin_assignments.utc_now`, a referência de relógio usada para construir o
serviço em cada requisição. Assim, cada designação continua sendo criada e concluída pela API real,
mas as datas permanecem determinísticas sem escrever diretamente na tabela de designações.

## Como validar

```bash
cd server
docker compose -f ../docker-compose.dev.yml up -d
uv run pytest tests/integration/test_assignment_history_query_integration.py -q
```

## Resultado da validação

- `uv run ruff check tests/integration` — passou.
- `uv run ruff format --check tests/integration` — passou.
- `uv run pytest --collect-only -q tests/integration` — 36 testes coletados.
- `uv run python -m compileall -q tests/integration/test_assignment_history_query_integration.py` — passou.
- A execução com PostGIS real foi tentada, mas o servidor em `localhost:5432` recusou conexão e o
  daemon Docker não respondeu após a tentativa de iniciar o Docker Desktop. Portanto, não há
  resultado verde de integração nem cobertura a reportar nesta máquina; a Task 21 deve repetir o
  comando acima com o banco disponível.
