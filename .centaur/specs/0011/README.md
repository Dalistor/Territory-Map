# [0011] Apagar publicador, com o nome preservado no histórico

**Data:** 2026-08-20
**Status:** Concluída
**Solicitação original:** "Deve ser possível deletar um publicador tbm" — e, sobre o histórico: "Salva o nome da pessoa, nao faça um fk para o histórico, tudo bem mexer com os dados agora, n lancei em producao de fato ainda"

## Objetivo

O admin pode **apagar** um publicador pela tela de Publicadores, e o histórico de trabalho e de designações daquela pessoa **continua legível depois disso**, porque cada linha passa a guardar o nome de quem a produziu em vez de depender de uma FK para `users`.

Hoje isso é impossível: `block_work_logs.user_id` e `territory_assignments.user_id` são `ON DELETE RESTRICT`, e o banco recusa a exclusão de quem já trabalhou uma quadra ou já apareceu num cartão S-13.

## Contexto técnico

**Decisões já tomadas com o dono do projeto (não reabrir):**

- O histórico guarda o **nome** da pessoa, gravado no momento em que a linha nasce, e **não tem FK** para `users`. `user_id` sobrevive como UUID simples, sem constraint — serve para agrupar "por dirigente" enquanto a pessoa existe, e vira um id órfão inofensivo depois que ela some, porque o nome já está na linha.
- **Apagar um publicador com designação em aberto é recusado.** A interface avisa que ele ainda tem território em vigor e pede que a designação seja concluída antes. Nada é encerrado por tabela.
- **Pode mexer nos dados.** O projeto ainda não foi para produção, então a migration preenche `user_name` a partir de `users` antes de derrubar as FKs — sem inventar nome nenhum, e sem o cuidado que uma base real exigiria.

**Consequências aceitas, registradas para quem for ler isto depois:**

- **O nome é uma fotografia.** Renomear um publicador não corrige o que já foi gravado: o histórico continua com o nome que a pessoa tinha no dia. É o preço de desnormalizar, e é exatamente o que faz o registro sobreviver à exclusão.
- **Dois homônimos ficam indistinguíveis** no histórico depois que um deles é apagado. Enquanto os dois existirem, o `user_id` sem FK ainda os separa.

**Decisões de detalhe tomadas nesta spec:**

- **O formato do DTO não muda.** `WorkLogOut.user` e `AssignmentOut.user` continuam sendo o objeto aninhado `{id, name}` — só que montado a partir de `user_id` + `user_name` em vez da relationship. É o que faz `DesignationsScreen`, `HistoryScreen` e `BlockWorkPanel` continuarem funcionando **sem uma linha alterada**, e o app sequer perceber a mudança.
- As relationships `BlockWorkLog.user` e `TerritoryAssignment.user` **deixam de existir**: sem FK, elas seriam um join que o banco não garante mais, e devolveriam `None` justamente no caso que a spec inteira existe para resolver.
- `user_name` é `NOT NULL`. Um registro sem autor não serviria para nada — é a mesma razão pela qual `user_id` sempre foi obrigatório.
- A recusa por designação aberta é um erro de domínio próprio, mapeado para **409 Conflict**, ao lado de `DuplicateNameError` — o pedido é válido, o estado atual é que não permite.

**Cuidados que valem para todas as tasks:** regra de negócio só no servidor; o renderer do admin nunca fala HTTP, só `window.api`; teste co-localizado no admin; e **100% de cobertura em `server/app/services/`** é portão de CI.

## Tasks

### Task 01 — O nome na linha do histórico: modelos e migration

