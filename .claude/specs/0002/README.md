# [0002] Fechar as divergências do admin desktop

**Data:** 2026-08-05
**Status:** Concluída
**Solicitação original:** "Pode criar um plano para corrigir estas divergências?" — referindo-se ao
levantamento feito sobre o `admin/`: dart-defines de `APP_KEY`/`API_BASE_URL` no build de release,
criação da GitHub Release de fato, apagar quadra pela UI, sair da congregação, testes de widget das
telas, camada `domain/` do admin, README do admin com o aviso do SmartScreen, e o `status.md`
desatualizado.

## Objetivo

Ao término:

1. O binário produzido por uma tag é **instalável e funcional**: sai com o `X-App-Key` e o endereço
   da API embutidos, e chega ao usuário como uma GitHub Release, não como artefato de Actions.
2. O admin consegue **apagar uma quadra** e **sair da congregação** pela interface.
3. As **seis telas têm teste de widget**, encerrando a promessa que o CI já faz e não cumpre.
4. As telas param de falar com o cliente da API direto: passam por **repositórios em
   `admin/lib/data/`**, o que é o que torna os testes acima possíveis com fakes.
5. `CLAUDE.md`, `admin/README.md` e `.claude/implements/status.md` descrevem o que existe de fato.

## Contexto técnico

### Estado atual

`flutter analyze` limpo, 27 testes passando ([polygon_editor_test.dart](../../../admin/test/polygon_editor_test.dart)
e [session_test.dart](../../../admin/test/session_test.dart)). Nenhum teste de widget.

Camadas do admin hoje: `data/` tem só `session.dart`, `credentials_store.dart` e `providers.dart`;
`domain/` não existe; as seis telas em `presentation/` fazem `ref.read(apiProvider)` e chamam
`api.x()` dentro de `ref.read(sessionProvider).run(...)`.

### Decisões já tomadas (não reabrir)

- **Sem camada `domain/`.** Casos de uso no admin seriam repasses de uma linha sobre o cliente da
  API — a regra de negócio vive no servidor. O que entra é a camada de **repositórios em `data/`**,
  cujo valor real é permitir fake nos testes de widget. O `CLAUDE.md` será ajustado para registrar
  essa ausência e o porquê (Task 12), em vez de descrever uma camada que não vai existir.
- **`https://territorymap.dalistor.com.br` já existe e responde com TLS.** É o valor do
  `API_BASE_URL` e continua sendo o default de [config.dart](../../../admin/lib/config.dart).
- **Os valores de `APP_KEY` e `API_BASE_URL` são cadastrados pelo usuário**, não por nenhuma task.
  As tasks escrevem o workflow que os consome e o passo a passo para cadastrá-los.
- **Testes de widget nas seis telas**, não só nos fluxos novos.

### Armadilhas conhecidas

- **`FlutterMap` em teste de widget.** `TerritoryMap`, `TerritoryEditorScreen` e `BlockEditorScreen`
  montam um `FlutterMap` com `TileLayer` apontando para o OSM. Em `flutter_test` a rede é bloqueada
  e o tile falha silenciosamente, mas o mapa **exige tamanho finito** — envolva em
  `MediaQuery`/`SizedBox` com dimensões explícitas. Se o mapa se mostrar instável no teste, a saída
  autorizada é extrair a regra sob teste para uma função pública de nível superior no mesmo arquivo
  (ex.: a cor da quadra) e cobrir o widget de forma mais leve. Não invente injeção de `TileProvider`.
