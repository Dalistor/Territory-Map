# [0009] Marcação de quadra pelo admin, rotação por território e página de configurações

**Data:** 2026-08-19
**Status:** Concluída
**Solicitação original:** "Preciso que no admin seja possível marcar uma quadra como concluída também. E também definir para cada território um tempo de rotação (para as quadras ficarem vermelhas novamente). Preciso de uma página de configurações para cada território"

## Objetivo

Ao término das tasks:

1. **O admin marca quadra como trabalhada.** No menu de ações da quadra (na `HomeScreen`), existe "Marcar como trabalhada": abre um diálogo onde o admin **escolhe o publicador** e a **data** (padrão: hoje), e o servidor grava um `BlockWorkLog` normal — o mesmo que o app grava, recalculando `Block.last_worked_at`. Diferente do app, o admin **não** está preso à designação do território: ele pode registrar o trabalho de qualquer publicador da congregação em qualquer quadra dela.
2. **Cada território tem um tempo de rotação em dias.** `Territory.rotation_days` é opcional; nulo significa "usa o padrão de 120 dias", exatamente o comportamento de hoje. Esse número **substitui o limiar fixo de 120 dias** no cálculo da cor da quadra, nos dois clientes: nunca trabalhada continua vermelha, passou da rotação fica laranja, dentro da rotação fica verde.
3. **Cada território tem uma página de configurações no admin.** Aberta pelo menu "⋮" do território na `HomeScreen`, com: nome (editável), tempo de rotação (editável, vazio = padrão), um **resumo somente-leitura** (quantidade de quadras, quantas vencidas pela rotação, publicador designado, data da última visita no território) e a ação de **apagar o território**, com a mesma confirmação que hoje vive na `HomeScreen`.

## Contexto técnico

**Decisões já tomadas com o dono do projeto (não reabrir):**

- O log criado pelo admin nomeia um publicador de verdade — `BlockWorkLog.user_id` continua `NOT NULL`, e a UI faz o admin escolher quem trabalhou. Nada de log "sem autor".
- `rotation_days` é `INTEGER NULL` no território. Nulo = padrão global de 120 dias. Nenhum território existente muda de comportamento sem o admin mexer, e a migration não faz backfill.
- Três cores continuam existindo. A rotação só troca o número que define "vencida".
- A página de configurações leva nome, rotação, resumo e apagar. O **desenho** do território continua no `TerritoryEditorScreen`; a página de configurações não desenha nada.

**Decisões de detalhe tomadas nesta spec:**

- O endpoint do admin é `POST /admin/blocks/{block_id}/worked`, com corpo `{"user_id": "<uuid>", "worked_at": "<iso8601 com offset>"}`. O `log_id` é gerado **no servidor** (o admin não tem fila offline; a idempotência por id do cliente existe para o celular, não aqui).
- A regra de relógio do admin é mais frouxa que a do app **de propósito**: `worked_at` no futuro é rejeitado, mas não há limite inferior de 90 dias. Aquele limite existe para pegar celular com relógio errado; a data aqui é digitada deliberadamente pelo admin, que pode estar lançando um trabalho antigo do papel.
- O publicador escolhido precisa ser da congregação do token; um id de outra congregação (ou inexistente) responde **404**, como todo o resto do admin.
- No `PATCH /admin/territories/{id}`, "não mandei `rotation_days`" e "mandei `rotation_days: null`" são coisas diferentes: o primeiro não toca a coluna, o segundo volta o território ao padrão. O router distingue os dois por `payload.model_fields_set`, não por valor.

**Arquivos que a spec toca:**

- Servidor: `app/models/territory.py`, `migrations/versions/`, `app/schemas/territory.py`, `app/schemas/work_log.py`, `app/repositories/territory.py`, `app/services/territory.py`, `app/services/work_log.py`, `app/routers/admin_territories.py`, `app/routers/admin_blocks.py`, `app/routers/app_client.py`, `server/tests/**`.
- Admin: `src/shared/models.ts`, `src/shared/ipc-contract.ts`, `src/main/api-client.ts`, `src/main/ipc-handlers.ts`, `src/preload/index.ts`, `src/renderer/map/blockColor.ts`, `src/renderer/map/TerritoryMap.tsx`, `src/renderer/screens/HomeScreen.tsx`, `src/renderer/screens/TerritorySettingsScreen.tsx` (novo), `src/renderer/App.tsx`.
- App: `src/domain/models.ts`, `src/domain/blockColor.ts`, `src/data/api-client.ts`, `src/presentation/map/TerritoryMapView.tsx`, `src/presentation/screens/MapScreen.tsx`.