**Objetivo:** As duas tabelas de histórico guardam o nome e deixam de depender de `users`.
**Camadas:** Models
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0011 — Task 01: em `server/app/models/block_work_log.py` e `server/app/models/territory_assignment.py`, acrescente a coluna `user_name` (`Mapped[str]`, `String(120)` — o mesmo tamanho de `User.name` —, `nullable=False`), **remova o `ForeignKey` de `user_id`** deixando a coluna como `PgUUID(as_uuid=True)` comum, `nullable=False`, e **remova a relationship `user`** de ambos os modelos (junto com os imports que ficarem órfãos). Documente em inglês, nos dois arquivos, por que a linha guarda o nome em vez de apontar para a pessoa: o registro precisa sobreviver à exclusão do publicador, e um nome copiado no momento da escrita é o que garante isso. Diga também o que `user_id` passou a ser — um id sem constraint, útil para agrupar enquanto a pessoa existe, órfão e inofensivo depois — e registre a consequência aceita: o nome é uma fotografia, então renomear o publicador não reescreve o histórico.
>
> Gere a migration em `server/migrations/versions/`, no padrão de nome dos arquivos existentes, com `down_revision` na head atual (confirme com `uv run alembic heads`). A ordem importa: adicione `user_name` como nullable, **preencha a partir de `users`** com um `UPDATE ... FROM` enquanto a FK ainda existe, só então torne a coluna `NOT NULL` e derrube as duas constraints de chave estrangeira. O projeto não está em produção, então o backfill é exato e não há caso de linha órfã a tratar. No downgrade, recrie as FKs e remova as colunas. Rode `uv run alembic upgrade head` e `uv run alembic check`.
>
> **Esperado nesta task:** `pytest` vai falhar em testes de router e de service que ainda usam a relationship `user` ou chamam os repositórios com a assinatura antiga — isso é das Tasks 02, 03 e 04, que vêm logo atrás. Relate quais falharam, mas **não** corrija código fora de Models e Migrations.
>
> Toque apenas nas camadas Models e Migrations; não modifique schemas, repositories, services ou routers.

---

### Task 02 — O nome é gravado junto com o registro

**Objetivo:** Todo registro de trabalho e toda designação nascem com o nome de quem os originou.
**Camadas:** Repositories, Services
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0011 — Task 02: implemente por TDD em `server/app/repositories/block_work_log.py`, `server/app/repositories/territory_assignment.py`, `server/app/services/work_log.py` e `server/app/services/assignment.py`, com os testes em `server/tests/services/test_work_log_service.py` e `server/tests/services/test_assignment_service.py` (arquivos existentes; acrescente casos). `server/app/services/` é portão de CI a 100% de cobertura, de linha **e** de branch.
>
> Os dois métodos `create` dos repositórios passam a receber e gravar `user_name`. Nos services, o nome sai do `User` que eles já têm em mãos: `WorkLogService.mark_worked` recebe o `user` inteiro por parâmetro, `mark_worked_by_admin` já resolve o publicador por `_user_of_congregation`, e `AssignmentService.designate` já valida o publicador antes de abrir a designação — em nenhum dos três é preciso uma consulta nova. Se algum fake de repositório nos testes implementar a interface antiga, atualize-o para a nova, porque um fake que aceita menos que o real deixa de provar o que promete.
>
> Critérios de aceite como comportamentos observáveis: marcar uma quadra pelo app grava o nome do publicador na linha; marcar pelo admin grava o nome do publicador **escolhido**, não o de quem estava designado; designar um território grava o nome do dirigente; o nome gravado é o que a pessoa tinha **no momento da escrita**, de modo que renomear o publicador depois não altera as linhas já criadas; um reenvio de `log_id` já conhecido continua devolvendo o registro existente sem criar outro nem reescrever o nome; e todas as regras que já existiam (designação exigida na rota do app, escopo de congregação, recusa de data implausível) continuam valendo sem alteração.
>
> Toque apenas nas camadas Repositories e Services (e nos testes de service); não modifique models, schemas ou routers.

---

### Task 03 — Apagar publicador, recusando quem tem designação aberta

