# Territory Map

## Visão Geral

Aplicativo para gerenciar **territórios de pregação das Testemunhas de Jeová**.

O sistema mapeia territórios (áreas geográficas atribuídas a uma congregação) e as quadras
numeradas dentro deles, exibindo tudo sobre um mapa real.

São quatro partes:

| Parte | Público | O que faz |
|-------|---------|-----------|
| **Servidor** | — | API REST, dono das regras de negócio e da validação geométrica |
| **App Android** (React Native) | Publicadores em campo | Abre e já mostra a posição do usuário no mapa, com os territórios e quadras da congregação desenhados por cima. Permite **marcar uma quadra como trabalhada**, sempre dentro de um território designado a quem está usando. |
| **Admin** (Electron desktop) | Responsável pelos territórios na congregação | Desenha as demarcações dos territórios, marca, numera e **apaga** as quadras, cadastra os publicadores e acompanha o que já foi trabalhado. Fala direto com o servidor. Roda em Windows, Linux e macOS. |
| **App Admin** (React Native, Android — specs 0012 e 0013) | O mesmo responsável pelos territórios, agora **em campo** | O subconjunto do admin que faz sentido no celular: ver quem está com cada território (mapa com as demarcações **e as quadras**, numeradas e coloridas pelo status, + lista), abrir o cartão S-13 de um território, **designar**, **marcar como concluído**, **apagar um registro** da designação, **lançar que uma quadra foi trabalhada** (escolhendo o publicador e a data) e **apagar um registro de trabalho** errado. Fala direto com o servidor, com a mesma credencial do desktop. |

**O que o app admin não faz, e continua só no desktop.** É recorte de propósito, não pendência:
desenhar ou editar demarcação de território e de quadra (e apagar qualquer uma das duas); cadastrar,
desativar ou apagar publicador e gerar código de acesso — ele **lê** a lista para poder escolher um
dirigente ou o autor de uma marcação, mas não a gerencia; forçar o `status_override` de uma quadra;
a página de Histórico da congregação inteira; e todo o import/export S-13/T em DOCX e XLSX.

**Apagar registro de trabalho deixou de estar nessa lista** (spec 0013). Era o caso mais próximo da
fronteira e caiu para o lado do celular pelo motivo mais simples: é a correção que acompanha o
marcar, e quem lança trabalho errado em campo precisa desfazer em campo, não na volta para casa. As
outras continuam onde estão — desenho pede tela grande, e gerir publicador ou forçar status é
decisão de mesa.

Duas ações do admin merecem destaque porque destroem dado:

- **Apagar uma quadra** leva o histórico de trabalho dela junto — `block_work_logs.block_id` é
  `ON DELETE CASCADE`, então isso é literal, não hipótese. A confirmação na tela diz isso com todas
  as letras antes de perguntar.
- **Sair da congregação** apaga nome, cidade e senha **deste computador** — ou **deste aparelho**, no
  app admin — e devolve o app à tela de configuração inicial. É o caminho para trocar de congregação
  ou corrigir uma senha digitada errado, sem precisar mexer no keystore do sistema operacional. Nada
  é tocado no servidor: os territórios, as quadras e os publicadores continuam lá, e digitar as
  credenciais de novo devolve o acesso.

**Uso pessoal: o admin não tem tela de login no dia a dia.** É uma instalação de uma congregação
só. Na primeira abertura o app pede nome, cidade e senha **uma única vez**, guarda os três
criptografados em disco via `safeStorage` do Electron e autentica sozinho dali em diante; ao receber
401 (o JWT dura 12h), ele refaz o login em silêncio e repete a requisição. Quem usa nunca mais vê a
tela. **O app admin faz exatamente o mesmo no celular**, trocando o `safeStorage` pelo keystore do
Android (`react-native-keychain`, em `admin-app/src/data/credentials-store.ts`) e o
`main/session.ts` pelo `data/session.ts` — mesmo login silencioso, mesma retentativa única no 401,
mesmo `CredentialsRejectedError` devolvendo à configuração inicial quando a senha muda no servidor.

**A congregação continua existindo no servidor, e isso é de propósito.** Ela é a única barreira de
escopo da API: todo dado é filtrado por `congregation_id` derivado do token, e as rotas de escrita
exigem esse token. Removê-la deixaria as rotas de admin protegidas só pelo `X-App-Key` — que viaja
dentro do binário e é extraível — num servidor publicado na internet. Como o mecanismo já está
pronto e testado, mantê-lo custa zero e é o que impede que quem achar o endereço apague tudo.

**Sem cadastro feito pelo publicador.** Quem cadastra é o admin, e só pelo **desktop**: ali ele
preenche o **nome da pessoa**, o sistema gera um **código de acesso individual**, e ele entrega esse
código àquela pessoa. Na primeira abertura o publicador informa só o código — sem nome, sem senha, sem conta — e
o app guarda o vínculo no dispositivo. Como o código é individual, o admin sempre sabe quem é cada
usuário e quem trabalhou cada quadra. Só o admin tem senha.

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Servidor | Python 3.12+, FastAPI, SQLAlchemy 2.x **síncrono** + psycopg 3, Pydantic v2, Alembic, uv |
| Banco | PostgreSQL 16 + **PostGIS** |
| Geometria (Python) | Shapely / GeoAlchemy2 |
| Auth | JWT (`python-jose`) + hash de senha com **bcrypt** (`passlib`) |
| Mapas | **OpenStreetMap** — `@maplibre/maplibre-react-native` (MapLibre Native) nos dois apps Android; `react-leaflet`/Leaflet no admin desktop. Sem chave de API, sem billing. |
| App (Android) | **React Native (CLI puro, sem Expo) + TypeScript**, React Navigation para navegação, `react-native-keychain` (token) e `AsyncStorage` (cache de mapa) |
| App Admin (Android) | **React Native (CLI puro, sem Expo) + TypeScript**, React Navigation, `react-native-keychain` (nome, cidade e senha da congregação), `@react-native-community/datetimepicker` (a data da marcação). Sem `AsyncStorage`: não há cache offline. |
| Admin (desktop) | **Electron + React + TypeScript**, Leaflet + **Leaflet-Geoman** para desenhar/editar polígono, `safeStorage` (Electron) para as credenciais, **`exceljs`** (no main process) para as planilhas `.xlsx` e **`jszip`** para ler e escrever o `.docx` do S-13-T |
| Infra | Docker + Docker Compose em um Ubuntu |
| CI/CD | GitHub Actions → deploy do servidor por SSH. Os três clientes não têm CI: os builds (`electron-builder`, `./gradlew assembleRelease` nos dois apps) são sempre locais |

> O admin trocou de Flutter para Electron em 2026-08-08 porque esta máquina não compila
> `flutter build macos` sem o Xcode completo, e o build local em Electron já era um caminho
> validado em outro projeto do autor. **Arquitetura de processo do admin:** o processo **main**
> é o único que fala com a API e guarda credenciais; o **renderer** (React) nunca vê senha nem
> token — só chama `window.api.*`, exposto pelo **preload** via `contextBridge`, com
> `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true`.

> **O app trocou de Flutter para React Native na spec 0005 (2026-08-17), por escolha do dono do
> projeto** — não por uma limitação técnica encontrada, como no caso do admin. Consequência direta:
> `packages/core`, o pacote Dart compartilhado que só o app Flutter usava, perdeu o único cliente e
> foi removido do monorepo na mesma spec (Task 12), junto com `.github/workflows/core.yml`. O app em
> TypeScript não tem com quem compartilhar código Dart; sua lógica própria vive em
> `app/src/domain/` e `app/src/data/`, sem pacote separado — mesma decisão de fundo já tomada para o
> admin (`admin/src/shared/` em vez de depender de `packages/core`), agora estendida ao segundo
> cliente.

> **`admin-app/` é projeto novo, não uma tela a mais dentro de `app/` (spec 0012, 2026-08-23).** O
> app do publicador se autentica por código descartável e não tem senha nenhuma; pôr a senha da
> congregação dentro do binário que o publicador instala inverteria a separação que o próprio
> servidor faz entre `/app/*` e `/admin/*`. São dois APKs, dois `applicationId`
> (`com.territorymapapp` e `com.territorymapadmin`) e dois públicos — e, como os ids diferem, os
> dois convivem instalados no mesmo aparelho, que é o caso de quem cuida dos territórios e também
> sai em campo. Também **sem pacote compartilhado** com `app/` ou `admin/`, pela terceira vez pela
> mesma razão: `admin-app/` tem sua própria `src/domain/`.

## Estrutura do Projeto