**Cuidados que valem para todas as tasks:** AGENTS.md manda regra de negócio só no servidor; o renderer do admin nunca fala HTTP, só `window.api`; `app/src/domain/` não importa nada de `react-native`; teste co-localizado nos dois clientes; e a meta de **100% de cobertura em `server/app/services/`** é portão de CI — uma task que mexe em service sem teste quebra o build.

> **Atenção:** a árvore de trabalho já tem alterações não commitadas em `app/src/presentation/screens/MapScreen.tsx`, `MapScreen.test.tsx` e os novos `app/src/domain/lastWorked.ts`/`.test.ts`. Não reverta nem "limpe" esses arquivos — a Task 11 constrói em cima do que estiver lá.

## Tasks

### Task 01 — `Territory.rotation_days`: modelo e migration

**Objetivo:** A coluna existe no banco e no modelo SQLAlchemy.
**Camadas:** Models
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0009 — Task 01: adicione a coluna `rotation_days` ao modelo `Territory` em `server/app/models/territory.py`: `Mapped[int | None]`, `Integer`, `nullable=True`, sem default no banco. Documente no docstring da coluna (em inglês, como o resto do arquivo) que nulo significa "usa o padrão do cliente" — o limiar de 120 dias que os dois clientes já aplicam hoje — e que a coluna é o número de dias de um ciclo de rotação do território, depois do qual as quadras voltam a aparecer como vencidas no mapa. Gere a migration Alembic correspondente em `server/migrations/versions/` seguindo a convenção de nome dos arquivos existentes (`AAAAMMDD_HHMM_<rev>_add_territory_rotation_days.py`), com `down_revision` apontando para a revisão mais recente (`d3ab774c1b2f`, "add territory assignments") — confira com `uv run alembic heads`. A migration só adiciona a coluna e a remove no downgrade: **não** faça backfill nem defina server_default, porque nulo já é o valor semanticamente correto para todo território existente. Rode `uv run alembic upgrade head` para provar que aplica. Toque apenas nas camadas Models e Migrations; não modifique schemas, repositories, services ou routers.

---

### Task 02 — DTOs: `rotation_days` no território e o corpo da marcação do admin

**Objetivo:** Os contratos de entrada e saída conhecem a rotação e a marcação feita pelo admin.
**Camadas:** Schemas (DTOs)
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0009 — Task 02: implemente por TDD, com os testes em `server/tests/schemas/test_territory_schemas.py` e `server/tests/schemas/test_work_log_schemas.py` (arquivos já existentes; acrescente casos, não reescreva os que estão lá).
>
> Em `server/app/schemas/territory.py`:
> - `TerritoryOut` ganha `rotation_days: int | None = None`.
> - `TerritoryPatchIn` ganha `rotation_days: int | None = None`, validado com `ge=1` e `le=3650` quando presente e não nulo (um ciclo de rotação vai de um dia a dez anos; zero, negativo e "mil anos" são bug de cliente, não configuração).
>
> Em `server/app/schemas/work_log.py`, crie `AdminWorkedIn`: `user_id: UUID` e `worked_at: AwareDatetime`. Sem `log_id` — quem cria o id é o servidor, porque o admin não tem fila offline; documente isso no docstring, contrastando com o `WorkedIn` do app logo acima, e explique que `AwareDatetime` é exigido pelo mesmo motivo de lá (o service compara o momento contra um relógio, e um timestamp ingênuo não é um ponto na linha do tempo).
>
> Critérios de aceite como comportamentos observáveis: `TerritoryPatchIn` aceita `rotation_days` ausente, `rotation_days=None` (e os dois casos são distinguíveis por `model_fields_set`), e `rotation_days=1`, `120`, `3650`; rejeita `0`, `-1` e `3651`. `TerritoryOut` serializa `rotation_days` nulo e preenchido. `AdminWorkedIn` aceita um `worked_at` com offset e rejeita um sem offset; rejeita `user_id` que não seja UUID; rejeita corpo sem `user_id` e sem `worked_at`.
>
> Toque apenas na camada Schemas (e nos testes dela); não modifique models, repositories, services ou routers.

---

### Task 03 — Repository e service do território escrevem a rotação

