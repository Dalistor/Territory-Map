# [0083] `WorkLogService.list_worked_territories`: repasse para o repositório

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0005/` — Task 07

## Solicitação

Spec 0005 — Task 07: Em `server/app/services/work_log.py`, adicionar o método
`list_worked_territories(self, user: User) -> list[tuple[UUID, str, datetime]]` em
`WorkLogService`, delegando para `self._work_logs.list_worked_territories(user.id)` — sem regra de
negócio adicional, é um repasse. Tocar apenas `server/app/services/work_log.py`.

## Contexto

O dashboard do app do publicador (Task 23, ainda não implementada) precisa listar os territórios
que o publicador já trabalhou, com a data da visita mais recente em cada um. O repositório
`BlockWorkLogRepository.list_worked_territories` já existia (Task 04, implementação 0078) fazendo o
`JOIN`/`GROUP BY` no PostGIS; faltava só o service expor esse dado para as camadas acima (a rota da
Task 09 vai chamar este método).

## O que foi feito

Adicionado `WorkLogService.list_worked_territories`, um repasse de uma linha para
`self._work_logs.list_worked_territories(user.id)`, sem lógica adicional — a query e a agregação já
vivem inteiramente no repositório.

## Arquivos modificados

- `server/app/services/work_log.py` — novo método `list_worked_territories`.

## Decisões técnicas

Nenhuma decisão além do que a task já especificava: é um puro repasse (mesmo padrão de
`list_by_block`, que também só delega ao repositório). Não foi escrito teste novo porque não há
regra de negócio a cobrir — o comportamento observável é inteiramente do repositório, já testado na
Task 04/implementação 0078.

## Como validar

```bash
cd server && uv run ruff check app/services/work_log.py
uv run pytest tests/services/test_work_log_service.py -q
```

## Resultado da validação

- `ruff check`: sem apontamentos.
- `pytest tests/services/test_work_log_service.py`: 27 passed (suíte existente, sem regressão; a
  task não pedia teste novo, pois não há regra de negócio própria a exercitar).
