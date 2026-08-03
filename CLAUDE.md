# Territory Map

## Visão Geral

Aplicativo para gerenciar **territórios de pregação das Testemunhas de Jeová**.

O sistema mapeia territórios (áreas geográficas atribuídas a uma congregação) e as quadras
numeradas dentro deles, exibindo tudo sobre um mapa real.

São três partes:

| Parte | Público | O que faz |
|-------|---------|-----------|
| **Servidor** | — | API REST, dono das regras de negócio e da validação geométrica |
| **App Android** (Flutter) | Publicadores em campo | Abre e já mostra a posição do usuário no mapa, com os territórios e quadras da congregação desenhados por cima. Permite **marcar uma quadra como trabalhada**. |
| **Admin** (Flutter desktop) | Responsável pelos territórios na congregação | Desenha as demarcações dos territórios, marca e numera as quadras, cadastra os publicadores e acompanha o que já foi trabalhado. Fala direto com o servidor. Roda em Windows, macOS e Linux. |

**Sem cadastro feito pelo publicador.** Quem cadastra é o admin: no app admin ele preenche o **nome
da pessoa**, o sistema gera um **código de acesso individual**, e ele entrega esse código àquela
pessoa. Na primeira abertura o publicador informa só o código — sem nome, sem senha, sem conta — e
o app guarda o vínculo no dispositivo. Como o código é individual, o admin sempre sabe quem é cada
usuário e quem trabalhou cada quadra. Só o admin tem senha.

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Servidor | Python 3.12+, FastAPI, SQLAlchemy 2.x **síncrono** + psycopg 3, Pydantic v2, Alembic, uv |
| Banco | PostgreSQL 16 + **PostGIS** |
| Geometria (Python) | Shapely / GeoAlchemy2 |
| Auth | JWT (`python-jose`) + hash de senha com **bcrypt** (`passlib`) |
| Mapas | **OpenStreetMap** via `flutter_map` nos dois clientes. Sem chave de API, sem billing. |
| App (Android) | Flutter (Dart), Riverpod para estado, Drift/SQLite para cache offline |
| Admin (desktop) | **Flutter desktop** (Windows/macOS/Linux), Riverpod, `flutter_secure_storage` para o JWT |
| Edição de polígono | `flutter_map_line_editor` + `flutter_map_dragmarker` (exigem `flutter_map ^8`) |
| Código compartilhado | Pacote Dart local `packages/core` — modelos, cliente da API, conversões geométricas |
| Infra | Docker + Docker Compose em um Ubuntu |
| CI/CD | GitHub Actions → deploy do servidor por SSH; build do admin nas 3 plataformas por tag |

## Estrutura do Projeto

Monorepo. Do lado cliente nada foi implementado ainda; no servidor existem o scaffold (config,
`/health`, Docker e Compose), a base ORM com a sessão do banco, as exceções de domínio e o Alembic
— o resto abaixo é a estrutura alvo.

```
Territory map/
├── CLAUDE.md
├── docker-compose.yml          # postgis + api (prod), api vinda do GHCR
├── docker-compose.dev.yml      # só o postgis, para desenvolvimento local
├── docker/
│   └── postgres/init/          # cria territory_map e territory_map_test com postgis
├── .github/
│   └── workflows/server.yml    # CI do servidor + build da imagem + deploy por SSH
├── .claude/
│   ├── implements/status.md    # histórico de implementações
│   └── specs/index.md          # índice de specs planejadas
├── server/                     # FastAPI
│   ├── README.md               # comandos locais e os secrets a cadastrar no GitHub
│   ├── docker-entrypoint.sh    # alembic upgrade head e depois uvicorn
│   ├── app/
│   │   ├── main.py             # bootstrap da aplicação
│   │   ├── core/               # config, segurança, sessão do banco, rate limit, scheduler
│   │   ├── models/             # entidades SQLAlchemy
│   │   ├── schemas/            # DTOs Pydantic
│   │   ├── repositories/       # acesso a dados
│   │   ├── services/           # regras de negócio
│   │   ├── routers/            # endpoints HTTP
│   │   └── jobs/               # tarefas agendadas, também executáveis com python -m
│   ├── migrations/             # Alembic
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── packages/
│   └── core/                   # pacote Dart compartilhado app ↔ admin
│       ├── lib/
│       │   ├── models/         # Territory, Block, User, LatLng…
│       │   ├── api/            # cliente HTTP da API, DTOs, erros
│       │   └── geo/            # conversões lat/lng ↔ GeoJSON, validações locais
│       └── test/
├── app/                        # Flutter — Android
│   ├── lib/
│   │   ├── main.dart
│   │   ├── data/               # cache local (Drift), repositórios
│   │   ├── domain/             # casos de uso
│   │   └── presentation/       # telas, widgets, providers
│   └── test/
└── admin/                      # Flutter — desktop
    ├── lib/
    │   ├── main.dart
    │   ├── data/               # repositórios sobre o cliente da API
    │   ├── domain/             # casos de uso (desenho, numeração, cadastro)
    │   └── presentation/       # telas, mapa editável, providers
    └── test/
```

