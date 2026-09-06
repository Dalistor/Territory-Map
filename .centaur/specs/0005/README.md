# [0005] App do publicador em React Native, com designação de território

**Data:** 2026-08-17
**Status:** Concluída
**Solicitação original:** "Vamos fazer o aplicativo agora. Ele deve ser feito em React Native para
android. Ao abrir deve perguntar o código e confirmar via server. Após isso teria o dashboard dele
mostrando uma lista com os territórios trabalhados e com datas. E também poderia ver o território
designado pelo admin (precisa ser implementado isso no backend e no app do admin também). Em uma
outra página deve mostrar o mapa junto com a sua localização em tempo real. E caso tenha um
território designado, mostrar somente as demarcações dele no mapa (mas com o filtro para poder
selecionar outros). Somente se o território tiver sido designado, o irmão pode clicar na quadra e
confirmar que ela foi feita, isso já salvará a data. No admin e no app, as quadras que mais faz
tempo que não foram feitas devem estar em vermelho e as que foram feitas em verde."

## Decisões já tomadas com o usuário

- **Stack do app: React Native (CLI puro, TypeScript), não Flutter.** `packages/core` (Dart) deixa
  de ter qualquer cliente e é removido do monorepo nesta spec (Task 12), junto com
  `.github/workflows/core.yml`. O `AGENTS.md` é atualizado por último (Task 27) para refletir a
  nova stack.
- **Mapa: MapLibre Native (`@maplibre/maplibre-react-native`), tiles OSM crus.** Mantém a decisão
  já registrada no projeto de não usar Google Maps/billing — é o equivalente nativo do que o
  Leaflet faz no admin, sem depender de Google Play Services nem de chave de API.
- **Localização em tempo real: `react-native-geolocation-service`**, permissão `ACCESS_FINE_LOCATION`
  pedida em runtime, só enquanto a tela de mapa está aberta (sem tracking em background — a posição
  é dado sensível e nunca é enviada ao servidor nem persistida, regra já vigente no `AGENTS.md`).
- **Designação de território: um território tem no máximo um publicador designado por vez; um
  publicador pode ter vários territórios designados ao mesmo tempo** (ex.: dirigente de grupo).
  Modelado como `territories.assigned_user_id`, nullable, `ON DELETE SET NULL`.

## Objetivo

Ao final desta spec:

1. O admin pode designar (e desdesignar) um território a um publicador, e ver isso refletido na
   lista de territórios.
2. O servidor expõe essa designação para o app do publicador e passa a rejeitar a marcação de uma
   quadra cujo território não esteja designado ao publicador que está tentando marcá-la.
3. O servidor expõe o histórico de territórios trabalhados por publicador (nome + data mais
   recente), agregado a partir do `BlockWorkLog` já existente.
4. Existe um app Android em React Native que: pede o código de acesso e confirma via servidor;
   mostra um dashboard com a lista de territórios trabalhados (com data) e o(s) território(s)
   designado(s) ao publicador; mostra um mapa com a localização do publicador em tempo real,
   restrito por padrão ao(s) território(s) designado(s) mas com filtro para ver os demais; permite
   marcar uma quadra como trabalhada **somente** dentro de um território designado; e cacheia mapa
   e fila de marcações localmente para funcionar offline em campo.
5. Tanto o admin quanto o app do publicador continuam colorindo as quadras pelo tempo desde a
   última visita (vermelho = nunca trabalhada, laranja = mais de 120 dias, verde = recente) — regra
   já implementada no admin (`admin/src/renderer/map/blockColor.ts`) e agora também portada ao app.

## Contexto técnico

**Servidor.** `Territory` (`server/app/models/territory.py`) ganha `assigned_user_id`. A regra de
"só marca quadra de território designado" entra em `WorkLogService.mark_worked`
(`server/app/services/work_log.py`), **só no caminho de uma marcação nova** — um reenvio
(`log_id` já existente) continua sendo confirmado sem reavaliar a designação, pelo mesmo motivo que
já vale para a checagem de relógio: o visita já é um fato aceito antes. Erros de domínio seguem o
padrão de `server/app/core/exceptions.py` + mapeamento em `server/app/main.py`
(`DOMAIN_ERROR_STATUS`); território de outro publicador é **403**, não 404 — o bloco existe
visivelmente na congregação do publicador, a barreira não é de existência.

**Admin.** A designação entra como mais uma ação no menu "⋮" da lista de territórios em
`admin/src/renderer/screens/HomeScreen.tsx` (mesmo padrão da Task de spec 0004 que trocou os três
botões por um menu). Segue o fluxo já estabelecido: `shared/` → `main/api-client.ts` +
`main/ipc-handlers.ts` → `preload/` → `renderer/`, com o mesmo padrão de erro
(`shared/ipc-error.ts`, toast).

**App (novo).** Estrutura de camadas nova, espelhando a que o `AGENTS.md` já documenta para o app
Flutter (a decisão de fundo não mudou com a troca de stack — só a linguagem):

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Presentation | `app/src/presentation/` | Telas, navegação (React Navigation), o componente de mapa | Chamada HTTP direta, regra de negócio |
| Domain | `app/src/domain/` | Entidades e funções puras (cor da quadra, "é meu território?", filtro do mapa) | Dependência de React Native, HTTP ou armazenamento |
| Data | `app/src/data/` | Cliente HTTP, `react-native-keychain` (token), `AsyncStorage` (fila offline e cache do mapa) | Widget, lógica de apresentação |

Sem gerenciador de estado externo (Redux/Zustand): o volume de telas é pequeno e o estado é quase
todo "o que o servidor respondeu", então hooks + Context bastam — consistente com a regra do
`AGENTS.md` de não otimizar/abstrair cedo. Configuração de build (`API_BASE_URL`, `APP_KEY`) entra
via `react-native-config`, lida de um `.env` na raiz de `app/` (git-ignorado, com `.env.example`) —
o equivalente RN do `dotenv` do admin: RN empacota o JS no APK, então não existe um "processo
principal" para ler um `.env` em tempo de execução como no Electron; `react-native-config` injeta o
valor no build sem hardcodar no código-fonte.

Testes do app: Jest + `@testing-library/react-native`, arquivos `*.test.ts(x)` co-localizados (mesma
convenção do admin, pelo mesmo motivo — é o padrão do próprio ecossistema RN/Jest). O componente que
efetivamente desenha o MapLibre nativo (Task 25) não é razoavelmente testável com Jest (é uma view
nativa) — mesmo "risco assumido" que o projeto já documenta para o Leaflet-Geoman do admin — e por
isso essa task é `Modo: direto`, verificada rodando o app num emulador/aparelho depois.

**Numeração das rotas novas do servidor:** `PATCH /admin/territories/{territory_id}/assignment`
(admin, corpo `{"user_id": "<uuid>" | null}`) e `GET /app/worked-territories` (app, token do
publicador, sem parâmetro — o publicador é o do token).

## Tasks

### Task 01 — Exceção de domínio `TerritoryNotAssignedError`

