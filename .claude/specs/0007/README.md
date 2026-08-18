# [0007] Designação como registro histórico (estilo S-13) e exportação para Excel

**Data:** 2026-08-18
**Status:** Concluída
**Solicitação original:** "Aqui deve ter uma opção para apagar uma designação (sem ter existido). E
também uma opção de exportar as informações em uma planilha excel. Ao exportar deve pegar
território por território (o admin pode marcar o território como concluído), para cada designação
precisa ter a data de início. Isso precisa ser histórico, mas o admin pode apagar um registro se
necessário."

## Decisões já tomadas com o usuário

- **"Marcar como concluído" encerra a designação e libera o território**: grava a data de
  conclusão, o registro vira histórico, e o território fica sem dirigente (disponível para outro).
  Consequência intencional: o publicador perde na hora o direito de marcar quadras ali.
- **Excel: uma aba por território, estilo S-13** — cada território vira uma aba com suas linhas de
  designação (publicador, data de início, data de conclusão), como o cartão de papel.
- **A página de Designações passa a abrir um painel** com a designação atual (e sua data de
  início), o histórico de designações anteriores — cada uma com opção de apagar — e os botões
  "Designar a…" e "Marcar como concluído".
- **As designações que existem hoje em produção são descartadas**: a migration zera
  `territories.assigned_user_id` e não cria histórico nenhum. O usuário redesigna pela tela, com a
  data correta.

## Decisões tomadas por mim (fora do que foi perguntado — objete se discordar)

- **Redesignar com uma designação aberta encerra a anterior com a data de hoje**, em vez de
  recusar. No S-13 só existem duas datas por linha (início e conclusão), então "devolveu" e
  "concluiu" são o mesmo evento — e recusar tiraria o clique único que o admin tem hoje para trocar
  de dirigente. A interface diz isso antes de confirmar.