`app/` e `admin/` dependem de `packages/core` por `path:` no `pubspec.yaml`. Nada de duplicar
modelo ou cliente da API entre os dois.

## Modelo de Dados

Coordenadas sempre em **WGS84 (SRID 4326)**, no par `(latitude, longitude)`.
Nas APIs de mapa e no GeoJSON a ordem é `[longitude, latitude]` — atenção à inversão.

**`GEOMETRY`, não `GEOGRAPHY`.** As regras do projeto são predicados topológicos (`ST_Within`,
`ST_Touches`, `ST_Intersects`) e o PostGIS só os oferece para `geometry` — em `geography` existem
apenas `ST_Intersects`, `ST_Covers` e `ST_DWithin`. Predicado topológico independe de projeção, então
`geometry(4326)` dá o resultado correto. Quando for preciso **área ou distância em metros**, aí sim
converter na hora: `boundary::geography`. Índice GIST em toda coluna geométrica.

Um território é **sempre uma área contígua** — `POLYGON`, nunca `MULTIPOLYGON`. Se a região tiver
partes desconexas, são territórios diferentes.

### Congregation
| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `name` | str | |
| `city` | str | |
| `password_hash` | str | bcrypt |
| `created_at` | datetime | |

Único composto em `(name, city)`.

### User
O publicador. Criado **pelo admin**, nunca pelo app.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `congregation_id` | UUID | FK → Congregation |
| `name` | str | o nome que o admin digitou no cadastro |
| `access_code` | str? | **único global** enquanto existe, curto (8 caracteres, alfabeto sem `0/O/1/I/L` — a fonte única é `ACCESS_CODE_ALPHABET` em `app/core/security.py`; não reescreva a string em outro lugar). Fica **nulo** depois de usado ou expirado. |
| `access_code_expires_at` | datetime? | `created_at + 24h` |
| `activated_at` | datetime? | nulo enquanto nenhum código foi resgatado; atualizado a cada novo resgate |
| `token_version` | int | começa em 0, `+1` a cada resgate. Invalida o token do aparelho anterior. |
| `is_active` | bool | `false` revoga o acesso sem apagar o histórico |
| `created_at` | datetime | |

O código é individual, então **ele já identifica a congregação** — não existe mais código de
congregação.

O `access_code` é **descartável**: serve uma única vez, vale 24 horas e é apagado da linha assim
que cumpre a função. O que dura é o token do app guardado no aparelho. Índice único parcial em
`access_code WHERE access_code IS NOT NULL`.

### Territory
| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `congregation_id` | UUID | FK → Congregation |
| `name` | str | único dentro da congregação |
| `boundary` | `GEOMETRY(POLYGON, 4326)` | a demarcação do território |
| `created_at` | datetime | |

### Block
| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `territory_id` | UUID | FK → Territory |
| `number` | int | único dentro do território |
| `polygon` | `GEOMETRY(POLYGON, 4326)` | o contorno da quadra |
| `last_worked_at` | datetime? | **derivado** do `BlockWorkLog` mais recente. Nulo = nunca trabalhada. |
| `created_at` | datetime | |

`last_worked_at` é cache de leitura, não fonte de verdade: quem manda é o `BlockWorkLog`. Recalcular
sempre que um log for inserido ou removido — nunca escrever nele direto a partir de um endpoint.

### BlockWorkLog
Registro de que uma quadra foi trabalhada. Append-only pelo app.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `block_id` | UUID | FK → Block |
| `user_id` | UUID | FK → User. Preservado mesmo se o usuário for desativado. |
| `worked_at` | datetime | quando a quadra foi concluída |
| `created_at` | datetime | quando o registro chegou ao servidor (pode diferir de `worked_at` por causa do offline) |

Índice em `(block_id, worked_at DESC)`.

### Divergências em relação ao brief inicial (e o porquê)

1. **`TerritoryDemarcationPoint` com `pointParent` foi removida.** Uma lista ligada de pontos para
   ordenar os vértices de um polígono é frágil (permite ciclos, órfãos e listas abertas) e não é
   consultável geometricamente. Em vez disso, a demarcação é uma coluna `POLYGON` do PostGIS. A API
   continua recebendo e devolvendo uma **lista ordenada de pontos** — para o admin, nada muda; muda
   só a persistência, que ganha índice espacial e validação nativa.
2. **`Block.px, py` virou um polígono.** Um par de coordenadas é um ponto, não dá para destacar uma
   quadra no mapa com ele. A quadra é um polígono com no mínimo 3 vértices.
3. **Senha em bcrypt, não SHA.** SHA é rápido por design, o que é exatamente o que não se quer em
   hash de senha — um ataque de dicionário offline testa bilhões de SHA por segundo. bcrypt tem
   custo configurável e salt embutido. Mesmo esforço de implementação (`passlib`), sem downside.
4. **O código de acesso é do `User`, não da `Congregation`.** Como o admin gera um código por
   pessoa, esse código já identifica a congregação — um código de congregação seria redundante e
   impediria saber quem trabalhou cada quadra.