**Objetivo:** Existe a regra de negócio da exclusão, com a única barreira que ela deve ter.
**Camadas:** Repositories, Services, Core/exceptions
**Modo:** TDD
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0011 — Task 03: implemente por TDD `UserService.delete(congregation_id, user_id)` em `server/app/services/user.py`, com os testes em `server/tests/services/test_user_service.py` (arquivo existente; acrescente casos). `server/app/services/` é portão de CI a 100% de cobertura, de linha **e** de branch.
>
> Acrescente em `server/app/core/exceptions.py` o erro de domínio `PublisherHasOpenAssignmentError`, no estilo dos vizinhos, com uma mensagem voltada ao admin que diga **o que fazer** e não só o que falhou (o publicador ainda tem território em vigor; conclua a designação antes de apagar). Acrescente ao repositório de designações o método que responde se um publicador tem designação aberta, e injete esse repositório no `UserService` — ajuste as composições que constroem o service (`app/routers/admin_users.py`, `app/routers/auth.py` e `app/jobs/expire_codes.py`, ou onde mais o construtor for chamado) apenas o suficiente para continuarem compilando; a fiação do endpoint é da Task 04.
>
> `delete` recusa quem tem designação **aberta** e apaga o resto. Quem tem histórico — registros de trabalho, designações já concluídas — **pode** ser apagado: é justamente para isso que o nome passou a viver na linha (Tasks 01 e 02). Documente isso em docstring, porque é o oposto do que a versão anterior deste modelo permitia.
>
> Critérios de aceite como comportamentos observáveis: apagar um publicador recém-cadastrado o remove; apagar um publicador que tem registros de trabalho **funciona**, e os registros continuam existindo com o nome preservado; apagar um publicador com designações apenas **concluídas** funciona; apagar um publicador com designação **aberta** levanta `PublisherHasOpenAssignmentError`; publicador de outra congregação e id inexistente levantam o mesmo `NotFoundError`, nunca um 403 disfarçado; e apagar um publicador **não** apaga território nenhum (`Territory.assigned_user_id` é `SET NULL` por construção).
>
> Toque apenas em Repositories, Services e `core/exceptions.py` (mais os testes de service) e no mínimo de composição citado acima; não modifique schemas nem a lógica dos routers.

---

### Task 04 — Rotas: `DELETE /admin/users/{id}` e o DTO montado a partir do nome

**Objetivo:** A exclusão é alcançável por HTTP, e as leituras voltam a funcionar sem a relationship.
**Camadas:** Routers
**Modo:** TDD
**Depende de:** Task 02, Task 03
**Instrução para o subagente:**
> Spec 0011 — Task 04: implemente por TDD, com os testes em `server/tests/routers/test_admin_users_routes.py`, `server/tests/routers/test_admin_blocks_routes.py`, `server/tests/routers/test_admin_assignments_routes.py` e `server/tests/routers/test_app_client_routes.py` (arquivos existentes; acrescente casos).
>
> Duas frentes. **Uma:** como a relationship `user` deixou de existir (Task 01), todo `WorkLogOut.model_validate(log)` e `AssignmentOut.model_validate(assignment)` precisa passar a montar o campo `user` explicitamente, como `UserBriefOut(id=..., name=...)` a partir de `user_id` e `user_name`. Os pontos são `app/routers/admin_blocks.py` (dois), `app/routers/admin_assignments.py` (três) e `app/routers/app_client.py` (um) — confirme com uma busca em vez de confiar nesta lista. **O formato da resposta não pode mudar**: o objeto aninhado `{id, name}` é o que mantém as telas do admin funcionando sem alteração, e isso é um critério, não um detalhe. Se a montagem se repetir, extraia um helper no módulo onde ele couber melhor, sem criar camada nova.
>
> **Duas:** acrescente `DELETE /admin/users/{user_id}` em `app/routers/admin_users.py`, respondendo **204**, chamando `UserService.delete`. Mapeie `PublisherHasOpenAssignmentError` para **409** em `app/main.py`, no dicionário `DOMAIN_ERROR_STATUS`, ao lado de `DuplicateNameError` — o pedido é válido, o estado atual é que não permite.
>
> Critérios de aceite como comportamentos observáveis: apagar um publicador responde 204 e ele some de `GET /admin/users`; apagar um que tem registros de trabalho responde 204, e `GET /admin/blocks/{id}/work-logs` continua respondendo com o nome dele em `user.name`; apagar um com designação aberta responde **409** com o código do erro no corpo padrão da API; apagar publicador de outra congregação ou id inexistente responde 404; um token de app não alcança a rota; e as leituras de work log e de designação continuam com exatamente o mesmo formato de antes, inclusive `user.id`.
>
> Toque apenas na camada Routers e em `app/main.py` (mais os testes de router); não modifique models, schemas, repositories ou services.

---

### Task 05 — Teste de integração: a pessoa some, o histórico fica