Monorepo. O servidor está completo. O `admin/` está implementado — configuração inicial e, a partir
daí, **navegação por sidebar permanente** (Mapa / Designações / Histórico / Publicadores, com o nome da
congregação no topo e "Sair da congregação" no rodapé): o Mapa é a Home (mapa + lista de
territórios), **Designações** é a página própria da designação de território (mapa só com as
demarcações, sem quadras, o nome do dirigente sobreposto a cada território), onde clicar num
território abre um **painel de histórico** — o cartão S-13, com a designação em vigor, as
anteriores com suas datas e um botão de apagar em cada, mais "Designar a…" e "Marcar como
concluído" — e um botão **"Exportar para Excel"** gera um `.xlsx` com **uma aba por território**,
no estilo do S-13 (publicador, data de início, data de conclusão); a planilha é montada com
**`exceljs`** no main process (`admin/src/main/excel-export.ts`, que sanea e desduplica o nome da
aba dentro do limite de 31 caracteres do Excel) e sai **formatada** — larguras de coluna que
comportam nome e rótulo de data, título e cabeçalho em negrito (o cabeçalho ainda com fundo cinza),
bordas finas em toda a tabela, cabeçalho congelado e configuração de impressão que ajusta à largura
da página e repete o cabeçalho em cada uma — e é salva pelo `dialog.showSaveDialog` do Electron.
A mesma página tem ainda o **import/export do formulário oficial S-13-T**, que é coisa diferente da
planilha acima: exportar abre um modal onde se escolhe o **ano de serviço** (o padrão vem de
`getServiceYear` em `admin/src/shared/models.ts` — de setembro em diante já conta o ano seguinte) e
o **formato**, `DOCX` (o padrão) ou `XLSX`. O `.docx` é gerado em `admin/src/main/docx-handler.ts`,
que abre o modelo oficial `admin/resources/S-13_T_template.docx` com **`jszip`** e reescreve o
`word/document.xml` célula a célula, preservando o layout do formulário; o `.xlsx` é a segunda
planilha de `excel-export.ts` (`buildS13TWorkbook`), em paisagem, com as dez colunas e os dois
registros por território do S-13-T e o rodapé "S-13-T 01/22". Importar é o caminho de quem já tem o
cartão preenchido em papel digitalizado: `imports.s13tSelectAndPreview` abre um seletor de `.docx`,
`parseS13TDocx` extrai ano, territórios e designações, e o resultado é **casado com os territórios
que já existem** — por número, e por nome quando não há número — e devolvido como *preview* com os
contadores, antes de qualquer escrita. Só quando o admin confirma é que `imports.s13tExecute` grava:
publicador que não existe é **criado pelo nome**, cada designação vira um `designate` e, se a linha
tiver data de conclusão, um `completeAssignment` em seguida; território sem correspondente é pulado,
e cada falha entra numa lista de erros devolvida ao final em vez de abortar o lote.
**Histórico** (spec 0008) é a página de consulta do histórico inteiro da congregação, numa chamada
só (`GET /admin/assignments`): os mesmos registros em **duas visões alternadas por um seletor** —
"Por dirigente" (cada publicador com as designações dele) e "Por território" (cada território com
quem passou por ele) —, mais um campo de **busca por nome** que filtra pelo nome de quem a visão
atual agrupa, e um botão de **apagar** em cada linha (com confirmação antes). Designar e concluir
continuam só em Designações, onde o mapa dá o contexto.
Publicadores tem busca por nome, contadores por situação e, em cada linha, **renomear**, gerar novo
código, desativar/reativar e **apagar** (spec 0011 — a confirmação avisa que o histórico da pessoa
fica, e uma recusa por designação aberta aparece com a mensagem do próprio servidor). Renomear é um
campo que abre na própria linha já preenchido com o nome atual; salvar sem mudar nada, ou com o
campo vazio, apenas fecha sem chamar o servidor. Cada território tem ainda uma
**página de configurações** (`TerritorySettingsScreen`, spec 0009), aberta pelo menu "⋮" da lista:
nome, **tempo de rotação** em dias (vazio = o padrão de 120, dito na própria interface, porque campo
vazio parece esquecimento), um resumo somente-leitura (quantas quadras, quantas vencidas pela
rotação em vigor, publicador designado, data da última visita), o **apagar território**, com a
mesma confirmação que antes vivia só na Home, e — desde a spec 0010 — a **tabela das quadras** do
território (número, status por extenso e última visita, ordenada por número, dizendo quando o status
é forçado). Clicar numa linha expande ali mesmo, sem sair da página, o `BlockWorkPanel`: o histórico
de trabalho daquela quadra, **adicionar** um registro (publicador + data, pelo `MarkWorkedForm`,
componente extraído da `HomeScreen` para não virar duas cópias), **apagar** um registro e **forçar o
status** para "Vencida", "Nunca trabalhada" ou de volta a "Automático". É de propósito que o painel
abra dentro da página: o admin percorre várias quadras seguidas sem ir e voltar. Ela continua não
desenhando nada — a demarcação é tarefa do `TerritoryEditorScreen`, e editar ou apagar o desenho da
quadra continua no menu dela no mapa da Home, assim como a `BlockHistorySheet`, a tela empurrada que
mostra o histórico de uma quadra a partir do mapa. As duas convivem: a `BlockHistorySheet` é o
caminho de quem já está com a quadra na frente, o `BlockWorkPanel` é o de quem está percorrendo o
território inteiro. Os editores de território e de quadra são telas empurradas
("← Voltar") em **layout lado a lado** (painel compacto à esquerda, mapa grande à direita); o de
quadra ainda sugere o próximo número da sequência após cada salvamento. Quando não há território
desenhado ainda, o mapa não tem onde ancorar: `admin/src/main/geocode.ts` procura um ponto
aproximado para a **cidade da congregação** na busca do **Nominatim** (OSM) e o mapa abre ali, em vez
de no meio do Brasil. Vive no main process pelo mesmo motivo que o `api-client.ts`: a política do
Nominatim pede um User-Agent identificando a aplicação, e um `fetch` de renderer não pode definir
esse header. Falha de qualquer tipo — sem resultado, sem rede, resposta malformada — resolve para
`null` em vez de estourar: é uma gentileza sobre onde o mapa abre, não algo que valha travar o app.
As nove telas são cobertas
por teste (Vitest + React Testing Library), assim como os dois componentes acima, mais o
roteamento/sidebar em `App.test.tsx`. O `app/` (React Native) também está implementado — ativação por código, dashboard,
mapa com MapLibre e localização em tempo real, marcação de quadra restrita ao território designado,
marcação sempre confirmada pelo servidor e cache local de leitura —, com as telas de
`presentation/` e as camadas de `domain/`/`data/`
cobertas por teste (Jest + `@testing-library/react-native`); só o componente que efetivamente
desenha o MapLibre nativo (`presentation/map/TerritoryMapView.tsx` e a tela que o compõe,
`presentation/screens/MapScreen.tsx`) não tem teste automatizado — ver "Testes" mais abaixo para o
porquê, e `app/README.md` para o passo de verificação manual em emulador/aparelho ainda pendente.
O `admin-app/` (spec 0012) é o mais novo dos três clientes, e está completo: configuração inicial
com nome, cidade e senha guardados no keystore, navegação e "Sair da congregação"
(`presentation/App.tsx`), e a **`DesignationsScreen`** como home — resumo de quantos territórios têm
dirigente, o mapa das designações, a lista com nome e dirigente de cada território (ou "Sem
dirigente") e um "Recarregar". Tocar num território, no mapa ou na lista, abre o `AssignmentPanel` —
o cartão S-13, com a designação em vigor, as anteriores, designar, concluir e apagar registro —, e
de cada linha se chega à `BlocksScreen`, as quadras do território ordenadas por número, com status
por extenso, última visita, o histórico de trabalho de cada uma e o formulário de marcar (publicador
+ data). As duas abrem **sobre** a lista, que continua montada por baixo: é o que faz uma designação
nova já estar refletida na linha quando o admin fecha o painel, sem sair e voltar da tela.

O mapa é `presentation/map/AssignmentsMapView.tsx`, e desde a spec 0013 ele **desenha as quadras**:
cada uma sai como polígono pintado pelo status — as mesmas três cores dos outros dois clientes,
`BLOCK_CATEGORY_COLOR` em `admin-app/src/domain/territoryMap.ts`, respeitando o `statusOverride` da
quadra e o `rotationDays` do território **dono** dela — com o número por cima, num `Marker` com
`<Text>` do React Native e não num `symbol` layer, pela mesma razão do app do publicador: o estilo é
raster puro, sem `glyphs`, e um servidor de fontes é o que escolher OSM + MapLibre existe para
evitar. O alvo do toque é o polígono inteiro, não só o número.

**Os rótulos de território ficam sempre visíveis no mapa, mesmo com as quadras à vista** —
decisão revertida em 2026-08-26 depois de um relato de campo: a spec 0013 os escondia quando havia
quadra desenhada (`shouldShowTerritoryLabels`, hoje removida), para o balão do dirigente não sentar
em cima dos números. Com uma congregação de 28 territórios, o efeito colateral pesou mais que o
problema que a regra resolvia — sem o rótulo o admin não sabia a qual território pertencia cada
grupo de quadras no mapa. O balão volta a aparecer sempre; a sobreposição ocasional com um número é
o preço aceito.

**No mapa principal, tocar num território (fora de uma quadra) abre a tela de quadras, não o cartão
S-13** — outra mudança do mesmo relato: no mapa o admin já está olhando as quadras, e a pergunta
natural ali é "o que já foi trabalhado", não "quem é o responsável". Designar continua alcançável
pela linha da lista, que abre o cartão S-13 como sempre, e agora tem também um atalho de "Marcar
como concluído" direto nela, ao lado da contagem de quadras do território. **Tocar numa quadra
continua abrindo o painel combinado** (`presentation/screens/BlockPanel.tsx`), sem mudança nenhuma
aqui: um lugar só com os dois níveis de ação entre os quais aquela quadra está. Em cima, a quadra —
status por extenso, o histórico de trabalho dela com um **apagar em cada registro**, e o formulário
de marcar como trabalhada. Embaixo, numa seção visualmente separada e rotulada com o nome do
território, o cartão S-13 dele: dirigente atual, designar, marcar como concluído e apagar registro
da designação. **A separação não é decoração**, e nem a frase que a acompanha: designar troca o
responsável pelo território **inteiro**, não pela quadra que o admin acabou de tocar — e ele chegou
ali dizendo "vou marcar esta quadra". O painel diz de quem é o escopo antes de oferecer o botão.
Nada é reescrito: a metade de cima é o `BlockWorkSection` que a `BlocksScreen` já usa, agora com a
capacidade de apagar que lá ele não tem, e a de baixo é o próprio `AssignmentPanel`.

A **tela de quadras** (`presentation/screens/BlocksScreen.tsx`) ganhou seu próprio mapa, do mesmo
jeito: um `AssignmentsMapView` recebendo só o território em vista (`[current]`), o que já desenha a
demarcação dele e suas quadras numeradas e coloridas sem nenhum código de mapa novo — o componente já
sabia desenhar o que recebesse. Tocar numa quadra ali abre a mesma seção que tocar na sua linha na
lista abre.

A **lista de territórios** é ordenada por `compareTerritoriesByNumber`
(`admin-app/src/domain/models.ts`), a mesma regra que o admin desktop já usa
(`admin/src/shared/models.ts`) — pelo número que o nome do território carrega por convenção
("Centro - N5"), não pela ordem alfabética do nome, senão "Casarotto -N28" lia antes de "Centro - N5"
só porque "C" vem antes de "C" do jeito errado. Nome sem número vai para o fim, alfabético entre si.

Todo o resto é coberto por
teste (Jest + `@testing-library/react-native`), com a mesma exceção de sempre para a view nativa do
MapLibre — o cálculo que dava para separar dela (centroide, cor, texto do rótulo, quais quadras são
desenháveis, se os rótulos aparecem) foi para
`admin-app/src/domain/territoryMap.ts`, com teste. O app usa a **logo e o ícone do produto**, os
mesmos do app do publicador — o ícone nas cinco densidades e a logo na tela de configuração inicial.
Ver `admin-app/README.md`, inclusive para o
pré-requisito de **JDK 17**, que esta máquina de desenvolvimento não tem: Jest, ESLint e `tsc` rodam
sem ele, nenhum build Android roda.

```
Territory map/
├── AGENTS.md
├── docker-compose.yml          # postgis + api (prod), api vinda do GHCR
├── docker-compose.dev.yml      # só o postgis, para desenvolvimento local
├── docker/
│   └── postgres/init/          # cria territory_map e territory_map_test com postgis
├── .github/
│   └── workflows/server.yml    # CI do servidor + build da imagem + deploy por SSH
├── .centaur/
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
├── app/                         # React Native (CLI puro) + TypeScript — Android
│   ├── README.md               # como instalar, configurar o .env, rodar e gerar o .apk
│   ├── .env.example             # API_BASE_URL e APP_KEY, lidos em tempo de build via react-native-config
│   ├── android/                 # projeto nativo Android (único alvo; não há pasta ios/)
│   └── src/
│       ├── domain/              # entidades e funções puras: models.ts, blockColor.ts, assignment.ts
│       ├── data/                # api-client.ts, session-store.ts (react-native-keychain),
│       │                        # territory-cache.ts (AsyncStorage)
│       └── presentation/        # screens/ (ActivationScreen, DashboardScreen, MapScreen), map/
│                                # (TerritoryMapView com MapLibre, territoryFilter.ts), App.tsx
├── admin-app/                   # React Native (CLI puro) + TypeScript — Android, o admin em campo
│   ├── README.md               # como rodar, empacotar, o JDK 17 e o que este app não faz
│   ├── .env.example             # API_BASE_URL e APP_KEY, lidos em tempo de build via react-native-config
│   ├── android/                 # projeto nativo Android (com.territorymapadmin; não há pasta ios/)
│   └── src/
│       ├── domain/              # entidades e funções puras: models.ts, assignment.ts, blockColor.ts,
│       │                        # blockStatusLabel.ts, territoryMap.ts
│       ├── data/                # api-client.ts, credentials-store.ts (react-native-keychain),
│       │                        # session.ts (reautenticação silenciosa no 401)
│       └── presentation/        # screens/ (SetupScreen, AssignmentPanel, BlocksScreen), map/
│                                # (AssignmentsMapView com MapLibre), App.tsx
└── admin/                      # Electron + React + TypeScript — desktop (sem domain/; veja Arquitetura de Camadas)
    ├── README.md               # como rodar, como configurar o .env e o aviso do SmartScreen/Gatekeeper
    ├── electron-builder.yml    # empacotamento local: dmg/zip (mac), nsis (Windows), AppImage/tar.gz (Linux)
    ├── .env.example             # API_BASE_URL e APP_KEY, lidos pelo main process via dotenv
    ├── resources/              # ícone do app e S-13_T_template.docx, o modelo oficial da exportação
    └── src/
        ├── main/                # processo principal: fala com a API (api-client.ts), guarda as
        │                        # credenciais com safeStorage (credentials-store.ts), sessão com
        │                        # reautenticação silenciosa (session.ts), as planilhas (excel-export.ts),
        │                        # o S-13-T em Word (docx-handler.ts), a geocodificação da cidade
        │                        # (geocode.ts) e os handlers de IPC
        ├── preload/             # ponte contextBridge — único lugar que expõe window.api ao renderer
        ├── renderer/            # React: telas (screens/), mapa editável (map/, com Leaflet-Geoman
        │                        # confinado a um único arquivo), providers
        └── shared/              # tipos e regras puras usados por main e renderer: modelos, geometria,
                                  # erros de API, contrato de IPC (ipc-contract.ts)
```
Testes ficam co-localizados dentro de `src/` (`*.test.ts`/`*.test.tsx`), não numa pasta `test/` à
parte — ver "Testes" mais abaixo para o porquê.

`app/`, `admin-app/` e `admin/` são três projetos TypeScript independentes, sem pacote compartilhado
entre eles — cada um tem sua própria cópia da lógica que só ele usa (`app/src/domain/`,
`admin-app/src/domain/` e `admin/src/shared/`). Nenhum dos três depende de `packages/core`, que não
existe mais no monorepo.

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
| `assigned_user_id` | UUID? | FK → User, nullable, `ON DELETE SET NULL`. **Derivado** da designação aberta em `TerritoryAssignment`. |
| `rotation_days` | int? | `INTEGER NULL`. Duração do ciclo de rotação do território, em dias. Nulo = **usa o padrão de 120 dias**. |
| `created_at` | datetime | |

`rotation_days` é a única regra do sistema que o admin configura por território: passado esse
número de dias sem visita, a quadra volta a aparecer como vencida no mapa. **Nulo não é "faltando
preencher"** — é o valor semanticamente correto para quem nunca precisou de outro ritmo, e os dois
clientes o traduzem para os mesmos 120 dias que já aplicavam antes de a coluna existir. Por isso a
migration que a criou (`a1c7e4f92b83`) **não faz backfill** e não define `server_default`: gravar
120 em toda linha diria que alguém escolheu 120, e ninguém escolheu. Faixa aceita quando presente:
1 a 3650 dias (de um dia a dez anos) — zero e negativo são bug de cliente, não configuração.

`assigned_user_id` é **1:N do lado do publicador, não do território**: um território tem no máximo
um publicador designado por vez, mas um publicador pode ter vários territórios designados ao mesmo
tempo (ex.: quem dirige um grupo). `SET NULL`, não `CASCADE` — apagar ou desativar o publicador
nunca apaga o território, só solta a designação.

**`assigned_user_id` é projeção, não fonte de verdade** — mesmo papel que `Block.last_worked_at`
tem em relação ao `BlockWorkLog`. Quem manda é a designação **aberta** em `TerritoryAssignment`; a
coluna é cache de leitura, recalculado pelo `AssignmentService` a cada designar/concluir/apagar
(`_refresh_assigned_user`). Ela sobrevive porque é o que a regra do app lê numa coluna só
(`WorkLogService`), sem precisar consultar o histórico a cada marcação.

### TerritoryAssignment
Um período em que um publicador foi responsável por um território — uma linha do cartão S-13.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `territory_id` | UUID | FK → Territory, `ON DELETE CASCADE` |
| `user_id` | UUID | **Sem FK.** UUID solto do publicador que dirigiu o território |
| `user_name` | str | `String(120)`, `NOT NULL`. O nome copiado no momento em que a designação foi aberta |
| `started_at` | datetime | quando a designação começou (relógio do servidor, nunca do cliente) |
| `completed_at` | datetime? | **nulo = designação aberta**; preenchido = virou histórico |
| `created_at` | datetime | |

Índices: `ix_territory_assignments_territory_started` em `(territory_id, started_at DESC)` — a
ordem em que o painel e a planilha leem o cartão — e **`uq_territory_assignments_open`**, índice
único **parcial** em `territory_id WHERE completed_at IS NULL`: é o banco, e não só o service,
garantindo **no máximo uma designação aberta por território**, mesmo com duas requisições
simultâneas.

Apagar o território leva o histórico junto (`CASCADE`), pela mesma razão das quadras: o registro só
significa alguma coisa em relação à área que descreve. Já apagar o **publicador** não leva nada:
veja "O nome na linha, em vez da FK" logo abaixo de `BlockWorkLog`.

A migration que criou a tabela (`d3ab774c1b2f`) **zera `territories.assigned_user_id`** e não faz
backfill: as designações que existiam não tinham data de início, e inventar uma poria data errada
no que vira histórico. O admin redesigna pela tela, com a data correta.

### Block
| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `territory_id` | UUID | FK → Territory |
| `number` | int | único dentro do território |
| `polygon` | `GEOMETRY(POLYGON, 4326)` | o contorno da quadra |
| `last_worked_at` | datetime? | **derivado** do `BlockWorkLog` mais recente. Nulo = nunca trabalhada. |
| `status_override` | str? | `VARCHAR(16) NULL`, restrito a `overdue` ou `never` por CHECK (`ck_blocks_status_override`). O status que o **admin forçou** para a quadra. Nulo = derive a cor dos registros. |
| `created_at` | datetime | |

`last_worked_at` é cache de leitura, não fonte de verdade: quem manda é o `BlockWorkLog`. Recalcular
sempre que um log for inserido ou removido — nunca escrever nele direto a partir de um endpoint.

`status_override` (spec 0010) é a exceção que o admin liga à mão quando sabe algo que os registros
não contam — a quadra está para ser trabalhada, ou o que está lá não vale mais. **Nulo não é
"faltando preencher"**: é "derive a cor dos registros de trabalho, como sempre", que é exatamente o
comportamento de toda quadra que já existia. Por isso a migration que criou a coluna **não faz
backfill** e não define `server_default` — gravar um status em toda linha diria que alguém escolheu
um, e ninguém escolheu. O CHECK só admite os dois estados que o admin pode forçar: não existe
forçar "recente", porque um registro de trabalho novo já produz isso, e a ausência é o caminho de
volta.

**A coluna não substitui `last_worked_at`, convive com ela.** O `BlockWorkLog` continua sendo a
verdade sobre **quem esteve lá e quando**; o override só diz **como pintar**. São perguntas
diferentes, e é por isso que forçar a cor não inventa visita nenhuma — o caminho alternativo, criar
um registro antigo para deixar a quadra laranja, foi descartado porque exigiria nomear um publicador
que nunca esteve ali, e registro falso é pior que uma coluna a mais.

### BlockWorkLog
Registro de que uma quadra foi trabalhada. Append-only pelo app.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID | PK |
| `block_id` | UUID | FK → Block |
| `user_id` | UUID | **Sem FK.** UUID solto de quem trabalhou a quadra |
| `user_name` | str | `String(120)`, `NOT NULL`. O nome copiado no momento em que o registro foi gravado |
| `worked_at` | datetime | quando a quadra foi concluída |
| `created_at` | datetime | quando o registro chegou ao servidor (pode diferir de `worked_at` por causa do offline) |

Índice em `(block_id, worked_at DESC)`.

### O nome na linha, em vez da FK

Vale para as **duas** tabelas de histórico — `BlockWorkLog` e `TerritoryAssignment`. Antes da spec
0011 as duas apontavam para `users` com `ON DELETE RESTRICT`, justamente para que o histórico não
perdesse a pessoa em silêncio; a consequência é que o banco recusava apagar qualquer publicador que
já tivesse trabalhado uma quadra ou aparecido num cartão S-13 — ou seja, todo mundo que importava.

A intenção continua a mesma, o mecanismo é outro: **a linha guarda o nome**, copiado no momento em
que ela é escrita, e o `user_name` é `NOT NULL` pela mesma razão que `user_id` sempre foi
obrigatório — registro sem autor não serve para nada. Assim o histórico não depende mais de a pessoa
continuar existindo para ser legível. `user_id` sobrevive como UUID **sem constraint**: serve para
agrupar "por dirigente" enquanto o publicador existe, e vira um id órfão inofensivo depois que ele é
apagado, porque quem responde "quem foi" é o nome ao lado. As relationships `BlockWorkLog.user` e
`TerritoryAssignment.user` deixaram de existir junto com as FKs — sem chave estrangeira elas seriam
um join que o banco não garante, devolvendo `None` exatamente no caso que a mudança existe para
resolver. Os DTOs continuam com o mesmo `{id, name}` aninhado de sempre, só que montado no router a
partir de `user_id` + `user_name`; nenhuma tela e nem o app perceberam a troca.

Duas consequências foram aceitas de propósito:

- **O nome é uma fotografia.** Renomear um publicador não reescreve o que já foi gravado — o
  histórico fica com o nome que a pessoa tinha no dia. É o preço de desnormalizar, e é exatamente
  o que faz o registro sobreviver à exclusão dela.
- **Dois homônimos ficam indistinguíveis** no histórico depois que um dos dois é apagado. Enquanto
  ambos existirem, o `user_id` sem FK ainda os separa.

A migration (`e7b34c1d5a80`) **faz backfill** a partir de `users` antes de derrubar as FKs. A aplicação
está em uso com dados reais; registros novos preservam o nome no momento da escrita, e os registros
existentes foram preenchidos antes da remoção das constraints. É o oposto do que as migrations de
`d3ab774c1b2f` e `a1c7e4f92b83` fizeram, e pela razão contrária: lá o dado correto não existia para
ser copiado; aqui ele existia.

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
- O app guarda o **token** em armazenamento seguro (`react-native-keychain`,
  `app/src/data/session-store.ts`) e nunca guarda o código. O token não expira; só deixa de valer se
  o admin desativar o usuário.
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
- O admin pode **renomear** um usuário pelo mesmo `PATCH /admin/users/{id}`, que passou a aceitar
  `name` além de `is_active`. Os dois campos são opcionais e **campo ausente não é tocado** — assim
  renomear alguém não é também uma declaração sobre o acesso dele —, mas um corpo com nenhum dos
  dois responde **422**: aceitar seria esconder bug de cliente atrás de um 200.
- **Renomear não reescreve o histórico**, e isso é consequência direta de "O nome na linha, em vez
  da FK": `block_work_logs.user_name` e `territory_assignments.user_name` são cópias feitas quando
  aquelas linhas foram escritas. O trabalho passado continua com o nome que a pessoa tinha no dia,
  que é justamente o que mantém o histórico legível depois de ela ser renomeada ou apagada. Se um
  dia for preciso propagar a correção de um nome digitado errado, isso é uma decisão nova e um
  backfill, não um efeito colateral deste `PATCH`.
- O admin pode **desativar** um usuário (`is_active = false`). A partir daí o token é recusado, mas
  os `BlockWorkLog` daquela pessoa permanecem — histórico não se apaga com revogação.
- O admin pode **apagar** um usuário (`DELETE /admin/users/{id}`, 204). A pessoa sai da lista e o
  aparelho dela perde o acesso na hora; o que ela produziu **fica**, com o nome preservado em cada
  linha (ver "O nome na linha, em vez da FK"). Ter histórico — registros de trabalho, designações já
  concluídas — **não** impede a exclusão; é justamente para isso que o nome passou a viver na linha.
- **A única barreira é a designação aberta.** Apagar quem ainda tem território em vigor responde
  **409** (`PublisherHasOpenAssignmentError`), com a mensagem dizendo o que fazer: concluir a
  designação antes. Nada é encerrado por tabela — soltar o território de alguém é decisão do admin,
  não efeito colateral de um clique em "Apagar". Publicador de outra congregação e id inexistente
  respondem o mesmo **404**.
- **Desativar e apagar não são a mesma coisa, e as duas existem de propósito.** Desativar revoga o
  acesso e **mantém a pessoa na lista** — é para quem parou de sair em campo e pode voltar, e para
  quem se quer continuar designando no admin. Apagar **tira a pessoa do sistema** e deixa só o
  rastro dela no histórico — é para o cadastro errado, o duplicado, ou quem saiu da congregação. A
  confirmação na tela diz isso com todas as letras, para o admin não escolher o botão errado por
  medo de perder o histórico.
- O admin nunca vê o código de outra congregação, e um código só serve para a congregação dele.

### Marcar quadra como trabalhada
- `POST /app/blocks/{id}/worked` com o token do app, corpo com `worked_at`. Cria um `BlockWorkLog`
  e atualiza `Block.last_worked_at`.
- O bloco precisa pertencer à congregação do token. Bloco de outra congregação responde **404**,
  não 403 — não confirmar que o recurso existe.
- **O app não desmarca.** Só o admin corrige ou remove um registro, pelo app admin; ao remover,
  `last_worked_at` é recalculado a partir do log restante.
- Marcações repetidas da mesma pessoa no mesmo bloco são registros distintos e legítimos (a quadra
  foi trabalhada de novo). Idempotência é por `id` do log gerado no cliente, para um reenvio não
  duplicar.
- `worked_at` no futuro é rejeitado. Muito antigo (ex.: > 90 dias) também — provável relógio errado
  do aparelho.

### Marcar quadra como trabalhada (pelo admin)
Nem todo trabalho chega pelo celular: o publicador esquece de marcar, entrega o cartão em papel, ou
nem usa o app. `POST /admin/blocks/{block_id}/worked` é o caminho do admin para lançar isso, com
corpo `{"user_id", "worked_at"}` — **o admin escolhe o publicador**, porque `BlockWorkLog.user_id`
continua `NOT NULL` e um log sem autor não serviria para nada. O que sai dali é um `BlockWorkLog`
comum, e `Block.last_worked_at` é recalculado a partir dos logs como sempre.

- **O `log_id` é gerado no servidor.** A idempotência por id do cliente existe por causa do reenvio
  do celular, e o admin não tem fila offline nenhuma — não há reenvio a reconhecer, então também
  não existe aqui o 200-de-reenvio que a rota do app devolve.
- **Não há checagem de designação**, ao contrário da rota do app. Quem registra é o responsável
  pelos territórios, lançando um fato que ele já conhece; exigir que a designação ainda estivesse
  aberta barraria justamente o caso mais comum, que é lançar trabalho de um ciclo já concluído.
- **Não há o piso de 90 dias.** Aquele limite existe para pegar aparelho com relógio errado; aqui a
  data foi digitada de propósito, muitas vezes copiada de um registro antigo em papel. O teto
  continua valendo: `worked_at` no futuro é recusado.
- Quadra e publicador precisam ser da congregação do token; qualquer um dos dois de fora, ou
  inexistente, responde o mesmo **404**. Publicador inativo **pode** ser marcado — desativar revoga
  o acesso ao app, não apaga a pessoa do histórico.
- **A rota do app não mudou.** O publicador continua só podendo marcar quadra de território
  designado a ele, e continua tomando 403 `territory_not_assigned` fora disso. A frouxidão acima é
  do admin, e só dele.
- **Dois clientes chamam esta rota**: o admin desktop, pela tabela de quadras da página de
  configurações do território, e o app admin (spec 0012), pela `BlocksScreen`. É a mesma rota e a
  mesma regra — o que muda é só o aparelho na mão de quem lança.

### Cor da quadra no mapa
Três cores, nos três clientes: **nunca trabalhada**, **vencida** e **recente**. O que a spec 0009
mudou foi o número que separa as duas últimas — era o literal 120 dias, e passou a ser o
`rotation_days` do território dono da quadra, com 120 sobrando apenas como padrão de quem não
configurou nada (`DEFAULT_ROTATION_DAYS`). A regra é função pura e vive em **três** arquivos
deliberadamente idênticos — `admin/src/renderer/map/blockColor.ts`, `app/src/domain/blockColor.ts` e
`admin-app/src/domain/blockColor.ts` (a terceira cópia chegou com a spec 0012) — e mudar um sem os
outros faz a mesma quadra ter cor diferente na mesa do admin, no celular dele e no celular do
publicador. Exatamente no limiar a quadra ainda é recente; só estritamente acima vira vencida.

Acima de tudo isso vem o `status_override` da quadra (spec 0010): os clientes o consultam
**antes** do cálculo por data, então `never` pinta de vermelho e `overdue` de laranja por mais
recente que seja a última visita, e ausente cai na regra de datas de sempre. Só há esses dois
valores — forçar "recente" seria forçar a interface a dizer que houve trabalho onde não houve.
No app admin a mesma categoria aparece **das duas formas**: como cor no mapa desde a spec 0013 (via
`BLOCK_CATEGORY_COLOR`, que repete os mesmos três hexadecimais dos outros clientes de propósito — os
valores são de domínio e por isso não moram em `presentation/theme.ts`), e como **texto** nas listas
e no painel da quadra, por `blockStatusLabel.ts`: "Nunca
trabalhada", "Vencida" e "Em dia", com o sufixo " (forçado)" quando o status veio de um override —
o admin precisa distinguir o que ele mesmo marcou do que o sistema derivou.

**Qualquer registro de trabalho novo limpa o override**, tanto pela rota do app quanto pela do
admin, no mesmo ponto em que `last_worked_at` é recomputado: uma visita recém-registrada é a
evidência mais forte que existe sobre a quadra, e mantê-la vermelha depois disso seria a interface
mentindo para quem acabou de trabalhar ali. **Apagar** um registro, ao contrário, **não** mexe no
override — apagar é o admin corrigindo o histórico, e adivinhar dali a intenção dele sobre a cor
erraria mais do que acertaria. A assimetria é deliberada, e é o que um refactor futuro mais
provavelmente quebra: `server/tests/integration/test_block_status_override_integration.py` existe
para pegar isso. Um reenvio de `log_id` já conhecido também não limpa nada, porque volta antes de
gravar. A interface do admin **diz na tela** que o forçado vale no mapa dele e no celular do
publicador e que o primeiro trabalho novo o desfaz — senão o admin acharia que o sistema desfez a
escolha dele sozinho.

### Designação de território
A designação é um **registro datado com histórico** (`TerritoryAssignment`), não um campo que se
sobrescreve — é o cartão S-13 em banco. Só o **admin** escreve nela; o app do publicador nunca.

As rotas vivem todas em `server/app/routers/admin_assignments.py`. Quatro delas ficam sob
`/admin/territories/{territory_id}/assignments`:

| Rota | O que faz |
|------|-----------|
| `GET ""` | o cartão do território: todos os períodos, mais recente primeiro (a aberta no topo) |
| `POST ""` (201) | designa a um publicador (`{"user_id": "<uuid>"}`), com `started_at` = agora |
| `POST "/complete"` | marca como concluído: fecha a designação em vigor e libera o território |
| `DELETE "/{assignment_id}"` (204) | apaga um registro do histórico de vez |

E há uma quinta, fora desse prefixo:

| Rota | O que faz |
|------|-----------|
| `GET /admin/assignments` | o histórico inteiro da congregação, mais recente primeiro, com o território embutido em cada registro (é o que a página **Histórico** do admin lê) |

Um prefixo pertence ao `APIRouter`, não à rota, então essa quinta rota tem um segundo `APIRouter`
(`flat_router`) no **mesmo arquivo** — manter o HTTP da designação num módulo só vale mais do que
uma pasta com um roteador por endereço.

As quatro primeiras têm **dois clientes** desde a spec 0012: a página Designações do admin desktop e
o `AssignmentPanel` do app admin. Nenhuma rota nova foi criada para o celular — mesmas rotas, mesmas
regras, mesma exigência de JWT de admin. A quinta (`GET /admin/assignments`) continua só no desktop,
porque a página Histórico não foi portada.

- **`PATCH /admin/territories/{id}/assignment` não existe mais** — foi removida junto com
  `TerritoryService.assign_to_user`. Designar e desdesignar deixaram de ser o mesmo `PATCH` com
  `null`, porque são eventos diferentes no cartão.
- **Designar grava a data de início.** Se já houver uma designação aberta, ela é **encerrada com a
  data de hoje** em vez de a operação ser recusada: no S-13 existem só duas datas por linha, então
  "devolveu" e "concluiu" são o mesmo evento, e exigir uma conclusão explícita antes custaria ao
  admin o clique único que ele tem para trocar de dirigente. A interface avisa antes de confirmar.
- **"Marcar como concluído" grava a data de conclusão e libera o território.** A projeção
  `assigned_user_id` é zerada na mesma chamada — consequência intencional: o publicador **perde na
  hora** o direito de marcar quadras ali. Território sem nada aberto responde 404.
- **Apagar um registro o remove do histórico de vez** (é o admin desfazendo o que não devia ter
  sido escrito, diferente de concluir, que preserva a linha). A projeção é **recalculada** a partir
  do que sobrou: apagar a designação aberta libera o território, apagar uma concluída não muda
  nada — sem caso especial no código.
- Um território tem **no máximo um publicador por vez** — garantido pelo índice único parcial
  `uq_territory_assignments_open`, não só pelo service.
- Território ou publicador de outra congregação, e id inexistente, respondem **o mesmo 404** — nunca
  403: um 403 confirmaria que o id nomeia algo real em outro lugar.
- Um publicador com `is_active = false` ainda **pode** ser designado: desativação revoga o acesso ao
  app, não o vínculo de responsabilidade registrado no admin.
- **A regra do app não mudou**: ela continua lendo `Territory.assigned_user_id` numa coluna só — o
  que mudou é que essa coluna passou a ser derivada da designação aberta.
- O publicador só pode **marcar uma quadra de um território designado a ele**. Tentar marcar fora
  disso responde **403** com o código `territory_not_assigned` — o bloco existe visivelmente na
  congregação do publicador, então a barreira aqui é de permissão, não de existência (diferente do
  404 de um bloco de outra congregação).
- **Reenvio de uma marcação já aceita não é reavaliado contra a designação.** Um `log_id` que já
  existe é confirmado direto (mesmo raciocínio já aplicado à checagem de relógio): a visita já é um
  fato aceito antes, e uma designação removida ou trocada depois não pode fazer o aparelho ficar
  retentando para sempre uma marcação que o servidor já gravou.

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
- **Forçar o status** da quadra entra pelo `PATCH /admin/blocks/{block_id}` que já existia, no campo
  `status_override`, junto de `number` e `polygon` — não ganhou rota própria porque é mais um
  atributo da quadra, não outro recurso. Vale aqui a mesma distinção que `rotation_days` tem no
  `PATCH` do território: **campo ausente não toca a coluna** (um PATCH que só renumera não pode
  apagar o status que o admin forçou) e **campo nulo devolve a quadra ao automático**. Quem traduz
  as duas intenções é o router, por `model_fields_set`, para um sentinela que o service entende.

### Chave de aplicação (`X-App-Key`)
- Toda requisição precisa trazer o header `X-App-Key` com o valor de `APP_SECRET`. **Os três
  clientes mandam em toda chamada** — cada cliente HTTP (`admin/src/main/api-client.ts`,
  `app/src/data/api-client.ts`, `admin-app/src/data/api-client.ts`) injeta o header sozinho, e
  nenhuma tela ou caso de uso precisa saber disso.
- **`GET /health` é isento**, por rota e não por fallback: o healthcheck do deploy e o runtime do
  container chamam sem chave e precisam funcionar antes de qualquer cliente existir.
- Header ausente e header errado recebem **a mesma** resposta 401. Comparação com
  `secrets.compare_digest`.
- `APP_SECRET` vazio **desliga** o gate — é o que mantém os testes e o desenvolvimento local sem
  header — e o app emite WARNING no startup.
- **Isto não é autenticação.** A chave é estática e viaja dentro dos dois APKs e do binário desktop;
  quem tem qualquer um dos três extrai o valor — o TLS de produção protege o valor **em trânsito**,
  não dentro do pacote instalado. Serve para o servidor parar de responder a varredura automática, e
  só. Autorização continua sendo o JWT do admin e o token de app.

### App Android (do publicador)
Vale para `app/` e para as rotas `/app/*`. O **app admin** (`admin-app/`) é outro binário, usa as
rotas `/admin/*` com o JWT da congregação, e nada desta seção se aplica a ele.

- A **única** escrita permitida ao app é marcar quadra como trabalhada. Nada de território, quadra,
  usuário ou congregação é criado, editado ou apagado pelo app.
- Vincula-se pelo `access_code` individual; sem código válido e ativo, não há dados.
- Faz cache local dos territórios e quadras para funcionar sem sinal em campo. Os *tiles* do mapa
  ficam limitados ao que já foi carregado — isso é uma limitação conhecida, não um bug.
- **Marcar quadra exige o servidor.** A confirmação só vale quando `POST /app/blocks/{id}/worked`
  é aceito; sem rede, o app avisa e **não** marca nada. Não há fila local de marcações — decisão do
  dono do projeto em 2026-08-18, revertendo a fila offline original: uma quadra verde que existe só
  no aparelho é pior que um erro honesto, porque quem marcou acredita que o trabalho foi registrado.
  O `id` do log continua sendo gerado no cliente e enviado na requisição, como chave de idempotência.
- O cache local **de leitura** continua: territórios e quadras já baixados abrem sem rede.

### Atualização Automática dos Aplicativos Android (In-App Auto-Update)
Implementada na spec 0016 para ambos os apps Android (`app/` e `admin-app/`):

- **Verificação ao abrir:** Ao iniciar, o app consulta `GET /updates/latest?app=app|admin-app` em segundo plano com o header `X-App-Key`. A requisição não bloqueia a interface nem atrasa a abertura caso a rede esteja instável ou offline.
- **Detecção de nova versão:** Se o servidor reportar `version_code` estritamente superior ao do app instalado (`versionCode` do Android), um modal (`UpdateModal`) é exibido informando a versão e o `changelog`.
- **Atualização obrigatória vs. opcional:** Se o `versionCode` local for menor que `min_version_code` informado no manifesto, a atualização é obrigatória — o modal não exibe o botão de fechar/depois e impede o uso do app até que o pacote seja instalado. Se for maior ou igual, a atualização é opcional ("Depois" fecha o modal).
- **Download e instalação nativa via FileProvider:** O download do APK é realizado pelo módulo nativo Kotlin `ApkInstallerModule` em thread de fundo com relatório de porcentagem de progresso em tempo real (`onApkDownloadProgress`). Ao finalizar o download no cache privado do aplicativo, o instalador do Android é disparado diretamente via `Intent.ACTION_VIEW` com URI segura provida por `androidx.core.content.FileProvider`.
- **Servidor:** O diretório de releases é montado via volume Docker (`./releases:/app/releases`). Não requer banco de dados ou infraestrutura externa pesada; novos APKs e manifestos `version.json` enviados via SCP ficam disponíveis imediatamente.

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
- **MapLibre Native (`@maplibre/maplibre-react-native`) nos dois apps, não `react-native-maps`.**
  Mesma decisão de fundo do Leaflet no admin: `react-native-maps` é feito para o Google Maps SDK
  (chave de API, billing, dependência de Google Play Services), o oposto do que o projeto escolheu.
  MapLibre Native desenha tiles raster crus (a mesma URL de tile do OSM que o admin usa) sem depender
  de nenhum provedor comercial.
- **Monorepo.** Os quatro projetos compartilham o contrato da API; versionar junto evita que os três
  clientes fiquem fora de sincronia com o servidor.
- **Electron no admin, não mais Flutter.** Decisão revertida em 2026-08-08 (ver a nota no início da
  Stack Técnica): esta máquina de desenvolvimento não compila `flutter build macos` sem o Xcode
  completo, e o dono do projeto já tinha um caminho de build local em Electron validado em outro
  projeto próprio. O argumento original a favor do Flutter (uma linguagem só, pacote compartilhado,
  sem a superfície de segurança do Electron) parou de valer quando o build passou a ser local e sem
  CI — o preço do `contextIsolation`/preload/IPC deixou de ser opcional.
- **React Native no app, não mais Flutter.** Decisão da spec 0005 (2026-08-17, ver a nota no início
  da Stack Técnica) — escolha do dono do projeto, não uma limitação técnica como no caso do admin.
  `packages/core`, o pacote Dart que só o app Flutter usava, foi removido em consequência: o app em
  TypeScript não tem com quem compartilhar código Dart, e sua lógica própria fica em
  `app/src/domain/` sem pacote separado, mesma decisão já tomada para `admin/src/shared/`.
- **Risco assumido na lib de edição de mapa.** Leaflet-Geoman é a lib de terceiro para
  desenhar/editar o polígono (arrastar vértice, arrastar ponto intermediário para inserir, remover
  vértice). O editor está confinado a `admin/src/renderer/map/PolygonEditorLayers.tsx`, o único
  arquivo do projeto que a importa — mesmo princípio de isolamento que o Flutter antigo aplicava a
  `flutter_map_line_editor`/`flutter_map_dragmarker`, para o caso de precisar trocar a lib depois.
- **O undo do editor não depende da biblioteca de mapa.** `admin/src/renderer/map/usePolygonEditor.ts`
  é um controller puro (sem Leaflet/Geoman) que tira um snapshot **antes** de cada mutação —
  adicionar ponto, mover ponto, remover ponto, limpar —, não só ao adicionar; é o que faz desfazer
  depois de um arraste restaurar o estado de antes do arraste, e não de antes do último ponto
  adicionado. A camada visual (`PolygonEditorLayers.tsx`) só traduz eventos do Geoman em chamadas ao
  controller, nunca muta o estado direto. Não mexa nisso sem rodar
  `admin/src/renderer/map/usePolygonEditor.test.ts`. *Snapping* continua não existindo.
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
| Jobs | `server/app/jobs/` | Tarefa agendada ou de linha de comando: abrir sessão, chamar service, comitar, logar | Regra de negócio, query direta, HTTP |
| Core | `server/app/core/` | Config, sessão do banco, segurança, dependências, rate limit, scheduler | Regra de negócio de domínio |

**Direção da dependência:** `router → service → repository → model`. Nunca o inverso.
Um job é um router sem HTTP: mesma posição na cadeia (`job → service → repository → model`), mesma
regra de só orquestrar. É também um dos dois lugares — o outro é o router — onde ler o relógio é
permitido; o service recebe a leitura por `now_provider`.
DTOs só nas bordas (router ↔ service); repositório trabalha com models.
Serviço não conhece HTTP: sinaliza erro com exceção de domínio, e o router traduz para status code.

### App (React Native)

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Presentation | `app/src/presentation/` | Telas, navegação (React Navigation), o componente de mapa (MapLibre) | Chamada HTTP direta, regra de negócio |
| Domain | `app/src/domain/` | Entidades e funções puras (cor da quadra, "é meu território?", filtro do mapa) | Dependência de React Native, HTTP ou armazenamento |
| Data | `app/src/data/` | Cliente HTTP (`api-client.ts`), `react-native-keychain` (token, `session-store.ts`), `AsyncStorage` (cache do mapa `territory-cache.ts`) | Widget, lógica de apresentação |

**Direção:** `presentation → domain ← data`. O domínio não depende de ninguém — mesma direção já
documentada quando o app era Flutter; a troca de stack na spec 0005 não mudou essa decisão, só a
linguagem. Sem gerenciador de estado externo (Redux/Zustand): o volume de telas é pequeno e o estado
é quase todo "o que o servidor respondeu", então hooks + Context bastam.

### App Admin (React Native)

As mesmas três camadas de `app/`, com um acréscimo em `data/`: aqui mora também a sessão que guarda
a credencial e refaz o login sozinha — o papel que no desktop é do `main/`.

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Presentation | `admin-app/src/presentation/` | Telas, navegação (React Navigation), o mapa das designações (MapLibre) | Chamada HTTP direta, `react-native-keychain`, regra de negócio |
| Domain | `admin-app/src/domain/` | Entidades e funções puras (cor e rótulo da quadra, designação aberta, centroide/rótulo do mapa) | Dependência de React Native, HTTP ou armazenamento |
| Data | `admin-app/src/data/` | Cliente HTTP (`api-client.ts`), credenciais no keystore (`credentials-store.ts`), sessão com reautenticação silenciosa no 401 (`session.ts`) | JSX, lógica de apresentação |

**Direção:** `presentation → domain ← data`, a mesma de `app/`. A `session` é a única coisa que a
presentation chama para escrever, e nenhuma tela conhece token, senha ou `fetch` — mesma promessa
que o renderer do Electron tem ao só falar com `window.api`. **Sem cache offline, de propósito:** o
app do publicador cacheia leitura porque trabalha sem sinal em campo, mas o admin escreve o tempo
todo (designar, concluir, marcar), e um cache de escrita seria a fila offline que o dono do projeto
já rejeitou em 2026-08-18. Sem rede, o app avisa e não faz nada.

### Admin (Electron)

Quatro camadas, ainda sem `domain/` — é a mesma decisão de antes, adaptada ao processo duplo do
Electron em vez de reaberta.

| Camada | Pasta | Responsabilidade | Proibido |
|--------|-------|------------------|----------|
| Main | `admin/src/main/` | Fala com a API (`api-client.ts`), guarda as credenciais com `safeStorage` (`credentials-store.ts`), a `session` com reautenticação silenciosa no 401 (`session.ts`), registra os handlers de IPC | JSX/React, conhecer o DOM |
| Preload | `admin/src/preload/` | Expõe `window.api` via `contextBridge`, um método por canal, 1:1 com `shared/ipc-contract.ts` | Qualquer lógica além de repassar para `ipcRenderer.invoke` |
| Renderer | `admin/src/renderer/` | Telas, mapa editável (Leaflet-Geoman confinado a um arquivo), providers/estado React | Chamada HTTP direta, `ipcRenderer` direto, conhecer `api-client`, `session` ou `safeStorage` — só fala com `window.api` |
| Shared | `admin/src/shared/` | Tipos e regras puras usados por Main e Renderer: modelos, geometria (`geo.ts`), erros de API, contrato de IPC | Módulo `electron`, DOM, chamada de rede |

**Por que não existe `domain/` aqui.** Toda a regra de negócio continua vivendo no servidor —
validação geométrica, sobreposição, numeração de quadra, geração de código — isso não mudou com a
troca de stack. O que mudou é quem desempenha o papel do antigo `data/`: é o **Main**, que fala com
a API e só repassa o resultado pelo IPC, sem decidir nada de negócio no caminho. O **Renderer** é
Presentation pura — não sabe que existe HTTP, token ou arquivo de credenciais, só conhece
`window.api`. Um caso de uso no admin ainda seria um repasse de uma linha sobre o cliente da API,
uma camada que só custaria arquivo; a camada que paga o próprio custo continua sendo a que fala com
a API de verdade (agora Main, antes `data/`), porque é a interface que os testes substituem por um
fake, sem HTTP nem uma janela Electron real. Se algum dia aparecer regra que seja de fato do
cliente, aí sim cabe reabrir `domain/`.

A reautenticação vive em `main/session.ts`, não na tela: nenhuma tela deve saber que o token
expira. O caminho é `ApiErrorException.isUnauthorized` → refaz o login com as credenciais guardadas
→ repete a ação **uma vez**. Falhando de novo, lança `CredentialsRejectedException`, que o IPC
serializa para o renderer poder distinguir do resto e voltar à tela de configuração inicial —
provavelmente a senha mudou no servidor.

## Testes

| Item | Servidor | App (React Native) | App Admin (React Native) | Admin (Electron) |
|------|----------|---------------------|---------------------------|-------------------|
| Framework | pytest | Jest + `@testing-library/react-native` | Jest + `@testing-library/react-native` | Vitest + React Testing Library |
| Rodar tudo | `cd server && pytest` | `cd app && npm test` | `cd admin-app && npm test` | `cd admin && npm test` |
| Rodar um arquivo | `pytest tests/services/test_territory_service.py` | `npx jest src/presentation/screens/DashboardScreen.test.tsx` | `npx jest src/presentation/screens/BlocksScreen.test.tsx` | `npx vitest run src/renderer/screens/HomeScreen.test.tsx` |
| Cobertura | `pytest --cov=app --cov-report=term-missing` | `npx jest --coverage` | `npx jest --coverage` | `npx vitest run --coverage` |
| Local e nome | `server/tests/**/test_*.py` | `app/src/**/*.test.ts(x)`, co-localizado | `admin-app/src/**/*.test.ts(x)`, co-localizado | `admin/src/**/*.test.ts(x)`, co-localizado |
| Meta | **100% nos services** (regras de negócio), 80% geral | uma tela, um teste; `domain/` e `data/` cobertos por fake de rede/armazenamento (nunca `AsyncStorage`/keychain reais); a view nativa do MapLibre (`presentation/map/TerritoryMapView.tsx`, `presentation/screens/MapScreen.tsx`) é risco assumido sem teste automatizado — mesmo caso do Leaflet-Geoman do admin, verificada rodando `npm run android` num emulador/aparelho | uma tela, um teste; `domain/` e `data/` cobertos por `fetch` injetado e keychain mockado; a view nativa do MapLibre (`presentation/map/AssignmentsMapView.tsx`) é a mesma exceção sem teste automatizado, e por isso todo cálculo dela mora em `domain/territoryMap.ts`, esse sim testado | uma tela, um teste de componente; `main/` coberto por fake das dependências do Electron (`safeStorage`, `fetch`, `ipcMain`) |

**Por que os clientes fogem do `test/` espelhado que o servidor usa.** Arquivo `*.test.ts(x)` ao
lado do código, não numa pasta paralela, é a convenção do próprio ecossistema Vitest/Vite (admin) e
Jest/React Native (`app/` e `admin-app/`) — seguir o padrão da ferramenta em vez de forçar o
espelhamento à moda do servidor economiza atrito com qualquer gerador ou plugin que espere esse
layout.

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

`app/src/domain/` e `admin-app/src/domain/` são código puro (sem `react-native`), pelo mesmo motivo
que já valia para `packages/core` quando o app era Flutter: lógica compartilhada (cor e rótulo da
quadra, "é meu território?", filtro do mapa, designação aberta) testável em milissegundos, sem
emulador nem janela. É onde o TDD do lado cliente vale a pena — mesmo padrão de
`admin/src/shared/geo.ts` no admin.

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
- **HTTP nos clientes**: cliente da API por trás de interface, com implementação fake nos
  testes — nunca um emulador Android ou uma janela Electron real. No `app/` e no `admin-app/`, o
  cliente (`data/api-client.ts`) é testado com um `fetch` fake injetado; no `admin-app/`, os testes
  de `data/session.ts` recebem fakes do cliente e do store, pelo mesmo desenho.
  No admin desktop, o cliente (`main/api-client.ts`) é local ao projeto, e os testes de
  `session.ts`/`ipc-handlers.ts` recebem um fake dele por injeção.
- **Armazenamento nos apps**: `react-native-keychain` (o token, no `app/`; nome, cidade e senha, no
  `admin-app/`) e `AsyncStorage` (cache do mapa, só no `app/`) são mockados nos testes de `data/` —
  nunca o keystore ou o armazenamento reais do aparelho, e a senha nunca aparece num `console.*`.

## Como Rodar

O servidor, o admin, o `app/` e o `admin-app/` (React Native) já sobem.

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
cd app && npm install
cp .env.example .env    # preencha API_BASE_URL e APP_KEY
npm run android
```
Exige um emulador Android já em execução ou um aparelho físico com depuração USB habilitada.
Builda e instala o app de debug, e sobe o Metro (o bundler do RN) automaticamente. `.env` é lido em
tempo de **build** via `react-native-config` — editar o arquivo exige parar e rodar `npm run
android` de novo, não há *hot reload* dele. Alvo Android apenas, sem pasta `ios/`. Detalhes em
`app/README.md`.

**App Admin (Android):**
```bash
cd admin-app && npm install
cp .env.example .env    # preencha API_BASE_URL e APP_KEY
npm run android
```
Mesmas condições do `app/`: emulador em execução ou aparelho com depuração USB, `.env` lido em tempo
de **build** pelo `react-native-config`, alvo Android apenas. **Exige JDK 17**, que esta máquina de
desenvolvimento não tem hoje — `npm test`, `npm run lint` e `npm run typecheck` rodam sem ele, mas
nenhum comando de Gradle roda. Detalhes em `admin-app/README.md`.

**Admin (desktop):**
```bash
cd admin && npm install && npm run dev
```
Sobe uma janela Electron de verdade com hot reload: `main`/`preload` recompilam e a janela reinicia
quando esse código muda, e o `renderer` (React) atualiza por HMR do Vite. Antes da primeira vez,
copie `admin/.env.example` para `admin/.env` e preencha `API_BASE_URL` e `APP_KEY` — ver "Chave de
aplicação" mais abaixo para o que `APP_KEY` precisa valer.

## Como Fazer Deploy

**Servidor** — VPS Ubuntu com Docker, deploy automático por **GitHub Actions**
(`.github/workflows/server.yml`).

| Job | Quando | O que faz |
|-----|--------|-----------|
| `test` | `push` e `pull_request` que toquem `server/**` ou o workflow | PostGIS real como service container, `ruff check`, `ruff format --check`, `alembic upgrade head`, `pytest --cov`, e um portão que **falha se `app/services/` sair de 100%** |
| `build-and-deploy` | `push` na `main` ou `workflow_dispatch`, depois do `test` | Buildx com cache de layers, publica no **GHCR** com as tags `latest` e o SHA; sincroniza o compose para a VPS; roda `docker compose pull && up -d && image prune -f`; verifica `127.0.0.1:$API_PORT/health` com 30 tentativas |

**Ambiente em produção:** VPS `76.13.160.146`, diretório `/opt/territory-map`. A API é alcançada de
fora em **`https://territorymap.dalistor.com.br`** — é esse o valor de `API_BASE_URL` dos clientes,
e o `GET /health` responde `200 {"status":"ok"}` por lá. O container continua escutando **só em
`127.0.0.1:8000`**; quem termina o TLS e encaminha para essa porta é o nginx do host.

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
`.centaur/implements/0023/`.

**Não há rollback automático.** Voltar é reverter o commit, ou fixar
`API_IMAGE=ghcr.io/dalistor/territory-map-server:<sha>` no `.env` da VPS e subir à mão.

**Bootstrap de uma instalação nova.** Não existe rota HTTP que crie congregação — cadastro aberto
deixaria qualquer um criar tenant no servidor alheio. O caminho é um job dentro do container:

```bash
docker compose exec api python -m app.jobs.create_congregation "Nome" "Cidade"
```

A senha é pedida no terminal (nunca como argumento, que ficaria no histórico do shell e na lista de
processos); `CONGREGATION_PASSWORD` no ambiente serve para execução não interativa. Mínimo de 12
caracteres.

**Backup.** `docker/backup.sh` roda por cron do root às 03:00, faz `pg_dump` comprimido em
`/opt/territory-map/backups`, mantém 14 dias e apaga dump vazio em vez de deixá-lo parecendo
backup. Fica **fora** de `docker/`, que o deploy espelha com `--delete`. É cópia local: sobrevive a
migration ruim, tabela derrubada e volume corrompido — não à perda do host. Levar para fora da
máquina é passo separado, ainda não feito.

**Firewall:** `ufw` ativo, só 22, 80 e 443. A porta 8000 do container escuta apenas em `127.0.0.1`,
que é para onde o nginx do host aponta.

**O proxy reverso com TLS existe** — o aviso que este documento trazia sobre "API exposta em HTTP
puro na porta 8000" ficou desatualizado e foi reescrito aqui (spec 0012, Task 14). O tráfego dos
clientes vai criptografado até `territorymap.dalistor.com.br`, e a 8000 nunca esteve aberta no
firewall. **O que continua valendo do aviso antigo:**

⚠️ Atrás de proxy, servir o uvicorn com `--proxy-headers` e apontar `FORWARDED_ALLOW_IPS` para o IP
do proxy. O rate limit é chaveado por `request.client.host`; sem isso, toda requisição parece vir do
nginx e todos os chamadores dividem um balde só — o primeiro que errar a senha tranca a congregação
inteira.

⚠️ **Não há backup do volume `postgis_data` fora da máquina.** O `docker/backup.sh` faz `pg_dump`
local (acima), que sobrevive a migration ruim e tabela derrubada, mas não à perda do host.

**Admin** — sem CI. `.github/workflows/admin-release.yml` foi removido junto com o admin em Flutter
que ele compilava, e não ganhou substituto: o build é sempre **local**, com
[`electron-builder`](https://www.electron.build/) (configurado em `admin/electron-builder.yml`),
documentado em `admin/README.md`:

```bash
npm run build:mac    # gera .dmg e .zip em admin/dist/
npm run build:win    # gera o instalador NSIS em admin/dist/
npm run build:linux  # gera .AppImage e .tar.gz em admin/dist/
```

Cada comando roda o build do `electron-vite` (que inclui `tsc --noEmit`) e depois empacota para o
alvo.

**A configuração não é mais compilada junto com o binário.** `API_BASE_URL` e `APP_KEY` (mesmo
propósito dos antigos `--dart-define`) chegam pelo `admin/.env`, lido em tempo de execução pelo
main process via `dotenv` — preencher os dois em `admin/.env` (a partir de `admin/.env.example`) é
passo manual antes de rodar ou empacotar. Um app sem `APP_KEY` sobe normalmente e toma 401 em toda
requisição, o mesmo risco que o passo de build do Flutter falhava de propósito para evitar; aqui
quem evita é o operador, na hora de preencher o `.env`.

**Compilar Windows/Linux a partir do macOS pode não funcionar sem ferramentas extra.** O
`electron-builder` cross-compila a maioria dos alvos a partir de qualquer SO, mas o instalador NSIS
do Windows depende do Wine para rodar fora do Windows. Se `build:win`/`build:linux` falharem por
isso, o caminho é compilar Windows num Windows e Linux num Linux — não há CI cobrindo isso, então é
`npm install` e o comando de build correspondente na máquina de destino. `build:mac` só funciona
num macOS de qualquer forma.

Sem assinatura de código — os binários não são assinados, então o Windows SmartScreen e o
Gatekeeper do macOS vão exibir aviso de desenvolvedor não identificado na primeira execução.
Documentar o "abrir mesmo assim" para o admin. Assinar exige certificado pago.

Build verde só prova que compila — ninguém clica num binário. Quem valida comportamento são os
testes (Vitest + React Testing Library), que existem e cobrem as nove telas (configuração inicial,
`HomeScreen` e as cores do mapa, Designações com o painel de histórico, Histórico, publicadores, os
dois editores, as configurações do território com a tabela de quadras e o histórico da quadra), os
componentes `BlockWorkPanel` e `MarkWorkedForm`, mais o roteamento com a
sidebar (`App.test.tsx`), o main
process (incluindo a montagem e a formatação da planilha em `excel-export.test.ts`, o S-13-T em Word
em `docx-handler.test.ts` e a geocodificação em `geocode.test.ts`) e o que se abre com `npm run dev`
durante o desenvolvimento.

**App Android** — sem CI, mesmo caminho do admin: build sempre **local**.

```bash
cd app/android && ./gradlew assembleRelease
```

Gera o `.apk` em `app/android/app/build/outputs/apk/release/`, distribuído fora da Play Store por
enquanto. Sem assinatura de código configurada — mesmo aviso do admin: o Android vai reclamar de
"fonte desconhecida" ao instalar fora da Play Store, e isso é esperado. `API_BASE_URL`/`APP_KEY`
vêm de `app/.env` (via `react-native-config`), lido em tempo de **build**, não de execução — editar
o `.env` exige gerar o `.apk` de novo. Detalhes em `app/README.md`.

**App Admin Android** — sem CI também, e o comando é o mesmo, um diretório ao lado:

```bash
cd admin-app/android && ./gradlew assembleRelease
```

Gera o `.apk` em `admin-app/android/app/build/outputs/apk/release/`. Valem os mesmos avisos — sem
assinatura, "fonte desconhecida" na instalação, `.env` lido em tempo de build — mais dois próprios:
**exige JDK 17**, que esta máquina de desenvolvimento não tem hoje (Jest, ESLint e `tsc` rodam sem
ele; nenhum comando de Gradle roda), e o `applicationId` é `com.territorymapadmin`, diferente do
`com.territorymapapp` do publicador, então os dois `.apk` **convivem no mesmo aparelho** sem um
substituir o outro. Este é o APK de quem tem a senha da congregação: instalar só no aparelho do
responsável pelos territórios. Detalhes em `admin-app/README.md`.

## Regras e Convenções

- **Idioma**: código, nomes de arquivo, commits e comentários em **inglês**. Documentação em
  `.centaur/` e conversa em **português**.
- **Naming**: Python `snake_case` (classes `PascalCase`); TypeScript (os três clientes)
  `lowerCamelCase` para variáveis/funções e `PascalCase` para classes/componentes React, arquivos
  `kebab-case.ts` em `admin/src/main/`/`preload/`/`shared/` e em `admin-app/src/data/`, e
  `PascalCase.tsx` para componentes de tela em `admin/src/renderer/`,
  `app/src/presentation/screens/` e `admin-app/src/presentation/screens/`.
- **Um arquivo por entidade** em cada camada — `models/territory.py`, `services/territory_service.py`.
- **Nada de coordenada como float solto**: use o tipo `LatLng` — `admin/src/shared/geo.ts` no admin,
  `app/src/domain/models.ts` no app, `admin-app/src/domain/models.ts` no app admin (`{lat, lng}`
  nomeado, o mesmo formato nos três) — para não trocar latitude com longitude. Cada um é a única
  fonte da conversão para GeoJSON do seu lado.
- **Lógica que serve a mais de um cliente TypeScript não existe hoje.** `admin/`, `app/` e
  `admin-app/` são três projetos independentes, cada um com sua própria pasta de lógica
  compartilhada interna (`admin/src/shared/`, `app/src/domain/`, `admin-app/src/domain/`) — nenhum
  pacote é compartilhado entre eles.
- **Lint**: ESLint com `typescript-eslint` recomendado nos três clientes. Sem warning ignorado em
  nenhum dos quatro projetos.
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
  Leaflet (admin) e o MapLibre Native (os dois apps) usam `(lat, lon)`. A conversão mora numa única
  função por lado — `admin/src/shared/geo.ts` no admin, `app/src/domain/models.ts` no app,
  `admin-app/src/domain/models.ts` no app admin —, cada uma com teste. Não converter à mão em nenhum
  outro lugar.
- **A regra de cor da quadra está duplicada de propósito, em três arquivos idênticos**:
  `admin/src/renderer/map/blockColor.ts`, `app/src/domain/blockColor.ts` e
  `admin-app/src/domain/blockColor.ts`. É o custo aceito de não haver pacote compartilhado entre os
  clientes: **quem mexer em um precisa mexer nos três**, senão a mesma quadra fica de uma cor na
  mesa do admin e de outra no celular. Cada cópia tem seu próprio teste — o jeito de perceber a
  divergência é os três suítes concordarem.
- **O admin guarda a senha da congregação no desktop**, não só o token — é o preço do login
  automático. Usar o `safeStorage` do Electron (criptografa com o keychain do sistema operacional) e
  nunca gravar as credenciais em texto puro. Nunca logar essas credenciais, nem em modo debug.
- **O app admin guarda a mesma senha no celular**, pela mesma razão e com o mesmo cuidado: nome,
  cidade e senha da congregação vão para o **keystore do Android** via `react-native-keychain`
  (`admin-app/src/data/credentials-store.ts`), num `service` próprio, nunca em `AsyncStorage`, em
  arquivo ou em texto puro. **Nunca logar essas credenciais, nem em modo debug** — nem em teste,
  onde o keychain é mockado. Um aparelho com este APK vale a senha do admin: é por isso que ele não
  é o app do publicador, e é por isso que "Sair da congregação" existe na tela.
- **Binários do admin não são assinados.** Windows SmartScreen e Gatekeeper (macOS) vão reclamar na
  primeira execução. É esperado; instruir o admin em vez de tentar contornar.
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

- Estratégia de **sincronização offline** do app (pull completo vs. delta por timestamp) — hoje é
  pull completo a cada abertura bem-sucedida (`app/src/presentation/App.tsx` recarrega e
  sobrescreve o cache inteiro via `saveTerritories`); delta por timestamp não foi avaliado.
- Se o admin precisa **exportar** territórios (PDF/imagem do mapa) para uso impresso — as
  exportações que existem hoje são todas das **designações**: a planilha por território em `.xlsx`
  (spec 0007) e o formulário oficial **S-13-T** em `.docx` ou `.xlsx`. Nenhuma delas leva o desenho.
- **Nenhuma tela do app admin foi vista rodando.** Falta o JDK 17 nesta máquina, então nem
  `npm run android` nem `assembleRelease` foram executados; o que garante o comportamento até aqui
  são os testes de Jest. O passo manual está anotado em `admin-app/README.md`.
- **Reinstalar o app custa um código novo.** Limpar os dados ou trocar de celular apaga o token, e
  só o admin consegue devolver o acesso. Se isso virar chamado frequente, o remédio é o admin poder
  gerar o código em lote e a tela deixar isso a dois cliques — não afrouxar a regra.
- Se o admin precisa de uma **listagem** de quadras não trabalhadas há mais de N dias — o N deixou
  de ser hipótese e já é o `rotation_days` do território (spec 0009), e a lista **existe por
  território** desde a spec 0010: a página de configurações mostra a tabela das quadras com status e
  última visita, além do contador de vencidas. O que ainda falta é a visão da **congregação
  inteira de uma vez**, para levar no papel a campo; o índice já está preparado para ela.

**Resolvidos, para não voltarem à mesa:** o desfazer do editor de polígono existe — é o controller
próprio `usePolygonEditor` (`admin/src/renderer/map/usePolygonEditor.ts`), com o Leaflet-Geoman só
traduzindo eventos para ele, não mutando estado direto —, o admin já apaga quadra e sai da
congregação pela interface, e o fluxo de **atribuição de território a publicador** existe de ponta a
ponta (spec 0005): o admin designa pela página **Designações** (spec 0006 — antes era pela
`HomeScreen`), o servidor restringe a marcação de quadra ao território designado, e o app do
publicador em React Native já existe. A designação também virou **histórico datado com exportação
para Excel** (spec 0007): designar, concluir e apagar registro estão na interface, e
`assigned_user_id` passou a ser projeção da designação aberta. E o histórico ganhou **página
própria** (spec 0008), com as visões por dirigente e por território, busca por nome e apagar em
cada linha — a planilha exportada, na mesma spec, passou a sair formatada e impressável. Por fim, o
admin já **corrige o registro de trabalho de uma quadra pela interface** e já **força a cor** dela
quando os registros não contam a história toda (spec 0010): adicionar, apagar e forçar status estão
na tabela de quadras da página de configurações do território, e o forçado se desfaz sozinho na
primeira visita nova. E **apagar publicador** deixou de ser impossível (spec 0011): o histórico
passou a guardar o nome em vez de uma FK, então a pessoa some sem levar junto o que ela trabalhou —
só quem tem designação aberta é recusado, até que a designação seja concluída. Por último, **o admin
deixou de depender do computador para designar** (spec 0012): `admin-app/` é um segundo APK, com a
credencial da congregação no keystore do Android, que faz em campo o cartão S-13 e a marcação de
quadra — sem nenhuma rota nova no servidor, e sem trazer junto o que só faz sentido na mesa (desenho,
gestão de publicador, status forçado, página Histórico, import/export S-13/T). E esse app deixou de
ser cego para as quadras (spec 0013): o mapa agora as desenha numeradas e coloridas pelo status,
tocar numa delas abre um painel único com as ações da quadra e, separadas, as do território, apagar
registro de trabalho passou a existir no celular, e o app ganhou a logo e o ícone do produto.

## Implementações

Atualizado automaticamente pelas skills `/tdd` e `/implement`.
Veja `.centaur/implements/status.md` para o histórico completo e `.centaur/specs/index.md` para as
specs planejadas.

---

_Documentação centaur — schema `5.2.0`, atualizada em `2026-10-09`. Atualize com `/update`._
