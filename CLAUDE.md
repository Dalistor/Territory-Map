# Territory Map

## Visão Geral

Aplicativo para gerenciar **territórios de pregação das Testemunhas de Jeová**.

O sistema mapeia territórios (áreas geográficas atribuídas a uma congregação) e as quadras
numeradas dentro deles, exibindo tudo sobre um mapa real.

São três partes:

| Parte | Público | O que faz |
|-------|---------|-----------|
| **Servidor** | — | API REST, dono das regras de negócio e da validação geométrica |
| **App Android** (Flutter) | Publicadores em campo | Abre e já mostra a posição do usuário no mapa, com os territórios e quadras da congregação desenhados por cima. **Somente leitura.** |
| **Admin** (Electron) | Responsável pelos territórios na congregação | Desenha as demarcações dos territórios, marca e numera as quadras. Fala direto com o servidor. |

**Sem cadastro de usuário.** O publicador não cria conta: na primeira abertura ele informa o
**código de acesso da congregação** (código curto, entregue pelo admin), o app guarda esse código
no dispositivo e a partir daí abre direto no mapa. Só o admin tem senha.

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Servidor | Python 3.12+, FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic |
| Banco | PostgreSQL 16 + **PostGIS** |
| Geometria (Python) | Shapely / GeoAlchemy2 |
| Auth | JWT (`python-jose`) + hash de senha com **bcrypt** (`passlib`) |
| Mapas | **OpenStreetMap** — `flutter_map` no Android, **Leaflet** no Electron. Sem chave de API, sem billing. |
| App | Flutter (Dart), Riverpod para estado, Drift/SQLite para cache offline |
| Admin | Electron + TypeScript + Vite + React |
| Infra | Docker + Docker Compose em um Ubuntu |
| CI/CD | GitHub Actions → deploy por SSH na VPS |

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
├── app/                        # Flutter (Android)
│   ├── lib/
│   │   ├── main.dart
│   │   ├── data/               # api client, cache local, repositórios
│   │   ├── domain/             # entidades e casos de uso
│   │   └── presentation/       # telas, widgets, providers
│   └── test/
└── admin/                      # Electron
    ├── src/
    │   ├── main/               # processo main, janelas, IPC
    │   ├── preload/            # bridge segura
    │   ├── renderer/           # UI React + Leaflet
    │   └── shared/             # tipos e contratos compartilhados
    └── tests/
