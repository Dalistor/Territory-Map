# [0150] `Block.status_override`: modelo e migration

**Data:** 2026-08-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0010/` — Task 01

## Solicitação
Adicionar a coluna `status_override` ao modelo `Block` (`Mapped[str | None]`, `String(16)`,
`nullable=True`, sem default), com `CheckConstraint` `ck_blocks_status_override` restringindo o
valor a `'overdue'` ou `'never'`, documentada em inglês; gerar a migration Alembic correspondente,
sem backfill e sem `server_default`, e provar que aplica e que modelo e banco ficam em sincronia.

## Contexto
A spec 0010 traz a tabela de quadras na configuração do território, onde o admin pode **forçar** a
cor de uma quadra ("vencida" ou "nunca trabalhada") acima do cálculo por data. A decisão já tomada
na spec é que esse status é **coluna no banco**, não um registro de trabalho inventado — forçar
laranja criando um log antigo exigiria nomear um publicador que nunca esteve ali. Esta task abre o
caminho: a coluna precisa existir antes que schemas, services e routers possam falar dela.

## O que foi feito
- `Block` ganhou a coluna `status_override` e a check constraint que limita o vocabulário dela.
- O docstring da classe passou a explicar, em inglês, que a coluna é o status forçado pelo admin,
  respeitado pelos clientes acima do cálculo por data; que nulo — o valor de toda quadra existente —
  significa "derive a cor dos registros de trabalho, como sempre"; e que ela **convive** com
  `last_worked_at` sem substituí-la: o log continua sendo a verdade sobre quem esteve lá e quando, e
  o override só diz como pintar.
- Migration `c5e21f0a7d94`, com `down_revision` na head confirmada (`a1c7e4f92b83`), adicionando
  coluna e constraint no upgrade e desfazendo as duas no downgrade.

## Arquivos modificados
- `server/app/models/block.py` — coluna `status_override`, `CheckConstraint`
  `ck_blocks_status_override` em `__table_args__`, imports de `CheckConstraint`/`String` e o novo
  trecho do docstring da classe.

## Arquivos criados
- `server/migrations/versions/20260820_0900_c5e21f0a7d94_add_block_status_override.py` — adiciona a
  coluna e a constraint; o downgrade derruba as duas na ordem inversa.

## Decisões técnicas
- **`String(16)` com `CHECK`, não `Enum` do PostgreSQL.** Um tipo enum no banco tornaria cada valor
  novo uma migration com `ALTER TYPE`; o `CHECK` sobre `varchar` dá a mesma garantia de integridade e
  é editável numa migration comum. É também o que a spec fixou.
- **Sem `server_default` e sem backfill**, mesmo raciocínio já documentado em `rotation_days`
  (`a1c7e4f92b83`): nulo não é "faltando preencher", é o valor semanticamente correto de toda quadra
  que já existe — gravar `'never'` ou qualquer outra coisa diria que alguém escolheu aquilo.
- **`'recent'` não é um valor aceito.** Só os dois estados que o admin tem motivo para forçar entram
  no vocabulário; "recente" é o que um registro de trabalho novo já produz sozinho. Está anotado ao
  lado da constraint.
- A constraint ficou em `__table_args__` com nome explícito, no mesmo estilo de
  `uq_blocks_territory_number`, para que o `op.drop_constraint` do downgrade tenha um nome estável e
  o `alembic check` não veja divergência.

## Como validar
```bash
cd server
uv run alembic heads          # c5e21f0a7d94 (head)
uv run alembic upgrade head
uv run alembic check          # "No new upgrade operations detected."
uv run alembic downgrade -1 && uv run alembic upgrade head
```

## Resultado da validação
- `uv run alembic upgrade head` aplicou a migration sem erro; `uv run alembic check` respondeu
  **"No new upgrade operations detected."**, provando modelo e banco em sincronia.
- Roundtrip `downgrade -1` → `upgrade head` executado com sucesso, provando que o downgrade desfaz
  coluna e constraint.
- `uv run ruff check .` e `uv run ruff format --check .` limpos.
- `uv run pytest`: 561 passaram. As 2 falhas restantes são de
  `tests/schemas/test_block_schemas.py` (`status_override` em `BlockPatchIn`), que é a **Task 02**
  desta mesma spec, ainda não implementada — fora do escopo desta task, que toca apenas Models e
  Migrations.
