# [0151] DTOs: o status forçado na entrada e na saída da quadra

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0010/` — Task 02

## Solicitação
> Spec 0010 — Task 02: implemente por TDD em `server/app/schemas/block.py`, com os testes em
> `server/tests/schemas/test_block_schemas.py` (arquivo existente; acrescente casos, não reescreva
> os que estão lá).
>
> Declare o tipo `BlockStatusOverride = Literal["overdue", "never"]` no próprio módulo, com um
> comentário dizendo o que cada valor significa para quem lê o mapa (laranja "vencida", vermelho
> "nunca trabalhada"). `BlockPatchIn` ganha `status_override: BlockStatusOverride | None = None` e
> `BlockOut` ganha `status_override: BlockStatusOverride | None = None`. No docstring de
> `BlockPatchIn`, registre que aqui "campo ausente" e "campo nulo" **não** são a mesma coisa —
> ausente não toca a coluna, nulo devolve a quadra ao cálculo automático — e que traduzir isso é do
> router, exatamente como já acontece com `rotation_days` em `TerritoryPatchIn` (spec 0009).
>
> Toque apenas na camada Schemas (e nos testes dela); não modifique models, repositories, services
> ou routers.

## Contexto
A spec 0010 põe uma tabela de quadras na página de configurações do território, onde o admin pode
**forçar a cor** de uma quadra — laranja "vencida" ou vermelha "nunca trabalhada" — acima do
cálculo por data. Essa decisão virou coluna no banco (Task 01) justamente para não obrigar o admin
a inventar um registro de trabalho com um publicador que nunca esteve ali. Esta task é o degrau do
contrato HTTP: sem o campo nos DTOs, nem o PATCH da quadra recebe o valor nem as leituras o
devolvem aos dois clientes.

## Critérios de aceite
- `BlockPatchIn` aceita `status_override` **ausente**, **nulo**, `"overdue"` e `"never"`.
- Ausente e nulo são **distinguíveis por `model_fields_set`** (o valor sozinho não os separa).
- `BlockPatchIn` rejeita `"recent"`, `"OVERDUE"`, `""` e um número.
- `BlockPatchIn` continua aceitando `number` e `polygon` como hoje, inclusive junto com o status na
  mesma carga.
- `BlockOut` serializa o campo **nulo** e **preenchido**.

## Ciclos TDD
| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | `test_block_patch_in_accepts_the_two_statuses_the_admin_can_force` (`overdue`, `never`) | `server/tests/schemas/test_block_schemas.py` | `BlockStatusOverride = Literal["overdue", "never"]` e o campo `status_override` em `BlockPatchIn` |
| 2 | `test_block_patch_in_tells_an_absent_status_override_from_an_explicit_null` | idem | nenhum — o comportamento decorre da declaração do ciclo 1; o teste fixa a garantia de que o router pode ler `model_fields_set` |
| 3 | `test_block_patch_in_rejects_a_status_outside_the_two_the_map_can_pin` (`recent`, `OVERDUE`, `""`, `3`) | idem | nenhum — o `Literal` do ciclo 1 já barra; antes dele o campo era extra e era **ignorado**, então o teste era vermelho de verdade |
| 4 | `test_block_patch_in_carries_the_status_alongside_a_renumbering_and_a_redraw` | idem | nenhum — fixa a convivência com `number`/`polygon` |
| 5 | `test_block_out_reports_a_block_left_on_the_automatic_colour_as_null` | idem | campo `status_override` em `BlockOut` |
| 6 | `test_block_out_carries_the_status_the_admin_pinned` | idem | idem (validação a partir de linha ORM) |

## O que foi feito
- `BlockStatusOverride` declarado no topo de `app/schemas/block.py`, com o comentário explicando o
  que cada valor pinta no mapa (laranja de rotação vencida, vermelho de quadra nunca coberta) e por
  que são exatamente os dois estados que o mapa já sabe pintar sozinho.
- `BlockPatchIn.status_override` e o docstring registrando que ausente ≠ nulo, e que quem traduz
  isso é o router pelo `model_fields_set`, como já faz com `rotation_days` em `TerritoryPatchIn`.
- `BlockOut.status_override`, com o docstring dizendo que ele viaja em toda leitura — inclusive na
  listagem que o app guarda em cache para colorir o mapa sem rede.

## Arquivos modificados
- `server/app/schemas/block.py` — tipo `BlockStatusOverride`, campo novo em `BlockPatchIn` e em
  `BlockOut`, docstrings atualizados.
- `server/tests/schemas/test_block_schemas.py` — seis casos novos; além disso,
  `test_block_out_carries_the_ring_and_the_derived_last_worked_at` teve o inventário de campos da
  resposta atualizado para incluir `status_override` (é a asserção fazendo o trabalho dela: ela
  existe para que ninguém acrescente campo à resposta sem perceber).

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`Literal` em vez de `Enum`.** O projeto ainda não tem nenhum enum de domínio nos schemas, e o
  valor viaja como string crua no JSON dos dois lados; um `Literal` dá a mesma validação e o mesmo
  erro 422 sem introduzir um tipo novo que models e services teriam de conhecer.
- **`"recent"` não é pinável** — é o que as datas já dizem sozinhas. Deixar o admin forçar "recente"
  seria pedir para a interface mentir sobre uma quadra que ninguém visitou; por isso o `Literal` tem
  dois valores e não três, e o teste do `"recent"` fica no arquivo como registro dessa escolha.
- **O campo não ganhou bound nenhum além do `Literal`.** Mesma razão do `rotation_days`: quem separa
  "não mexer" de "voltar ao automático" é `model_fields_set` no router, nunca o valor, então o DTO
  não pode tratar o nulo como inválido.
- **Nada fora de Schemas foi tocado.** A gravação da coluna (`set_status_override`, o sentinela de
  "não mexer" no `BlockService`) é a Task 03, e o router que lê `model_fields_set` é a Task 04.

## Como validar
```bash
cd server && uv run pytest tests/schemas/test_block_schemas.py
```

## Resultado da validação
- `uv run pytest tests/schemas/test_block_schemas.py` → **25 testes passando**.
- `uv run pytest --cov=app.schemas.block --cov-branch --cov-report=term-missing` → **571 testes
  passando** na suíte inteira; `app/schemas/block.py` com **100% de linha e 100% de branch**
  (21 stmts, 0 miss, 0 partial).
- `uv run ruff check .` → *All checks passed!*; `uv run ruff format --check .` → 94 arquivos já
  formatados.