```

## Modelo de Dados

Coordenadas sempre em **WGS84 (SRID 4326)**, no par `(latitude, longitude)`.
Nas APIs de mapa e no GeoJSON a ordem é `[longitude, latitude]` — atenção à inversão.

### Congregation
| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `name` | str | |
| `city` | str | |
| `access_code` | str | único, curto (ex.: 8 caracteres). É o que o app Android usa para se vincular. |
| `password_hash` | str | bcrypt |
| `created_at` | datetime | |

Único composto em `(name, city)`.

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
| `created_at` | datetime | |

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
4. **`Congregation.access_code` é campo novo**, necessário para o app sem cadastro saber de qual
   congregação carregar os territórios.

## Regras de Negócio

### Login (admin)
- `POST /auth/login` recebe `name`, `city` e `password`. **Os três são validados juntos** — não
  existe "buscar congregação e depois conferir a senha" exposto ao cliente.
- Falha em qualquer um dos três retorna **a mesma mensagem genérica** ("credenciais inválidas") e o
  mesmo status, sem revelar qual campo errou.
- Sucesso retorna um JWT com expiração e o `congregation_id` no payload.
- Todo endpoint de escrita exige o JWT e opera **apenas** sobre dados da congregação do token.

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
- Somente leitura. Nenhum endpoint de escrita é exposto ao app.
- Vincula-se pelo `access_code` da congregação; sem código válido, não há dados.
- Faz cache local dos territórios e quadras para funcionar sem sinal em campo. Os *tiles* do mapa
  ficam limitados ao que já foi carregado — isso é uma limitação conhecida, não um bug.

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
- **Multi-tenant por congregação.** Todo dado é escopado por `congregation_id`, sempre derivado do
  JWT ou do `access_code` — nunca aceito como parâmetro vindo do cliente.

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

### Admin (Electron)

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Main | `admin/src/main/` | Janelas, ciclo de vida, IPC, armazenamento do token | Renderizar UI |
| Preload | `admin/src/preload/` | Bridge tipada via `contextBridge` | Lógica de negócio, expor `ipcRenderer` cru |
| Renderer | `admin/src/renderer/` | UI React, mapa Leaflet, desenho dos polígonos | Acesso a Node/fs, uso de `nodeIntegration` |
| Shared | `admin/src/shared/` | Tipos do contrato da API | Código com efeito colateral |

`contextIsolation: true` e `nodeIntegration: false` são obrigatórios.

## Testes

| Item | Servidor | App (Flutter) | Admin (Electron) |
|------|----------|---------------|------------------|
| Framework | pytest + pytest-asyncio | `flutter_test` | Vitest |
| Rodar tudo | `cd server && pytest` | `cd app && flutter test` | `cd admin && npm test` |
| Rodar um arquivo | `pytest tests/services/test_territory_service.py` | `flutter test test/domain/foo_test.dart` | `npm test -- src/shared/foo.test.ts` |
| Cobertura | `pytest --cov=app --cov-report=term-missing` | `flutter test --coverage` | `npm test -- --coverage` |
| Local e nome | `server/tests/**/test_*.py` | `app/test/**/*_test.dart` | `admin/**/*.test.ts` |
| Meta | **100% nos services** (regras de negócio), 80% geral | casos de uso do domínio | funções puras de `shared/` |

**TDD é obrigatório em toda regra de negócio do servidor** — validação geométrica, login,
numeração de quadras. Espelhe a estrutura de `app/` dentro de `tests/`.

**Como mockar:**
- **Banco**: as regras geométricas dependem do PostGIS de verdade — teste os services contra um
  PostGIS real em container (`docker-compose.dev.yml`), cada teste dentro de uma transação com
  rollback. Não mocke geometria; um fake de `ST_Within` testa o fake, não a regra.
- **Repositórios**: em teste de service que *não* seja geométrico, use fake in-memory implementando
  a mesma interface — não `MagicMock` solto.
- **Relógio**: injete um provider de tempo; nunca chame `datetime.now()` direto no service.
- **HTTP no app/admin**: cliente da API por trás de interface, com implementação fake nos testes.

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

**App:**
```bash
cd app && flutter pub get && flutter run
```

**Admin:**
```bash
cd admin && npm install && npm run dev
```

## Como Fazer Deploy

Alvo: VPS Ubuntu com Docker, deploy automático por **GitHub Actions** disparado em push na `main`
(build da imagem + `docker compose up -d` via SSH).

Ainda não configurado — usar a skill `/centaur-driven-deploy` quando o servidor estiver de pé.
Os clientes não entram nesse fluxo: o app é distribuído como APK/Play Store e o admin como binário
Electron empacotado.

## Regras e Convenções

- **Idioma**: código, nomes de arquivo, commits e comentários em **inglês**. Documentação em
  `.claude/` e conversa em **português**.
- **Naming**: Python `snake_case` (classes `PascalCase`); Dart `lowerCamelCase` com arquivos
  `snake_case.dart`; TypeScript `camelCase` com componentes React em `PascalCase.tsx`.
- **Um arquivo por entidade** em cada camada — `models/territory.py`, `services/territory_service.py`.
- **Nada de coordenada como float solto**: use um tipo/DTO nomeado (`LatLng`) para não trocar
  latitude com longitude.
- **Migrações sempre via Alembic**, nunca DDL manual no banco.
- **Erros de domínio** são exceções próprias (`TerritoryOverlapError`, `BlockOutsideTerritoryError`),
  traduzidas para HTTP só no router.
- Mensagens de erro **voltadas ao admin** devem dizer o que fazer, não só o que falhou
  ("a quadra 12 ficou fora da nova demarcação").

## Restrições e Cuidados

- **Nunca aceitar `congregation_id` do cliente.** Sempre derivar do JWT (admin) ou do `access_code`
  (app). É a única barreira entre os dados de congregações diferentes.
- **Senha nunca em SHA simples, nunca em log, nunca de volta na resposta.**
- **Ordem das coordenadas** é a fonte clássica de bug aqui: PostGIS/GeoJSON usam `(lon, lat)`,
  Leaflet e flutter_map usam `(lat, lon)`. Converta numa única função e teste-a.
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
- Volume esperado é pequeno: dezenas de territórios e centenas de quadras por congregação.

## Pontos em Aberto

- **Território não contíguo**: se um território puder ser formado por áreas separadas ("grupos de
  demarcações"), `boundary` precisa ser `MULTIPOLYGON` em vez de `POLYGON`. Definir antes da
  primeira migração — mudar depois é retrabalho.
- Estratégia de **sincronização offline** do app (pull completo vs. delta por timestamp).
- Se o admin precisa **exportar** territórios (PDF/imagem) para uso impresso.
- Se existe fluxo de **atribuição** de território a publicador, ou se isso segue fora do sistema.

## Implementações

Atualizado automaticamente pelas skills `/centaur-driven-tdd` e `/centaur-driven-implement`.
Veja `.claude/implements/status.md` para o histórico completo e `.claude/specs/index.md` para as
specs planejadas.