**Objetivo:** Criar a exceção que a Task 06 vai lançar quando um publicador tentar marcar uma
quadra fora do território designado a ele.
**Camadas:** Core (`server/app/core/exceptions.py`)
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0005 — Task 01: Em `server/app/core/exceptions.py`, adicione a classe
> `TerritoryNotAssignedError(DomainError)`, seguindo exatamente o padrão das classes já existentes
> no arquivo (docstring curta explicando quando ela é lançada, `code = "territory_not_assigned"`,
> `default_message` em português voltado ao publicador, dizendo o que fazer:
> "Este território não está designado a você. Peça a quem cuida dos territórios na congregação
> para atribuí-lo antes de marcar quadras."). Não altere nenhuma outra classe do arquivo. Toque
> apenas `server/app/core/exceptions.py`; não modifique arquivos de outras camadas.

---

### Task 02 — Modelo: `Territory.assigned_user_id` e migration

**Objetivo:** Adicionar a coluna que registra qual publicador está com o território designado.
**Camadas:** Models
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0005 — Task 02: Em `server/app/models/territory.py`, adicione a coluna
> `assigned_user_id: Mapped[UUID | None]`, `ForeignKey("users.id", ondelete="SET NULL")`,
> `nullable=True`, `index=True` (siga exatamente o estilo de `congregation_id` no mesmo arquivo,
> mas nullable e com `SET NULL` em vez de `CASCADE` — perder o território não pode apagar o
> publicador, nem apagar/desativar o publicador deve exigir apagar o território, só solta a
> designação). Adicione também a relação `assigned_user: Mapped["User | None"] = relationship()`
> com `foreign_keys=[assigned_user_id]` (import de `User` só sob `TYPE_CHECKING`, como já é feito
> para `Congregation` no mesmo arquivo). Não é necessário criar a relação inversa em
> `server/app/models/user.py` — nada no escopo desta spec precisa listar "os territórios deste
> publicador" a partir do `User`. Depois, gere a migration Alembic
> (`cd server && uv run alembic revision --autogenerate -m "add territory assigned_user_id"`),
> confira que ela cria só a coluna, o índice e a FK esperados (nada de `MULTIPOLYGON` ou geometria
> por engano no diff), e rode `uv run alembic upgrade head` localmente para confirmar que aplica
> sem erro contra o Postgres de desenvolvimento (`docker compose -f docker-compose.dev.yml up -d`
> se ainda não estiver de pé). Toque apenas `server/app/models/territory.py` e o arquivo de
> migration novo em `server/migrations/versions/`; não modifique outras camadas.

---

### Task 03 — Schemas: designação e território trabalhado

**Objetivo:** DTOs para o admin designar um publicador e para o app ler quem está designado e o
histórico de territórios trabalhados.
**Camadas:** Schemas
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0005 — Task 03: Em `server/app/schemas/territory.py`, adicione o campo
> `assigned_user: UserBriefOut | None = None` em `TerritoryOut` (import `UserBriefOut` de
> `app.schemas.user`, mesmo padrão de `WorkLogOut.user` em `server/app/schemas/work_log.py`), e a
> nova classe `TerritoryAssignmentIn(BaseModel): user_id: UUID | None` — **sem valor default**, o
> campo é obrigatório mesmo quando `null` (mesmo motivo de `UserPatchIn.is_active` em
> `server/app/schemas/user.py`: o endpoint existe para setar o estado, um corpo sem o campo não
> significa nada). Em `server/app/schemas/work_log.py`, adicione a classe
> `WorkedTerritoryOut(OutSchema)` com `id: UUID` (o id do território), `name: str` e
> `last_worked_at: datetime` (nunca nulo — esse schema só serve para territórios com pelo menos uma
> marcação do publicador). Toque apenas esses dois arquivos de `server/app/schemas/`; não modifique
> repositórios, serviços ou rotas.

---

### Task 04 — Repositórios: designação e histórico agregado por publicador

**Objetivo:** As queries que sustentam a designação e o dashboard de territórios trabalhados.
**Camadas:** Repositories
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0005 — Task 04: Em `server/app/repositories/territory.py`, adicione o método
> `set_assigned_user(self, territory: Territory, user_id: UUID | None) -> Territory`, que atribui
> `territory.assigned_user_id = user_id`, dá `flush()` e retorna o território — siga o estilo de
> `update()` no mesmo arquivo. Depois do flush, force o SQLAlchemy a recarregar a relação
> `assigned_user` (ex.: `self.session.refresh(territory, attribute_names=["assigned_user"])` quando
> `user_id` não é `None`, e deixe `assigned_user` cair para `None` naturalmente quando `user_id` é
> `None`) — sem isso a resposta HTTP da Task 08 serializaria um `assigned_user` desatualizado depois
> de trocar de publicador. Em `server/app/repositories/block_work_log.py`, adicione o método
> `list_worked_territories(self, user_id: UUID) -> list[tuple[UUID, str, datetime]]`: uma query
> que junta `BlockWorkLog` → `Block` (via `block_id`) → `Territory` (via `territory_id`), filtra por
> `BlockWorkLog.user_id == user_id`, agrupa por território e devolve `(territory_id, territory.name,
> MAX(worked_at))`, ordenado por essa data mais recente decrescente (use `select(...).join(...).
> group_by(...).order_by(func.max(BlockWorkLog.worked_at).desc())`, seguindo o estilo de
> `latest_worked_at` no mesmo arquivo). Toque apenas esses dois arquivos de
> `server/app/repositories/`; não modifique models, services ou rotas.

---

### Task 05 — Service: `TerritoryService.assign_to_user`

**Objetivo:** Regra de negócio de designar (ou remover a designação de) um território a um
publicador, sempre dentro da congregação de quem chama.
**Camadas:** Services
**Modo:** TDD
**Depende de:** Task 02, Task 04
**Instrução para o subagente:**
> Spec 0005 — Task 05: Implemente por TDD. Em `server/app/services/territory.py`, adicione o método
> `assign_to_user(self, congregation_id: UUID, territory_id: UUID, user_id: UUID | None) ->
> Territory` em `TerritoryService`. O construtor da classe vai precisar passar a receber também um
> `UserRepository` (mesma classe já usada em `server/app/services/user.py`,
> `server/app/repositories/user.py`) — adicione o parâmetro ao `__init__` e atualize os dois pontos
> que instanciam `TerritoryService` hoje (`server/app/routers/admin_territories.py` e
> `server/app/routers/app_client.py`, funções `get_territory_service`) para passar
> `UserRepository(session)`. Comportamentos observáveis a cobrir com teste (contra o Postgres real
> via a fixture `session`, seguindo o padrão de `server/tests/services/test_territory_service.py`):
> - Caminho feliz: designar um território existente a um publicador ativo da mesma congregação seta
>   `territory.assigned_user_id` para o `id` do publicador, e o território devolvido reflete isso.
> - Caminho feliz: chamar com `user_id=None` remove a designação (`assigned_user_id` volta a
>   `None`), mesmo que já estivesse designado a alguém.
> - Caminho feliz: designar a um publicador diferente do que já estava designado simplesmente
>   substitui — não é erro, não precisa "desdesignar" antes.
> - Erro: `territory_id` inexistente ou de outra congregação levanta `NotFoundError`.
> - Erro: `user_id` inexistente ou de um publicador de outra congregação levanta `NotFoundError`
>   (mesma exceção genérica — não revelar se o problema foi o território ou o publicador).
> - Borda: publicador com `is_active=False` **pode** ser designado (desativação revoga acesso ao
>   app, não o direito de estar registrado como responsável por um território no admin — quem
>   decide isso é o admin, e reativar depois não deve exigir designar de novo).
> Toque apenas `server/app/services/territory.py`, os dois `get_territory_service` citados, e o
> arquivo de teste `server/tests/services/test_territory_service.py`; não modifique repositórios,
> schemas ou rotas além da injeção de dependência já descrita.

---

### Task 06 — Service: restringir `mark_worked` ao território designado

**Objetivo:** Um publicador só pode marcar uma quadra como trabalhada se o território dela estiver
designado a ele.
**Camadas:** Services
**Modo:** TDD
**Depende de:** Task 01, Task 02
**Instrução para o subagente:**
> Spec 0005 — Task 06: Implemente por TDD. Em `server/app/services/work_log.py`, dentro de
> `WorkLogService.mark_worked`, depois de resolver `block` via `_block_of_congregation` e depois da
> checagem de reenvio (`stored is not None`, que deve continuar retornando sem reavaliar nada — um
> reenvio de uma visita já aceita não deve poder ser rejeitado por uma designação que mudou
> depois), adicione a checagem de designação **só no caminho de uma marcação nova**: se
> `block.territory.assigned_user_id != user.id`, levante `TerritoryNotAssignedError` (de
> `app.core.exceptions`) antes de criar o log. Comportamentos observáveis a cobrir com teste
> (`server/tests/services/test_work_log_service.py`, mesmo padrão das fixtures já existentes lá):
> - Caminho feliz: publicador com o território do bloco designado a ele marca a quadra normalmente
>   — cria o log e recalcula `last_worked_at` (comportamento já existente, não pode regredir).
> - Erro novo: publicador sem nenhum território designado tenta marcar uma quadra → levanta
>   `TerritoryNotAssignedError`, nenhum `BlockWorkLog` é criado.
> - Erro novo: publicador com **outro** território designado (não o do bloco) tenta marcar → mesma
>   rejeição.
> - Borda: reenvio (mesmo `log_id` já gravado) de uma marcação aceita antes continua devolvendo o
>   log armazenado mesmo que a designação do território tenha sido removida ou trocada depois —
>   não deve levantar `TerritoryNotAssignedError` nesse caminho.
> - Borda: bloco de outra congregação continua levantando `NotFoundError` **antes** de qualquer
>   checagem de designação (a ordem das checagens já documentada no docstring do método não muda).
> Toque apenas `server/app/services/work_log.py` e seu arquivo de teste; não modifique repositórios,
> schemas ou rotas.

---

### Task 07 — Service: territórios trabalhados pelo publicador

**Objetivo:** Expor a lista agregada que o dashboard do app vai consumir.
**Camadas:** Services
**Modo:** direto
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0005 — Task 07: Em `server/app/services/work_log.py`, adicione o método
> `list_worked_territories(self, user: User) -> list[tuple[UUID, str, datetime]]` em
> `WorkLogService`, que apenas delega para `self._work_logs.list_worked_territories(user.id)` (o
> método da Task 04) — sem regra de negócio adicional, é um repasse. Toque apenas
> `server/app/services/work_log.py`; não modifique repositórios, schemas ou rotas.

---

### Task 08 — Rota admin: designar território

**Objetivo:** Endpoint para o admin atribuir ou remover a designação de um publicador a um
território.
**Camadas:** Routers
**Modo:** direto
**Depende de:** Task 03, Task 05
**Instrução para o subagente:**
> Spec 0005 — Task 08: Em `server/app/routers/admin_territories.py`, adicione
> `PATCH /admin/territories/{territory_id}/assignment`, corpo `TerritoryAssignmentIn`, chamando
> `territories.assign_to_user(congregation.id, territory_id, payload.user_id)` e devolvendo
> `territory_out(territories, territory)` (mesma função já usada pelas outras rotas do arquivo).
> Atualize também `territory_out()` no mesmo arquivo para incluir
> `assigned_user=UserBriefOut.model_validate(territory.assigned_user) if territory.assigned_user
> else None` no `TerritoryOut` construído — hoje as outras rotas (`create_territory`,
> `list_territories`, `get_territory`, `patch_territory`) já passam por essa função, então elas
> passam a devolver a designação automaticamente, sem precisar tocar em cada uma. Um `territory_id`
> de outra congregação, ou um `user_id` de outra congregação, já viram `NotFoundError` (404) na
> Task 05 — não trate isso de novo aqui. Toque apenas `server/app/routers/admin_territories.py`;
> não modifique services, schemas além do import necessário, ou outras rotas.

---

### Task 09 — Rotas do app: designação visível e histórico de territórios trabalhados

**Objetivo:** O app do publicador passa a ver, por território, quem está designado, e ganha o
endpoint do dashboard.
**Camadas:** Routers
**Modo:** direto
**Depende de:** Task 03, Task 06, Task 07
**Instrução para o subagente:**
> Spec 0005 — Task 09: Em `server/app/routers/app_client.py`, atualize `_territory_out` para incluir
> `assigned_user=UserBriefOut.model_validate(territory.assigned_user) if territory.assigned_user
> else None` no `TerritoryOut` que ela monta (mesmo raciocínio da Task 08 — o publicador enxerga
> quem está designado a cada território para poder decidir o filtro do mapa; é informação que já
> circula entre publicadores da mesma congregação no mundo real, não é um dado sensível como o
> `access_code`). Adicione a rota `GET /app/worked-territories`, sem parâmetros além do token do
> app, chamando `work_logs.list_worked_territories(user)` (Task 07) e devolvendo
> `list[WorkedTerritoryOut]` (Task 03) montado a partir da tupla `(territory_id, name,
> last_worked_at)`. Toque apenas `server/app/routers/app_client.py`; não modifique services,
> schemas ou as rotas do admin.

---

### Task 10 — Core: mapear `TerritoryNotAssignedError` para 403

**Objetivo:** A exceção da Task 01 vira uma resposta HTTP 403, não o 422 genérico.
**Camadas:** Core
**Modo:** direto
**Depende de:** Task 01
**Instrução para o subagente:**
> Spec 0005 — Task 10: Em `server/app/main.py`, importe `TerritoryNotAssignedError` de
> `app.core.exceptions` e adicione a entrada `TerritoryNotAssignedError: status.HTTP_403_FORBIDDEN`
> em `DOMAIN_ERROR_STATUS`, seguindo o padrão das entradas já existentes na tabela (403 porque o
> bloco existe visivelmente dentro da congregação do publicador — a barreira aqui não é de
> existência, como no 404 do `NotFoundError`, e sim de permissão sobre um recurso que ele já sabe
> que existe). Toque apenas `server/app/main.py`.

---

### Task 11 — Integração: designação e marcação restrita, ponta a ponta

**Objetivo:** Cobrir o fluxo completo por HTTP: admin designa, publicador vê a designação, marca
dentro do território designado com sucesso, e é rejeitado fora dele.
**Camadas:** Integração (`server/tests/integration/`)
**Modo:** TDD
**Depende de:** Task 05, Task 06, Task 07, Task 08, Task 09, Task 10
**Instrução para o subagente:**
> Spec 0005 — Task 11: Implemente por TDD. Crie
> `server/tests/integration/test_territory_assignment_integration.py`, seguindo exatamente o padrão
> dos outros arquivos em `server/tests/integration/` (app FastAPI real sobre o Postgres real, tudo
> criado por HTTP exceto a congregação). Cenários a cobrir, cada um subindo o próprio território,
> quadra e publicador pelo fluxo HTTP real:
> - Admin cria um território e um publicador, designa o publicador ao território
>   (`PATCH /admin/territories/{id}/assignment`), e `GET /admin/territories` devolve o território
>   com `assigned_user` preenchido com o publicador certo.
> - O publicador ativa o app (`POST /app/activate`) e `GET /app/territories` mostra o mesmo
>   `assigned_user` no território designado a ele.
> - O publicador marca uma quadra desse território (`POST /app/blocks/{id}/worked`) e recebe 201;
>   `GET /app/worked-territories` passa a listar esse território com a data marcada.
> - Um segundo publicador, sem designação nenhuma, tenta marcar uma quadra de **qualquer**
>   território dessa congregação e recebe 403 com `code == "territory_not_assigned"`; nenhum log é
>   criado (confirme consultando o histórico do bloco pelo admin,
>   `GET /admin/blocks/{id}/work-logs` ou rota equivalente já existente).
> - O admin remove a designação (`PATCH .../assignment` com `user_id: null`); uma nova tentativa de
>   marcação do primeiro publicador nesse mesmo território também passa a receber 403.
> Toque apenas o arquivo de teste novo; não modifique código de produção — se algum cenário falhar
> por um bug de fiação (não de regra de negócio, que já foi testada nas Tasks 05/06), corrija o
> arquivo mínimo necessário das Tasks 08/09/10 e registre isso na conclusão da task.

---

### Task 12 — Remover `packages/core` (Dart) e seu workflow de CI

**Objetivo:** Nada mais usa o pacote Dart compartilhado depois que o app vira React Native.
**Camadas:** estrutural, fora da árvore de camadas do servidor/admin/app
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0005 — Task 12: Remova o diretório `packages/core/` inteiro e o arquivo
> `.github/workflows/core.yml` (o workflow de CI que só existia para testar aquele pacote). Não
> mexa em mais nada — o `AGENTS.md` é atualizado à parte, na Task 27, depois que a nova stack do
> app estiver de fato implementada. Confirme com `grep -rn "packages/core"` na raiz do repositório
> (fora de `.git/`) que não sobrou nenhuma referência em código ativo (arquivos de configuração,
> `pubspec.yaml` de outros pacotes, etc.) antes de finalizar; referências dentro de `AGENTS.md` são
> esperadas e ficam para a Task 27.

---

### Task 13 — Admin: modelo e contrato IPC de designação

**Objetivo:** O lado `shared/` do admin passa a conhecer a designação de território.
**Camadas:** Shared (admin)
**Modo:** direto
**Depende de:** Task 08
**Instrução para o subagente:**
> Spec 0005 — Task 13: Em `admin/src/shared/models.ts`, adicione `readonly assignedUser?:
> PublisherBrief` à interface `Territory` (documente com um comentário curto igual ao estilo do
> arquivo: `undefined`/ausente significa território sem designação). Em
> `admin/src/shared/ipc-contract.ts`, adicione o canal `territoriesAssign: 'territories:assign'` em
> `IPC_CHANNELS`, e o método `assign(territoryId: string, userId: string | null): Promise<Territory>`
> dentro de `IpcApi.territories`, com um comentário curto explicando que `userId: null` remove a
> designação. Toque apenas esses dois arquivos; não implemente ainda o handler nem a chamada HTTP —
> isso é a Task 14.

---

### Task 14 — Admin: cliente da API e handler IPC de designação

**Objetivo:** Ligar o novo canal IPC à chamada HTTP real `PATCH /admin/territories/{id}/assignment`.
**Camadas:** Main, Preload (admin)
**Modo:** direto
**Depende de:** Task 13
**Instrução para o subagente:**
> Spec 0005 — Task 14: Em `admin/src/main/api-client.ts`, adicione o método que chama
> `PATCH /admin/territories/{territoryId}/assignment` com corpo `{"user_id": userId}`, seguindo
> exatamente o padrão dos outros métodos de escrita já existentes no arquivo (tratamento de erro,
> anexação do token, etc.). Em `admin/src/main/ipc-handlers.ts`, registre o handler para
> `IPC_CHANNELS.territoriesAssign`, chamando esse método do cliente. Em `admin/src/preload/index.ts`
> e `admin/src/preload/index.d.ts`, implemente `territories.assign` repassando para
> `ipcRenderer.invoke`, mesmo padrão dos demais métodos de `territories`. Toque apenas esses quatro
> arquivos; não modifique o renderer — isso é a Task 15.

---

### Task 15 — Admin: tela de designar publicador a um território

**Objetivo:** Interface para o admin atribuir/remover a designação, na tela onde ele já gerencia
territórios.
**Camadas:** Renderer (admin)
**Modo:** TDD
**Depende de:** Task 14
**Instrução para o subagente:**
> Spec 0005 — Task 15: Implemente por TDD, em `admin/src/renderer/screens/HomeScreen.tsx` e seu
> teste `HomeScreen.test.tsx`. Adicione ao menu "⋮" que já existe por território (mesmo padrão da
> Task de spec 0004 que trocou os três botões visíveis por esse menu) a ação "Atribuir a
> publicador", que abre um diálogo (`role="dialog"`, mesmo estilo dos diálogos já existentes na
> tela) listando os publicadores **ativos** (`window.api.publishers.list()`, filtrando
> `isActive`) como opções selecionáveis, mais uma opção "Nenhum" para remover a designação. Ao
> confirmar, chama `window.api.territories.assign(territoryId, publisherId | null)` e recarrega a
> lista de territórios; a linha do território passa a mostrar o nome do publicador designado (ou
> nada, se nenhum). Comportamentos observáveis a cobrir com teste (RTL, mesmo padrão de
> `runWrite`/`parseIpcError` já usado na tela para outras ações):
> - Caminho feliz: abrir o diálogo, escolher um publicador ativo, confirmar → chama `assign` com o
>   `id` certo, a lista recarrega e a linha do território mostra o nome desse publicador.
> - Caminho feliz: escolher "Nenhum" e confirmar → chama `assign(territoryId, null)`, a linha volta
>   a não mostrar publicador nenhum.
> - Erro: a chamada IPC rejeita → aparece um toast com a mensagem de erro, mesmo padrão já usado
>   pelas outras ações da tela; a lista não é recarregada incorretamente.
> - Borda: publicadores desativados (`isActive: false`) não aparecem como opção no diálogo.
> Toque apenas `admin/src/renderer/screens/HomeScreen.tsx` e seu arquivo de teste; se for preciso um
> pequeno ajuste de CSS para o novo diálogo, ele vai em `admin/src/renderer/index.css`, seguindo as
> classes já existentes para diálogos — não crie um arquivo de estilo novo.