5. **"Última vez trabalhada" virou tabela, não só coluna.** Uma coluna sobrescrita perde o
   histórico e não sobrevive ao offline: dois publicadores podem marcar a mesma quadra sem rede e
   sincronizar depois. Com `BlockWorkLog`, os dois registros coexistem e `last_worked_at` é o
   máximo entre eles — nada se perde e não há conflito para resolver.

## Regras de Negócio

### Login (admin)
- `POST /auth/login` recebe `name`, `city` e `password`. **Os três são validados juntos** — não
  existe "buscar congregação e depois conferir a senha" exposto ao cliente.
- Falha em qualquer um dos três retorna **a mesma mensagem genérica** ("credenciais inválidas") e o
  mesmo status, sem revelar qual campo errou.
- Sucesso retorna um JWT com expiração e o `congregation_id` no payload.
- Todo endpoint de escrita do admin exige o JWT e opera **apenas** sobre dados da congregação do
  token.

### Cadastro de publicador (User)
- Só o **admin** cria usuário. O app nunca cria — ele só consome um código que já existe.
- O admin informa o **nome**; o servidor gera o `access_code`. O código nunca é escolhido à mão.
- Geração do código: aleatório criptográfico, alfabeto sem caracteres ambíguos (`0/O`, `1/I/l`),
  **único globalmente**, com retry em colisão. É lido em voz alta e digitado à mão — legibilidade
  importa mais que tamanho.
- **O código é de uso único e vale 24 horas.** `POST /app/activate` recebe o código e, se ele
  existir, estiver dentro da validade e ainda não tiver sido resgatado, devolve um **token de app**
  permanente com `user_id` e `congregation_id`. Na mesma transação o servidor grava `activated_at`
  e **apaga o `access_code`** (`NULL`). A partir daí o código não existe mais — nem para quem
  digitou de novo, nem no banco.
- O app guarda o **token** em armazenamento seguro (`flutter_secure_storage`) e nunca guarda o
  código. O token não expira; só deixa de valer se o admin desativar o usuário.
- Código inexistente, expirado e já usado retornam **a mesma resposta genérica**. Não dizer qual
  dos três é — a diferença entregaria a existência de códigos válidos.
- Uma rotina periódica limpa os códigos vencidos e não usados (`access_code = NULL` onde
  `access_code_expires_at < now()`), para que a expiração não dependa só da checagem em tempo de
  resgate. É `app/jobs/expire_codes.py`, agendado de hora em hora por um `BackgroundScheduler` que
  o `lifespan` do FastAPI sobe e desce (`app/core/scheduler.py`), e também executável à mão com
  `python -m app.jobs.expire_codes`. Com vários workers uvicorn cada um sobe o seu scheduler e o job
  roda uma vez por worker — inofensivo, porque a varredura é idempotente e não toma lock.
- O admin pode **gerar um novo código** para um usuário existente a qualquer momento — é o caminho
  para troca de aparelho, reinstalação do app ou código perdido/vencido. Gerar um novo substitui o
  anterior, que deixa de valer na hora.
- **Um usuário, um aparelho ativo.** Cada resgate incrementa `token_version`, e o token carrega essa
  versão; token com versão antiga é recusado. Consequência intencional: ativar no aparelho novo
  desconecta o antigo — que é justamente o que se quer quando o celular foi perdido ou trocado.
- Acesso é **imediato** — quem resgatou o código já usa e já marca quadra. Sem fila de aprovação.
- O admin pode **desativar** um usuário (`is_active = false`). A partir daí o token é recusado, mas
  os `BlockWorkLog` daquela pessoa permanecem — histórico não se apaga com revogação.
- O admin nunca vê o código de outra congregação, e um código só serve para a congregação dele.

### Marcar quadra como trabalhada
- `POST /app/blocks/{id}/worked` com o token do app, corpo com `worked_at`. Cria um `BlockWorkLog`
  e atualiza `Block.last_worked_at`.
- O bloco precisa pertencer à congregação do token. Bloco de outra congregação responde **404**,
  não 403 — não confirmar que o recurso existe.
- **O app não desmarca.** Só o admin corrige ou remove um registro, pelo app admin; ao remover,
  `last_worked_at` é recalculado a partir do log restante.
- Marcações repetidas da mesma pessoa no mesmo bloco são registros distintos e legítimos (a quadra
  foi trabalhada de novo). Idempotência é por `id` do log gerado no cliente, para o reenvio offline
  não duplicar.
- `worked_at` no futuro é rejeitado. Muito antigo (ex.: > 90 dias) também — provável relógio errado
  do aparelho.

### Demarcação de território
- O polígono precisa ser **válido e simples** (`ST_IsValid`, `ST_IsSimple`) — sem auto-interseção.
- Mínimo de 3 vértices distintos.
- **Territórios da mesma congregação não podem se sobrepor.** Encostar na divisa é permitido;
  invadir a área do vizinho não. Na prática: rejeitar quando
  `ST_Intersects(a, b) AND NOT ST_Touches(a, b)`.
- Territórios de congregações diferentes não são comparados entre si.