**Objetivo:** `TerritoryService.update` sabe alterar o tempo de rotação, e voltá-lo ao padrão.
**Camadas:** Repositories, Services
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0009 — Task 03: implemente por TDD, com os testes em `server/tests/services/test_territory_service.py` (arquivo existente; acrescente casos). Lembre que `server/app/services/` é portão de CI a 100% de cobertura.
>
> Em `server/app/repositories/territory.py`, estenda `update` (ou acrescente um `set_rotation_days`, o que ficar mais coerente com o estilo do arquivo) para gravar `rotation_days`. Em `server/app/services/territory.py`, `update` ganha um parâmetro `rotation_days` que precisa distinguir três intenções, e não duas: "não mexer", "definir N dias" e "voltar ao padrão" (nulo). Como `None` já é um dos valores de domínio, use um sentinela de módulo (ex.: `UNSET = object()` ou `Literal`-based) em vez de sobrecarregar `None`; documente a escolha num comentário, porque é exatamente o tipo de sutileza que um leitor futuro desfaz sem querer. Mantenha a assinatura compatível com quem já chama `update` hoje (nome e boundary), e o valor padrão do novo parâmetro tem que ser "não mexer".
>
> Critérios de aceite como comportamentos observáveis: chamar `update` sem passar `rotation_days` não altera o valor existente (nem quando é nulo, nem quando é 90); passar `60` grava 60; passar o sentinela de "voltar ao padrão" com nulo zera a coluna; a alteração de rotação convive com uma alteração simultânea de nome e/ou boundary na mesma chamada; e território de outra congregação continua respondendo `NotFoundError`, sem caso especial novo.
>
> Toque apenas nas camadas Repositories e Services (e nos testes de service); não modifique models, schemas ou routers.

---

### Task 04 — `WorkLogService`: marcação de quadra feita pelo admin

**Objetivo:** Existe a regra de negócio que grava um `BlockWorkLog` a pedido do admin, sem a barreira da designação.
**Camadas:** Services
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0009 — Task 04: implemente por TDD em `server/app/services/work_log.py`, com os testes em `server/tests/services/test_work_log_service.py` (arquivo existente; acrescente casos). `server/app/services/` é portão de CI a 100% de cobertura.
>
> Acrescente `mark_worked_by_admin(congregation_id: UUID, block_id: UUID, user_id: UUID, worked_at: datetime, now: datetime | None = None) -> BlockWorkLog`. Ela gera o `log_id` no servidor (`uuid4`), grava o log pelo repositório e recalcula `Block.last_worked_at` pelo `_refresh_last_worked_at` que já existe — a projeção continua sendo recomputada a partir dos logs, nunca atribuída. Para isso o service passa a receber também o `UserRepository` no construtor (ajuste as composições em `app/routers/admin_blocks.py` e `app/routers/app_client.py` só o suficiente para continuar compilando; a fiação dos endpoints é da Task 05).
>
> Três diferenças em relação a `mark_worked`, todas deliberadas e que precisam estar documentadas em docstring: (a) **não** há checagem de designação — o admin registra o trabalho de quem ele quiser, em qualquer quadra da congregação dele, e é ele que sabe o que aconteceu em campo; (b) **não** há limite inferior de 90 dias — aquele limite existe para pegar celular com relógio errado, e aqui a data é digitada de propósito, possivelmente lançando trabalho antigo vindo do papel; (c) não há idempotência por id de cliente, porque o admin não tem fila offline. O que **permanece**: `worked_at` no futuro é recusado (`InvalidWorkedAtError`), e tanto a quadra quanto o publicador têm que ser da congregação do chamador.
>
> Critérios de aceite como comportamentos observáveis: marcar cria um log com o `user_id` pedido e atualiza `last_worked_at` da quadra; duas marcações seguidas do mesmo publicador na mesma quadra criam **dois** logs (visitar de novo é um fato legítimo, como já vale para o app); marcar com data mais antiga que o último log **não** faz `last_worked_at` andar para trás; quadra de outra congregação e quadra inexistente levantam `NotFoundError`; publicador de outra congregação e publicador inexistente levantam `NotFoundError` (o mesmo erro, nunca um 403 disfarçado); publicador inativo **pode** ser marcado (desativar revoga o acesso ao app, não apaga a existência da pessoa no histórico); `worked_at` no futuro levanta `InvalidWorkedAtError`; `worked_at` de 200 dias atrás é **aceito**, ao contrário do que aconteceria por `mark_worked`; e marcar numa quadra de território **sem designação aberta** funciona normalmente.
>
> Toque apenas na camada Services (e nos testes dela), mais o ajuste mínimo de construção do service nos routers para não quebrar a compilação; não modifique models, schemas ou repositories.