---

### Task 16 — App: scaffold do projeto React Native

**Objetivo:** O esqueleto do projeto `app/` em React Native (CLI puro, TypeScript), com as três
camadas, navegação, lint e testes prontos para as tasks seguintes escreverem código de verdade.
**Camadas:** estrutural, cria `app/` inteiro
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0005 — Task 16: Crie o projeto React Native em `app/` (CLI puro — `npx @react-native-community/cli
> init`, ou equivalente, com template TypeScript; **não** use Expo). Alvo Android apenas (não é
> necessário configurar o alvo iOS — pode removê-lo se o template gerar). Adicione as dependências
> que as tasks seguintes vão usar: `@maplibre/maplibre-react-native`, `react-native-geolocation-service`,
> `react-native-keychain`, `@react-native-async-storage/async-storage`, `@react-navigation/native` +
> `@react-navigation/native-stack` (e as dependências nativas que o React Navigation pede —
> `react-native-screens`, `react-native-safe-area-context`), `react-native-config`, `uuid` (para
> gerar `log_id` no cliente) e, como dependências de desenvolvimento,
> `@testing-library/react-native` e `jest` (o template já traz Jest — só confira que
> `@testing-library/react-native` funciona com ele). Crie as pastas `app/src/presentation/`,
> `app/src/domain/`, `app/src/data/`, cada uma vazia por enquanto (um `.gitkeep` ou um arquivo
> `index.ts` vazio, o que o template preferir). Configure ESLint com as mesmas regras de
> `typescript-eslint` recomendado usadas no admin (`admin/.eslintrc` ou equivalente, adapte para RN
> — sem warning ignorado). Crie `app/.env.example` com `API_BASE_URL` e `APP_KEY` (mesmo par de
> variáveis do admin), documentado num `app/README.md` novo explicando: como instalar
> (`npm install`), como configurar o `.env` a partir do `.env.example`, como rodar em desenvolvimento
> (`npm run android`, exige um emulador Android ou aparelho conectado) e como gerar o instalável
> (`cd android && ./gradlew assembleRelease`, sem assinatura de código por enquanto — mesmo aviso já
> dado para os binários do admin: o Android vai reclamar de "fonte desconhecida" na instalação, e
> isso é esperado). Rode `npm test` e confirme que passa vazio (sem teste ainda) e `npm run lint`
> sem warning. Este é um scaffold: não escreva nenhuma lógica de domínio, tela ou chamada de API
> aqui — isso é das tasks seguintes.