### Demarcação de quadra (block)
- Só é possível criar uma quadra **depois** que o território existe e tem demarcação.
- A quadra precisa estar **inteiramente dentro** da demarcação do território:
  `ST_Within(block.polygon, territory.boundary)`. Um vértice fora já invalida.
- Quadras do mesmo território não podem se sobrepor (mesma regra de `ST_Touches` acima).
- **Numeração**: o servidor sugere o próximo inteiro livre do território, e o admin pode
  sobrescrever. O número é único dentro do território.
- Alterar a demarcação de um território que já tem quadras precisa revalidar todas as quadras: se
  alguma ficar fora, a alteração é rejeitada com a lista das quadras afetadas.

### Chave de aplicação (`X-App-Key`)
- Toda requisição precisa trazer o header `X-App-Key` com o valor de `APP_SECRET`. **Os dois
  clientes mandam em toda chamada** — quando `packages/core` existir, o cliente HTTP compartilhado
  injeta o header, e nenhum caso de uso deve precisar saber disso.
- **`GET /health` é isento**, por rota e não por fallback: o healthcheck do deploy e o runtime do
  container chamam sem chave e precisam funcionar antes de qualquer cliente existir.
- Header ausente e header errado recebem **a mesma** resposta 401. Comparação com
  `secrets.compare_digest`.
- `APP_SECRET` vazio **desliga** o gate — é o que mantém os testes e o desenvolvimento local sem
  header — e o app emite WARNING no startup.
- **Isto não é autenticação.** A chave é estática e viaja dentro do APK e do binário desktop; quem
  tem qualquer um dos dois extrai o valor. Sobre HTTP puro ela trafega em texto claro, ao lado do
  token que deveria proteger. Serve para o servidor parar de responder a varredura automática, e só.
  Autorização continua sendo o JWT do admin e o token de app.

### App Android
- A **única** escrita permitida ao app é marcar quadra como trabalhada. Nada de território, quadra,
  usuário ou congregação é criado, editado ou apagado pelo app.
- Vincula-se pelo `access_code` individual; sem código válido e ativo, não há dados.
- Faz cache local dos territórios e quadras para funcionar sem sinal em campo. Os *tiles* do mapa
  ficam limitados ao que já foi carregado — isso é uma limitação conhecida, não um bug.
- Marcação feita offline entra numa **fila local** com `worked_at` do momento real e um `id` gerado
  no cliente, e é enviada quando houver rede. A UI mostra a quadra como concluída na hora.

## Arquitetura e Decisões Técnicas

- **Servidor é a única fonte de verdade das regras geométricas.** O admin pode dar feedback visual
  otimista enquanto o usuário desenha, mas nenhuma validação vive só no cliente.
- **PostGIS em vez de validar tudo em Python.** As regras do projeto são todas geoespaciais
  (dentro-de, sobrepõe, próximo-de). PostGIS resolve isso com índice espacial; Shapely fica para
  pré-validações baratas antes de tocar o banco.
- **SQLAlchemy síncrono, não async.** O volume é de dezenas de requisições por dia e as regras são
  transacionais e sequenciais. Async traria complexidade de driver com PostGIS sem ganho algum
  aqui, e deixaria os testes mais difíceis. FastAPI roda endpoint `def` em threadpool sem problema.