- **`territories.assigned_user_id` continua existindo, como projeção** da designação aberta —
  exatamente o papel que `blocks.last_worked_at` já tem em relação a `BlockWorkLog` ("Trabalho
  registrado é log, não estado", no `CLAUDE.md`). É recalculado a cada designar/concluir/apagar.
  Consequência boa: a regra do app (`block.territory.assigned_user_id != user.id`,
  `WorkLogService._refuse_unassigned_territory`) **não muda nem uma linha**, e os testes de
  integração da spec 0005 continuam valendo.
- **A data de início e a de conclusão são carimbadas pelo servidor** (`now`), sem campo de data na
  interface. Registrar designações retroativas (as que estão no papel) exigiria um seletor de data
  e fica anotado como evolução futura, não entra aqui.
- **`territory_assignments.user_id` usa `ON DELETE RESTRICT`**, espelhando
  `block_work_logs.user_id`: o histórico nomeia uma pessoa e não pode perdê-la em silêncio. Não há
  rota que apague usuário (só desativar), então isso não bloqueia nada hoje.

## Objetivo

Ao final: a designação de território é um **registro histórico** — cada uma com data de início,
encerrada por uma data de conclusão explícita, e apagável quando foi um erro. A página de
Designações do admin mostra o histórico por território com as três ações (designar, concluir,
apagar), e um botão exporta tudo para um `.xlsx` com uma aba por território no formato do cartão
S-13. O app do publicador continua funcionando sem alteração, e a suíte do servidor continua com
`app/services/` em 100%.

## Contexto técnico

**Modelo novo — `TerritoryAssignment` (tabela `territory_assignments`):**

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `territory_id` | UUID | FK → Territory, `ON DELETE CASCADE` (apagar o território leva o histórico dele, como já leva as quadras) |
| `user_id` | UUID | FK → User, `ON DELETE RESTRICT` (espelha `block_work_logs.user_id`) |
| `started_at` | datetime | a data de início que o usuário pediu |
| `completed_at` | datetime? | nulo = designação **aberta**; preenchido = histórico |
| `created_at` | datetime | do `EntityMixin` |

Índices: `(territory_id, started_at DESC)` para ler o histórico, e **índice único parcial**
`UNIQUE (territory_id) WHERE completed_at IS NULL` — no máximo uma designação aberta por
território, garantido pelo banco e não só pelo service.

**Rotas novas** (todas exigem o JWT do admin e são escopadas por congregação):

- `GET    /admin/territories/{territory_id}/assignments` — o histórico, mais recente primeiro
- `POST   /admin/territories/{territory_id}/assignments` — designar (corpo `{"user_id": "<uuid>"}`)
- `POST   /admin/territories/{territory_id}/assignments/complete` — concluir a designação aberta
- `DELETE /admin/territories/{territory_id}/assignments/{assignment_id}` — apagar um registro

**Rota removida:** `PATCH /admin/territories/{territory_id}/assignment` (spec 0005) e o método
`TerritoryService.assign_to_user` que ela chamava — o trabalho migra para `AssignmentService`.
`TerritoryRepository.set_assigned_user` **permanece**, virando o atualizador da projeção (papel
igual ao de `BlockRepository.set_last_worked_at`).

**Arquivos-chave já existentes:** `server/app/models/territory.py` (a coluna projeção),
`server/app/services/work_log.py` (`_refuse_unassigned_territory`, que não muda),
`server/app/repositories/block_work_log.py` (padrão de repositório com agregação),
`server/app/services/block.py` (padrão de service com `now_provider`),
`admin/src/renderer/screens/DesignationsScreen.tsx` (o diálogo que vira painel),
`admin/src/shared/ipc-contract.ts` (contrato IPC tipado),
`admin/src/main/ipc-handlers.ts` e `admin/src/main/api-client.ts`.

**Testes:** servidor com pytest (470 verdes; `app/services/` **precisa** ficar em 100% — a CI
falha abaixo disso), admin com Vitest + RTL (345 verdes). Todo service novo é TDD.

**Biblioteca de Excel:** `exceljs` (MIT, mantida, escreve `.xlsx` com formatação e datas reais).
Roda no **main process**, que é quem pode tocar disco e abrir `dialog.showSaveDialog`.

## Tasks

### Task 01 — Model `TerritoryAssignment` e migration

**Objetivo:** A tabela do histórico existe, com a garantia de no máximo uma designação aberta por
território, e as designações atuais são descartadas.
**Camadas:** Models (servidor)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0007 — Task 01: Crie `server/app/models/territory_assignment.py` com a classe
> `TerritoryAssignment(Base, EntityMixin)`, tabela `territory_assignments`, seguindo o estilo de
> `server/app/models/block_work_log.py` (docstrings explicando o *porquê*, imports sob
> `TYPE_CHECKING`): `territory_id` (UUID, FK → `territories.id`, `ondelete="CASCADE"`,
> `nullable=False`, `index=True`), `user_id` (UUID, FK → `users.id`, `ondelete="RESTRICT"`,
> `nullable=False`, `index=True` — espelha `block_work_logs.user_id`: o histórico nomeia uma pessoa
> e não pode perdê-la), `started_at` (`DateTime(timezone=True)`, `nullable=False`), `completed_at`
> (`DateTime(timezone=True)`, `nullable=True` — nulo significa designação **aberta**). Relações:
> `territory` e `user`, com `back_populates` só se o outro lado já tiver o par (não crie relação
> nova em `User`; em `Territory` adicione `assignments` com `cascade="all, delete-orphan"` e
> `passive_deletes=True`, igual ao que `Territory.blocks` já faz). Em `__table_args__`, além do
> índice composto `Index('ix_territory_assignments_territory_started', 'territory_id',
> started_at.desc())` (ou equivalente), declare o **índice único parcial**
> `Index('uq_territory_assignments_open', 'territory_id', unique=True,
> postgresql_where=text('completed_at IS NULL'))` — é o que garante no banco que só existe uma
> designação aberta por território. Registre a classe em `server/app/models/__init__.py`. Depois
> gere a migration (`cd server && uv run alembic revision --autogenerate -m "add territory
> assignments"`), **e edite-a** para, além de criar a tabela e os índices, executar
> `op.execute("UPDATE territories SET assigned_user_id = NULL")` — decisão do usuário: as
> designações que existem hoje são descartadas e serão refeitas pela tela, já que não há como saber
> a data de início real delas. Deixe um comentário na migration dizendo isso, e outro dizendo que o
> `downgrade` (que dropa a tabela) não restaura as designações zeradas. Rode `uv run alembic
> upgrade head` e depois `uv run alembic downgrade -1` e `upgrade head` de novo contra o Postgres de
> desenvolvimento (`docker compose -f docker-compose.dev.yml up -d` se preciso) para confirmar que
> o ciclo funciona, e `uv run ruff check .`/`ruff format --check .`. Toque apenas
> `server/app/models/territory_assignment.py`, `server/app/models/territory.py` (só a relação
> `assignments`), `server/app/models/__init__.py` e o arquivo de migration novo; não modifique
> schemas, repositórios, services ou rotas.

---

### Task 02 — Schemas da designação

**Objetivo:** Os DTOs de entrada e saída do histórico de designações.
**Camadas:** Schemas (servidor)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0007 — Task 02: Crie `server/app/schemas/assignment.py` seguindo o estilo dos schemas
> existentes (`server/app/schemas/work_log.py` é a referência mais próxima — veja como
> `WorkLogOut` aninha `UserBriefOut`): (1) `AssignmentCreateIn(BaseModel)` com `user_id: UUID`
> (obrigatório, sem default); (2) `AssignmentOut(OutSchema)` com `id: UUID`,
> `user: UserBriefOut`, `started_at: datetime` e `completed_at: datetime | None = None` — a
> docstring deve explicar que `completed_at` nulo significa designação **aberta** (a que vale
> agora), e que preenchido significa histórico. Não crie schema de exportação: a planilha é montada
> no admin a partir dessas mesmas respostas. Não altere `server/app/schemas/territory.py`
> (`TerritoryOut.assigned_user` continua exatamente como está — é a projeção da designação aberta).
> Valide com `uv run ruff check .` e `uv run pytest tests/schemas -q`. Toque apenas
> `server/app/schemas/assignment.py`; não modifique outras camadas.

---

### Task 03 — Repositório de designações

**Objetivo:** As queries do histórico: criar, listar, achar a aberta, achar por id dentro da
congregação, encerrar e apagar.
**Camadas:** Repositories (servidor)
**Modo:** direto
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0007 — Task 03: Crie `server/app/repositories/territory_assignment.py` com
> `TerritoryAssignmentRepository`, seguindo o estilo de
> `server/app/repositories/block_work_log.py` (construtor recebendo `Session`, docstrings
> explicando o porquê de cada query, `flush()` depois de escrever). Métodos:
> `create(territory_id, user_id, started_at) -> TerritoryAssignment`;
> `get_open(territory_id) -> TerritoryAssignment | None` (a que tem `completed_at IS NULL`);
> `list_by_territory(territory_id) -> list[TerritoryAssignment]` ordenada por `started_at`
> **decrescente** (mais recente primeiro — é como o painel do admin lê);
> `get_in_congregation(congregation_id, assignment_id) -> TerritoryAssignment | None`, com `join`
> em `Territory` filtrando `Territory.congregation_id` (mesmo raciocínio de
> `BlockRepository.get_in_congregation`: uma designação de outra congregação tem que ser
> indistinguível de uma que não existe, e o jeito mais barato de garantir isso é nunca carregá-la);
> `close(assignment, completed_at) -> TerritoryAssignment` (atribui e dá flush);
> `delete(assignment) -> None`. Carregue o `user` junto onde fizer sentido para o
> `AssignmentOut` não disparar N+1 (`selectinload`/`joinedload`, como o projeto já fizer em
> `block_work_log.py` — se lá não houver precedente, use `joinedload` e comente o porquê). Valide
> com `uv run ruff check .`, `uv run ruff format --check .` e `uv run pytest tests -q` (nada deve
> regredir). Toque apenas `server/app/repositories/territory_assignment.py`; não modifique models,
> services ou rotas.

---

### Task 04 — Service de designação: designar, concluir, apagar

**Objetivo:** A regra de negócio inteira do histórico, com a projeção
`territories.assigned_user_id` sempre coerente com a designação aberta.
**Camadas:** Services (servidor)
**Modo:** TDD
**Depende de:** Task 01, Task 03
**Instrução para o subagente:**
> Spec 0007 — Task 04: Implemente por TDD. Crie `server/app/services/assignment.py` com
> `AssignmentService`, no estilo de `server/app/services/work_log.py` (construtor recebendo os
> repositórios e um `now_provider: Callable[[], datetime]`; **nunca** chame `datetime.now()`
> direto). Ele recebe `TerritoryAssignmentRepository`, `TerritoryRepository` e `UserRepository`.
> Métodos e regras:
> - `designate(congregation_id, territory_id, user_id, now=None) -> TerritoryAssignment`: valida
>   que o território é da congregação (senão `NotFoundError`) e que o publicador é da mesma
>   congregação (senão `NotFoundError` — mesma exceção genérica, sem revelar qual dos dois falhou,
>   igual ao que `TerritoryService.assign_to_user` fazia). Se já existe designação **aberta**,
>   encerra-a com `completed_at = now` antes de criar a nova (decisão registrada na spec: no S-13
>   só existem duas datas por linha, então devolver e concluir são o mesmo evento). Cria a nova com
>   `started_at = now` e `completed_at = None`. Atualiza a projeção
>   `territories.assigned_user_id = user_id` via `TerritoryRepository.set_assigned_user`.
>   Publicador com `is_active = False` **pode** ser designado (desativação revoga o acesso ao app,
>   não o vínculo de responsabilidade — regra que já valia antes).
> - `complete(congregation_id, territory_id, now=None) -> TerritoryAssignment`: encerra a designação
>   aberta com `completed_at = now` e zera a projeção (`set_assigned_user(territory, None)`) — o
>   território fica livre. Sem designação aberta, `NotFoundError`.
> - `delete(congregation_id, assignment_id) -> None`: apaga o registro de vez ("como se não tivesse
>   existido"). Se o registro apagado era o aberto, a projeção volta a ser recalculada a partir do
>   que sobrou (use um helper privado tipo `_refresh_assigned_user(territory)` que lê
>   `get_open(territory_id)` e chama `set_assigned_user` com o `user_id` dela ou `None` — mesmo
>   padrão de `WorkLogService._refresh_last_worked_at`, que recalcula em vez de assumir). Registro
>   inexistente ou de outra congregação → `NotFoundError`.
> - `list(congregation_id, territory_id) -> list[TerritoryAssignment]`: o histórico do território,
>   validando a congregação primeiro.
> Comportamentos observáveis a cobrir com teste (contra o Postgres real, via a fixture `session`,
> seguindo `server/tests/services/test_work_log_service.py` e `test_territory_service.py`), em
> `server/tests/services/test_assignment_service.py`:
> - Caminho feliz: designar cria um registro aberto com `started_at` do relógio injetado e deixa
>   `territory.assigned_user_id` apontando para o publicador.
> - Caminho feliz: designar a outro publicador com uma designação aberta encerra a anterior
>   (`completed_at` = agora, ela deixa de ser a aberta), cria a nova aberta, e a projeção passa a
>   apontar para o novo — o histórico fica com dois registros.
> - Caminho feliz: concluir encerra a aberta e deixa `territory.assigned_user_id` como `None`; o
>   registro continua no histórico com `completed_at` preenchido.
> - Caminho feliz: apagar um registro **já concluído** não mexe na projeção nem no registro aberto.
> - Caminho feliz: apagar o registro **aberto** faz `territory.assigned_user_id` voltar a `None`.
> - Borda: apagar o registro aberto quando existe um concluído mais antigo **não** reabre o antigo
>   — a projeção fica `None` (só uma designação aberta existe por vez, e um registro concluído
>   permanece concluído).
> - Caminho feliz: `list` devolve o histórico do mais recente para o mais antigo.
> - Erro: território inexistente ou de outra congregação → `NotFoundError` em `designate`,
>   `complete` e `list`.
> - Erro: `user_id` inexistente ou de outra congregação → `NotFoundError` em `designate`.
> - Erro: `complete` sem designação aberta → `NotFoundError`.
> - Erro: `delete` com id inexistente ou de outra congregação → `NotFoundError`.
> - Borda: publicador desativado (`is_active=False`) pode ser designado normalmente.
> A cobertura de `app/services/assignment.py` precisa ficar em **100% linha e branch** (a CI falha
> se `app/services/` sair de 100%) — confira com `uv run pytest --cov=app --cov-report=term-missing`.
> Toque apenas `server/app/services/assignment.py` e seu arquivo de teste; não modifique
> repositórios, schemas ou rotas.

---

### Task 05 — Rotas de designação

**Objetivo:** Os quatro endpoints do histórico, registrados na aplicação.
**Camadas:** Routers (servidor)
**Modo:** direto
**Depende de:** Task 02, Task 04
**Instrução para o subagente:**
> Spec 0007 — Task 05: Crie `server/app/routers/admin_assignments.py` seguindo o estilo de
> `server/app/routers/admin_blocks.py` (prefixo, `tags`, dependências `AdminCongregation` e a
> fábrica de service com `Annotated[..., Depends(...)]`, `utc_now` como `now_provider`). Rotas,
> todas escopadas pela congregação do token:
> - `GET /admin/territories/{territory_id}/assignments` → `list[AssignmentOut]`, chamando
>   `AssignmentService.list`.
> - `POST /admin/territories/{territory_id}/assignments`, corpo `AssignmentCreateIn`, status **201**
>   → `AssignmentOut`, chamando `designate`.
> - `POST /admin/territories/{territory_id}/assignments/complete` → `AssignmentOut`, chamando
>   `complete` (devolve o registro recém-encerrado, com a data de conclusão).
> - `DELETE /admin/territories/{territory_id}/assignments/{assignment_id}` → **204** sem corpo,
>   chamando `delete`. Note que o `territory_id` da URL não é usado pelo service (o
>   `assignment_id` já é validado contra a congregação): mantenha-o na rota mesmo assim, por
>   coerência de hierarquia REST, e comente isso.
> Registre o router em `server/app/main.py` (`app.include_router(admin_assignments.router)`), junto
> dos outros. Escreva também os testes de rota em
> `server/tests/routers/test_admin_assignments_routes.py`, no padrão de
> `server/tests/routers/test_admin_blocks_routes.py`: caminho feliz de cada rota (incluindo os
> status 201/204), 404 para território de outra congregação, e 401 sem token de admin. Valide com
> `uv run pytest tests -q`, `uv run ruff check .` e `ruff format --check .`. Toque apenas
> `server/app/routers/admin_assignments.py`, `server/app/main.py` (só a linha do include) e o
> arquivo de teste novo; não modifique services, schemas ou as outras rotas.

---

### Task 06 — Remover a rota e o service antigos de designação

**Objetivo:** Sai o `PATCH /assignment` da spec 0005, que agora tem substituto — sem deixar dois
caminhos concorrentes para o mesmo dado.
**Camadas:** Routers, Services (servidor)
**Modo:** direto
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0007 — Task 06: Remova o caminho antigo de designação, que a Task 05 substituiu:
> (1) a rota `PATCH /admin/territories/{territory_id}/assignment` em
> `server/app/routers/admin_territories.py` (e o import de `TerritoryAssignmentIn` que ficar órfão);
> (2) o método `TerritoryService.assign_to_user` e o helper `_user_in_congregation` em
> `server/app/services/territory.py`, junto com o `UserRepository` do construtor **se ele não for
> mais usado por nenhum outro método** (confira antes; se ficar sem uso, remova o parâmetro e
> atualize os dois pontos que instanciam o service, `get_territory_service` em
> `admin_territories.py` e em `app_client.py`); (3) o schema `TerritoryAssignmentIn` em
> `server/app/schemas/territory.py`, se nada mais o referenciar. **Mantenha**
> `TerritoryRepository.set_assigned_user` — ele agora é o atualizador da projeção usado pelo
> `AssignmentService`. Atualize os testes afetados: os casos de `assign_to_user` em
> `server/tests/services/test_territory_service.py`, os da rota em
> `server/tests/routers/test_admin_territories_routes.py`, e
> `server/tests/integration/test_territory_assignment_integration.py` — este último passa a
> exercitar as rotas novas (`POST .../assignments` em vez de `PATCH .../assignment`), preservando
> exatamente o que ele já verificava: o `assigned_user` aparecendo em `GET /admin/territories` e em
> `GET /app/territories`, a marcação de quadra funcionando dentro do território designado, o 403
> `territory_not_assigned` para quem não tem designação, e o 403 depois que a designação é
> desfeita — que agora se desfaz **concluindo** (`POST .../assignments/complete`) em vez de
> `PATCH` com `user_id: null`. Ao final, `uv run pytest -q` precisa ficar **100% verde** e
> `uv run pytest --cov=app --cov-report=term-missing` precisa manter `app/services/` em 100%.
> Toque apenas os arquivos citados; não mexa em `app/services/assignment.py` nem em
> `app/routers/admin_assignments.py` (são da Task 05, já prontos).

---

### Task 07 — Integração: o ciclo de vida completo da designação

**Objetivo:** Provar por HTTP que designar → concluir → redesignar → apagar mantém o histórico e a
projeção coerentes, e que o app do publicador acompanha.
**Camadas:** Integração (servidor)
**Modo:** TDD
**Depende de:** Task 05, Task 06
**Instrução para o subagente:**
> Spec 0007 — Task 07: Implemente por TDD. Crie
> `server/tests/integration/test_assignment_history_integration.py`, seguindo o padrão dos outros
> arquivos de `server/tests/integration/` (app FastAPI real sobre o PostGIS real, tudo criado por
> HTTP menos a congregação; use o `Api` de `conftest.py`, acrescentando a ele os métodos que
> faltarem para as rotas novas — `list_assignments`, `designate`, `complete_assignment`,
> `delete_assignment` — no mesmo estilo dos existentes). Um fluxo encadeado, cobrindo:
> - O admin designa o território ao publicador A: `GET .../assignments` mostra **uma** designação,
>   aberta (`completed_at` nulo) e com `started_at` preenchido; `GET /admin/territories` mostra
>   `assigned_user` = A.
> - O publicador A ativa o app e consegue marcar uma quadra desse território (201).
> - O admin conclui: `GET .../assignments` mostra a mesma designação agora com `completed_at`
>   preenchido, `GET /admin/territories` mostra `assigned_user` nulo, e uma nova tentativa de
>   marcação do publicador A responde **403** `territory_not_assigned` — a conclusão tira o acesso
>   na hora.
> - O admin designa ao publicador B: o histórico passa a ter **duas** entradas (a de B aberta, a de
>   A concluída), mais recente primeiro; B consegue marcar, A não.
> - O admin designa de volta a A **sem concluir** a de B: a de B é encerrada automaticamente com
>   data de conclusão, e o histórico fica com três entradas.
> - O admin apaga a designação **aberta** (a de A): ela some do histórico (duas entradas restam),
>   `assigned_user` volta a nulo, e A perde o acesso de novo.
> - O admin apaga uma designação **já concluída**: ela some do histórico sem afetar nada mais.
> - Uma designação de outra congregação responde **404** ao ser apagada (crie a segunda congregação
>   como os testes de isolamento já fazem).
> Ao final rode a suíte inteira (`uv run pytest -q`) e relate o número exato de testes passando.
> Toque apenas o arquivo de teste novo e `server/tests/integration/conftest.py` (só para
> acrescentar os métodos do `Api`); **não** modifique código de produção — se algum cenário falhar
> por bug de fiação das Tasks 05/06, corrija o arquivo mínimo necessário e registre isso no
> relatório final.

---

### Task 08 — Admin: modelo e contrato IPC das designações e da exportação

**Objetivo:** O `shared/` do admin conhece a designação histórica e os canais novos.
**Camadas:** Shared (admin)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0007 — Task 08: Em `admin/src/shared/models.ts`, adicione a interface `Assignment`:
> `id: string`, `publisher: PublisherBrief`, `startedAt: Date`, `completedAt?: Date` — com
> comentário curto dizendo que `completedAt` ausente significa designação **aberta** (a que vale
> agora). Adicione também a função pura `assignmentIsOpen(assignment: Assignment): boolean`, no
> estilo dos predicados que já existem no arquivo (`publisherIsPending`, `blockWasNeverWorked`), e
> **teste-a** em `admin/src/shared/models.test.ts` (verdadeiro sem `completedAt`, falso com). Em
> `admin/src/shared/ipc-contract.ts`, acrescente em `IPC_CHANNELS` os canais
> `assignmentsListFor: 'assignments:listFor'`, `assignmentsDesignate: 'assignments:designate'`,
> `assignmentsComplete: 'assignments:complete'`, `assignmentsDelete: 'assignments:delete'` e
> `exportAssignments: 'export:assignments'`; e em `IpcApi` um namespace novo `assignments` com
> `listFor(territoryId): Promise<Assignment[]>`,
> `designate(territoryId, publisherId): Promise<Assignment>`,
> `complete(territoryId): Promise<Assignment>` e
> `delete(territoryId, assignmentId): Promise<void>`, mais um namespace `exports` com
> `assignments(): Promise<string | null>` — comentando que ele devolve o caminho do arquivo salvo,
> ou `null` quando o admin cancelou o diálogo de salvar. **Remova** de `IpcApi.territories` o método
> `assign` e o canal `territoriesAssign` (a designação passa a viver no namespace novo); a
> implementação dele em `main`/`preload` sai na Task 09 e o uso no renderer sai na Task 11 — como
> isso quebra a compilação até lá, deixe registrado no relatório final. `Territory.assignedUser`
> **permanece** como está (é a projeção da designação aberta). Valide com `npm run typecheck` (vai
> acusar os pontos que as Tasks 09/11 consertam — liste-os no relatório) e
> `npx vitest run src/shared`. Toque apenas `admin/src/shared/models.ts`,
> `admin/src/shared/models.test.ts` e `admin/src/shared/ipc-contract.ts`.

---

### Task 09 — Admin: cliente da API e handlers IPC das designações

**Objetivo:** Ligar os canais novos às rotas reais do servidor.
**Camadas:** Main, Preload (admin)
**Modo:** direto
**Depende de:** Task 05, Task 08
**Instrução para o subagente:**
> Spec 0007 — Task 09: Em `admin/src/main/api-client.ts`, troque o método `assignTerritory` (da
> spec 0005, que chamava o `PATCH .../assignment` agora removido) por quatro métodos, seguindo
> exatamente o padrão dos existentes (`request()`, tratamento de erro, token): `listAssignments
> (territoryId)` → `GET /admin/territories/{id}/assignments`; `designate(territoryId, userId)` →
> `POST /admin/territories/{id}/assignments` com corpo `{ user_id }`; `completeAssignment
> (territoryId)` → `POST /admin/territories/{id}/assignments/complete`;
> `deleteAssignment(territoryId, assignmentId)` → `DELETE
> /admin/territories/{id}/assignments/{assignmentId}`. Adicione um `parseAssignment` que converta a
> resposta (`user`, `started_at`, `completed_at`) para o `Assignment` do `shared/models.ts`
> (`publisher`, `startedAt`, `completedAt`), com as datas viradas `Date` — mesmo padrão do
> `parseWorkLog`/`parseTerritory` que já existem. Em `admin/src/main/ipc-handlers.ts`, registre os
> quatro handlers novos (`IPC_CHANNELS.assignmentsListFor`, `assignmentsDesignate`,
> `assignmentsComplete`, `assignmentsDelete`), todos via `session.run(...)` como os demais, e
> remova o handler de `territoriesAssign`. Em `admin/src/preload/index.ts`, exponha o namespace
> `assignments` repassando para `ipcRenderer.invoke`, e remova `territories.assign`. Estenda os
> testes existentes (`admin/src/main/api-client.test.ts`, e o `fakeApiClient()` de
> `session.test.ts` e de `ipc-handlers.test.ts`, que precisam dos métodos novos para satisfazer a
> interface) cobrindo: cada um dos quatro métodos monta URL/método/corpo certos, e
> `parseAssignment` converte datas e trata `completed_at` nulo. **Não** implemente ainda o handler
> de exportação (`exportAssignments`) — é a Task 10. Valide com `npx vitest run src/main`,
> `npm run typecheck` (o renderer ainda vai acusar o uso removido de `territories.assign` — é a
> Task 11) e `npm run lint`. Toque apenas `admin/src/main/api-client.ts`,
> `admin/src/main/api-client.test.ts`, `admin/src/main/ipc-handlers.ts`,
> `admin/src/main/ipc-handlers.test.ts`, `admin/src/main/session.test.ts` e
> `admin/src/preload/index.ts`.

---

### Task 10 — Admin: exportação para Excel, uma aba por território

**Objetivo:** A planilha `.xlsx` no formato do cartão S-13, salva onde o admin escolher.
**Camadas:** Main (admin)
**Modo:** TDD
**Depende de:** Task 09
**Instrução para o subagente:**
> Spec 0007 — Task 10: Implemente por TDD. Instale `exceljs` (`npm install exceljs`) e crie
> `admin/src/main/excel-export.ts` exportando a função **pura**
> `buildAssignmentsWorkbook(territories: { territory: Territory; assignments: Assignment[] }[]):
> ExcelJS.Workbook` — sem tocar disco, sem Electron, o que a torna testável de verdade. Regras da
> planilha, no estilo do cartão S-13:
> - **Uma aba por território**, na ordem do número do território (reutilize
>   `compareTerritoriesByNumber` de `admin/src/shared/models.ts`, que já existe).
> - Nome da aba = nome do território **saneado** para o que o Excel aceita: máximo 31 caracteres e
>   sem os caracteres proibidos `[ ] : * ? / \`; se dois territórios colidirem depois do saneamento,
>   desempate com um sufixo numérico (` (2)`, ` (3)`…), porque duas abas não podem ter o mesmo nome.
> - Dentro da aba: uma linha de título com o nome **completo** do território (não o saneado), e
>   abaixo a tabela com o cabeçalho `Publicador | Data de início | Data de conclusão`, uma linha por
>   designação, **da mais antiga para a mais recente** (o cartão é lido de cima para baixo no tempo;
>   note que a API devolve o contrário, então inverta aqui).
> - As datas entram como **datas reais do Excel** (objeto `Date` na célula) com `numFmt`
>   `'dd/mm/yyyy'`, para o Excel ordenar e formatar como data. Designação aberta deixa a célula de
>   conclusão **vazia** (não escreva "—" nem texto).
> - Território sem designação nenhuma **ainda ganha sua aba**, com o cabeçalho e nenhuma linha — o
>   cartão existe mesmo vazio.
> Comportamentos a cobrir com teste (`admin/src/main/excel-export.test.ts`, inspecionando o
> `Workbook` em memória — `workbook.worksheets`, `sheet.getRow(n).getCell(n).value` — sem escrever
> arquivo):
> - Caminho feliz: um território com duas designações vira uma aba com as duas linhas, na ordem
>   cronológica crescente, com nome do publicador e as duas datas.
> - Caminho feliz: designação aberta deixa a célula de conclusão vazia.
> - Caminho feliz: as abas saem ordenadas pelo número do território (ex.: N6, N7, N12 nessa ordem,
>   mesmo recebendo fora de ordem).
> - Borda: território sem designações gera aba com cabeçalho e zero linhas de dados.
> - Borda: nome de território com mais de 31 caracteres vira nome de aba truncado e válido.
> - Borda: nome com caractere proibido (`/`, `:`…) vira nome de aba válido.
> - Borda: dois territórios cujo nome saneado colidiria geram abas com nomes distintos.
> Depois, ligue a exportação no `admin/src/main/ipc-handlers.ts`: o handler de
> `IPC_CHANNELS.exportAssignments` busca os territórios (`listWithBlocks`) e, para cada um, seu
> histórico (`listAssignments`) — o N+1 é aceitável nesse volume (dezenas de territórios), comente
> isso —, monta o workbook, abre `dialog.showSaveDialog` (nome sugerido
> `designacoes-<AAAA-MM-DD>.xlsx`, filtro `.xlsx`), e grava com `workbook.xlsx.writeFile(path)`,
> devolvendo o caminho salvo ou `null` se o admin cancelar. O `dialog` precisa ser **injetável** no
> `registerIpcHandlers` (como `session`, `api` e `geocoder` já são) para o teste do handler não
> abrir janela nenhuma; cubra no teste do handler: cancelar devolve `null` sem escrever arquivo, e
> confirmar devolve o caminho. Valide com `npx vitest run src/main`, `npm run typecheck` e
> `npm run lint`. Toque apenas `admin/src/main/excel-export.ts`, seu teste,
> `admin/src/main/ipc-handlers.ts`, `admin/src/main/ipc-handlers.test.ts`,
> `admin/src/preload/index.ts` (o namespace `exports`) e `admin/package.json`/`package-lock.json`.

---

### Task 11 — Admin: painel de histórico na página de Designações

**Objetivo:** A interface das três ações — designar, concluir, apagar — mais o botão de exportar.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 08, Task 09, Task 10
**Instrução para o subagente:**
> Spec 0007 — Task 11: Implemente por TDD em
> `admin/src/renderer/screens/DesignationsScreen.tsx` e `DesignationsScreen.test.tsx`. Hoje clicar
> num território abre um diálogo só com os publicadores + "Nenhum"; ele passa a abrir um **painel**
> (mantenha `role="dialog"`, `aria-label={`Designações de ${territory.name}`}`) contendo:
> - **Designação atual**: nome do dirigente e a data de início formatada (`toLocaleDateString`),
>   ou "Sem dirigente" quando não houver.
> - **Histórico**: as designações já concluídas, mais recente primeiro, cada uma como
>   "{publicador} — {início} a {conclusão}", com um botão "Apagar" (`aria-label` incluindo o nome do
>   publicador, para o teste distinguir as linhas). Apagar pede confirmação via `window.confirm`
>   (mesmo padrão do resto do admin) com uma mensagem dizendo que o registro será removido do
>   histórico como se não tivesse existido, e chama `window.api.assignments.delete`.
> - **Ações**: "Designar a…" (a lista de publicadores ativos que já existe hoje, agora **sem** a
>   opção "Nenhum" — liberar o território agora é "Marcar como concluído") e, quando há designação
>   aberta, "Marcar como concluído", que chama `window.api.assignments.complete` depois de
>   confirmar com uma mensagem explicando que o território fica livre e o publicador perde o acesso
>   para marcar quadras. Se já houver designação aberta ao designar a outra pessoa, a confirmação
>   deve avisar que a designação atual será encerrada com a data de hoje.
> - Toda ação recarrega o histórico do território **e** a lista de territórios (a projeção
>   `assignedUser` muda), e cada falha vira `role="alert"` com `parseIpcError`, como já é feito.
> Fora do painel, no cabeçalho da tela, um botão **"Exportar para Excel"** que chama
> `window.api.exports.assignments()`; sucesso mostra uma confirmação (`role="status"`) com o
> caminho salvo, cancelamento (retorno `null`) não mostra nada, e falha vira `role="alert"`.
> Comportamentos a cobrir com teste (RTL, com o `AssignmentsMap` mockado via `vi.mock` como o
> arquivo já faz):
> - Abrir o painel de um território designado mostra o dirigente atual com a data de início, e as
>   designações concluídas no histórico.
> - Designar a um publicador ativo chama `assignments.designate` com os ids certos e recarrega.
> - "Marcar como concluído" confirmado chama `assignments.complete`; recusado na confirmação não
>   chama nada.
> - "Apagar" numa linha do histórico confirmado chama `assignments.delete` com o id daquela
>   designação; recusado não chama nada.
> - Território sem designação: mostra "Sem dirigente", não oferece "Marcar como concluído", e
>   ainda permite designar.
> - "Exportar para Excel" com caminho devolvido mostra a confirmação com o caminho; com `null`
>   (cancelado) não mostra confirmação nem erro; com rejeição mostra `role="alert"`.
> - Publicadores desativados continuam fora da lista de opções.
> Ajustes de CSS necessários vão em `admin/src/renderer/index.css`, reaproveitando as classes que
> já existem (`.assign-options`, `.dialog-actions`, `.dialog-subtitle`, `.status-badge`). Valide
> com `npm test` (a suíte inteira precisa ficar verde — inclusive `App.test.tsx`, que fabrica
> `window.api` e vai precisar dos namespaces novos no fake), `npm run typecheck` e `npm run lint`.
> Toque apenas `DesignationsScreen.tsx`, `DesignationsScreen.test.tsx`, `index.css` e os fakes de
> `window.api` nos testes que deixarem de compilar.

---

### Task 12 — Documentação: `CLAUDE.md`

**Objetivo:** A documentação do projeto descreve a designação histórica e a exportação.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 01–Task 11
**Instrução para o subagente:**
> Spec 0007 — Task 12: Atualize o `CLAUDE.md` para refletir o que esta spec construiu (confira o
> código antes de escrever — descreva o que existe, não o que foi planejado): (1) **Modelo de
> Dados**: seção nova `TerritoryAssignment` com a tabela de campos, o índice único parcial que
> garante uma designação aberta por território, e a nota de que `territories.assigned_user_id`
> passou a ser **projeção** da designação aberta (mesmo papel de `Block.last_worked_at` em relação
> ao `BlockWorkLog`) — inclua essa observação também na linha `assigned_user_id` da tabela de
> `Territory`. (2) **Regras de Negócio**: reescreva a seção "Designação de território" para o ciclo
> real — designar grava data de início; designar a outro com uma designação aberta encerra a
> anterior com a data de hoje; "marcar como concluído" grava a data de conclusão e **libera** o
> território (o publicador perde o acesso de marcar quadras na hora); apagar um registro o remove
> do histórico de vez, e a projeção é recalculada; a regra do app continua sendo
> `assigned_user_id`, agora derivada. Cite as rotas novas e diga que o `PATCH
> /admin/territories/{id}/assignment` deixou de existir. (3) **Admin**: mencione a página de
> Designações com o painel de histórico e a exportação `.xlsx` (uma aba por território, estilo
> S-13, via `exceljs` no main process com `dialog.showSaveDialog`), e acrescente `exceljs` onde as
> dependências do admin forem listadas. (4) **Testes**: atualize os números de testes citados, se
> houver algum, para os reais depois desta spec. Não invente comportamento: se algo saiu diferente
> do planejado aqui, documente o que existe de verdade. Toque apenas `CLAUDE.md`.

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0007
```

Ondas naturais: **01, 02 e 08 em paralelo** (nada depende delas) → **03** → **04** → **05** →
**06** e **09** em paralelo → **07** e **10** em paralelo → **11** → **12**.

**Atenção do orquestrador:** a Task 08 remove `territories.assign` do contrato IPC e **quebra a
compilação do admin de propósito** até a Task 11 — é esperado, e as Tasks 09 e 11 são o conserto.
Não trate isso como bloqueio. No servidor, a Task 06 remove a rota antiga e mexe em testes que a
Task 05 não toca; não rode as duas em paralelo.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo`
da task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task, ou pelo `/centaur-driven-run` ao montar
  o plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — Model `TerritoryAssignment` e migration → implements/0117
- [x] Task 02 — Schemas da designação → implements/0115
- [x] Task 03 — Repositório de designações → implements/0118
- [x] Task 04 — Service de designação: designar, concluir, apagar → implements/0119
- [x] Task 05 — Rotas de designação → implements/0120
- [x] Task 06 — Remover a rota e o service antigos de designação → implements/0122
- [x] Task 07 — Integração: o ciclo de vida completo da designação → implements/0123
- [x] Task 08 — Admin: modelo e contrato IPC das designações e da exportação → implements/0116
- [x] Task 09 — Admin: cliente da API e handlers IPC das designações → implements/0121
- [x] Task 10 — Admin: exportação para Excel, uma aba por território → implements/0124
- [x] Task 11 — Admin: painel de histórico na página de Designações → implements/0125
- [x] Task 12 — Documentação: `CLAUDE.md` → implements/0126