---

### Task 05 — Rotas: rotação no PATCH do território e `POST /admin/blocks/{id}/worked`

**Objetivo:** As duas capacidades novas ficam alcançáveis por HTTP.
**Camadas:** Routers
**Modo:** TDD
**Depende de:** Task 02, Task 03, Task 04
**Instrução para o subagente:**
> Spec 0009 — Task 05: implemente por TDD, com os testes em `server/tests/routers/test_admin_territories_routes.py` e `server/tests/routers/test_admin_blocks_routes.py` (arquivos existentes; acrescente casos).
>
> Em `server/app/routers/admin_territories.py`: `patch_territory` passa a repassar `rotation_days` ao service, **distinguindo ausente de nulo por `payload.model_fields_set`** e traduzindo isso no sentinela que a Task 03 criou — mandar `{"name": "X"}` não pode zerar a rotação de um território que tinha 60 dias. `territory_out` passa a devolver `rotation_days`, tanto na listagem quanto no detalhe.
>
> Em `server/app/routers/admin_blocks.py`: acrescente `POST /admin/blocks/{block_id}/worked`, status 201, corpo `AdminWorkedIn`, resposta `WorkLogOut`, chamando `mark_worked_by_admin`. Documente no docstring por que aqui não existe o 200-de-reenvio que a rota do app tem (o id é do servidor; não há fila offline para reconhecer) e por que a designação não é consultada.
>
> Em `server/app/routers/app_client.py`: `_territory_out` também passa a devolver `rotation_days`, porque o app precisa do número para colorir o mapa offline.
>
> Critérios de aceite como comportamentos observáveis: `PATCH` com `rotation_days: 60` responde 200 com `rotation_days: 60`; `PATCH` só com `name` mantém a rotação anterior; `PATCH` com `rotation_days: null` volta ao nulo; `PATCH` com `rotation_days: 0` responde 422; `GET /admin/territories` e `GET /admin/territories/{id}` trazem o campo; `POST /admin/blocks/{id}/worked` responde 201 com o log e o publicador nomeado, e uma leitura seguinte da quadra mostra `last_worked_at` atualizado; quadra ou publicador de outra congregação respondem 404; `worked_at` no futuro responde o status que o handler de `InvalidWorkedAtError` já define hoje (confira o mapeamento em `app/main.py` em vez de assumir); e todas as rotas continuam exigindo o token de admin — um token de app não alcança nenhuma delas.
>
> Toque apenas na camada Routers (e nos testes dela); não modifique models, schemas, repositories ou services.

---

### Task 06 — Teste de integração: rotação e marcação pelo admin ponta a ponta

**Objetivo:** O fluxo completo é exercido por HTTP contra o PostGIS real.
**Camadas:** Testes de integração
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0009 — Task 06: escreva `server/tests/integration/test_admin_marking_integration.py`, seguindo o padrão dos arquivos vizinhos em `server/tests/integration/` (app FastAPI real sobre PostGIS real, tudo criado por HTTP, congregação como única linha escrita direto no banco).
>
> Cubra dois fluxos ponta a ponta. **Um:** admin cria território e quadra, cadastra dois publicadores, marca a quadra como trabalhada em nome do primeiro, e confirma que `GET /admin/blocks/{id}/work-logs` nomeia esse publicador e que o `last_worked_at` da quadra aparece atualizado tanto no `GET` do território do admin quanto no `GET /app/territories` lido com o token do segundo publicador — inclusive quando **nenhuma designação** existe no território, que é a diferença central em relação à regra do app. Confirme também, no mesmo teste, que o app do segundo publicador continua tomando 403 `territory_not_assigned` ao tentar marcar a mesma quadra: a rota nova é do admin e não afrouxa nada do lado do celular. **Dois:** admin define `rotation_days` no território via `PATCH`, e o valor volta em `GET /admin/territories` e em `GET /app/territories`; depois manda um `PATCH` só com o nome e confirma que a rotação sobreviveu; por fim manda `rotation_days: null` e confirma que voltou ao nulo. Verifique que o isolamento entre congregações se mantém: o admin de outra congregação recebe 404 ao tentar marcar essa quadra ou alterar essa rotação.
>
> Toque apenas em `server/tests/integration/`; não modifique código de produção — se algum comportamento não fechar, o defeito é de uma task anterior e deve ser reportado, não corrigido aqui.

---