**Objetivo:** O fluxo completo é exercido por HTTP contra o PostGIS real.
**Camadas:** Testes de integração
**Modo:** TDD
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0011 — Task 05: escreva `server/tests/integration/test_publisher_deletion_integration.py`, seguindo o padrão dos arquivos vizinhos em `server/tests/integration/` (app FastAPI real sobre PostGIS real, tudo criado por HTTP, congregação como única linha escrita direto no banco).
>
> O fluxo central: o admin cadastra um publicador, designa um território a ele, registra trabalho numa quadra em nome dele, e **tenta apagá-lo — recebendo 409** porque a designação está aberta; conclui a designação e aí a exclusão responde 204. Depois disso, verifique o que a spec inteira existe para garantir: `GET /admin/blocks/{id}/work-logs` continua nomeando a pessoa, `GET /admin/assignments` continua mostrando a designação concluída com o nome dela, o território segue existindo e sem publicador designado, e `GET /admin/users` não a lista mais. Verifique também que **o token do aparelho dela deixa de valer** (uma chamada a `GET /app/territories` com aquele token é recusada) — apagar a pessoa tem que revogar o acesso, senão a exclusão seria só cosmética. Feche com o isolamento: o admin de outra congregação recebe 404 ao tentar apagar um publicador que não é dele.
>
> Toque apenas em `server/tests/integration/`; não modifique código de produção — se algum comportamento não fechar, o defeito é de uma task anterior e deve ser reportado, não corrigido aqui.

---

### Task 06 — Admin: `publishers.delete` no main e no IPC

**Objetivo:** O renderer alcança a exclusão por `window.api`.
**Camadas:** Main, Preload, Shared/ipc-contract (admin)
**Modo:** TDD
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0011 — Task 06: implemente por TDD em `admin/src/main/api-client.ts`, `admin/src/shared/ipc-contract.ts`, `admin/src/main/ipc-handlers.ts` e `admin/src/preload/index.ts`, com os testes em `admin/src/main/api-client.test.ts` e `admin/src/main/ipc-handlers.test.ts` (arquivos existentes; acrescente casos). Rode com `cd admin && npx vitest run`.
>
> `deletePublisher(publisherId)` no cliente da API, fazendo `DELETE /admin/users/{id}`, no mesmo estilo dos `delete` que já existem ali. No contrato de IPC, `publishers.delete(publisherId): Promise<void>` com um canal novo em `IPC_CHANNELS`, o handler registrado dentro de `session.run` (para herdar a reautenticação silenciosa no 401) e o repasse de uma linha no preload.
>
> Critérios de aceite como comportamentos observáveis: `deletePublisher` chama o método e o caminho certos e resolve sem valor quando o servidor responde 204; um 409 do servidor chega ao chamador como erro com o código e o status preservados, para a tela poder distinguir "tem designação aberta" de uma falha qualquer; o handler de IPC repassa o argumento e propaga o erro serializado como os vizinhos; e um 401 dispara a reautenticação uma vez, como nas demais chamadas.
>
> Toque apenas em `admin/src/main/`, `admin/src/preload/` e `admin/src/shared/ipc-contract.ts` (mais os testes de main); não modifique nenhuma tela do renderer.

---

### Task 07 — Admin: apagar publicador pela tela

**Objetivo:** O admin apaga um publicador pela interface, com a confirmação e o aviso certos.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 06
**Instrução para o subagente:**
> Spec 0011 — Task 07: implemente por TDD a ação de apagar publicador em `admin/src/renderer/screens/PublishersScreen.tsx`, com os casos no teste co-localizado que já existe. Rode com `cd admin && npx vitest run`.
>
> Cada publicador ganha a ação de apagar, ao lado de "Desativar"/"Reativar" que já existem. A confirmação precisa deixar claro o que acontece e o que **não** acontece: a pessoa sai da lista e perde o acesso ao aplicativo, mas o histórico de trabalho e as designações dela **continuam no sistema com o nome preservado**. Diga isso na própria confirmação — é a diferença entre apagar e desativar, e é o que evita que o admin escolha o botão errado por medo.
>
> Quando o servidor recusar por designação aberta (409), mostre a mensagem que ele mandou, que já explica o que fazer, em vez de um erro genérico. Use a mesma via de erro que a tela já usa para as outras escritas.
>
> Critérios de aceite como comportamentos observáveis: cada linha de publicador oferece a ação de apagar; confirmar chama `window.api.publishers.delete` com o id certo e recarrega a lista; cancelar não chama nada; a mensagem de confirmação menciona que o histórico é preservado; uma recusa por designação aberta aparece na tela com a mensagem do servidor e a lista **não** é recarregada; um erro qualquer também aparece em vez de sumir; e as ações que já existiam (criar, gerar novo código, desativar/reativar, busca por nome, contadores por situação) continuam funcionando — os testes que as cobrem devem passar sem serem reescritos.
>
> Toque apenas em `admin/src/renderer/` (`PublishersScreen.tsx`, seu teste e `index.css`); não modifique main, preload nem shared.