- **`Session` é a única coisa que sabe do token.** Nenhum repositório, provider ou tela pode chamar
  `api.x()` fora de `session.run(...)`; é isso que faz o login silencioso e o retry único no 401
  funcionarem ([session.dart:69](../../../admin/lib/data/session.dart#L69)).
- **`access_code` é credencial.** Nunca em log, nunca em URL. Um teste pode afirmar que ele aparece
  na tela; nenhum teste deve imprimi-lo.
- **Apagar quadra apaga o histórico dela**: `block_work_logs.block_id` é `ON DELETE CASCADE`
  ([block_work_log.py:46](../../../server/app/models/block_work_log.py#L46)). A confirmação precisa
  dizer isso.
- **CI é exigente com formatação**: `dart format --output=none --set-exit-if-changed lib test` roda
  no job `admin` de [core.yml](../../../.github/workflows/core.yml). Toda task termina com
  `dart format lib test`, `flutter analyze` e `flutter test` verdes em `admin/`.
- **Numeração de `.claude/implements/`**: a Task 01 roda primeiro justamente para reservar os
  números retroativos antes que as skills de execução comecem a criar os seus.

### Superfície do cliente da API (`packages/core`)

Já existe tudo de que o admin precisa — inclusive `deleteBlock`, hoje sem nenhum chamador:
`login`, `listPublishers`, `createPublisher`, `regenerateAccessCode`, `setPublisherActive`,
`listTerritories`, `getTerritory`, `createTerritory`, `updateTerritory`, `deleteTerritory`,
`createBlock`, `updateBlock`, `deleteBlock`, `listWorkLogs`, `deleteWorkLog`.

## Tasks

### Task 01 — Registrar `packages/core` e o admin no histórico de implementações

**Objetivo:** `.claude/implements/status.md` deixa de parar em 0024 e passa a cobrir o pacote
compartilhado e o admin, que já estão no código.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0002 — Task 01: O histórico em `.claude/implements/status.md` para na entrada 0024, mas
> quatro commits de feature já entraram depois dela: `e4af19a` (pacote Dart compartilhado com
> modelos, cliente da API e geo), `38eccd6` (primeira fatia do admin — login silencioso e mapa),
> `12c95fe` (editor de polígono, quadras, publicadores e histórico) e os dois de CI `0b693aa` /
> `d1153bd` / `9165f19` (workflows `core.yml` e `admin-release.yml`). Crie retroativamente as pastas
> `.claude/implements/0025/`, `0026/` e `0027/` com um `README.md` cada, seguindo o formato de
> `.claude/implements/0024/README.md` (título, Data, Status `Concluído`, Modo, Solicitação, Contexto,
> Critérios de aceite, e as decisões relevantes). Distribua assim: **0025** = pacote `packages/core`
> (modelos imutáveis, `TerritoryMapApi`, `LatLng`/GeoJSON e `validateRing`, com os testes em
> `packages/core/test/`); **0026** = admin, primeira fatia (configuração inicial em
> `SetupScreen`, `CredentialsStore` sobre `flutter_secure_storage`, `Session` com login silencioso e
> retry único no 401, `HomeScreen` e `TerritoryMap`); **0027** = admin, segunda fatia
> (`PolygonEditorController` com undo próprio envolvendo o `PolyEditor`, editores de território e de
> quadra, `PublishersScreen` e o histórico de trabalho por quadra). Use as datas reais dos commits
> (`git log --format='%h %ad %s' --date=short`). Não invente ciclos TDD que não aconteceram: onde
> não houver teste, descreva o que foi entregue e diga francamente o que ficou sem cobertura —
> as telas não têm teste de widget, e a Spec 0002 é o que resolve isso. Adicione as três linhas na
> tabela de `status.md`, com os arquivos afetados de cada uma. Toque apenas em `.claude/implements/`;
> não modifique nenhum arquivo de código.

---

### Task 02 — Build de release: dart-defines e uma GitHub Release de verdade

**Objetivo:** a tag `v*` passa a produzir binários configurados e publicados numa Release.
**Camadas:** CI/CD
**Modo:** direto
**Depende de:** —
**Instrução para o subagente:**
> Spec 0002 — Task 02: `.github/workflows/admin-release.yml` tem dois defeitos. **(a)** roda
> `flutter build ${{ matrix.target }} --release` sem nenhum `--dart-define`, e as duas constantes de
> `admin/lib/config.dart` são `String.fromEnvironment` — o binário publicado sai com `appKey` vazio,
> e com `APP_SECRET` configurado no servidor todo request dele toma 401. **(b)** o workflow se chama
> `admin-release`, o comentário no topo promete anexar os binários a uma GitHub Release e tem
> `permissions: contents: write`, mas o último passo é `actions/upload-artifact` — artefato de
> Actions expira em 90 dias e exige estar logado no GitHub.
>
> Corrija os dois. No job `build`: passe
> `--dart-define=APP_KEY=${{ secrets.APP_KEY }} --dart-define=API_BASE_URL=${{ vars.API_BASE_URL }}`
> no `flutter build`, e **antes dele** um passo que falha se qualquer um dos dois estiver vazio, com
> mensagem dizendo exatamente o que cadastrar e onde — publicar um binário silenciosamente quebrado é
> pior do que não publicar. Acrescente um job `release` com `needs: build`, condicionado a
> `startsWith(github.ref, 'refs/tags/')` (o `workflow_dispatch` continua produzindo só artefatos,
> porque não há tag para anexar), que baixa os dois artefatos com `actions/download-artifact`,
> compacta cada um (`zip -r` para Windows, `tar -czf` para Linux) e cria a Release com o `gh` CLI já
> presente no runner — `gh release create "$GITHUB_REF_NAME" --generate-notes <arquivos>` — usando
> `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Nada de action de terceiro para isso. O corpo da release
> deve avisar que os binários **não são assinados** e que o Windows SmartScreen vai reclamar na
> primeira execução, apontando para `admin/README.md`. Atualize o comentário do topo do arquivo para
> descrever o que o workflow faz de verdade, incluindo quais secret e variable ele exige. **Não
> cadastre secret nem variable** — quem faz isso é o usuário; a Task 03 documenta o passo a passo.
> Valide com `actionlint` se disponível, ou releia o YAML com atenção. Toque apenas em
> `.github/workflows/admin-release.yml`; não modifique código nem o README.

---

### Task 03 — README do admin: como rodar, como configurar o build e o aviso do SmartScreen

**Objetivo:** `admin/README.md` deixa de ser o boilerplate do `flutter create`.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Task 02
**Instrução para o subagente:**
> Spec 0002 — Task 03: `admin/README.md` é o texto padrão gerado pelo `flutter create` ("A new
> Flutter project"). Reescreva-o em português, no tom do `server/README.md`, cobrindo: **(1)** o que
> é o admin (aplicativo desktop do responsável pelos territórios, Windows e Linux, uma congregação
> por instalação, sem tela de login depois da primeira execução); **(2)** como rodar localmente —
> `flutter pub get` e `flutter run -d chrome` (o alvo entregue é Windows/Linux, mas o
> desenvolvimento roda no Chrome porque a máquina de desenvolvimento não tem o Xcode completo),
> incluindo como passar `--dart-define=API_BASE_URL=...` e `--dart-define=APP_KEY=...` para apontar
> para um servidor local; **(3)** os dois valores que precisam estar cadastrados no GitHub para a
> release funcionar — o **secret** `APP_KEY` (mesmo valor do `APP_SECRET` do servidor) e a
> **variable** `API_BASE_URL` (`https://territorymap.dalistor.com.br`) —, com os comandos
> `gh secret set APP_KEY` e `gh variable set API_BASE_URL` e a observação de que sem eles o job de
> release falha de propósito, em vez de publicar um binário que não fala com o servidor; **(4)** como
> sair uma release: `git tag v0.1.0 && git push origin v0.1.0`; **(5)** uma seção **"O Windows vai
> avisar que o programa não é confiável"** explicando que os binários não são assinados (certificado
> custa dinheiro), que na primeira execução o SmartScreen mostra "O Windows protegeu o computador" e
> que o caminho é *Mais informações → Executar assim mesmo*; **(6)** como rodar os testes
> (`flutter test`) e o que o CI checa. Não invente comandos: confira contra
> `.github/workflows/admin-release.yml` e `.github/workflows/core.yml` como eles estão depois da
> Task 02. Toque apenas em `admin/README.md`.

---

### Task 04 — Repositórios em `admin/lib/data/`

**Objetivo:** existe uma camada de dados com interface própria, sobre a qual os testes de widget
podem montar fakes sem simular HTTP.
**Camadas:** Data
**Modo:** TDD
**Depende de:** —
**Instrução para o subagente:**
> Spec 0002 — Task 04: Implemente por TDD. Hoje as telas do admin chamam
> `ref.read(apiProvider)` e montam a chamada dentro de `ref.read(sessionProvider).run(...)` — o que
> deixa a presentation conhecendo o cliente HTTP e torna teste de widget caro. Crie a camada de
> repositórios em `admin/lib/data/`, um arquivo por entidade, cada um com uma
> `abstract interface class` e uma implementação sobre `TerritoryMapApi` + `Session`:
>
> - `territory_repository.dart` — `Future<List<Territory>> listWithBlocks()` (lista os resumos e
>   busca o detalhe de cada um, como o `territoriesProvider` faz hoje em `data/providers.dart`),
>   `create({required String name, required List<LatLng> boundary})`,
>   `update(String id, {String? name, List<LatLng>? boundary})`, `delete(String id)`
> - `block_repository.dart` — `create({required String territoryId, required List<LatLng> polygon, int? number})`,
>   `update(String id, {List<LatLng>? polygon, int? number})`, `delete(String id)`
> - `publisher_repository.dart` — `list()`, `create(String name)`, `regenerateCode(String id)`,
>   `setActive(String id, bool isActive)`
> - `work_log_repository.dart` — `listFor(String blockId)`, `delete(String logId)`
>
> **Toda** operação passa por `session.run(...)`: é o que garante o login silencioso e o retry único
> no 401, e nenhuma camada acima pode saber que existe token. Registre um provider por repositório em
> `admin/lib/data/providers.dart` (`territoryRepositoryProvider`, `blockRepositoryProvider`,
> `publisherRepositoryProvider`, `workLogRepositoryProvider`), mantendo `apiProvider`,
> `sessionProvider` e `isConfiguredProvider` como estão. **Não** renomeie nem redefina
> `territoriesProvider` nesta task, e **não** crie providers com os nomes `publishersProvider` ou
> `workLogsProvider` — eles ainda existem dentro de arquivos de `presentation/` e um homônimo aqui
> tornaria a referência ambígua e quebraria o `analyze`; quem move os três é a Task 05.
>
> Critérios de aceite, como comportamentos observáveis (use o `FakeServer`/`MockClient` de
> `test/session_test.dart` como modelo, num novo `test/repositories_test.dart`): **(1)** a primeira
> chamada de cada repositório dispara o login automático antes da requisição de negócio — a sequência
> de paths começa em `/auth/login`; **(2)** `listWithBlocks()` faz um `GET /admin/territories` e
> depois um `GET /admin/territories/{id}` por território, devolvendo os detalhes com as quadras;
> **(3)** um 401 no meio de uma operação faz o repositório logar de novo e repetir a chamada uma
> única vez, e o chamador recebe o resultado sem ver o 401; **(4)** `BlockRepository.delete` emite
> `DELETE /admin/blocks/{id}`; **(5)** `PublisherRepository.setActive` envia o valor booleano
> recebido, sem invertê-lo; **(6)** um erro que não é 401 sobe como `ApiException` sem nova tentativa
> de login. Termine com `dart format lib test`, `flutter analyze` e `flutter test` verdes em
> `admin/`. Toque apenas em `admin/lib/data/` e `admin/test/`; não modifique nada em
> `admin/lib/presentation/` nem em `packages/core/`.

---

### Task 05 — As telas passam a falar com os repositórios

**Objetivo:** nenhuma tela do admin conhece mais `TerritoryMapApi` nem `Session`.
**Camadas:** Presentation (e os providers de `data/providers.dart`)
**Modo:** direto
**Depende de:** Task 04
**Instrução para o subagente:**
> Spec 0002 — Task 05: Com os repositórios da Task 04 no lugar, remova o cliente da API de dentro das
> telas. Em `admin/lib/data/providers.dart`: reescreva `territoriesProvider` para chamar
> `ref.watch(territoryRepositoryProvider).listWithBlocks()`, e traga para cá o `publishersProvider`
> (hoje no topo de `presentation/publishers_screen.dart`) e o `workLogsProvider`
> (hoje no topo de `presentation/block_history_sheet.dart`), agora sobre os repositórios
> correspondentes — mesmos nomes, mesmos tipos, para que as telas mudem só o import. Em seguida
> ajuste as seis telas (`home_screen.dart`, `setup_screen.dart`, `publishers_screen.dart`,
> `territory_editor_screen.dart`, `block_editor_screen.dart`, `block_history_sheet.dart`): troque
> cada `ref.read(apiProvider)` + `session.run(() => api.x(...))` pela chamada direta ao repositório,
> e apague as definições de provider que foram movidas. `SetupScreen` continua usando
> `sessionProvider.configure(...)` — a configuração inicial é da sessão, não de um repositório, e é o
> único ponto que legitimamente conhece as credenciais. O tratamento de erro fica como está: capturar
> `ApiException` e mostrar a `error.message` (banner nos editores, `SnackBar` nas listas). Nenhuma
> mudança de comportamento visível ao usuário nesta task — é rewiring. Termine com
> `dart format lib test`, `flutter analyze` e `flutter test` verdes em `admin/`, e confirme que
> `grep -rn "apiProvider" admin/lib/presentation` não retorna nada. Toque apenas em
> `admin/lib/presentation/` e em `admin/lib/data/providers.dart`; não altere as interfaces dos
> repositórios nem `packages/core/`.

---

### Task 06 — Apagar quadra pela interface

**Objetivo:** o admin consegue remover uma quadra desenhada errado.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0002 — Task 06: Implemente por TDD. `deleteBlock` existe em `packages/core` e no
> `BlockRepository`, mas nenhuma tela do admin chama: dá para apagar um território
> (`home_screen.dart`, `_deleteTerritory`) e um registro de trabalho
> (`block_history_sheet.dart`), mas não uma quadra — desenhou errado, fica lá para sempre.
> Acrescente a opção ao bottom sheet que já abre ao tocar no número de uma quadra no mapa
> (`_blockActions` em `admin/lib/presentation/home_screen.dart`), abaixo de "Ver histórico" e
> "Editar contorno ou número", e siga o padrão de confirmação já usado em `_deleteTerritory`.
>
> Critérios de aceite, como comportamentos observáveis (teste de widget novo em
> `admin/test/block_delete_test.dart`, com um fake de `BlockRepository` sobreposto por
> `ProviderScope(overrides: ...)`): **(1)** o bottom sheet de uma quadra oferece "Apagar quadra";
> **(2)** escolher a opção abre um diálogo que nomeia o número da quadra e avisa que **o histórico de
> trabalho dela será apagado junto** — o `block_work_logs.block_id` é `ON DELETE CASCADE`, então isso
> é literal, não hipótese; **(3)** confirmar chama `BlockRepository.delete` com o id daquela quadra,
> exatamente uma vez, e invalida `territoriesProvider` para o mapa refletir a remoção; **(4)**
> cancelar não chama o repositório; **(5)** um `ApiException` vindo do repositório aparece como
> `SnackBar` com a `error.message` do servidor, e a quadra continua na tela. Se o `FlutterMap` do
> `TerritoryMap` atrapalhar o teste, chame `_blockActions` a partir de um widget de teste que monte
> só o bottom sheet — o que está sob teste é a ação, não o mapa. Termine com `dart format lib test`,
> `flutter analyze` e `flutter test` verdes em `admin/`. Toque apenas em
> `admin/lib/presentation/home_screen.dart` e `admin/test/`; não altere a camada `data/`.

---

### Task 07 — Sair da congregação pela interface

**Objetivo:** o admin consegue trocar as credenciais guardadas sem mexer no keystore do sistema.
**Camadas:** Presentation
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0002 — Task 07: `Session.signOut()` existe em `admin/lib/data/session.dart` e só é chamado
> pelo teste. Hoje o único caminho de volta à `SetupScreen` é a credencial guardada ser recusada pelo
> servidor duas vezes (`main.dart`, `_Authenticated`); se o admin quiser trocar de congregação ou
> corrigir uma senha digitada errada, teria que limpar o keystore do sistema operacional na mão.
> Acrescente a saída explícita à `AppBar` da `HomeScreen`, como item de um `PopupMenuButton`
> (`Icons.more_vert`) e não como botão solto — é uma ação destrutiva e não pode ficar a um toque de
> distância dos botões de recarregar e publicadores.
>
> Critérios de aceite, como comportamentos observáveis (teste de widget novo em
> `admin/test/sign_out_test.dart`, com fakes por `ProviderScope(overrides: ...)`): **(1)** a `AppBar`
> da `HomeScreen` oferece "Sair da congregação"; **(2)** escolher abre um diálogo que diz que os
> dados da congregação serão apagados **deste computador** e que o nome, a cidade e a senha terão de
> ser digitados de novo para voltar a usar — o dado no servidor não é tocado; **(3)** confirmar chama
> `Session.signOut()` e invalida `isConfiguredProvider`, e a `SetupScreen` volta a ser exibida;
> **(4)** cancelar não chama `signOut` e mantém a `HomeScreen`; **(5)** depois de sair, nenhuma
> credencial permanece no `CredentialsStore` (use `InMemoryCredentialsStore` no teste e verifique que
> `read()` devolve `null`). A senha não pode aparecer em nenhuma mensagem da interface. Termine com
> `dart format lib test`, `flutter analyze` e `flutter test` verdes em `admin/`. Toque apenas em
> `admin/lib/presentation/home_screen.dart` e `admin/test/`; não altere `session.dart` nem a camada
> `data/`.

---

### Task 08 — Testes de widget: configuração inicial e roteamento

**Objetivo:** a primeira execução e o retorno forçado ao setup ficam cobertos.
**Camadas:** Presentation (testes)
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0002 — Task 08: O comentário do `admin-release.yml` afirma que "os testes de widget são o que
> diz que o app se comporta", e não existe um único teste de widget no admin. Cubra a porta de
> entrada, em `admin/test/setup_screen_test.dart`, usando `ProviderScope(overrides: ...)` com um fake
> de `Session`/`CredentialsStore` (`InMemoryCredentialsStore` já existe em
> `admin/lib/data/credentials_store.dart`).
>
> Critérios de aceite, como comportamentos observáveis: **(1)** com nome, cidade ou senha em branco,
> "Entrar" não dispara chamada nenhuma e o campo vazio mostra a mensagem de obrigatório; **(2)** nome
> e cidade são enviados sem espaços nas pontas, mas a **senha vai exatamente como digitada, inclusive
> com espaços** — é uma sequência de bytes secreta, e o servidor também não a corta; **(3)** um
> `ApiException` do servidor aparece no banner de erro com a mensagem dele, e a tela continua
> preenchida para o admin corrigir; **(4)** enquanto a chamada está em curso o botão fica
> desabilitado e mostra o indicador de progresso; **(5)** no sucesso, `isConfiguredProvider` é
> invalidado. Depois, em `admin/test/app_routing_test.dart`, cubra o roteamento de `main.dart`
> montando `TerritoryAdminApp` dentro de um `ProviderScope` com overrides: **(6)** sem credenciais
> guardadas, abre a `SetupScreen`; **(7)** com credenciais guardadas, abre a `HomeScreen`; **(8)** se
> a leitura do keystore falhar, abre a `SetupScreen` com o aviso de que os dados guardados não
> puderam ser lidos — retry não conserta isso, digitar de novo conserta; **(9)** se
> `territoriesProvider` falhar com `CredentialsRejectedException`, a `SetupScreen` volta exibindo a
> mensagem da exceção. Termine com `dart format lib test`, `flutter analyze` e `flutter test` verdes
> em `admin/`. Se um teste revelar um defeito real de comportamento, corrija-o e diga o que era.
> Toque apenas em `admin/test/` e, se um defeito exigir, no arquivo de `presentation/` correspondente;
> não altere a camada `data/`.

---

### Task 09 — Testes de widget: `HomeScreen` e o mapa

**Objetivo:** a lista lateral, os estados de carga/erro e a cor das quadras ficam cobertos.
**Camadas:** Presentation (testes)
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0002 — Task 09: Cubra a tela principal do admin em `admin/test/home_screen_test.dart`, com um
> fake de `TerritoryRepository` sobreposto por `ProviderScope(overrides: ...)`. `HomeScreen` e
> `TerritoryMap` já recebem um `now` injetável exatamente para isto — use-o em vez de depender do
> relógio real.
>
> Critérios de aceite, como comportamentos observáveis: **(1)** enquanto carrega, mostra o indicador
> de progresso e nenhum FAB; **(2)** com a lista vazia, mostra o texto convidando a desenhar o
> primeiro território e não monta o mapa; **(3)** com territórios, a lista lateral traz o nome, a
> contagem de quadras e, quando houver, quantas nunca foram trabalhadas; **(4)** quando o
> repositório falha com `ApiException`, aparece a mensagem do servidor e o botão "Tentar de novo",
> que reinvalida `territoriesProvider`; **(5)** o menu de um território oferece adicionar quadra,
> editar demarcação e apagar; **(6)** apagar pede confirmação citando quantas quadras e o histórico
> serão apagados junto, chama `TerritoryRepository.delete` só depois de confirmado, e um erro vira
> `SnackBar`; **(7)** a cor da quadra segue `last_worked_at`: nunca trabalhada usa a cor de erro do
> tema, mais de 120 dias (`overdueAfter`) usa laranja, e recente usa verde — três quadras com datas
> escolhidas em torno do `now` injetado provam os três casos de uma vez. Para o critério 7,
> `FlutterMap` precisa de tamanho finito: monte dentro de um `SizedBox`/`MediaQuery` explícito e
> encontre a `PolygonLayer` para ler as cores. Se o mapa se mostrar instável no ambiente de teste, a
> saída autorizada é promover a regra de cor a uma função pública de nível superior em
> `presentation/map/territory_map.dart` e testá-la diretamente, mantendo um teste de widget mais leve
> para o resto. Termine com `dart format lib test`, `flutter analyze` e `flutter test` verdes em
> `admin/`. Toque apenas em `admin/test/` e, se o critério 7 exigir a extração, em
> `admin/lib/presentation/map/territory_map.dart`; não altere a camada `data/`.

---

### Task 10 — Testes de widget: publicadores e código de acesso

**Objetivo:** o fluxo que entrega credenciais a pessoas reais fica coberto.
**Camadas:** Presentation (testes)
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0002 — Task 10: Cubra `admin/lib/presentation/publishers_screen.dart` em
> `admin/test/publishers_screen_test.dart`, com um fake de `PublisherRepository` sobreposto por
> `ProviderScope(overrides: ...)`. `PublishersScreen` recebe um `now` injetável — use-o para decidir
> se o código ainda está vivo, em vez do relógio real.
>
> Critérios de aceite, como comportamentos observáveis: **(1)** lista vazia mostra "Nenhum publicador
> cadastrado"; falha do repositório mostra a mensagem do servidor; **(2)** cadastrar exige um nome não
> vazio — o botão "Gerar código" fica desabilitado sem ele; **(3)** cadastrado com sucesso, o código
> gerado aparece em destaque num diálogo, junto do aviso de que vale 24 horas, serve uma única vez e
> não poderá ser consultado depois; **(4)** o subtítulo de cada pessoa reflete o estado certo:
> revogada ("o histórico de trabalho continua guardado"), com código válido aguardando resgate,
> pendente sem código válido, ou ativa num aparelho — monte um `Publisher` para cada caso variando
> `isActive`, `accessCode`, `accessCodeExpiresAt` e `activatedAt` em torno do `now` injetado;
> **(5)** "Ver código" só aparece no menu enquanto `hasLiveCode(now)` é verdadeiro, e some depois de
> expirado ou resgatado; **(6)** "Gerar novo código" chama `regenerateCode` e exibe o código novo;
> **(7)** "Desativar"/"Reativar" chama `setActive` com o **inverso** do estado atual; **(8)** um
> `ApiException` em qualquer uma dessas ações vira `SnackBar` com a mensagem do servidor. O código de
> acesso é credencial: pode ser afirmado na tela, mas nenhum teste deve imprimi-lo em log. Termine com
> `dart format lib test`, `flutter analyze` e `flutter test` verdes em `admin/`. Se um teste revelar
> um defeito real, corrija-o e diga o que era. Toque apenas em `admin/test/` e, se um defeito exigir,
> em `admin/lib/presentation/publishers_screen.dart`; não altere a camada `data/`.

---

### Task 11 — Testes de widget: editores e histórico de trabalho

**Objetivo:** o desenho, a numeração e a correção de registros ficam cobertos.
**Camadas:** Presentation (testes)
**Modo:** TDD
**Depende de:** Task 05
**Instrução para o subagente:**
> Spec 0002 — Task 11: Cubra as três telas restantes do admin. Em
> `admin/test/territory_editor_test.dart`: **(1)** "Salvar" fica desabilitado sem nome, e também com
> menos de 3 pontos no polígono; **(2)** "Desfazer" nasce desabilitado e "Apagar tudo" também,
> enquanto não há ponto; **(3)** com nome e um anel válido, salvar chama `TerritoryRepository.create`
> (tela nova) ou `update` (tela de edição) com os pontos desenhados, e invalida `territoriesProvider`;
> **(4)** um `ApiException` do servidor — o caso real é sobreposição com outro território — aparece no
> banner vermelho com a mensagem dele, e a tela **não** fecha, para o admin poder corrigir o desenho.
> Em `admin/test/block_editor_test.dart`: **(5)** com o campo de número em branco, a chamada leva
> `number: null`, deixando o servidor escolher o menor livre; **(6)** um número menor que 1 ou não
> numérico mostra "Use um número a partir de 1" e bloqueia o salvamento; **(7)** salvar chama
> `BlockRepository.create` numa quadra nova e `update` numa existente. Em
> `admin/test/block_history_test.dart`: **(8)** sem registros, diz que a quadra nunca foi trabalhada;
> **(9)** cada registro mostra o nome do publicador e a data do trabalho, e acrescenta "sincronizado
> em ..." quando `wasSyncedLate` — a diferença entre trabalhar e a fila offline drenar; **(10)**
> remover um registro pede confirmação nomeando quem e quando, chama `WorkLogRepository.delete` e
> invalida **tanto** `workLogsProvider(blockId)` **quanto** `territoriesProvider`, porque o servidor
> recalcula `last_worked_at` e a cor da quadra no mapa muda junto. Os dois editores montam um
> `FlutterMap`: dê tamanho finito com `SizedBox`/`MediaQuery` e, se necessário, interaja com o
> `PolygonEditorController` diretamente para montar o polígono em vez de simular toques no mapa —
> o alvo aqui é a tela, e o editor já tem cobertura própria em `polygon_editor_test.dart`. Termine
> com `dart format lib test`, `flutter analyze` e `flutter test` verdes em `admin/`. Toque apenas em
> `admin/test/` e, se um defeito real exigir, nos arquivos correspondentes de
> `admin/lib/presentation/`; não altere a camada `data/`.

---

### Task 12 — Alinhar o `CLAUDE.md` ao admin que passou a existir

**Objetivo:** a documentação do projeto descreve as camadas, as capacidades e o release reais.
**Camadas:** Documentação
**Modo:** direto
**Depende de:** Tasks 02, 05, 06, 07
**Instrução para o subagente:**
> Spec 0002 — Task 12: Com as tasks anteriores concluídas, o `CLAUDE.md` da raiz ficou descrevendo um
> admin que não é o que existe. Ajuste, sem reescrever o documento inteiro:
> **(1)** na tabela de camadas do **Admin (Flutter desktop)**, registre que `data/` contém os
> repositórios sobre o cliente da API além das credenciais e da sessão, e **substitua a linha de
> `domain/`** por uma nota explícita de que o admin **não tem** essa camada — os casos de uso seriam
> repasses de uma linha sobre o cliente da API, porque toda a regra de negócio vive no servidor, e a
> camada que realmente paga o próprio custo é a de repositórios, que é o que permite fake nos testes
> de widget. Esta é uma decisão tomada, não um débito. **(2)** Na árvore de "Estrutura do Projeto",
> tire `admin/lib/domain/` e acrescente os repositórios em `admin/lib/data/`. **(3)** Registre as
> duas capacidades novas do admin: apagar uma quadra (com o histórico dela junto, por cascade) e sair
> da congregação, que apaga as credenciais deste computador e devolve à configuração inicial.
> **(4)** Na seção de deploy do admin, registre que o build por tag injeta `APP_KEY` (secret) e
> `API_BASE_URL` (variable) por `--dart-define`, que o job falha de propósito se algum dos dois
> estiver faltando, e que os binários são publicados numa GitHub Release — não mais como artefato de
> Actions. **(5)** Revise a frase "Build verde só prova que compila (...) quem valida comportamento
> são os testes de widget": agora eles existem, nas seis telas; ajuste o texto para dizer o que é
> verdade. **(6)** Se a seção "Pontos em Aberto" citar algo que estas tasks resolveram, mova ou
> remova. Não altere as seções do servidor, do modelo de dados nem das regras de negócio — nada disso
> mudou. Toque apenas em `CLAUDE.md`.

---

## Ordem e paralelismo

- **Task 01** roda sozinha e primeiro: ela reserva os números `0025`–`0027` de
  `.claude/implements/` antes que as skills de execução comecem a criar os seus.
- **Tasks 02 e 04** podem correr em paralelo depois dela (CI e Data não se tocam). **Task 03**
  espera a 02 porque documenta o workflow resultante.
- **Task 05** é o gargalo: tudo de presentation espera por ela.
- **Tasks 06 a 11** são paralelizáveis entre si — cada uma tem seu próprio arquivo de teste e as
  duas que mexem em `home_screen.dart` (06 e 07) tocam pontos diferentes do arquivo; se o executor
  não paralelizar edições no mesmo arquivo, rode 06 e 07 em sequência.
- **Task 12** é a última, porque descreve o resultado das outras.

## Como executar

Recomendado — orquestração automática:

```
/centaur-driven-run 0002
```

O run lança um subagente por task, paraleliza as independentes e respeita as dependências.

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

- [x] Task 01 — Registrar `packages/core` e o admin no histórico de implementações → implements/0025, implements/0026, implements/0027
- [x] Task 02 — Build de release: dart-defines e uma GitHub Release de verdade → implements/0028
- [x] Task 03 — README do admin: como rodar, como configurar o build e o aviso do SmartScreen → implements/0030
- [x] Task 04 — Repositórios em `admin/lib/data/` → implements/0029
- [x] Task 05 — As telas passam a falar com os repositórios → implements/0031
- [x] Task 06 — Apagar quadra pela interface → implements/0032
- [x] Task 07 — Sair da congregação pela interface → implements/0033
- [x] Task 08 — Testes de widget: configuração inicial e roteamento → implements/0034
- [x] Task 09 — Testes de widget: `HomeScreen` e o mapa → implements/0035
- [x] Task 10 — Testes de widget: publicadores e código de acesso → implements/0036
- [x] Task 11 — Testes de widget: editores e histórico de trabalho → implements/0037
- [x] Task 12 — Alinhar o `CLAUDE.md` ao admin que passou a existir → implements/0038