### Task 07 — Admin: `rotationDays` no modelo compartilhado e na regra de cor

**Objetivo:** A regra pura de cor da quadra passa a respeitar a rotação do território.
**Camadas:** Shared (admin)
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0009 — Task 07: implemente por TDD nos arquivos `admin/src/shared/models.ts` e `admin/src/renderer/map/blockColor.ts`, com os testes em `admin/src/shared/models.test.ts` e `admin/src/renderer/map/blockColor.test.ts` (arquivos existentes; acrescente casos). Rode com `cd admin && npx vitest run`.
>
> `Territory` ganha `readonly rotationDays?: number` — ausente significa "usa o padrão", documentado no próprio campo. `blockColorCategory(block, now)` ganha um terceiro parâmetro opcional `rotationDays?: number`: o limiar de "vencida" passa a ser `(rotationDays ?? 120)` dias em milissegundos, e a constante exportada hoje como `OVERDUE_AFTER_MS` continua existindo como o padrão (renomeie para `DEFAULT_ROTATION_DAYS` mais um derivado em ms se ficar mais legível, atualizando quem importa). Mantenha a semântica de borda que já existe: exatamente no limiar ainda é `'recent'`, só estritamente acima vira `'overdue'`.
>
> Critérios de aceite como comportamentos observáveis: sem `rotationDays`, o comportamento é idêntico ao de hoje (120 dias); com `rotationDays: 30`, uma quadra trabalhada há 45 dias é `'overdue'` e uma de 10 dias é `'recent'`; com `rotationDays: 365`, uma quadra de 200 dias é `'recent'` — o mesmo caso que hoje seria `'overdue'`; exatamente no limiar da rotação configurada é `'recent'`; quadra nunca trabalhada é `'never'` seja qual for a rotação; `rotationDays` ausente e `undefined` se comportam igual.
>
> Toque apenas em `admin/src/shared/models.ts` e `admin/src/renderer/map/blockColor.ts` (mais os testes deles); não modifique main, preload nem telas.

---

### Task 08 — Admin: main e IPC ganham a rotação e a marcação de quadra

**Objetivo:** O processo main sabe ler/escrever a rotação e chamar a rota nova, e o renderer alcança as duas por `window.api`.
**Camadas:** Main, Preload, Shared/ipc-contract (admin)
**Modo:** TDD
**Depende de:** Task 05, Task 07
**Instrução para o subagente:**
> Spec 0009 — Task 08: implemente por TDD em `admin/src/main/api-client.ts`, `admin/src/shared/ipc-contract.ts`, `admin/src/main/ipc-handlers.ts` e `admin/src/preload/index.ts`, com os testes em `admin/src/main/api-client.test.ts` e `admin/src/main/ipc-handlers.test.ts` (arquivos existentes; acrescente casos). Rode com `cd admin && npx vitest run`.
>
> No `api-client`: `parseTerritory` passa a ler `rotation_days` para `rotationDays` (ausente ou nulo → `undefined`, mesmo tratamento que `parseBlock` dá a `last_worked_at`); `updateTerritory` aceita `rotationDays` no input e o serializa como `rotation_days`, **preservando a distinção entre "não mandei" e "mandei nulo"** — o corpo só carrega a chave quando o chamador realmente quis mexer nela, e mandar nulo é o jeito de voltar ao padrão; e surge `markBlockWorked(blockId, { userId, workedAt })`, que faz `POST /admin/blocks/{id}/worked` com `{user_id, worked_at: workedAt.toISOString()}` e devolve o `WorkLog` parseado.
>
> No contrato de IPC: `TerritoryUpdateInput` ganha `rotationDays?: number | null`, e o namespace `workLogs` ganha `markWorked(blockId: string, publisherId: string, workedAt: Date): Promise<WorkLog>` com um canal novo em `IPC_CHANNELS`. Registre o handler correspondente em `ipc-handlers.ts` (dentro de `session.run`, como os vizinhos, para herdar a reautenticação silenciosa no 401) e implemente o repasse em `preload/index.ts`.
>
> Critérios de aceite como comportamentos observáveis: um território vindo da API com `rotation_days: 60` vira `rotationDays: 60`, e com `rotation_days: null` vira `rotationDays: undefined`; `updateTerritory` sem `rotationDays` no input não manda a chave no corpo, com `rotationDays: null` manda `null`, e com `rotationDays: 60` manda `60`; `markBlockWorked` chama o método e o caminho certos com o corpo em snake_case e a data em ISO, e devolve o log parseado; o handler de IPC novo repassa os argumentos ao cliente e propaga o erro serializado como os outros; e um erro 401 do servidor nessa chamada dispara a reautenticação de `session.run` uma vez, exatamente como nas chamadas já existentes.
>
> Toque apenas em `admin/src/main/`, `admin/src/preload/` e `admin/src/shared/ipc-contract.ts` (mais os testes de main); não modifique nenhuma tela do renderer.