---

### Task 17 — App/Domain: entidades e regras puras

**Objetivo:** Os tipos do domínio e as funções puras que decidem cor da quadra e se um território
é do publicador logado — sem nenhuma dependência de React Native, HTTP ou armazenamento.
**Camadas:** Domain (app)
**Modo:** TDD
**Depende de:** Task 16
**Instrução para o subagente:**
> Spec 0005 — Task 17: Implemente por TDD. Em `app/src/domain/models.ts`, declare as interfaces
> `Territory`, `Block`, `WorkedTerritory`, `PublisherBrief`, `Session` (token + `PublisherBrief` +
> `congregation`), espelhando os campos que `server/app/schemas/territory.py`,
> `server/app/schemas/block.py`, `server/app/schemas/work_log.py` e
> `server/app/schemas/user.py::ActivateOut` devolvem (mesmo espírito de
> `admin/src/shared/models.ts`, que já existe e pode servir de referência direta para os campos e
> convenções de nome — `camelCase` no TS, `lastWorkedAt?: Date`, etc.). Em
> `app/src/domain/blockColor.ts`, porte `blockColorCategory` e a constante `OVERDUE_AFTER_MS`
> exatamente como estão em `admin/src/renderer/map/blockColor.ts` (mesmo limiar de 120 dias, mesma
> lógica `never`/`overdue`/`recent`) — pode copiar a lógica, já que o app não depende do admin. Em
> `app/src/domain/assignment.ts`, adicione `isTerritoryAssignedToMe(territory: Territory, userId:
> string): boolean`, verdadeiro somente quando `territory.assignedUser?.id === userId`. Testes
> (Jest puro, sem RTL, mesmo espírito de `admin/src/renderer/map/blockColor.test.ts`) cobrindo:
> - `blockColorCategory`: `never` quando `lastWorkedAt` é ausente; `overdue` quando o tempo desde a
>   última visita é estritamente maior que 120 dias; `recent` inclusive exatamente nos 120 dias.
> - `isTerritoryAssignedToMe`: verdadeiro só quando o `id` do `assignedUser` bate com o `userId`
>   passado; falso quando `assignedUser` é `undefined`, e falso quando é de outra pessoa.
> Toque apenas os três arquivos de `app/src/domain/` citados e seus testes; não importe nada de
> `react-native` aqui.