---

### Task 08 — Documentar a exclusão de publicador no `AGENTS.md`

**Objetivo:** O `AGENTS.md` descreve o modelo que passou a existir.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 05, Task 07
**Instrução para o subagente:**
> Spec 0011 — Task 08: atualize o `AGENTS.md` da raiz para refletir a spec 0011, no mesmo tom do documento (português, explicando o porquê e não só o quê, sem inflar). Os pontos que precisam entrar:
>
> - **Modelo de dados → BlockWorkLog e TerritoryAssignment**: a coluna `user_name` e o fim da FK para `users`. Explique a troca: a linha guarda o nome copiado no momento da escrita para sobreviver à exclusão do publicador, e `user_id` virou um id sem constraint — útil para agrupar enquanto a pessoa existe, órfão e inofensivo depois. Registre as duas consequências aceitas: o nome é uma fotografia (renomear não reescreve o histórico) e dois homônimos ficam indistinguíveis depois que um é apagado. **Isto contradiz o que o documento diz hoje** sobre `ON DELETE RESTRICT` "porque o histórico nomeia uma pessoa e não a perde em silêncio" — corrija esse texto em vez de deixar as duas versões convivendo, mantendo a intenção original, que continua valendo: o histórico não perde o nome.
> - **Regras de negócio → cadastro de publicador**: o admin pode **apagar** um publicador; a exclusão é recusada com 409 enquanto houver designação aberta, e permitida para quem tem apenas histórico. Diga qual a diferença entre apagar e desativar, já que agora as duas existem lado a lado: desativar revoga o acesso e mantém a pessoa na lista; apagar tira a pessoa do sistema e mantém só o rastro dela no histórico.
> - **Estrutura do projeto**: se a descrição da tela de Publicadores ficar imprecisa, ajuste-a.
> - **Pontos em aberto** e **Resolvidos**: se algum item mudou de status por causa desta spec, ajuste o texto.
>
> Toque apenas no `AGENTS.md`; não modifique código.

---

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0011
```

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo` da task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

### Ordem e paralelismo

- **Onda 1:** Task 01
- **Onda 2 (paralelas):** Task 02, Task 03
- **Onda 3:** Task 04
- **Onda 4 (paralelas):** Task 05, Task 06
- **Onda 5:** Task 07
- **Onda 6:** Task 08

A Task 01 fica sozinha na primeira onda de propósito: ela derruba as relationships de que services e routers ainda dependem, então a árvore fica transitoriamente vermelha até a Task 04 fechar. É o preço de trocar a fundação antes das paredes, e está avisado na instrução da própria task.

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task, ou pelo `/centaur-driven-run` ao montar o plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou `/centaur-driven-implement`)._

- [x] Task 01 — O nome na linha do histórico: modelos e migration → implements/0162
- [x] Task 02 — O nome é gravado junto com o registro → implements/0163
- [x] Task 03 — Apagar publicador, recusando quem tem designação aberta → implements/0164
- [x] Task 04 — Rotas: `DELETE /admin/users/{id}` e o DTO montado a partir do nome → implements/0165
- [x] Task 05 — Teste de integração: a pessoa some, o histórico fica → implements/0167
- [x] Task 06 — Admin: `publishers.delete` no main e no IPC → implements/0166
- [x] Task 07 — Admin: apagar publicador pela tela → implements/0168
- [x] Task 08 — Documentar a exclusão de publicador no `AGENTS.md` → implements/0169
