# [0010] Tabela de quadras na configuração do território, com histórico e status forçado

**Data:** 2026-08-20
**Status:** Concluída
**Solicitação original:** "Na config de cada território, coloque uma tabela mostrando cada quadra, para cada quadra seria possível abrir para ver o histórico de trabalho de cada uma dela, sendo possível alterar o status dela previamente (Mudando para laranja ou vermelho), adicionar ou apagar registros de trabalho"

## Objetivo

Ao término das tasks, a `TerritorySettingsScreen` (spec 0009) tem uma **tabela das quadras do território** — número, status e última visita, ordenada por número — e cada linha **expande dentro da própria página** um painel com o histórico de trabalho daquela quadra, onde o admin pode:

- **adicionar** um registro de trabalho (escolhendo publicador e data, como já faz pelo mapa da Home);
- **apagar** um registro;
- **forçar o status** da quadra para "vencida" (laranja) ou "nunca trabalhada" (vermelha), e **voltar ao automático**.

O status forçado é um campo novo da quadra (`Block.status_override`), respeitado pelos dois clientes acima do cálculo por data, e **limpo sozinho quando um registro de trabalho novo chega** — sem isso a quadra ficaria presa na cor errada depois de trabalhada de verdade.

## Contexto técnico

**Decisões já tomadas com o dono do projeto (não reabrir):**

- O status forçado é **coluna no banco**, não consequência de inventar registros. O caminho alternativo (forçar laranja criando um registro antigo) foi descartado porque exigiria nomear um publicador que nunca esteve ali — e um registro falso é pior que uma coluna a mais.
- O histórico abre **dentro da página de configurações**, expandindo a linha. O admin percorre várias quadras seguidas sem ir e voltar.
- A tabela tem **três colunas**: número, status e última visita. Editar o desenho e apagar a quadra continuam onde estão hoje, no menu da quadra no mapa da Home.

**Decisões de detalhe tomadas nesta spec:**

- `Block.status_override` é `VARCHAR(16) NULL` com `CHECK` no banco restringindo a `'overdue'` e `'never'`. Nulo — o valor de toda quadra existente — significa "cor derivada dos registros", exatamente o comportamento de hoje, e por isso a migration não faz backfill.
- **Forçar `'overdue'` numa quadra nunca trabalhada é legítimo**, e é justamente o caso de uso: "esta área está para ser trabalhada". Forçar `'never'` numa quadra com registros também é legítimo — o admin está dizendo "considere não trabalhada", sem apagar o histórico de quem esteve lá.
- Não há rota nova: o status entra no `PATCH /admin/blocks/{block_id}` que já existe, com a **mesma distinção entre ausente e nulo** que a spec 0009 estabeleceu para `rotation_days` — ausente não toca a coluna, nulo volta ao automático. O sentinela vive na camada de service, e o router traduz `payload.model_fields_set`.
- **Qualquer registro de trabalho novo limpa o override**, tanto o da rota do app quanto o da rota do admin. Apagar um registro **não** mexe no override: apagar é o admin corrigindo o histórico, e adivinhar a intenção dele sobre a cor seria pior que deixar como está.
- O formulário de "publicador + data" já existe embutido na `HomeScreen` (spec 0009, Task 10). Ele será **extraído para um componente reutilizável** em vez de copiado para o painel novo — duas cópias divergiriam na primeira mudança.

**Arquivos que a spec toca:**

- Servidor: `app/models/block.py`, `migrations/versions/`, `app/schemas/block.py`, `app/repositories/block.py`, `app/services/block.py`, `app/services/work_log.py`, `app/routers/admin_blocks.py`, `app/routers/admin_territories.py`, `app/routers/app_client.py`, `server/tests/**`.
- Admin: `src/shared/models.ts`, `src/shared/ipc-contract.ts`, `src/main/api-client.ts`, `src/main/ipc-handlers.ts`, `src/preload/index.ts`, `src/renderer/map/blockColor.ts`, `src/renderer/screens/HomeScreen.tsx`, `src/renderer/screens/MarkWorkedForm.tsx` (novo), `src/renderer/screens/BlockWorkPanel.tsx` (novo), `src/renderer/screens/TerritorySettingsScreen.tsx`, `src/renderer/index.css`.
- App: `src/domain/models.ts`, `src/domain/blockColor.ts`, `src/data/api-client.ts`.