---

### Task 09 — Admin: `TerritorySettingsScreen` e a rota que a abre

**Objetivo:** Existe a página de configurações do território, alcançável pelo menu "⋮" da `HomeScreen`.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 08
**Instrução para o subagente:**
> Spec 0009 — Task 09: implemente por TDD `admin/src/renderer/screens/TerritorySettingsScreen.tsx` com seu teste co-localizado `TerritorySettingsScreen.test.tsx`, e ligue a tela ao roteamento em `admin/src/renderer/App.tsx` (com o caso correspondente em `App.test.tsx`) e ao menu "⋮" da lista de territórios em `admin/src/renderer/screens/HomeScreen.tsx`. Rode com `cd admin && npx vitest run`. Siga o padrão visual e estrutural das telas empurradas que já existem (`TerritoryEditorScreen`, `BlockEditorScreen`): cabeçalho com "← Voltar" via o `PushedScreen` que `App.tsx` já usa, e nada de HTTP — só `window.api`.
>
> A tela recebe o território (com as quadras já carregadas) e mostra:
> - **Nome**, editável, salvo por `window.api.territories.update`.
> - **Tempo de rotação**, em dias, campo numérico. Vazio é um valor legítimo e significa "usar o padrão de 120 dias" — deixe isso escrito na interface, não só no código, porque um campo vazio parece esquecimento. Salvar com o campo vazio manda `rotationDays: null`; salvar com um número manda o número.
> - **Resumo somente-leitura**: quantidade de quadras, quantas estão vencidas segundo a rotação em vigor (use `blockColorCategory` da Task 07 — a mesma regra do mapa, nunca uma segunda cópia dela), o publicador designado (ou "Nenhum") e a data da última visita registrada no território (a maior `lastWorkedAt` entre as quadras, ou "Nunca trabalhada").
> - **Apagar território**, com a mesma mensagem de confirmação que hoje vive em `deleteTerritoryConfirmMessage` na `HomeScreen` — reaproveite a função, não duplique o texto — e voltando para a Home ao concluir.
>
> Critérios de aceite como comportamentos observáveis: a tela mostra o nome e a rotação atuais do território, com o campo de rotação vazio quando ela é o padrão; editar o nome e salvar chama `territories.update` com o nome novo; digitar 60 e salvar manda `rotationDays: 60`; limpar o campo e salvar manda `rotationDays: null`; um valor inválido (zero, negativo, texto) é barrado com mensagem antes de chamar a API; um erro vindo da API aparece na tela em vez de sumir; o resumo conta as quadras e as vencidas corretamente para uma rotação de 30 dias e para o padrão; apagar pede confirmação, e cancelar não chama `territories.delete`; e a `HomeScreen` tem, no menu "⋮" de cada território, uma entrada que navega para esta tela.
>
> Toque apenas em `admin/src/renderer/` (a tela nova, `App.tsx`, `HomeScreen.tsx` e os testes deles, mais `index.css` se precisar de estilo); não modifique main, preload nem shared.

---

### Task 10 — Admin: marcar quadra como trabalhada, e o mapa colorindo pela rotação

