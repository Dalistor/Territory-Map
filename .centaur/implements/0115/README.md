# [0115] Schemas da designação de território (spec 0007, Task 02)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0007/` — Task 02

## Solicitação
> Spec 0007 — Task 02: Crie `server/app/schemas/assignment.py` seguindo o estilo dos schemas
> existentes (`server/app/schemas/work_log.py` é a referência mais próxima — veja como
> `WorkLogOut` aninha `UserBriefOut`): (1) `AssignmentCreateIn(BaseModel)` com `user_id: UUID`
> (obrigatório, sem default); (2) `AssignmentOut(OutSchema)` com `id: UUID`, `user: UserBriefOut`,
> `started_at: datetime` e `completed_at: datetime | None = None` — a docstring deve explicar que
> `completed_at` nulo significa designação **aberta** (a que vale agora), e que preenchido significa
> histórico. Não crie schema de exportação: a planilha é montada no admin a partir dessas mesmas
> respostas. Não altere `server/app/schemas/territory.py` (`TerritoryOut.assigned_user` continua
> exatamente como está — é a projeção da designação aberta). Valide com `uv run ruff check .` e
> `uv run pytest tests/schemas -q`. Toque apenas `server/app/schemas/assignment.py`; não modifique
> outras camadas.

## Contexto
A spec 0007 transforma a designação de território, hoje um campo só (`territories.assigned_user_id`),
num registro histórico no estilo do cartão S-13: uma linha por período de responsabilidade, com data
de início e data de conclusão. Esta task entrega a camada de contrato — os DTOs que as rotas de
`/admin/territories/{id}/assignments` vão usar — sem tocar em model, repositório, service ou rota.

## O que foi feito
Criado `server/app/schemas/assignment.py` com os dois DTOs:

- `AssignmentCreateIn(BaseModel)` — só `user_id: UUID`, obrigatório e sem default. Nem território
  (vem da URL), nem congregação (vem do token), nem `started_at` (vem do relógio do servidor).
- `AssignmentOut(OutSchema)` — `id`, `user: UserBriefOut` aninhado, `started_at: datetime` e
  `completed_at: datetime | None = None`. A docstring explica que `completed_at` nulo é a designação
  **aberta** (a que vale agora, a que autoriza o publicador a marcar quadras, e a que
  `TerritoryOut.assigned_user` projeta) e que preenchido significa histórico.

Nenhum schema de exportação foi criado, como a task determina.

## Arquivos modificados
Nenhum.

## Arquivos criados
- `server/app/schemas/assignment.py` — DTOs de entrada e saída do histórico de designações.

## Decisões técnicas
- **`AssignmentOut` herda de `OutSchema`, `AssignmentCreateIn` de `BaseModel`** — o padrão do
  pacote: só a saída precisa de `from_attributes` para ser validada direto de uma linha do ORM.
- **`user` aninhado em vez de `user_name: str`** — mesmo raciocínio já documentado em
  `WorkLogOut.user`: dois publicadores de mesmo primeiro nome ficam distinguíveis, e `UserBriefOut`
  expõe só identidade, nunca `token_version`/`access_code`.
- **`started_at` não está no `CreateIn`** — aceitar a data do cliente deixaria uma digitação errada
  reescrever a cronologia do cartão. Quem lê o relógio é o router/service, como o `AGENTS.md` manda.
- **`datetime` puro, não `AwareDatetime`** — `AwareDatetime` em `WorkedIn` existe porque aquele
  instante nasce no relógio do celular, possivelmente offline e em outro fuso; aqui as duas datas
  nascem no servidor, então não há entrada de datetime a validar (a única entrada é o `user_id`).
- **Sem schema de exportação** — a planilha do Excel é montada no admin a partir destas mesmas
  respostas; um DTO de exportação seria uma segunda forma do mesmo dado, sem consumidor no servidor.
- **`territory.py` intocado** — `TerritoryOut.assigned_user` continua sendo a projeção da designação
  aberta, exatamente como já estava.

## Como validar
```bash
cd server
uv run ruff check .
uv run pytest tests/schemas -q
```

## Resultado da validação
- `uv run ruff check .` → `All checks passed!`
- `uv run ruff format --check app/schemas/assignment.py` → `1 file already formatted`
- `uv run pytest tests/schemas -q` → **94 passed** (nenhuma regressão)

Não foi criado teste de schema para o arquivo novo: a task restringe explicitamente o escopo a
`server/app/schemas/assignment.py`, e os DTOs aqui não têm validador próprio nem regra de forma além
das anotações do Pydantic. As rotas que os consomem ganham teste na Task 05.