**Cuidados que valem para todas as tasks:** regra de negócio só no servidor; o renderer do admin nunca fala HTTP, só `window.api`; `app/src/domain/` não importa nada de `react-native`; teste co-localizado nos dois clientes; e **100% de cobertura em `server/app/services/`** é portão de CI.

## Tasks

### Task 01 — `Block.status_override`: modelo e migration

**Objetivo:** A coluna do status forçado existe no banco e no modelo.
**Camadas:** Models
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0010 — Task 01: adicione a coluna `status_override` ao modelo `Block` em `server/app/models/block.py`: `Mapped[str | None]`, `String(16)`, `nullable=True`, sem default, mais um `CheckConstraint` em `__table_args__` restringindo o valor a `'overdue'` ou `'never'` (nomeie a constraint `ck_blocks_status_override`, no estilo dos nomes já usados no arquivo). Documente em inglês, no docstring da classe ou ao lado da coluna, que ela é o status que o **admin forçou** para a quadra, respeitado pelos clientes acima do cálculo por data, e que nulo — o estado de toda quadra existente — significa "derive a cor dos registros de trabalho, como sempre". Registre também, no mesmo comentário, que a coluna convive com `last_worked_at` sem substituí-la: o histórico continua sendo a verdade sobre **quem esteve lá e quando**, e o override só diz **como pintar**.
>
> Gere a migration Alembic em `server/migrations/versions/`, seguindo a convenção de nome dos arquivos existentes (`AAAAMMDD_HHMM_<rev>_add_block_status_override.py`), com `down_revision` apontando para a head atual — confirme com `uv run alembic heads` em vez de assumir. A migration adiciona a coluna e a constraint no upgrade e desfaz as duas no downgrade; **não** faça backfill nem defina `server_default`. Rode `uv run alembic upgrade head` e `uv run alembic check` para provar que aplica e que modelo e banco ficaram em sincronia.
>
> Toque apenas nas camadas Models e Migrations; não modifique schemas, repositories, services ou routers.

---

### Task 02 — DTOs: o status forçado na entrada e na saída da quadra

**Objetivo:** O contrato HTTP da quadra conhece o status forçado.
**Camadas:** Schemas (DTOs)
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0010 — Task 02: implemente por TDD em `server/app/schemas/block.py`, com os testes em `server/tests/schemas/test_block_schemas.py` (arquivo existente; acrescente casos, não reescreva os que estão lá).
>
> Declare o tipo `BlockStatusOverride = Literal["overdue", "never"]` no próprio módulo, com um comentário dizendo o que cada valor significa para quem lê o mapa (laranja "vencida", vermelho "nunca trabalhada"). `BlockPatchIn` ganha `status_override: BlockStatusOverride | None = None` e `BlockOut` ganha `status_override: BlockStatusOverride | None = None`. No docstring de `BlockPatchIn`, registre que aqui "campo ausente" e "campo nulo" **não** são a mesma coisa — ausente não toca a coluna, nulo devolve a quadra ao cálculo automático — e que traduzir isso é do router, exatamente como já acontece com `rotation_days` em `TerritoryPatchIn` (spec 0009).
>
> Critérios de aceite como comportamentos observáveis: `BlockPatchIn` aceita `status_override` ausente, nulo, `"overdue"` e `"never"`, e os dois primeiros casos são distinguíveis por `model_fields_set`; rejeita `"recent"`, `"OVERDUE"`, `""` e um número; continua aceitando `number` e `polygon` como hoje, inclusive junto com o status na mesma carga; `BlockOut` serializa o campo nulo e preenchido.
>
> Toque apenas na camada Schemas (e nos testes dela); não modifique models, repositories, services ou routers.

---