**Objetivo:** O admin registra o trabalho de uma quadra pela interface, e o mapa passa a usar a rotação do território.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 08, Task 09
**Instrução para o subagente:**
> Spec 0009 — Task 10: implemente por TDD em `admin/src/renderer/screens/HomeScreen.tsx` (teste co-localizado já existente) e `admin/src/renderer/map/TerritoryMap.tsx`. Rode com `cd admin && npx vitest run`.
>
> **Marcar como trabalhada:** no modal de ações da quadra que já existe na `HomeScreen` (`activeBlock`), acrescente "Marcar como trabalhada". Ela abre um formulário com dois campos: um seletor de **publicador** (carregado por `window.api.publishers.list()`; quando o território tem designação aberta, o publicador designado já vem pré-selecionado, porque é o palpite certo na esmagadora maioria das vezes — mas continua trocável) e uma **data**, um `<input type="date">` com o dia de hoje como padrão. Confirmar chama `window.api.workLogs.markWorked(blockId, publisherId, workedAt)` e, no sucesso, recarrega a lista de territórios para que a cor da quadra no mapa acompanhe. Trate erro pela mesma via de `actionError` que a tela já usa.
>
> **Cor pela rotação:** `TerritoryMap` passa a chamar `blockColorCategory` com o `rotationDays` do território ao qual a quadra pertence, em vez do limiar fixo. Se a legenda do mapa citar "120 dias" em texto, ajuste para não mentir num território com rotação própria.
>
> Critérios de aceite como comportamentos observáveis: o modal de ações da quadra oferece "Marcar como trabalhada"; abrir o formulário lista os publicadores e pré-seleciona o designado quando existe; confirmar chama `workLogs.markWorked` com a quadra, o publicador escolhido e a data escolhida; cancelar não chama nada; um erro da API aparece na tela e a lista não é recarregada; depois de marcar com sucesso, `territories.listWithBlocks` é chamado de novo; e uma quadra trabalhada há 45 dias num território com `rotationDays: 30` é desenhada na cor de vencida, enquanto a mesma quadra num território sem rotação configurada é desenhada como recente.
>
> Toque apenas em `admin/src/renderer/` (mais `index.css` se precisar de estilo); não modifique main, preload nem shared.

---

### Task 11 — App: rotação no domínio e no cliente HTTP

**Objetivo:** O app conhece a rotação do território e colore as quadras por ela.
**Camadas:** Domain, Data (app)
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0009 — Task 11: implemente por TDD em `app/src/domain/models.ts`, `app/src/domain/blockColor.ts` e `app/src/data/api-client.ts`, com os testes co-localizados já existentes (`blockColor.test.ts`, `api-client.test.ts`; crie `models.test.ts` se não houver). Rode com `cd app && npm test`. Lembre que `app/src/domain/` não pode importar nada de `react-native`.
>
> `Territory` ganha `readonly rotationDays?: number`. `blockColorCategory(block, now)` ganha o terceiro parâmetro opcional `rotationDays?: number`, com exatamente a mesma semântica da Task 07 no admin — limiar `(rotationDays ?? 120)` dias, borda inclusiva no `'recent'` — e o comentário no topo do arquivo, que hoje diz que a regra é uma cópia idêntica à do admin, deve continuar verdadeiro depois da mudança. `parseTerritory` em `data/api-client.ts` lê `rotation_days` para `rotationDays`, tratando ausente e nulo como `undefined`, como já faz com `last_worked_at`.
>
> A árvore de trabalho já tem alterações não commitadas nestes arredores (`app/src/domain/lastWorked.ts` e `app/src/presentation/screens/MapScreen.tsx`); construa em cima do que estiver lá, sem reverter nada.
>
> Critérios de aceite como comportamentos observáveis: sem `rotationDays`, a cor é idêntica à de hoje (120 dias); com `rotationDays: 30`, 45 dias é `'overdue'` e 10 dias é `'recent'`; com `rotationDays: 365`, 200 dias é `'recent'`; exatamente no limiar é `'recent'`; nunca trabalhada é `'never'` com qualquer rotação; um território vindo da API com `rotation_days: 60` vira `rotationDays: 60`, e com `rotation_days` ausente ou nulo vira `undefined`. O cache local (`territory-cache.ts`) precisa continuar dando a volta completa (gravar e reler) sem perder o campo novo — acrescente o caso ao teste dele se o formato serializado for enumerado campo a campo.
>
> Toque apenas em `app/src/domain/` e `app/src/data/` (mais os testes deles); não modifique `app/src/presentation/`.

---

### Task 12 — App: o mapa passa a rotação do território para a cor da quadra

**Objetivo:** A tela do mapa do publicador reflete a rotação configurada pelo admin.
**Camadas:** Presentation (app)
**Modo:** direto
**Depende de:** Task 11
**Instrução para o subagente:**
> Spec 0009 — Task 12: em `app/src/presentation/map/TerritoryMapView.tsx` e `app/src/presentation/screens/MapScreen.tsx`, passe o `rotationDays` do território dono da quadra na chamada a `blockColorCategory`, em vez do limiar fixo de hoje. Se houver texto na interface citando "120 dias", ajuste para não mentir num território com rotação própria.
>
> Esta task é `direto` e não TDD por uma razão já documentada no AGENTS.md: `TerritoryMapView.tsx` e `MapScreen.tsx` são os dois arquivos do app que desenham o MapLibre nativo e são risco assumido sem teste automatizado. Não crie teste para eles; a regra que muda o comportamento já está coberta na Task 11. Se algum teste existente de `MapScreen` quebrar (a árvore tem alterações não commitadas nele), conserte-o em vez de removê-lo.
>
> Rode `cd app && npm test` e `npx tsc --noEmit` para provar que nada quebrou. Toque apenas em `app/src/presentation/`; não modifique `domain/` nem `data/`.

