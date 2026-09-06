# [0131] Service: listar o histórico de designações da congregação

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0008/` — Task 03

## Solicitação
> Spec 0008 — Task 03: Implemente por TDD. Em `server/app/services/assignment.py`, adicione
> `list_all(congregation_id: UUID) -> list[TerritoryAssignment]` ao `AssignmentService`, delegando
> para o `list_by_congregation` do repositório (Task 02). É um repasse — sem regra própria além do
> escopo por congregação, que a própria query garante. […] A cobertura de
> `app/services/assignment.py` precisa continuar em **100% linha e branch**. Toque apenas
> `server/app/services/assignment.py` e seu arquivo de teste.

## Contexto
A página de Histórico do admin (spec 0008) precisa de todas as designações da congregação numa
chamada só, agrupáveis por dirigente ou por território. O service só sabia listar o histórico de
**um** território (`list`), que exige o `territory_id` e obrigaria a tela a fazer uma chamada por
território. `TerritoryAssignmentRepository.list_by_congregation` (Task 02, implementação 0129) já
resolvia a query; faltava o método de negócio que a rota `GET /admin/assignments` (Task 04) vai
chamar.

## Critérios de aceite
- Com designações em dois territórios diferentes da mesma congregação, devolve todas, da mais
  recente para a mais antiga.
- Designações abertas e concluídas aparecem juntas na mesma lista — a listagem é o histórico
  inteiro, não só o encerrado.
- Congregação sem designação nenhuma devolve lista vazia.
- Designação de outra congregação não aparece na lista.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_list_all_gives_every_assignment_of_the_congregation_most_recent_first` | `server/tests/services/test_assignment_service.py` | `AssignmentService.list_all`, delegando para `list_by_congregation` |
| 2 | `test_list_all_mixes_open_and_completed_assignments_in_the_same_list` | idem | (mesmo método — confirma que nenhum filtro por `completed_at` foi introduzido) |
| 3 | `test_list_all_of_a_congregation_without_assignments_is_empty` | idem | (mesmo método — borda da lista vazia) |
| 4 | `test_list_all_does_not_show_the_assignment_of_another_congregation` | idem | (mesmo método — escopo por congregação vindo da query) |

Os ciclos 2 a 4 foram escritos com a implementação do ciclo 1 temporariamente removida
(`git stash` do arquivo de produção), para que o RED fosse observado de verdade nos três — num
método de repasse eles passariam de primeira, o que não prova nada. Com os quatro vermelhos, a
implementação voltou e os quatro ficaram verdes.

## O que foi feito
Adicionado `AssignmentService.list_all(congregation_id)` — um repasse de uma linha para
`TerritoryAssignmentRepository.list_by_congregation`, posicionado logo depois de `list` e antes dos
métodos privados. A docstring registra por que não há filtragem em Python: o escopo por congregação
é o `WHERE` da query, e repeti-lo aqui seria um segundo lugar para errar, não uma segunda barreira.

## Arquivos modificados
- `server/app/services/assignment.py` — método `list_all` novo; nada mais alterado.
- `server/tests/services/test_assignment_service.py` — quatro testes novos, reaproveitando as
  fixtures `service`, `make_congregation`, `make_territory` e `make_user` já existentes no arquivo.

## Arquivos criados
Nenhum.

## Decisões técnicas
- **Sem checagem redundante de congregação no service.** Diferente de `list`, `complete` e
  `delete`, que precisam carregar um recurso pelo id vindo da URL e por isso passam pelo
  `_territory_of_congregation` / `get_in_congregation`, aqui o `congregation_id` **é** o filtro —
  não há id de cliente para validar. Uma verificação extra em Python só criaria uma branch sem
  teste possível.
- **Teste contra o Postgres real**, no padrão que o arquivo já usa: a ordenação `started_at DESC` e
  o join de escopo são da query, e um fake do repositório testaria o fake em vez da regra.
- **Territórios com nomes distintos** (`Centro`, `Bairro`) nos testes que criam dois na mesma
  congregação, por causa do único composto `(congregation_id, name)`.
- **Nada deliberadamente sem teste** — a cobertura de `app/services/assignment.py` fechou em 100%
  de linha e de branch.

## Como validar
```bash
cd server && uv run pytest tests/services/test_assignment_service.py -q
cd server && uv run pytest --cov=app --cov-branch --cov-report=term-missing -q
```

## Resultado da validação
- `uv run pytest tests/services/test_assignment_service.py -q` → **21 passed**
- `uv run pytest --cov=app --cov-branch --cov-report=term-missing -q` → **499 passed** (eram 495),
  `app/services/assignment.py`: 59 statements, 0 miss, 10 branches, 0 partial — **100% linha e
  branch**
- `uv run ruff check .` → All checks passed! · `uv run ruff format --check .` → 93 files already
  formatted