### Task 03 — Services: gravar o status forçado e limpá-lo quando chega trabalho novo

**Objetivo:** A regra de negócio do status forçado existe, incluindo a que o desfaz sozinho.
**Camadas:** Repositories, Services
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0010 — Task 03: implemente por TDD em `server/app/repositories/block.py`, `server/app/services/block.py` e `server/app/services/work_log.py`, com os testes em `server/tests/services/test_block_service.py` e `server/tests/services/test_work_log_service.py` (arquivos existentes; acrescente casos). `server/app/services/` é portão de CI a 100% de cobertura, de linha **e** de branch.
>
> No repositório, acrescente `set_status_override(block, status)` no estilo do `set_last_worked_at` vizinho. Em `BlockService.update`, acrescente o parâmetro `status_override` capaz de distinguir três intenções — "não mexer", "forçar este status" e "voltar ao automático" (nulo) —, com um sentinela de módulo, exatamente como `TerritoryService` faz com `UNSET` (spec 0009, Task 03). **Defina o sentinela análogo no próprio módulo do service de quadra**, com um comentário apontando para o gêmeo em `territory.py`: promovê-lo a um módulo comum mexeria nos imports do router de territórios, que está fora do escopo desta task. O valor padrão do novo parâmetro tem que ser "não mexer", e a assinatura precisa continuar compatível com quem já chama `update` com `number`/`points`.
>
> Em `WorkLogService`, tanto `mark_worked` (a rota do app) quanto `mark_worked_by_admin` passam a **limpar o override** ao gravar um registro novo. Faça isso no mesmo ponto em que `last_worked_at` é recomputado, e documente o porquê: um trabalho recém-registrado é a evidência mais forte que existe sobre a quadra, e mantê-la vermelha depois disso seria a interface mentindo. Cuidado com dois casos: um **reenvio** de `log_id` já conhecido volta antes de gravar qualquer coisa e portanto **não** limpa nada, e **apagar** um registro não mexe no override.
>
> Critérios de aceite como comportamentos observáveis: `update` sem `status_override` não altera o valor existente (nem quando é nulo, nem quando é `"overdue"`); passar `"never"` grava `"never"`; passar o sentinela de "voltar ao automático" com nulo zera a coluna; o status convive com renumerar e redesenhar na mesma chamada; quadra de outra congregação continua respondendo `NotFoundError`; marcar trabalho pelo app numa quadra com override `"never"` deixa a coluna nula; o mesmo vale para a marcação feita pelo admin; um reenvio de `log_id` já gravado deixa o override como estava; e apagar um registro de trabalho **não** limpa o override.
>
> Toque apenas nas camadas Repositories e Services (e nos testes de service); não modifique models, schemas ou routers.

---

### Task 04 — Rotas: o status forçado no PATCH da quadra e nas leituras

**Objetivo:** O status forçado é escrito e lido por HTTP, nos dois clientes.
**Camadas:** Routers
**Modo:** TDD
**Depende de:** Task 02, Task 03
**Instrução para o subagente:**
> Spec 0010 — Task 04: implemente por TDD, com os testes em `server/tests/routers/test_admin_blocks_routes.py`, `server/tests/routers/test_admin_territories_routes.py` e `server/tests/routers/test_app_client_routes.py` (arquivos existentes; acrescente casos).
>
> Em `server/app/routers/admin_blocks.py`, `patch_block` passa a repassar `status_override` ao service, **distinguindo ausente de nulo por `payload.model_fields_set`** e traduzindo no sentinela da Task 03 — um PATCH que só renumera não pode apagar o status que o admin forçou. Em `server/app/routers/admin_territories.py`, a função `block_out` passa a devolver `status_override`; como ela é o ponto único de montagem do DTO da quadra no admin (o router de blocos a importa), isso cobre a criação, a edição e a leitura do território de uma vez. Em `server/app/routers/app_client.py`, `_block_out` também passa a devolver o campo, porque o app precisa dele para colorir o mapa offline.
>
> Critérios de aceite como comportamentos observáveis: `PATCH /admin/blocks/{id}` com `status_override: "overdue"` responde 200 com o campo preenchido; um `PATCH` só com `number` preserva o status forçado anterior; `PATCH` com `status_override: null` volta ao automático; `PATCH` com `status_override: "recent"` responde 422; `GET /admin/territories/{id}` traz o campo em cada quadra; `GET /app/territories` também; marcar a quadra como trabalhada (pela rota do app ou pela do admin) e reler o território mostra o campo já nulo; quadra de outra congregação continua respondendo 404; e as rotas de admin continuam inalcançáveis com um token de app.
>
> Toque apenas na camada Routers (e nos testes dela); não modifique models, schemas, repositories ou services.