---

### Task 13 — Documentar a rotação e a marcação pelo admin no `AGENTS.md`

**Objetivo:** O `AGENTS.md` descreve o sistema que passou a existir.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 06, Task 10, Task 12
**Instrução para o subagente:**
> Spec 0009 — Task 13: atualize o `AGENTS.md` da raiz para refletir a spec 0009, escrevendo no mesmo tom do documento (português, explicando o porquê e não só o quê, sem inflar). Os pontos que precisam entrar:
>
> - **Modelo de dados**: `Territory.rotation_days` (`INTEGER NULL`), com a explicação de que nulo é "usa o padrão de 120 dias" e de que a migration não faz backfill de propósito.
> - **Regras de negócio**: uma subseção curta sobre a marcação de quadra feita pelo admin — `POST /admin/blocks/{block_id}/worked`, o admin escolhendo o publicador, o `log_id` gerado no servidor, e as duas frouxidões deliberadas em relação à rota do app (sem checagem de designação, sem o piso de 90 dias) com o motivo de cada uma. Deixe claro que a rota do app **não** mudou: o publicador continua preso ao território designado a ele.
> - **Regras de negócio / mapa**: a rotação substitui o limiar fixo de 120 dias no cálculo da cor, nos dois clientes, mantendo as três cores.
> - **Estrutura do projeto**: a `TerritorySettingsScreen` do admin na descrição das telas (que passam de oito para nove), com o que ela contém — nome, rotação, resumo e apagar — e a observação de que o desenho continua no editor de território.
> - **Pontos em aberto**: o item "quadras não trabalhadas há mais de N dias" passa a ter o N configurável por território; ajuste o texto em vez de deixá-lo desatualizado. Se algum outro trecho ficou falso (a menção ao limiar fixo de 120 dias, a contagem de telas do admin), corrija junto.
>
> Toque apenas no `AGENTS.md`; não modifique código.

---

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0009
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo` da task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

Execute as tasks na ordem indicada, respeitando as dependências.

### Ordem e paralelismo

- **Onda 1 (paralelas):** Task 01, Task 02, Task 04, Task 07
- **Onda 2:** Task 03 (depende de 01), Task 05 (depende de 02, 03, 04)
- **Onda 3 (paralelas):** Task 06, Task 08, Task 11
- **Onda 4:** Task 09 (depende de 08), Task 12 (depende de 11)
- **Onda 5:** Task 10 (depende de 09), depois Task 13

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task (`/centaur-driven-tdd` ou `/centaur-driven-implement`) ao iniciar a primeira task, ou pelo `/centaur-driven-run` ao montar o plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou `/centaur-driven-implement`)._

- [x] Task 01 — `Territory.rotation_days`: modelo e migration → implements/0137
- [x] Task 02 — DTOs: `rotation_days` no território e o corpo da marcação do admin → implements/0139
- [x] Task 03 — Repository e service do território escrevem a rotação → implements/0141
- [x] Task 04 — `WorkLogService`: marcação de quadra feita pelo admin → implements/0140
- [x] Task 05 — Rotas: rotação no PATCH do território e `POST /admin/blocks/{id}/worked` → implements/0142
- [x] Task 06 — Teste de integração: rotação e marcação pelo admin ponta a ponta → implements/0143
- [x] Task 07 — Admin: `rotationDays` no modelo compartilhado e na regra de cor → implements/0138
- [x] Task 08 — Admin: main e IPC ganham a rotação e a marcação de quadra → implements/0144
- [x] Task 09 — Admin: `TerritorySettingsScreen` e a rota que a abre → implements/0147
- [x] Task 10 — Admin: marcar quadra como trabalhada, e o mapa colorindo pela rotação → implements/0148
- [x] Task 11 — App: rotação no domínio e no cliente HTTP → implements/0145
- [x] Task 12 — App: o mapa passa a rotação do território para a cor da quadra → implements/0146
- [x] Task 13 — Documentar a rotação e a marcação pelo admin no `AGENTS.md` → implements/0149
