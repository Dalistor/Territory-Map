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
| Servidor | Python 3.12+, FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic |
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

Monorepo. Nada foi implementado ainda — esta é a estrutura alvo.

```
Territory map/
├── CLAUDE.md
├── docker-compose.yml          # postgis + api (prod)
├── docker-compose.dev.yml      # só o postgis, para desenvolvimento local
├── .claude/
│   ├── implements/status.md    # histórico de implementações
│   └── specs/index.md          # índice de specs planejadas
├── server/                     # FastAPI
│   ├── app/
│   │   ├── main.py             # bootstrap da aplicação
│   │   ├── core/               # config, segurança, sessão do banco
│   │   ├── models/             # entidades SQLAlchemy
│   │   ├── schemas/            # DTOs Pydantic
│   │   ├── repositories/       # acesso a dados
│   │   ├── services/           # regras de negócio
│   │   └── routers/            # endpoints HTTP
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
| `access_code` | str? | **único global** enquanto existe, curto (ex.: 8 caracteres, alfabeto sem `0/O/1/I`). Fica **nulo** depois de usado ou expirado. |
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
| `boundary` | `GEOGRAPHY(POLYGON, 4326)` | a demarcação do território |
| `created_at` | datetime | |

### Block
| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `territory_id` | UUID | FK → Territory |
| `number` | int | único dentro do território |
| `polygon` | `GEOGRAPHY(POLYGON, 4326)` | o contorno da quadra |
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
  resgate.
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
| Core | `server/app/core/` | Config, sessão do banco, segurança, dependências | Regra de negócio de domínio |

**Direção da dependência:** `router → service → repository → model`. Nunca o inverso.
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
| Framework | pytest + pytest-asyncio | `package:test` (Dart puro) | `flutter_test` |
| Rodar tudo | `cd server && pytest` | `cd packages/core && dart test` | `cd app && flutter test` |
| Rodar um arquivo | `pytest tests/services/test_territory_service.py` | `dart test test/geo/latlng_test.dart` | `flutter test test/domain/foo_test.dart` |
| Cobertura | `pytest --cov=app --cov-report=term-missing` | `dart test --coverage=coverage` | `flutter test --coverage` |
| Local e nome | `server/tests/**/test_*.py` | `packages/core/test/**/*_test.dart` | `<projeto>/test/**/*_test.dart` |
| Meta | **100% nos services** (regras de negócio), 80% geral | **100%** em `geo/` | casos de uso do domínio |

**TDD é obrigatório em toda regra de negócio do servidor** — validação geométrica, login,
numeração de quadras. Espelhe a estrutura de `app/` dentro de `tests/`.

`packages/core` é Dart puro justamente para que a lógica compartilhada (conversão de coordenadas,
pré-validação de polígono, mapeamento de erro) seja testável em milissegundos, sem emulador nem
janela. É onde o TDD do lado cliente vale a pena.

**Como mockar:**
- **Banco**: as regras geométricas dependem do PostGIS de verdade — teste os services contra um
  PostGIS real em container (`docker-compose.dev.yml`), cada teste dentro de uma transação com
  rollback. Não mocke geometria; um fake de `ST_Within` testa o fake, não a regra.
- **Repositórios**: em teste de service que *não* seja geométrico, use fake in-memory implementando
  a mesma interface — não `MagicMock` solto.
- **Relógio**: injete um provider de tempo; nunca chame `datetime.now()` direto no service.
- **HTTP no app/admin**: cliente da API por trás de interface, com implementação fake nos testes.
  Como o cliente vive em `core`, o mesmo fake serve aos dois projetos.

## Como Rodar

Ainda não há código. Passos alvo:

**Banco (necessário para servidor e testes):**
```bash
docker compose -f docker-compose.dev.yml up -d
```

**Servidor:**
```bash
cd server && uv sync && alembic upgrade head && uvicorn app.main:app --reload
```
API em `http://localhost:8000`, docs em `/docs`.

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

**Servidor** — VPS Ubuntu com Docker, deploy automático por **GitHub Actions** em push na `main`
(build da imagem + `docker compose up -d` via SSH). Ainda não configurado; usar a skill
`/centaur-driven-deploy` quando o servidor estiver de pé.

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
- **`POST /app/activate` precisa de rate limit.** É o único endpoint em que um código curto pode ser
  adivinhado por tentativa e erro. Limitar por IP e cortar após poucas falhas seguidas. Com 8
  caracteres, uso único e 24 horas de janela, o risco já é baixo — o rate limit é o que o mantém
  baixo se o alfabeto ou o tamanho mudarem depois.
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

- **Território não contíguo**: se um território puder ser formado por áreas separadas ("grupos de
  demarcações"), `boundary` precisa ser `MULTIPOLYGON` em vez de `POLYGON`. Definir antes da
  primeira migração — mudar depois é retrabalho.
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