---

### Task 05 — Teste de integração: forçar o status e vê-lo se desfazer sozinho

**Objetivo:** O ciclo completo do status forçado é exercido por HTTP contra o PostGIS real.
**Camadas:** Testes de integração
**Modo:** TDD
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0010 — Task 05: escreva `server/tests/integration/test_block_status_override_integration.py`, seguindo o padrão dos arquivos vizinhos em `server/tests/integration/` (app FastAPI real sobre PostGIS real, tudo criado por HTTP, congregação como única linha escrita direto no banco).
>
> Cubra o ciclo inteiro num fluxo só: o admin cria território e quadra, força `status_override: "overdue"` pelo `PATCH`, e o campo volta tanto no `GET` do território do admin quanto no `GET /app/territories` lido com o token de um publicador; um `PATCH` que só renumera a quadra preserva o status forçado; o admin então registra trabalho na quadra por `POST /admin/blocks/{id}/worked` e o status forçado aparece **nulo** na releitura, com `last_worked_at` preenchido; forçar `"never"` de novo e **apagar** o registro de trabalho deixa o override **intacto** (é a assimetria deliberada da Task 03, e é o caso que um refactor futuro mais provavelmente quebra); por fim, `status_override: null` devolve a quadra ao automático. Verifique também que o admin de outra congregação recebe 404 ao tentar forçar o status dessa quadra.
>
> Toque apenas em `server/tests/integration/`; não modifique código de produção — se algum comportamento não fechar, o defeito é de uma task anterior e deve ser reportado, não corrigido aqui.

---

### Task 06 — Admin: o status forçado no modelo compartilhado e na regra de cor

**Objetivo:** A regra pura de cor respeita o status forçado, acima do cálculo por data.
**Camadas:** Shared, Renderer/map (admin)
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0010 — Task 06: implemente por TDD em `admin/src/shared/models.ts` e `admin/src/renderer/map/blockColor.ts`, com os testes em `admin/src/shared/models.test.ts` e `admin/src/renderer/map/blockColor.test.ts` (arquivos existentes; acrescente casos). Rode com `cd admin && npx vitest run`.
>
> `Block` ganha `readonly statusOverride?: 'overdue' | 'never'` — declare o tipo do valor como um alias exportado (ex.: `BlockStatusOverride`), porque a tela da Task 09 vai precisar dele. Documente no campo que é o status que o admin forçou e que ausente significa "derive dos registros". Em `blockColorCategory`, o override passa a ser consultado **antes** do cálculo por data: `'never'` devolve `'never'`, `'overdue'` devolve `'overdue'`, ausente cai na regra que já existe. Não invente um terceiro valor de override para "recente": forçar uma quadra a parecer recém-trabalhada é justamente o que ninguém pediu, e a ausência é o caminho de volta.
>
> Critérios de aceite como comportamentos observáveis: sem override, o comportamento é idêntico ao de hoje, incluindo o efeito de `rotationDays`; uma quadra trabalhada ontem com override `'overdue'` é `'overdue'`; a mesma com override `'never'` é `'never'`; uma quadra nunca trabalhada com override `'overdue'` é `'overdue'` (o caso "está para ser trabalhada", que é legítimo); o override vence qualquer `rotationDays`; e `statusOverride` ausente e `undefined` se comportam igual.
>
> Toque apenas em `admin/src/shared/models.ts` e `admin/src/renderer/map/blockColor.ts` (mais os testes deles); não modifique main, preload nem telas.

