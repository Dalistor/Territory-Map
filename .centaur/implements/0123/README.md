# [0123] Integração: o ciclo de vida completo da designação (spec 0007, Task 07)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0007/` — Task 07

## Solicitação
> Spec 0007 — Task 07: Implemente por TDD. Crie
> `server/tests/integration/test_assignment_history_integration.py`, seguindo o padrão dos outros
> arquivos de `server/tests/integration/` (app FastAPI real sobre o PostGIS real, tudo criado por
> HTTP menos a congregação; use o `Api` de `conftest.py`, acrescentando a ele os métodos que
> faltarem para as rotas novas). Um fluxo encadeado, cobrindo designação, marcação, conclusão,
> troca de dirigente, redesignação sem concluir, remoção da designação aberta, remoção de uma já
> concluída e 404 na designação de outra congregação. Não modificar código de produção.

## Contexto
As Tasks 01–06 trocaram a coluna `territories.assigned_user_id` como fonte de verdade por um
histórico (`territory_assignments`), mantendo a coluna apenas como **projeção** da designação
aberta. O service tem teste unitário e as quatro rotas têm teste de rota, mas nada provava a
junção — que é justamente onde uma projeção quebra: a permissão do app (`territory_not_assigned`)
lê a coluna, não o histórico. Este teste é o que amarra as três leituras (card do admin,
`assigned_user` e a resposta ao celular) em cada passo do ciclo.

## Critérios de aceite
- Designar a A → uma entrada, `completed_at` nulo, `started_at` preenchido, `assigned_user` = A
- A marca quadra do território designado → 201
- Concluir → mesma entrada com `completed_at` preenchido, `assigned_user` nulo, e nova marcação
  de A → 403 `territory_not_assigned`
- Designar a B → duas entradas, a de B aberta no topo e a de A concluída abaixo; B marca (201),
  A é recusado
- Designar de volta a A sem concluir a de B → a de B é encerrada automaticamente, três entradas
- Apagar a designação **aberta** → some do histórico (duas restam), `assigned_user` volta a nulo,
  A perde o acesso
- Apagar uma designação **já concluída** → some sem afetar `assigned_user` nem os logs de trabalho
- Apagar designação de outra congregação → 404, e a linha continua no card do dono

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | O que passou a ser exercitado |
|---|---------------|------------------|-------------------------------|
| 1 | designação abre uma linha no card e libera a marcação | `tests/integration/test_assignment_history_integration.py` | `POST .../assignments` + `GET .../assignments` + `assigned_user` + `POST /app/blocks/{id}/worked` |
| 2 | concluir fecha a mesma linha e tira o acesso na hora | idem | `POST .../assignments/complete` e a projeção zerada |
| 3 | troca de dirigente e redesignação encerram a anterior sozinhas | idem | `designate` fechando a designação em vigor; ordem mais-recente-primeiro |
| 4 | apagar a linha aberta e depois uma concluída | idem | `DELETE .../assignments/{id}` e o recálculo da projeção |
| 5 | designação de outra congregação responde 404 ao ser apagada | idem | escopo por `congregation_id` derivado do token |

Cada ciclo foi escrito e rodado isoladamente antes do seguinte (o teste é uma cadeia, então cada
etapa parte do estado que a anterior deixou). Como o código de produção já existia, o RED clássico
não se aplica; no lugar dele foi feita uma **falsificação deliberada**: removendo o
`_refresh_assigned_user(territory)` do `AssignmentService.delete`, o teste falha com
`assert {'id': ..., 'name': 'Irmã Marta'} is None` — prova de que as asserções realmente medem a
coerência da projeção, e não passariam com qualquer implementação. A alteração foi revertida e o
arquivo conferido byte a byte com `diff` contra o backup.

## O que foi feito
Um arquivo de teste de integração novo com dois testes: o fluxo encadeado do ciclo de vida
(designar → marcar → concluir → trocar → redesignar → apagar aberta → apagar concluída) e o teste
de fronteira entre congregações. No `Api` do `conftest.py` de integração foram acrescentados os
dois métodos que faltavam — `list_assignments` e `delete_assignment`. `assign_territory` e
`complete_assignment` já existiam da Task 06 e foram reaproveitados como estão, sem duplicar sob
os nomes `designate`/`complete_assignment` sugeridos na instrução.

**Nenhum código de produção foi alterado.** Todos os cenários passaram contra a fiação existente
das Tasks 05/06 — não havia bug a corrigir.

## Arquivos modificados
- `server/tests/integration/conftest.py` — `Api.list_assignments` e `Api.delete_assignment`

## Arquivos criados
- `server/tests/integration/test_assignment_history_integration.py` — o ciclo de vida da designação
  ponta a ponta e a isolação entre congregações na remoção

## Decisões técnicas
- **Um teste longo em vez de sete curtos**, mesma escolha de `test_full_flow_integration` e
  `test_territory_assignment_integration`: os passos são uma cadeia em que cada um afirma o que o
  anterior deixou. Separados, seis deles viraram setup repetido e a única coisa interessante — o
  encadeamento — sumiria.
- **A marcação do celular é asserção de primeira classe em quase todo passo**, não só o
  `GET .../assignments`. Ler o histórico de volta não detecta projeção desatualizada; o 403/201 do
  aparelho detecta. Foi exatamente esse assert que pegou a falsificação.
- **O 404 entre congregações ficou num teste próprio** — é o único cenário que precisa de uma
  segunda congregação, e enxertá-lo na cadeia obrigaria a inventar um segundo tenant no meio de um
  fluxo que fala de um só.
- **Comparar `id`/`started_at` da linha, não só a contagem**, para provar que concluir *fecha a
  mesma linha* em vez de fechar uma e abrir outra parecida.
- **Sem mock de nada:** app FastAPI real, PostGIS real, tudo criado por HTTP menos a congregação —
  é o contrato desta pasta, e uma designação depende de FK, índice único parcial e ordenação reais.

## Como validar
```bash
cd server && uv run pytest -q tests/integration/test_assignment_history_integration.py
```

## Resultado da validação
- `uv run pytest -q` → **495 passed** (baseline antes desta task: 493)
- `uv run pytest -q tests/integration/` → 28 passed
- `uv run ruff check tests/integration/` → All checks passed
- `uv run ruff format --check tests/integration/` → 8 files already formatted
- Falsificação: com `_refresh_assigned_user` removido do `delete`, o fluxo falha; restaurado, volta
  a passar (`diff` contra o backup confirma que a produção ficou idêntica).