---

### Task 18 — App/Data: cliente HTTP da API

**Objetivo:** O único lugar do app que fala com o servidor.
**Camadas:** Data (app)
**Modo:** TDD
**Depende de:** Task 16
**Instrução para o subagente:**
> Spec 0005 — Task 18: Implemente por TDD. Em `app/src/data/api-client.ts`, crie o cliente HTTP do
> app: `activate(accessCode: string): Promise<{token: string; user: PublisherBrief; congregation:
> Congregation}>` (`POST /app/activate`), `listTerritories(token: string): Promise<Territory[]>`
> (`GET /app/territories`), `listWorkedTerritories(token: string): Promise<WorkedTerritory[]>`
> (`GET /app/worked-territories`), `markBlockWorked(token: string, blockId: string, logId: string,
> workedAt: Date): Promise<void>` (`POST /app/blocks/{id}/worked`, aceita tanto 201 quanto 200 como
> sucesso). Toda chamada injeta o header `X-App-Key` (lido de `react-native-config`, mesmo par
> `API_BASE_URL`/`APP_KEY` da Task 16) e, quando um token é passado, `Authorization: Bearer
> <token>`. Erros de resposta não-2xx viram uma exceção tipada `ApiErrorException` carregando
> `code` e a mensagem (`detail`) do corpo `{"code", "detail"}` que o servidor sempre devolve — mesmo
> contrato que `admin/src/shared/api-errors.ts` já modela para o admin (pode replicar a mesma forma
> de exceção, adaptada ao `fetch` do React Native em vez do cliente do admin). Comportamentos
> observáveis a cobrir com teste (usando um `fetch` fake injetado, nunca uma chamada de rede real,
> mesmo espírito de `admin/src/main/api-client.test.ts`):
> - Caminho feliz de cada um dos quatro métodos: monta a URL, o método HTTP e os headers certos, e
>   decodifica a resposta 2xx no formato esperado.
> - `markBlockWorked` trata tanto 201 quanto 200 como sucesso, sem lançar erro em nenhum dos dois.
> - Erro: uma resposta não-2xx (ex.: 403 com `{"code": "territory_not_assigned", "detail": "..."}`)
>   vira `ApiErrorException` com esses mesmos `code`/`detail` acessíveis.
> - Borda: uma falha de rede (fetch rejeita) vira um tipo de erro distinguível de `ApiErrorException`
>   (ex.: `NetworkException`), para a Task 20 poder decidir "tentar de novo depois" só nesse caso.
> Toque apenas `app/src/data/api-client.ts` e seu teste; não importe `react-native-keychain` nem
> `AsyncStorage` aqui — quem guarda o token é a Task 19, e quem chama este cliente com o token já
> lido são as telas.

---

### Task 19 — App/Data: armazenamento seguro do token de sessão

**Objetivo:** Guardar o token do app com segurança no aparelho, e nunca o código de acesso (que é
descartável).
**Camadas:** Data (app)
**Modo:** TDD
**Depende de:** Task 16
**Instrução para o subagente:**
> Spec 0005 — Task 19: Implemente por TDD. Em `app/src/data/session-store.ts`, usando
> `react-native-keychain`, crie `saveSession(session: Session): Promise<void>`,
> `getSession(): Promise<Session | null>` e `clearSession(): Promise<void>` — `Session` é o tipo da
> Task 17 (token + `PublisherBrief` + `Congregation`, serializado como JSON dentro do keychain).
> Nunca guarde o código de acesso — ele nem chega a este módulo, só o token já trocado. Comportamentos
> a cobrir com teste, com `react-native-keychain` mockado (nunca o keychain real — mesmo princípio
> de `admin/src/main/credentials-store.test.ts`, que mocka o `safeStorage` do Electron):
> - Caminho feliz: `saveSession` seguido de `getSession` devolve exatamente o que foi salvo.
> - Caminho feliz: `getSession` sem nada salvo devolve `null`, não lança erro.
> - Caminho feliz: `clearSession` seguido de `getSession` devolve `null`.
> Toque apenas `app/src/data/session-store.ts` e seu teste.

---

### Task 20 — App/Data: fila offline de marcações