---

### Task 07 — Admin: main e IPC levam o status forçado

**Objetivo:** O processo main lê e escreve o status forçado, e o renderer o alcança por `window.api`.
**Camadas:** Main, Preload, Shared/ipc-contract (admin)
**Modo:** TDD
**Depende de:** Task 04, Task 06
**Instrução para o subagente:**
> Spec 0010 — Task 07: implemente por TDD em `admin/src/main/api-client.ts`, `admin/src/shared/ipc-contract.ts`, `admin/src/main/ipc-handlers.ts` e `admin/src/preload/index.ts`, com os testes em `admin/src/main/api-client.test.ts` e `admin/src/main/ipc-handlers.test.ts` (arquivos existentes; acrescente casos). Rode com `cd admin && npx vitest run`.
>
> No `api-client`: `parseBlock` lê `status_override` para `statusOverride` (ausente ou nulo → `undefined`); `updateBlock` aceita `statusOverride` no input e o serializa como `status_override`, **preservando a distinção entre "não mandei" e "mandei nulo"** — o corpo só carrega a chave quando o chamador quis mexer nela, e nulo é o jeito de voltar ao automático. Espelhe a solução que `updateTerritory` já usa para `rotationDays` (spec 0009, Task 08), inclusive o detalhe de não deixar um `undefined` explícito virar chave ausente por obra do `JSON.stringify`.
>
> No contrato de IPC: `BlockUpdateInput` ganha `statusOverride?: BlockStatusOverride | null`. Nenhum canal novo é necessário — `blocks:update` já existe.
>
> Critérios de aceite como comportamentos observáveis: uma quadra vinda da API com `status_override: "overdue"` vira `statusOverride: 'overdue'`, e com `status_override: null` vira `undefined`; `updateBlock` sem `statusOverride` no input não manda a chave no corpo, com `null` manda `null`, e com `'never'` manda `"never"`; a chamada continua funcionando quando só `number` ou só `polygon` é enviado; e um 401 nessa chamada continua disparando a reautenticação de `session.run` uma vez, como nas demais.
>
> Toque apenas em `admin/src/main/`, `admin/src/preload/` e `admin/src/shared/ipc-contract.ts` (mais os testes de main); não modifique nenhuma tela do renderer.

---

### Task 08 — Admin: extrair o formulário de "publicador + data" para um componente

**Objetivo:** O formulário de marcação vira componente reutilizável, sem mudar o comportamento da Home.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0010 — Task 08: extraia o formulário de marcação de quadra que hoje vive embutido em `admin/src/renderer/screens/HomeScreen.tsx` (spec 0009, Task 10 — o `<select>` de publicador com o designado pré-selecionado, mais o `<input type="date">` com hoje) para um componente próprio `admin/src/renderer/screens/MarkWorkedForm.tsx`, com teste co-localizado `MarkWorkedForm.test.tsx`. Implemente por TDD: escreva primeiro os testes do componente novo, depois mova o código, depois ajuste a `HomeScreen` para usá-lo. Rode com `cd admin && npx vitest run`.
>
> O componente recebe por prop o publicador a pré-selecionar (opcional) e devolve, ao confirmar, o par publicador + data escolhidos; **quem chama `window.api.workLogs.markWorked` continua sendo a tela**, não o formulário — assim ele serve tanto à Home quanto ao painel da Task 09, que vive numa página diferente e trata erro de outro jeito. Carregar a lista de publicadores por `window.api.publishers.list()` pode ficar dentro do componente, já que os dois usos precisam exatamente disso.
>
> Esta é uma refatoração: **o comportamento observável da `HomeScreen` não pode mudar**, e os testes dela que já cobrem o fluxo de marcação devem continuar passando **sem serem reescritos**. Se algum precisar mudar, isso é sinal de que a extração alterou a interface — pare e reveja em vez de ajustar o teste.
>
> Critérios de aceite como comportamentos observáveis, para o componente novo: lista os publicadores carregados; pré-seleciona o que veio por prop, e não pré-seleciona nada quando a prop está ausente; a data começa em hoje; confirmar entrega o publicador e a data escolhidos a quem chamou; cancelar não entrega nada; o botão de confirmar fica desabilitado enquanto não há publicador selecionado; e uma falha ao listar publicadores é comunicada em vez de deixar o formulário vazio e mudo.
>
> Toque apenas em `admin/src/renderer/` (o componente novo, `HomeScreen.tsx` e os testes deles, mais `index.css` se precisar de estilo); não modifique main, preload nem shared.