- **OpenStreetMap em vez de Google Maps.** Gratuito, sem chave nem conta de billing, e cobre
  polígonos, marcadores e rótulos numerados — tudo que o caso de uso pede. Respeitar a
  [política de uso dos tiles](https://operations.osmfoundation.org/policies/tiles/) do OSM:
  definir um User-Agent identificando o app e não fazer *bulk download*.
- **Monorepo.** Os três projetos compartilham o contrato da API; versionar junto evita que o app e
  o admin fiquem fora de sincronia com o servidor.
- **Flutter também no admin, em vez de Electron.** Uma linguagem só do lado cliente, e o que antes
  seria escrito duas vezes em linguagens diferentes — modelos, cliente da API, conversão de
  coordenadas — vira um pacote Dart compartilhado, testado uma vez. Some também toda a superfície de
  segurança do Electron (`contextIsolation`, preload, IPC) e o runtime Chromium de ~150 MB.
  O desenho do polígono, que seria o argumento a favor do Leaflet, é coberto por
  [`flutter_map_line_editor`](https://pub.dev/packages/flutter_map_line_editor) sobre
  [`flutter_map_dragmarker`](https://pub.dev/packages/flutter_map_dragmarker): tocar para adicionar
  vértice, arrastar vértice, arrastar ponto intermediário para inserir, long-press para remover e
  `addClosePathMarker` para fechar o polígono. Ambos pedem `flutter_map ^8.0.0`, que é a major
  corrente.
- **Risco assumido nas libs de edição de mapa.** São pacotes pequenos (~5k downloads, 32 likes) e
  sem release recente — não porque estejam abandonados, mas porque o `flutter_map` não quebrou API
  desde a v8. Se pararem, são MIT e pequenos o bastante para *vendorizar*. Encapsular o editor num
  widget próprio (`presentation/map/polygon_editor.dart`) para que essa troca fique confinada a um
  arquivo. Não vêm de fábrica: desfazer, *snapping* e bloqueio de auto-interseção — este último já
  é validado no servidor (`ST_IsValid`) e pré-validado em `packages/core/lib/geo/`.
- **Multi-tenant por congregação.** Todo dado é escopado por `congregation_id`, sempre derivado do
  token — nunca aceito como parâmetro vindo do cliente.
- **Dois tipos de token, com poderes bem diferentes.** O JWT do admin expira rápido e pode tudo
  dentro da congregação; o token do app não expira e só pode ler e registrar trabalho. Rotas
  separadas (`/admin/*` e `/app/*`) com dependências de autenticação distintas, para que um token
  de app nunca alcance um endpoint de escrita do admin por descuido de roteamento.
- **O token do app não é stateless.** Como ele vale para sempre, cada requisição precisa conferir
  no banco que o usuário está ativo e que o `token_version` do payload bate com o da linha. É uma
  consulta por request — no volume deste projeto, irrelevante, e é o que permite revogar acesso e
  trocar de aparelho de verdade. Um token sem essa checagem seria irrevogável.
- **O código de acesso é efêmero por design.** Uso único, 24 horas, apagado da linha ao ser
  resgatado. Credencial que não persiste não vaza depois: um dump do banco não devolve acesso a
  ninguém, e a janela de ataque é de um dia.
- **Trabalho registrado é log, não estado.** `Block.last_worked_at` é projeção; a verdade é a
  sequência de eventos. Isso é o que torna a sincronização offline trivial — eventos concorrentes
  se somam em vez de conflitar.

## Arquitetura de Camadas

### Servidor (FastAPI) — camada obrigatória

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Models | `server/app/models/` | Entidades SQLAlchemy, colunas, relacionamentos | Regra de negócio, query, HTTP |
| Schemas (DTOs) | `server/app/schemas/` | Contratos de entrada/saída, validação de forma (tipos, tamanho, formato) | Regra de negócio, acesso a banco |
| Repositories | `server/app/repositories/` | Queries, ORM, chamadas PostGIS | Regra de negócio, HTTP, autorização |
| Services | `server/app/services/` | Regras de negócio e orquestração | SQL cru fora do repositório, `Request`/`Response`, `HTTPException` |
| Routers | `server/app/routers/` | Receber requisição, autenticar, chamar service, devolver resposta | Regra de negócio, query direta |
| Jobs | `server/app/jobs/` | Tarefa agendada: abrir sessão, chamar service, comitar, logar | Regra de negócio, query direta, HTTP |
| Core | `server/app/core/` | Config, sessão do banco, segurança, dependências, rate limit, scheduler | Regra de negócio de domínio |

**Direção da dependência:** `router → service → repository → model`. Nunca o inverso.
Um job é um router sem HTTP: mesma posição na cadeia (`job → service → repository → model`), mesma
regra de só orquestrar. É também um dos dois lugares — o outro é o router — onde ler o relógio é
permitido; o service recebe a leitura por `now_provider`.
DTOs só nas bordas (router ↔ service); repositório trabalha com models.
Serviço não conhece HTTP: sinaliza erro com exceção de domínio, e o router traduz para status code.

### App (Flutter)

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Presentation | `app/lib/presentation/` | Telas, widgets, providers Riverpod | Chamada HTTP direta, regra de negócio |
| Domain | `app/lib/domain/` | Entidades e casos de uso | Dependência de Flutter, HTTP ou banco |
| Data | `app/lib/data/` | Cliente da API, cache SQLite, implementação dos repositórios | Widget, lógica de apresentação |

**Direção:** `presentation → domain ← data`. O domínio não depende de ninguém.

### Admin (Flutter desktop)

Mesma separação do app — é o mesmo framework.

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Presentation | `admin/lib/presentation/` | Telas, mapa editável, providers Riverpod | Chamada HTTP direta, regra de negócio |
| Domain | `admin/lib/domain/` | Casos de uso: desenhar demarcação, numerar quadra, cadastrar publicador | Dependência de Flutter ou HTTP |
| Data | `admin/lib/data/` | Repositórios sobre o cliente da API, guarda do JWT | Widget, lógica de apresentação |

### Pacote compartilhado (`packages/core`)

| Pasta | Responsabilidade | Proibido |
|-------|------------------|----------|
| `lib/models/` | Entidades do domínio, imutáveis | Chamada de rede, dependência de Flutter |
| `lib/api/` | Cliente HTTP, DTOs, mapeamento de erro da API | Estado de UI, cache |
| `lib/geo/` | Conversão `LatLng` ↔ GeoJSON, pré-validação de polígono | Rede, banco |

`packages/core` **não depende de `flutter`**, só de `dart:core` e do pacote HTTP — assim roda em
teste puro (`dart test`), rápido e sem emulador. Nem `app/` nem `admin/` podem importar código um
do outro; o que for comum sobe para `core`.

## Testes

| Item | Servidor | `packages/core` | App e Admin (Flutter) |
|------|----------|-----------------|-----------------------|
| Framework | pytest | `package:test` (Dart puro) | `flutter_test` |
| Rodar tudo | `cd server && pytest` | `cd packages/core && dart test` | `cd app && flutter test` |
| Rodar um arquivo | `pytest tests/services/test_territory_service.py` | `dart test test/geo/latlng_test.dart` | `flutter test test/domain/foo_test.dart` |
| Cobertura | `pytest --cov=app --cov-report=term-missing` | `dart test --coverage=coverage` | `flutter test --coverage` |
| Local e nome | `server/tests/**/test_*.py` | `packages/core/test/**/*_test.dart` | `<projeto>/test/**/*_test.dart` |
| Meta | **100% nos services** (regras de negócio), 80% geral | **100%** em `geo/` | casos de uso do domínio |

**TDD é obrigatório em toda regra de negócio do servidor** — validação geométrica, login,
numeração de quadras. Espelhe a estrutura de `app/` dentro de `tests/`.

**`server/tests/integration/` é a exceção ao espelhamento** — não corresponde a nenhuma pasta de
`app/`, porque o que ela testa são os fluxos ponta a ponta (caminho completo, troca de aparelho,
isolamento entre congregações, integridade da demarcação, revogação), não uma camada. Sobem o app
FastAPI real sobre o PostGIS real e criam por HTTP tudo que a API permite criar; a congregação é a
única linha escrita direto no banco, porque não existe endpoint que a crie. O conftest próprio
(`tests/integration/conftest.py`) sobrescreve `get_session` reproduzindo o contrato de produção —
commit no sucesso, rollback na falha —, então cada requisição é uma transação de verdade e um 422
comprovadamente não deixa nada gravado.

**Nome de arquivo de teste é único no servidor inteiro.** As pastas de `tests/` não são pacotes
(não há `__init__.py`), então dois arquivos de mesmo basename em pastas diferentes fazem o pytest
abortar a coleta. Espelhar `app/` no nome, e não só na pasta: `tests/core/test_geo.py` e
`tests/schemas/test_geo_schemas.py`, `tests/services/test_user_service.py`.

`packages/core` é Dart puro justamente para que a lógica compartilhada (conversão de coordenadas,
pré-validação de polígono, mapeamento de erro) seja testável em milissegundos, sem emulador nem
janela. É onde o TDD do lado cliente vale a pena.

**Como mockar:**
- **Banco**: as regras geométricas dependem do PostGIS de verdade — teste os services contra um
  PostGIS real em container (`docker-compose.dev.yml`), cada teste dentro de uma transação com
  rollback. Não mocke geometria; um fake de `ST_Within` testa o fake, não a regra.
  As fixtures estão em `server/tests/conftest.py`: `session` (transação revertida no fim de cada
  teste), `engine` (banco de teste migrado uma vez por execução) e `make_congregation`. O conftest
  aponta o processo inteiro para `TEST_DATABASE_URL`, então nenhum teste alcança o banco de
  desenvolvimento — basta pedir a fixture `session`.
- **Repositórios**: em teste de service que *não* seja geométrico, use fake in-memory implementando
  a mesma interface — não `MagicMock` solto.
- **Relógio**: injete um provider de tempo; nunca chame `datetime.now()` direto no service.
- **HTTP no app/admin**: cliente da API por trás de interface, com implementação fake nos testes.
  Como o cliente vive em `core`, o mesmo fake serve aos dois projetos.

## Como Rodar

O servidor já sobe; os clientes Flutter ainda não existem (passos alvo).

**Banco (necessário para servidor e testes):**
```bash
docker compose -f docker-compose.dev.yml up -d
```
Sobe o PostGIS em `localhost:5432` já com os databases `territory_map` e `territory_map_test`, com
a extensão habilitada nos dois. O script que faz isso é `docker/postgres/init/`, e ele só roda em
volume vazio — se precisar recriar os bancos, `docker compose -f docker-compose.dev.yml down -v`.

**Servidor:**
```bash
cd server && cp .env.example .env && uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```
API em `http://localhost:8000`, docs em `/docs`, healthcheck em `/health`.
Lint: `uv run ruff check .` e `uv run ruff format .`.

**Stack completa em container (produção):**
```bash
cp server/.env.example .env    # na raiz; ajuste o host do banco para `db`
docker compose up -d
```
O `docker-compose.yml` **não constrói** a imagem: puxa `ghcr.io/dalistor/territory-map-server:latest`,
publicada pela CI. Defina `API_IMAGE` no `.env` para fixar um SHA ou apontar para outra imagem. O
container roda `alembic upgrade head` no entrypoint antes de subir o uvicorn — não há passo de
migração separado no deploy. Detalhes em `server/README.md`.

**App (Android):**
```bash
cd app && flutter pub get && flutter run
```

**Admin (desktop):**
```bash
cd admin && flutter pub get && flutter run -d macos
```
Trocar `-d macos` por `-d windows` ou `-d linux` conforme a máquina. Na primeira vez, habilitar o
alvo desktop com `flutter config --enable-macos-desktop` (idem para windows/linux).

## Como Fazer Deploy

**Servidor** — VPS Ubuntu com Docker, deploy automático por **GitHub Actions**
(`.github/workflows/server.yml`).

| Job | Quando | O que faz |
|-----|--------|-----------|
| `test` | `push` e `pull_request` que toquem `server/**` ou o workflow | PostGIS real como service container, `ruff check`, `ruff format --check`, `alembic upgrade head`, `pytest --cov`, e um portão que **falha se `app/services/` sair de 100%** |
| `build-and-deploy` | `push` na `main` ou `workflow_dispatch`, depois do `test` | Buildx com cache de layers, publica no **GHCR** com as tags `latest` e o SHA; sincroniza o compose para a VPS; roda `docker compose pull && up -d && image prune -f`; verifica `127.0.0.1:$API_PORT/health` com 30 tentativas |

**Ambiente em produção:** `76.13.160.146`, diretório `/opt/territory-map`, API em HTTP na 8000.

**O que viaja para a VPS:** só o `docker-compose.yml` e o `docker/postgres/init/`. A aplicação chega
como imagem do GHCR — o código-fonte nunca é enviado. O `--delete` do rsync é escopado a `docker/`,
então o `.env` de produção, que mora um nível acima, está fora do alcance dele por construção.

**Migrations** não são aplicadas de fora: quem faz isso é o `server/docker-entrypoint.sh`, dentro do
container, antes do uvicorn. Uma migration destrutiva sobe junto com o deploy, sem confirmação.

**Ensaiar sem tocar na VPS:** Actions → `server` → Run workflow → marcar `dry_run`. Ele simula o
rsync e pula build, rollout e health check.

**Credenciais** — GitHub Environment **`production`**, restrito à branch `main`: secrets
`SSH_PRIVATE_KEY` e `SSH_KNOWN_HOSTS`; variables `SSH_HOST`, `SSH_USER`, `SSH_PORT`, `DEPLOY_PATH`.
Já cadastrados. Host/usuário/porta são variables de propósito, para aparecerem no log e tornarem
falha de conexão legível. Rotação e revogação em `server/README.md`; detalhes em
`.claude/implements/0023/`.

**Não há rollback automático.** Voltar é reverter o commit, ou fixar
`API_IMAGE=ghcr.io/dalistor/territory-map-server:<sha>` no `.env` da VPS e subir à mão.

⚠️ **A API está exposta em HTTP puro na porta 8000.** JWT do admin e token do app trafegam em texto
claro. Antes de uso real, colocar proxy reverso com TLS na frente, fechar a 8000 no firewall e
apontar `FORWARDED_ALLOW_IPS` para o IP do proxy — senão o rate limit por IP passa a ver sempre o
mesmo endereço. Também não há backup do volume `postgis_data`.

**Admin** — build das três plataformas no GitHub Actions, disparado por **git tag** (`v*`). Flutter
não faz cross-compile, então é um job por SO, cada um no seu runner, e os artefatos vão para uma
GitHub Release:

| Alvo | Runner | Comando | Artefato |
|------|--------|---------|----------|
| Windows | `windows-latest` | `flutter build windows` | pasta `Release/` zipada |
| macOS | `macos-latest` | `flutter build macos` | `.app` zipado |
| Linux | `ubuntu-latest` | `flutter build linux` | pasta `bundle/` em `.tar.gz` |

Sem assinatura de código nem notarização — os binários não são assinados, então macOS e Windows vão
exibir aviso de desenvolvedor não identificado na primeira execução. Documentar o "abrir mesmo
assim" para o admin. Assinar depois é possível, mas exige certificado pago e conta de desenvolvedor.

O Linux precisa das dependências GTK no runner (`libgtk-3-dev`, `ninja-build`, `clang`).

**App Android** — build de APK/AAB também por tag, distribuído fora da Play Store no começo.

## Regras e Convenções

- **Idioma**: código, nomes de arquivo, commits e comentários em **inglês**. Documentação em
  `.claude/` e conversa em **português**.
- **Naming**: Python `snake_case` (classes `PascalCase`); Dart `lowerCamelCase` com arquivos
  `snake_case.dart` e classes `PascalCase`.
- **Um arquivo por entidade** em cada camada — `models/territory.py`, `services/territory_service.py`.
- **Nada de coordenada como float solto**: use o tipo `LatLng` de `packages/core` para não trocar
  latitude com longitude. Ele é a única fonte da conversão para GeoJSON.
- **Lógica que serve aos dois clientes vive em `packages/core`.** Se você está prestes a copiar um
  arquivo de `app/` para `admin/`, ele deveria estar em `core`.
- **Lint**: `flutter_lints` nos dois apps e `lints/recommended` em `core`, sem warning ignorado.
- **Migrações sempre via Alembic**, nunca DDL manual no banco.
- **Erros de domínio** são exceções próprias (`TerritoryOverlapError`, `BlockOutsideTerritoryError`),
  traduzidas para HTTP só no router.
- Mensagens de erro **voltadas ao admin** devem dizer o que fazer, não só o que falhou
  ("a quadra 12 ficou fora da nova demarcação").

## Restrições e Cuidados

- **Nunca aceitar `congregation_id` do cliente.** Sempre derivar do token (JWT do admin ou token do
  app). É a única barreira entre os dados de congregações diferentes.
- **Senha nunca em SHA simples, nunca em log, nunca de volta na resposta.**
- **`access_code` é credencial, não identificador.** Nunca em URL, nunca em log, nunca em mensagem
  de erro. Aparece na tela do admin enquanto está válido e some depois. Inexistente, expirado e já
  usado respondem igual.
- **As duas rotas públicas têm rate limit por IP** (`slowapi`, em `app/core/rate_limit.py`):
  `POST /app/activate` 10/minuto e `POST /auth/login` 5/minuto, respondendo **429** no formato de erro
  padrão da API. São os únicos endpoints alcançáveis sem token e os únicos em que uma credencial pode
  ser adivinhada por tentativa e erro. Com 8 caracteres, uso único e 24 horas de janela o risco já era
  baixo — o rate limit é o que o mantém baixo se o alfabeto ou o tamanho mudarem depois.
- **Em produção, servir com `--proxy-headers`.** O limite é chaveado por `request.client.host`; atrás
  de um proxy reverso toda requisição chega do proxy, e sem isso (com o proxy setando `X-Forwarded-For`)
  todos os chamadores dividem um balde só — o primeiro que adivinhar tranca a congregação inteira.
  Os contadores são em memória e por processo, então o teto efetivo é o limite × número de workers;
  se um dia precisar de balde compartilhado, apontar o `storage_uri` do limiter para um Redis.
- **Comparação de código em tempo constante** (`secrets.compare_digest`), não `==`.
- **O log de trabalho identifica pessoas.** Guarda quem esteve em qual quadra e quando. Guardar só
  isso — nada de posição GPS, rota ou horário de deslocamento no `BlockWorkLog`.
- **Ordem das coordenadas** é a fonte clássica de bug aqui: PostGIS/GeoJSON usam `(lon, lat)` e o
  `flutter_map` usa `(lat, lon)`. A conversão mora numa única função em `packages/core/lib/geo/`,
  com teste. Não converter à mão em nenhum outro lugar.
- **O admin guarda um JWT no desktop.** Usar `flutter_secure_storage` (Keychain no macOS, DPAPI no
  Windows, libsecret no Linux) — nunca `SharedPreferences`, que é texto puro em disco.
- **Binários do admin não são assinados.** Windows SmartScreen e Gatekeeper vão reclamar na primeira
  execução. É esperado; instruir o admin em vez de tentar contornar.
- **Uso dos tiles do OSM** tem política própria: sem *bulk download*, com User-Agent identificado.
  Se o volume crescer, migrar para um provedor de tiles ou hospedar os próprios.
- **Localização é dado sensível.** A posição do publicador fica no dispositivo — não enviar ao
  servidor, não logar, não guardar histórico.
- **Polígono grande é payload grande.** Simplificar geometria no envio ao app (`ST_Simplify` com
  tolerância pequena) e paginar por proximidade quando a congregação tiver muitos territórios.
- Os dados são de uso comunitário e de baixo volume — otimizar cedo não vale o custo, exceto no
  índice espacial, que vem de graça com PostGIS.

## Contexto Extra

- **Território** é a área atribuída a um grupo de publicadores; **quadra** (*block*) é o quarteirão
  numerado dentro dele, que é a unidade real de trabalho em campo. A numeração das quadras
  frequentemente já existe em papel — por isso ela é editável, e não gerada de forma imutável.
- O admin é uma pessoa só por congregação, sem perfil técnico. A interface de desenho precisa ser
  tolerante: desfazer, arrastar vértice, e mensagem clara quando a regra bloqueia.
- Territórios são trabalhados em **ciclos**: a ideia é cobrir todos e recomeçar. Por isso "última
  vez trabalhada" é a informação mais útil do sistema no dia a dia — é o que diz para onde ir hoje.
  Vale destacar visualmente no mapa a quadra que está há mais tempo sem visita.
- Volume esperado é pequeno: dezenas de territórios e centenas de quadras por congregação.

## Pontos em Aberto

- Estratégia de **sincronização offline** do app (pull completo vs. delta por timestamp).
- Se o admin precisa **exportar** territórios (PDF/imagem) para uso impresso.
- Se existe fluxo de **atribuição** de território a publicador, ou se isso segue fora do sistema.
- **Reinstalar o app custa um código novo.** Limpar os dados ou trocar de celular apaga o token, e
  só o admin consegue devolver o acesso. Se isso virar chamado frequente, o remédio é o admin poder
  gerar o código em lote e a tela deixar isso a dois cliques — não afrouxar a regra.
- Se o admin precisa de uma visão de **quadras não trabalhadas há mais de N dias** — é o relatório
  mais provável de aparecer assim que houver histórico, e o índice já está preparado para ele.
- **Desfazer no editor de polígono**: o `flutter_map_line_editor` não traz pilha de undo. Definir se
  o admin precisa de undo/redo real ou se "apagar vértice por long-press" basta.

## Implementações

Atualizado automaticamente pelas skills `/centaur-driven-tdd` e `/centaur-driven-implement`.
Veja `.claude/implements/status.md` para o histórico completo e `.claude/specs/index.md` para as
specs planejadas.