**Objetivo:** Uma quadra marcada sem sinal entra numa fila local e é enviada quando houver rede,
sem duplicar nem perder marcações.
**Camadas:** Data (app)
**Modo:** TDD
**Depende de:** Task 18
**Instrução para o subagente:**
> Spec 0005 — Task 20: Implemente por TDD. Em `app/src/data/work-log-queue.ts`, usando
> `@react-native-async-storage/async-storage` para persistir um array JSON, crie:
> `enqueue(blockId: string, workedAt: Date): Promise<void>` (gera um `logId` novo com `uuid` e
> adiciona `{logId, blockId, workedAt}` à fila persistida — a UI já pode mostrar a quadra como
> concluída na hora, antes de qualquer sincronização, é o que a regra de negócio já documentada no
> `AGENTS.md` pede), `drain(token: string): Promise<void>` (percorre a fila, chama
> `markBlockWorked` da Task 18 para cada item; um item que sincroniza com sucesso — 200 ou 201 —
> **sai** da fila; um item que falha por `NetworkException` **permanece** na fila para a próxima
> tentativa; um item que falha por `ApiErrorException` também sai da fila e é reportado ao chamador
> como falha definitiva, já que reenviar o mesmo `logId` de novo não vai mudar o resultado de um
> erro de regra de negócio), e `pending(): Promise<QueuedWorkLog[]>` (o que ainda não sincronizou,
> para a tela de mapa poder mostrar algo como "2 marcações pendentes de envio"). Comportamentos a
> cobrir com teste (com o cliente HTTP da Task 18 injetado como fake, e `AsyncStorage` real em
> memória — `@react-native-async-storage/async-storage/jest/async-storage-mock` ou equivalente):
> - Caminho feliz: `enqueue` seguido de `drain` bem-sucedido remove o item da fila.
> - Erro de rede: `drain` que falha por `NetworkException` mantém o item na fila.
> - Erro de regra: `drain` que falha por `ApiErrorException` remove o item da fila e reporta a
>   falha ao chamador (não fica tentando para sempre algo que o servidor já rejeitou).
> - Borda: marcar a mesma quadra duas vezes antes de sincronizar gera dois `logId` diferentes na
>   fila — são duas visitas legítimas, não uma duplicata (regra já descrita no `AGENTS.md`: "quadra
>   trabalhada de novo" é um registro novo, não um erro).
> - Borda: um item que o servidor responde com 200 (já existia, reenvio reconhecido) sai da fila do
>   mesmo jeito que um 201.
> Toque apenas `app/src/data/work-log-queue.ts` e seu teste; não importe telas nem navegação.

---

### Task 21 — App/Data: cache local de territórios e quadras

**Objetivo:** O app consegue desenhar o último mapa conhecido mesmo sem sinal.
**Camadas:** Data (app)
**Modo:** TDD
**Depende de:** Task 18
**Instrução para o subagente:**
> Spec 0005 — Task 21: Implemente por TDD. Em `app/src/data/territory-cache.ts`, usando
> `AsyncStorage`, crie `saveTerritories(territories: Territory[]): Promise<void>` e
> `getCachedTerritories(): Promise<Territory[] | null>` (`null` quando nunca houve um `save`
> anterior — o chamador decide o que fazer nesse caso, ex.: mapa vazio com aviso). Adicione também
> `clearCache(): Promise<void>`, para ser chamado quando a Task 26 detectar que o token foi
> revogado/expirou e a sessão for limpa — dado de outra congregação não deve sobreviver a uma troca
> de código de acesso no mesmo aparelho. Comportamentos a cobrir com teste (`AsyncStorage` real em
> memória, mesmo mock da Task 20):
> - Caminho feliz: `saveTerritories` seguido de `getCachedTerritories` devolve exatamente a lista
>   salva.
> - Caminho feliz: `getCachedTerritories` sem nenhum `save` anterior devolve `null`.
> - Caminho feliz: `clearCache` seguido de `getCachedTerritories` devolve `null`.
> Toque apenas `app/src/data/territory-cache.ts` e seu teste.

---

### Task 22 — App/Presentation: tela de ativação por código

**Objetivo:** A primeira tela que o publicador vê: digitar o código de acesso e confirmar via
servidor.
**Camadas:** Presentation (app)
**Modo:** TDD
**Depende de:** Task 18, Task 19
**Instrução para o subagente:**
> Spec 0005 — Task 22: Implemente por TDD. Em `app/src/presentation/screens/ActivationScreen.tsx`,
> um campo de texto para o código de acesso e um botão "Confirmar", que chama `activate` (Task 18)
> e, em caso de sucesso, salva a sessão (`saveSession`, Task 19) e navega para o dashboard (a
> navegação em si é só fiada de verdade na Task 26 — aqui, receba a função de navegação por prop,
> ex. `onActivated: (session: Session) => void`, para o componente ser testável isolado). Use
> `@testing-library/react-native` (`render`, `fireEvent`, `waitFor`), mesmo espírito dos testes de
> tela do admin (`admin/src/renderer/screens/SetupScreen.test.tsx` é a referência mais próxima —
> também é "primeira tela, credencial única, chamada ao backend"). Comportamentos a cobrir:
> - Caminho feliz: digitar um código e confirmar chama `activate` com o código digitado, salva a
>   sessão e chama `onActivated` com o resultado.
> - Erro: `activate` rejeita (código inválido/expirado/já usado) → mostra uma mensagem genérica na
>   tela (a mesma para os três casos — o servidor já não diferencia, e a tela não deve inventar uma
>   diferença que não existe), sem navegar.
> - Borda: o botão "Confirmar" fica desabilitado enquanto o campo está vazio.
> Toque apenas esse arquivo e seu teste.

---

### Task 23 — App/Presentation: tela de dashboard

**Objetivo:** Lista de territórios trabalhados com data, e o(s) território(s) designado(s) ao
publicador.
**Camadas:** Presentation (app)
**Modo:** TDD
**Depende de:** Task 18
**Instrução para o subagente:**
> Spec 0005 — Task 23: Implemente por TDD. Em `app/src/presentation/screens/DashboardScreen.tsx`,
> recebendo a `Session` já ativa por prop, ao montar busca `listWorkedTerritories` e
> `listTerritories` (Task 18) e mostra duas seções: (1) "Territórios trabalhados", uma lista com
> nome do território e a data mais recente formatada (ex. `toLocaleDateString`), na ordem em que o
> servidor já devolve (mais recente primeiro — a Task 04/07 do servidor já ordena assim, a tela não
> precisa reordenar); (2) "Território(s) designado(s)", filtrando `listTerritories` por
> `isTerritoryAssignedToMe` (Task 17) com o `id` do publicador da sessão, cada um com um botão "Ver
> no mapa" que recebe uma prop `onOpenMap: (territory: Territory) => void` (a navegação real é
> fiada na Task 26). Comportamentos a cobrir com teste (RTL):
> - Caminho feliz: territórios trabalhados aparecem com nome e data.
> - Caminho feliz: quando há território(s) designado(s), a seção 2 lista cada um com seu botão "Ver
>   no mapa"; clicar chama `onOpenMap` com o território certo.
> - Borda: sem nenhum território designado, a seção 2 mostra uma mensagem explicando isso (algo
>   como "Nenhum território designado no momento — fale com quem cuida dos territórios na
>   congregação"), sem lista vazia silenciosa.
> - Borda: sem nenhum território trabalhado ainda, a seção 1 mostra "Nenhuma quadra trabalhada
>   ainda" em vez de uma lista vazia.
> Toque apenas esse arquivo e seu teste.

---

### Task 24 — App/Presentation: lógica pura do filtro do mapa

**Objetivo:** Decidir quais territórios o mapa mostra, dado o estado do filtro — sem nenhum código
de mapa nele, só a regra.
**Camadas:** Presentation (app) — lógica pura, sem view nativa
**Modo:** TDD
**Depende de:** Task 17
**Instrução para o subagente:**
> Spec 0005 — Task 24: Implemente por TDD. Em `app/src/presentation/map/territoryFilter.ts`, defina
> o tipo `MapFilter = {mode: 'assigned'} | {mode: 'all'} | {mode: 'specific'; territoryId: string}`
> e a função `visibleTerritories(all: Territory[], filter: MapFilter, myUserId: string):
> Territory[]`: em `'assigned'`, devolve só os territórios com `isTerritoryAssignedToMe` (Task 17)
> verdadeiro para `myUserId`; em `'all'`, devolve `all` sem filtrar; em `'specific'`, devolve só o
> território cujo `id` bate com `territoryId` (lista vazia se não achar). Adicione também
> `defaultFilter(all: Territory[], myUserId: string): MapFilter`: `{mode: 'assigned'}` quando existe
> pelo menos um território designado ao publicador, senão `{mode: 'all'}` (é o estado inicial da
> tela de mapa — sem designação nenhuma, não faz sentido abrir num filtro que mostraria uma lista
> vazia). Comportamentos a cobrir com teste (Jest puro):
> - `visibleTerritories` nos três modos, incluindo `'specific'` com um `territoryId` que não existe
>   em `all` (lista vazia, não erro).
> - `defaultFilter`: `'assigned'` quando há designação, `'all'` quando não há nenhuma.
> Toque apenas esse arquivo e seu teste; não importe `@maplibre/maplibre-react-native` nem qualquer
> outra dependência de view nativa aqui.

---

### Task 25 — App/Presentation: tela de mapa com MapLibre e localização em tempo real

**Objetivo:** O mapa de verdade: tiles OSM, território(s) e quadras coloridas, localização do
publicador em tempo real, e o toque numa quadra só habilitado dentro de um território designado.
**Camadas:** Presentation (app)
**Modo:** direto
**Depende de:** Task 17, Task 20, Task 24
**Instrução para o subagente:**
> Spec 0005 — Task 25: Em `app/src/presentation/map/TerritoryMapView.tsx`, monte o mapa com
> `@maplibre/maplibre-react-native`: uma fonte de tiles raster apontando para
> `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (mesma URL do admin,
> `admin/src/renderer/map/TerritoryMap.tsx`), com a atribuição "© OpenStreetMap contributors"
> visível na tela (exigência da política de uso do OSM já documentada no `AGENTS.md`) e um
> `User-Agent` identificando o app configurado nas opções do MapLibre (a lib expõe isso via
> `Mapbox.setConnected`/cabeçalhos customizados da fonte de tiles — confira a documentação da
> versão instalada e use o mecanismo que ela oferecer; se a versão não suportar customizar o
> `User-Agent` da fonte raster, documente essa limitação no `README.md` do app em vez de inventar
> uma gambiarra). Desenhe os territórios visíveis (via `visibleTerritories` da Task 24) como contornos,
> e as quadras de cada um coloridas por `blockColorCategory` (Task 17) — mesmas três cores do admin
> (`#c62828` nunca trabalhada, `#ef6c00` vencida, `#2e7d32` recente). Peça permissão
> `ACCESS_FINE_LOCATION` em runtime (`react-native-geolocation-service` +
> `PermissionsAndroid.request`) e mostre a posição do publicador com `watchPosition` enquanto a tela
> estiver montada — pare de observar (`clearWatch`) ao desmontar; a posição nunca é enviada ao
> servidor nem persistida em disco, ela só alimenta o marcador na tela (regra já vigente no
> `AGENTS.md`). Em `app/src/presentation/screens/MapScreen.tsx`, componha `TerritoryMapView` com um
> controle de filtro (um seletor simples: "Meu(s) território(s)" / "Todos" / a lista de territórios
> individuais) inicializado com `defaultFilter` (Task 24), e um `onBlockTap` que só abre uma folha
> de confirmação ("Marcar quadra N como trabalhada?") quando o território daquele bloco está
> designado ao publicador logado (`isTerritoryAssignedToMe`, Task 17) — fora de um território
> designado, o toque não faz nada, ou no máximo mostra as informações da quadra em modo leitura,
> sem opção de marcar. Confirmar a marcação chama `enqueue` (Task 20) e tenta `drain` na hora, se
> houver rede. Este componente depende de uma view nativa de terceiro (MapLibre) e não é
> razoavelmente testável com Jest — não escreva teste para ele; verifique manualmente rodando
> `npm run android` num emulador ou aparelho Android depois que as tasks anteriores estiverem
> prontas, e registre esse passo manual pendente na conclusão da task em vez de forjar um teste que
> não testa nada de verdade. Toque apenas os dois arquivos citados em
> `app/src/presentation/map/` e `app/src/presentation/screens/`.

---

### Task 26 — App/Presentation: navegação raiz e restauração de sessão

**Objetivo:** Ligar Ativação → Dashboard ↔ Mapa de verdade, e pular a tela de ativação quando já
existe uma sessão salva.
**Camadas:** Presentation (app)
**Modo:** TDD
**Depende de:** Task 19, Task 21, Task 22, Task 23, Task 25
**Instrução para o subagente:**
> Spec 0005 — Task 26: Implemente por TDD. Em `app/src/presentation/App.tsx`, usando
> `@react-navigation/native-stack`, monte a navegação entre `ActivationScreen` (Task 22),
> `DashboardScreen` (Task 23) e `MapScreen` (Task 25). No arranque: leia a sessão salva
> (`getSession`, Task 19); se existir, tente validar contra o servidor chamando
> `listTerritories` (Task 18) com o token salvo — sucesso pula direto para o Dashboard sem pedir o
> código de novo, atualizando o cache (`saveTerritories`, Task 21) com a resposta; uma falha por
> `ApiErrorException` (token revogado/versão antiga — mesmo mecanismo de `token_version` do
> `AGENTS.md`) limpa a sessão (`clearSession`) e o cache (`clearCache`, Task 21) e volta para a
> `ActivationScreen`; uma falha por `NetworkException` (sem sinal no arranque) mantém a sessão e
> abre o Dashboard usando o cache local (`getCachedTerritories`, Task 21) em vez de travar o app sem
> conectividade. Comportamentos a cobrir com teste (RTL, mockando as dependências de dados
> injetadas):
> - Caminho feliz: sem sessão salva, abre a `ActivationScreen`.
> - Caminho feliz: com sessão salva e servidor acessível, pula direto para o `DashboardScreen`.
> - Borda: sessão salva mas rejeitada pelo servidor (`ApiErrorException`) volta para a
>   `ActivationScreen` e limpa sessão e cache salvos.
> - Borda: sessão salva mas sem rede (`NetworkException`) abre o `DashboardScreen` mesmo assim,
>   usando os dados em cache.
> Toque apenas `app/src/presentation/App.tsx` e seu teste; se precisar de um ponto de entrada novo
> (`app/index.js` chamando este `App`), ajuste-o também, mas sem lógica adicional nele.

---

### Task 27 — Documentação: atualizar o `AGENTS.md`

**Objetivo:** O `AGENTS.md` passa a descrever o que foi de fato construído: app em React Native,
designação de território no modelo de dados e nas regras de negócio, e o fim de `packages/core`.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** todas as tasks anteriores (01–26)
**Instrução para o subagente:**
> Spec 0005 — Task 27: Atualize `AGENTS.md` para refletir o que esta spec implementou de fato
> (confira o código resultante das tasks anteriores antes de escrever, não descreva o que foi
> planejado e sim o que existe):
> - **Stack Técnica:** troque a linha do "App (Android)" de Flutter/Dart/Riverpod/Drift para React
>   Native (CLI puro) + TypeScript + `@maplibre/maplibre-react-native` + React Navigation, e remova
>   a linha de `packages/core` da tabela (o pacote não existe mais).
>   Adicione uma nota de decisão, no mesmo estilo da nota já existente sobre a troca do admin de
>   Flutter para Electron, explicando que o app trocou de Flutter para React Native nesta spec e
>   por quê (escolha do usuário; `packages/core`, exclusivo do Flutter, foi removido em consequência
>   — Task 12).
> - **Estrutura do Projeto:** substitua a árvore de `app/` (hoje descrita como alvo Flutter) pela
>   árvore real criada nas Tasks 16–26 (`presentation/`, `domain/`, `data/`), e remova
>   `packages/core/` da árvore do monorepo.
> - **Modelo de Dados:** na tabela de `Territory`, adicione a linha `assigned_user_id` (UUID?, FK →
>   User, nullable, `ON DELETE SET NULL`) com uma nota curta explicando a cardinalidade (um
>   território tem no máximo um publicador designado por vez; um publicador pode ter vários
>   territórios).
> - **Regras de Negócio:** adicione uma seção "Designação de território" (no mesmo estilo das
>   seções já existentes — comportamento em bullets, não prosa longa) descrevendo: só o admin
>   designa; um território tem no máximo um publicador por vez; o publicador só pode marcar quadra
>   de um território designado a ele (403, código `territory_not_assigned`); reenvio de uma
>   marcação já aceita não é reavaliado contra uma designação que mudou depois.
> - **Arquitetura e Decisões Técnicas / Arquitetura de Camadas:** adicione a entrada da tabela de
>   camadas do App (Presentation/Domain/Data em React Native, mesma direção de dependência que a
>   Flutter já documentava) e uma nota sobre a escolha de MapLibre Native em vez de `react-native-maps`
>   (mantém a decisão de só usar OSM, sem Google Maps/billing).
> - **Como Rodar / Como Fazer Deploy:** troque os comandos do app Flutter (`flutter pub get`,
>   `flutter run`) pelos comandos reais do app RN documentados no `app/README.md` da Task 16.
> - **Testes:** adicione a linha do app RN na tabela de testes (Jest + Testing Library, comando,
>   local dos arquivos, meta de cobertura — siga o mesmo padrão de rigor já usado para o admin: uma
>   tela, um teste; `data/` coberto por fake de rede/armazenamento; a view nativa do MapLibre
>   deliberadamente sem teste automatizado, mesmo "risco assumido" do Leaflet-Geoman do admin).
> - **Restrições e Cuidados:** confirme que a nota já existente "Localização é dado sensível" segue
>   valendo (ela já cobre o app RN, não precisa duplicar, só confirmar que nada nesta spec violou
>   essa regra).
> Não invente nenhum comportamento que as tasks anteriores não tenham de fato implementado — se
> algo ficou diferente do planejado aqui na spec (ex.: um nome de arquivo, uma lib trocada por
> limitação encontrada na prática), documente o que existe de verdade.

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0005
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências. Dado o
tamanho desta spec (27 tasks, cruzando servidor, admin e um app novo), espere várias rodadas de
paralelismo: a Task 12 (remover `packages/core`) e a Task 16 (scaffold do app) podem rodar desde já
em paralelo com a cadeia toda do servidor (Tasks 01–11); as Tasks 13–15 (admin) só começam depois da
Task 08; a maior parte das Tasks 17–24 (domínio e dados do app) paraleliza entre si assim que a Task
16 termina.

**A Task 25 (mapa nativo) precisa de verificação manual num emulador ou aparelho Android** — nenhum
subagente consegue confirmar visualmente que o MapLibre renderiza e que a localização aparece
corretamente; trate o "verde" dela no checklist como "código escrito, verificação manual pendente"
até alguém rodar `npm run android` de verdade.

Alternativa manual — para cada task, abra um subagente e invoque a skill correspondente ao `Modo` da
task:

```
/centaur-driven-tdd [instrução da task, se Modo: TDD]
/centaur-driven-implement [instrução da task, se Modo: direto]
```

Execute as tasks na ordem indicada, respeitando as dependências.

## Ciclo de vida

- `Pendente` → nenhuma task iniciada
- `Em andamento` → definido pela skill de execução da task (`/centaur-driven-tdd` ou
  `/centaur-driven-implement`) ao iniciar a primeira task, ou pelo `/centaur-driven-run` ao montar o
  plano
- `Concluída` → definido pela skill de execução quando a última task do checklist for marcada
- Tasks bloqueadas ficam anotadas no checklist com o motivo

## Checklist de conclusão

_Atualizado automaticamente pela skill de execução de cada task (`/centaur-driven-tdd` ou
`/centaur-driven-implement`)._

- [x] Task 01 — Exceção de domínio `TerritoryNotAssignedError` → implements/0075
- [x] Task 02 — Modelo: `Territory.assigned_user_id` e migration → implements/0073
- [x] Task 03 — Schemas: designação e território trabalhado → implements/0076
- [x] Task 04 — Repositórios: designação e histórico agregado por publicador → implements/0078
- [x] Task 05 — Service: `TerritoryService.assign_to_user` → implements/0087
- [x] Task 06 — Service: restringir `mark_worked` ao território designado → implements/0081
- [x] Task 07 — Service: territórios trabalhados pelo publicador → implements/0083
- [x] Task 08 — Rota admin: designar território → implements/0091
- [x] Task 09 — Rotas do app: designação visível e histórico de territórios trabalhados → implements/0090
- [x] Task 10 — Core: mapear `TerritoryNotAssignedError` para 403 → implements/0077
- [x] Task 11 — Integração: designação e marcação restrita, ponta a ponta → implements/0094
- [x] Task 12 — Remover `packages/core` (Dart) e seu workflow de CI → implements/0072
- [x] Task 13 — Admin: modelo e contrato IPC de designação → implements/0093
- [x] Task 14 — Admin: cliente da API e handler IPC de designação → implements/0096
- [x] Task 15 — Admin: tela de designar publicador a um território → implements/0097
- [x] Task 16 — App: scaffold do projeto React Native → implements/0074
- [x] Task 17 — App/Domain: entidades e regras puras → implements/0079
- [x] Task 18 — App/Data: cliente HTTP da API → implements/0082
- [x] Task 19 — App/Data: armazenamento seguro do token de sessão → implements/0080
- [x] Task 20 — App/Data: fila offline de marcações → implements/0088
- [x] Task 21 — App/Data: cache local de territórios e quadras → implements/0085
- [x] Task 22 — App/Presentation: tela de ativação por código → implements/0086
- [x] Task 23 — App/Presentation: tela de dashboard → implements/0089
- [x] Task 24 — App/Presentation: lógica pura do filtro do mapa → implements/0084
- [x] Task 25 — App/Presentation: tela de mapa com MapLibre e localização em tempo real → implements/0092 (verificação manual em emulador/aparelho ainda pendente, documentada no `app/README.md`)
- [x] Task 26 — App/Presentation: navegação raiz e restauração de sessão → implements/0095
- [x] Task 27 — Documentação: atualizar o `AGENTS.md` → implements/0098