---

### Task 09 — Admin: o painel de trabalho da quadra

**Objetivo:** Existe o painel que mostra o histórico de uma quadra e permite adicionar, apagar e forçar o status.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 06, Task 07, Task 08
**Instrução para o subagente:**
> Spec 0010 — Task 09: implemente por TDD `admin/src/renderer/screens/BlockWorkPanel.tsx`, com teste co-localizado `BlockWorkPanel.test.tsx`. Rode com `cd admin && npx vitest run`. Ele é o painel que a Task 10 vai expandir dentro da linha da tabela de quadras, então é um componente, não uma tela roteada: recebe o território e a quadra por prop, fala só com `window.api`, e avisa quem o chamou por um callback (`onChanged`) sempre que algo que muda a cor da quadra acontece — não é papel dele saber que a página precisa recarregar.
>
> O painel mostra e faz:
> - **Histórico**: os registros de `window.api.workLogs.listFor(block.id)`, mais recente primeiro, cada um com publicador e data; "Esta quadra nunca foi trabalhada." quando não há nenhum. Reaproveite a formatação e o aviso de sincronização tardia que a `BlockHistorySheet` já usa (`workLogWasSyncedLate`) em vez de reinventá-los.
> - **Adicionar registro**: o `MarkWorkedForm` da Task 08, pré-selecionando o publicador designado ao território quando existe; ao confirmar, chama `window.api.workLogs.markWorked` e recarrega a lista.
> - **Apagar registro**: com confirmação nomeando o publicador e a data, como a `BlockHistorySheet` já faz.
> - **Status**: um controle com três opções — "Automático", "Vencida (laranja)" e "Nunca trabalhada (vermelha)" — que chama `window.api.blocks.update(block.id, { statusOverride })` com `null` no caso do automático. Deixe visível na interface **o que o forçado faz e quando ele se desfaz**: que a cor forçada vale no mapa do admin e no celular do publicador, e que o primeiro registro de trabalho novo devolve a quadra ao automático. Isso não é enfeite — é a única forma de o admin não achar que o sistema desfez a escolha dele sozinho.
>
> Critérios de aceite como comportamentos observáveis: o painel lista os registros da quadra e mostra a mensagem própria quando não há nenhum; adicionar chama `workLogs.markWorked` com a quadra, o publicador e a data escolhidos, recarrega a lista e dispara `onChanged`; apagar pede confirmação, e cancelar não chama `workLogs.delete`; apagar confirmado chama a API, recarrega e dispara `onChanged`; o controle de status mostra a opção correspondente ao `statusOverride` atual da quadra (inclusive "Automático" quando não há nenhum); escolher "Vencida" chama `blocks.update` com `{ statusOverride: 'overdue' }`, "Nunca trabalhada" com `'never'` e "Automático" com `null`, e cada um dispara `onChanged`; e um erro vindo de qualquer uma dessas chamadas aparece no painel em vez de sumir.
>
> Toque apenas em `admin/src/renderer/` (o componente novo e `index.css` se precisar de estilo); não modifique main, preload, shared nem outras telas.

---

### Task 10 — Admin: a tabela de quadras na página de configurações

**Objetivo:** A página de configurações do território lista as quadras e abre o painel de cada uma.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 09
**Instrução para o subagente:**
> Spec 0010 — Task 10: implemente por TDD a tabela de quadras em `admin/src/renderer/screens/TerritorySettingsScreen.tsx`, com os casos no teste co-localizado que já existe. Rode com `cd admin && npx vitest run`.
>
> Abaixo do resumo que já está lá, acrescente uma **tabela das quadras do território**, ordenada por número, com três colunas: **número**, **status** e **última visita**. O status sai de `blockColorCategory` (a mesma regra do mapa, com a rotação do território — nunca uma segunda cópia dela), escrito por extenso e distinguível sem depender só de cor ("Nunca trabalhada", "Vencida", "Recente"); quando a quadra tem status forçado, a tabela **diz que é forçado**, senão o admin não tem como saber por que aquela linha discorda da data ao lado. A última visita mostra a data, ou "Nunca trabalhada" quando não há nenhuma. Território sem quadra nenhuma mostra uma mensagem em vez de uma tabela vazia.
>
> Clicar numa linha **expande o `BlockWorkPanel` da Task 09 dentro da própria página**, para aquela quadra, e clicar de novo recolhe; abrir uma linha diferente troca o painel aberto, sem empilhar dois. O `onChanged` do painel precisa atualizar o que a página mostra — a tela recebe o território pronto por prop, então busque a versão nova por `window.api.territories.listWithBlocks()` (ou o caminho equivalente que a tela já tiver) e reflita a mudança na tabela e no resumo. Uma marcação feita no painel que não muda a linha correspondente é o defeito mais provável desta task; cubra isso com teste.
>
> Critérios de aceite como comportamentos observáveis: a tabela lista as quadras ordenadas por número, com status e última visita corretos para uma rotação de 30 dias e para o padrão; uma quadra com status forçado aparece com o status forçado e sinalizada como tal; território sem quadras mostra a mensagem própria; clicar numa linha abre o painel daquela quadra e clicar de novo o fecha; abrir outra linha move o painel; e uma mudança disparada pelo painel (`onChanged`) atualiza a linha e o resumo sem o admin sair da página.
>
> Toque apenas em `admin/src/renderer/` (`TerritorySettingsScreen.tsx`, seu teste e `index.css`); não modifique main, preload, shared nem o `BlockWorkPanel`.

---

### Task 11 — App: o status forçado no domínio e no cliente HTTP

**Objetivo:** O celular do publicador respeita o status que o admin forçou.
**Camadas:** Domain, Data (app)
**Modo:** TDD
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0010 — Task 11: implemente por TDD em `app/src/domain/models.ts`, `app/src/domain/blockColor.ts` e `app/src/data/api-client.ts`, com os testes co-localizados já existentes. Rode com `cd app && npm test`. Lembre que `app/src/domain/` não pode importar nada de `react-native`.
>
> `Block` ganha `readonly statusOverride?: 'overdue' | 'never'`, e `blockColorCategory` consulta o override **antes** do cálculo por data, com exatamente a mesma semântica da Task 06 no admin — o comentário do topo do arquivo, que afirma ser cópia idêntica à regra do admin, precisa continuar verdadeiro depois da mudança. `parseBlock` em `data/api-client.ts` lê `status_override` para `statusOverride`, tratando ausente e nulo como `undefined`.
>
> Nada em `app/src/presentation/` precisa mudar: quem colore é `blockColorCategory`, que o `TerritoryMapView` já chama com o bloco inteiro. Confirme isso lendo o arquivo em vez de assumir, e **não** o modifique.
>
> Critérios de aceite como comportamentos observáveis: sem override, a cor é idêntica à de hoje, incluindo o efeito de `rotationDays`; uma quadra trabalhada ontem com override `'overdue'` é `'overdue'`; com `'never'` é `'never'`; uma quadra nunca trabalhada com `'overdue'` é `'overdue'`; o override vence qualquer rotação; uma quadra vinda da API com `status_override: "never"` vira `statusOverride: 'never'`, e ausente ou nulo vira `undefined`; e o cache local (`territory-cache.ts`) continua dando a volta completa sem perder o campo novo.
>
> Toque apenas em `app/src/domain/` e `app/src/data/` (mais os testes deles); não modifique `app/src/presentation/`.

---

### Task 12 — Documentar o status forçado e a tabela de quadras no `CLAUDE.md`

**Objetivo:** O `CLAUDE.md` descreve o sistema que passou a existir.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 05, Task 10, Task 11
**Instrução para o subagente:**
> Spec 0010 — Task 12: atualize o `CLAUDE.md` da raiz para refletir a spec 0010, no mesmo tom do documento (português, explicando o porquê e não só o quê, sem inflar). Os pontos que precisam entrar:
>
> - **Modelo de dados → Block**: a coluna `status_override` (`VARCHAR(16) NULL`, restrita a `overdue`/`never` por CHECK), com a explicação de que nulo é "derive a cor dos registros" — o comportamento de sempre — e de que a migration não faz backfill. Diga explicitamente como ela convive com `last_worked_at`: o histórico continua sendo a verdade sobre quem esteve lá e quando; o override só diz como pintar.
> - **Regras de negócio → cor da quadra**: o override é consultado antes do cálculo por data, nos dois clientes, e **qualquer registro de trabalho novo o limpa** (tanto pela rota do app quanto pela do admin), enquanto apagar um registro não mexe nele. Registre o porquê das duas metades dessa assimetria.
> - **Regras de negócio → quadra**: o status forçado entra pelo `PATCH /admin/blocks/{block_id}` que já existia, com a mesma distinção ausente/nulo do `rotation_days`.
> - **Estrutura do projeto**: a `TerritorySettingsScreen` ganhou a tabela de quadras com o painel de trabalho embutido (histórico, adicionar, apagar, forçar status). Se a descrição atual das telas do admin ficar imprecisa por causa disso, corrija-a — inclusive a contagem, se ela mudar, e a menção à `BlockHistorySheet`, que agora divide o assunto com o painel novo.
> - **Pontos em aberto**: se algum item passou a estar resolvido ou parcialmente resolvido por esta spec, ajuste o texto em vez de deixá-lo desatualizado.
>
> Toque apenas no `CLAUDE.md`; não modifique código.

---

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0010
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo` da task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

Execute as tasks na ordem indicada, respeitando as dependências.

### Ordem e paralelismo

- **Onda 1 (paralelas):** Task 01, Task 02, Task 06, Task 08
- **Onda 2:** Task 03 (depende de 01)
- **Onda 3:** Task 04 (depende de 02, 03)
- **Onda 4 (paralelas):** Task 05, Task 07, Task 11
- **Onda 5:** Task 09 (depende de 06, 07, 08)
- **Onda 6:** Task 10 (depende de 09)
- **Onda 7:** Task 12

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task (`/centaur-driven-tdd` ou `/centaur-driven-implement`) ao iniciar a primeira task, ou pelo `/centaur-driven-run` ao montar o plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou `/centaur-driven-implement`)._

- [x] Task 01 — `Block.status_override`: modelo e migration → implements/0150
- [x] Task 02 — DTOs: o status forçado na entrada e na saída da quadra → implements/0151
- [x] Task 03 — Services: gravar o status forçado e limpá-lo quando chega trabalho novo → implements/0154
- [x] Task 04 — Rotas: o status forçado no PATCH da quadra e nas leituras → implements/0155
- [x] Task 05 — Teste de integração: forçar o status e vê-lo se desfazer sozinho → implements/0156
- [x] Task 06 — Admin: o status forçado no modelo compartilhado e na regra de cor → implements/0152
- [x] Task 07 — Admin: main e IPC levam o status forçado → implements/0158
- [x] Task 08 — Admin: extrair o formulário de "publicador + data" para um componente → implements/0153
- [x] Task 09 — Admin: o painel de trabalho da quadra → implements/0159
- [x] Task 10 — Admin: a tabela de quadras na página de configurações → implements/0160
- [x] Task 11 — App: o status forçado no domínio e no cliente HTTP → implements/0157
- [x] Task 12 — Documentar o status forçado e a tabela de quadras no `CLAUDE.md` → implements/0161
