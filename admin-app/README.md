# Territory Map — App Admin

App Android (React Native, CLI puro, TypeScript — sem Expo) para o **responsável pelos territórios**
fazer em campo o que hoje só o admin desktop faz na mesa: ver quem está com cada território,
designar, marcar como concluído, corrigir o histórico da designação, e lançar — ou apagar — o
registro de que uma quadra foi trabalhada. Fala direto com o servidor da API. Veja o `AGENTS.md` na
raiz do monorepo para a visão geral do projeto inteiro.

Usa a **mesma logo e o mesmo ícone** do app do publicador: é o mesmo produto, e o que separa os dois
é o nome exibido e o `applicationId` (ver "Dois apps no mesmo aparelho").

Alvo **Android apenas** — o projeto não tem pasta `ios/`.

> **Este não é o app do publicador.** O app do publicador é `app/`, se autentica por um código
> descartável e só marca quadra. Este aqui pede **nome, cidade e senha da congregação** uma única
> vez e guarda os três no keystore do Android — é a mesma credencial do admin desktop, e por isso
> ele é instalado só no aparelho de quem cuida dos territórios. Ver "Dois apps no mesmo aparelho"
> mais abaixo.

## Instalar

```bash
npm install
```

## Configurar (`admin-app/.env`)

O app lê duas variáveis em tempo de **build**, via `react-native-config` — o equivalente RN do
`dotenv` do admin desktop: como o React Native empacota o JS dentro do APK, não existe um "processo
principal" para ler um `.env` em tempo de execução como no Electron; `react-native-config` injeta o
valor no build a partir do `.env`, sem hardcodar no código-fonte.

```bash
cp .env.example .env
```

Depois preencha `admin-app/.env`:

| Variável | Para que serve |
|----------|-----------------|
| `API_BASE_URL` | URL base do servidor da Territory Map. No emulador Android, `localhost` do servidor é acessado como `http://10.0.2.2:8000`; num aparelho físico, o IP da máquina na rede local, ou o domínio de produção. |
| `APP_KEY` | O mesmo valor de `APP_SECRET` do servidor. Vai em toda requisição como o header `X-App-Key` — ver "Chave de aplicação" no `AGENTS.md` da raiz. |

`.env` está no `.gitignore` da raiz do monorepo — nunca commitar as duas chaves preenchidas.

Depois de criar ou editar o `.env`, pare o Metro e o app em execução e rode `npm run android` de
novo — o `react-native-config` lê o arquivo no momento do build nativo (Gradle), não faz *hot
reload*.

## Estrutura

Três camadas, as mesmas de `app/`, com um acréscimo em `data/`: aqui mora também a sessão que
guarda a credencial e refaz o login sozinha.

| Camada | Pasta | Responsabilidade |
|--------|-------|-------------------|
| Presentation | `src/presentation/` | Telas, navegação (React Navigation), o mapa das designações (MapLibre) |
| Domain | `src/domain/` | Entidades e funções puras — sem depender de React Native, HTTP ou armazenamento |
| Data | `src/data/` | `api-client.ts` (HTTP), `credentials-store.ts` (`react-native-keychain`), `session.ts` (reautenticação silenciosa no 401) |

**Direção:** `presentation → domain ← data`. A `session` é a única coisa que a presentation chama
para escrever; nenhuma tela conhece token, senha ou `fetch`.

**Sem cache offline.** O app do publicador cacheia leitura porque trabalha sem sinal em campo; o
admin escreve o tempo todo (designar, concluir, marcar), e um cache de escrita seria a fila offline
que o dono do projeto já rejeitou. Sem rede, o app avisa e não faz nada.

## Pré-requisito: JDK 17

Qualquer build Android — `npm run android` e `./gradlew assembleRelease` — exige o **JDK 17**
instalado e visível no `PATH` (o Gradle do React Native 0.87 não roda com JDK 8 nem com as versões
mais novas sem ajuste).

⚠️ **A máquina de desenvolvimento usada até aqui não tem JDK nenhum** (`java -version` falha). Isso
não impede desenvolver: **Jest, ESLint e `tsc` rodam sem JDK**, e todo o código deste app foi
escrito e testado assim. O que fica bloqueado é rodar o app num emulador/aparelho e gerar o `.apk`
— instalar o JDK 17 é passo do operador, e é o primeiro lugar a olhar se um comando de Gradle
falhar sem explicação.

## Rodar em desenvolvimento

Exige o JDK 17 (acima) e um emulador Android já em execução, ou um aparelho físico conectado com
depuração USB habilitada.

```bash
npm run android
```

Builda e instala o app de debug, e sobe o Metro (o bundler do React Native) automaticamente. Para
só iniciar o Metro sem reinstalar o app, use `npm start` numa aba separada.

## Testes, lint e tipos

Não precisam de JDK, emulador nem rede.

```bash
npm test           # Jest, com @testing-library/react-native para componentes
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

`@testing-library/react-native` 14 tem APIs assíncronas por padrão: use `await render(<Componente />)`,
não `render(<Componente />)` sem `await` — sem o `await`, `screen` fica sem o componente montado e
toda query (`screen.getByText`, etc.) falha com "`render` function has not been called". Mesmo
detalhe já documentado em `app/README.md`.

O cliente HTTP recebe o `fetch` por injeção e o `react-native-keychain` é mockado no
`jest.setup.js` — nenhum teste toca a rede nem o keystore real.

## Gerar o instalável (`.apk`)

```bash
cd android && ./gradlew assembleRelease
```

Gera o `.apk` em `android/app/build/outputs/apk/release/admin-app-release.apk`.

**Não há assinatura de código configurada** — mesmo ponto já documentado para o app do publicador e
para os binários do admin desktop: o Android vai reclamar de "fonte desconhecida" ao instalar esse
`.apk` fora da Play Store, e isso é esperado; oriente quem for instalar a permitir a instalação
mesmo assim, em vez de tentar contornar o aviso.

## Atualização Automática In-App (Auto-Update)

O app admin verifica e instala novas versões automaticamente a partir da VPS:

1. **Verificação no bootstrap:** No início da inicialização, consulta `GET /updates/latest?app=admin-app` em segundo plano sem travar a tela.
2. **Comparação de versão:**
   - Se houver `versionCode` maior no servidor, apresenta modal com informações da nova versão.
   - Suporta bloqueio obrigatório se a versão atual for inferior a `minVersionCode`.
3. **Download e instalador Android:** Faz download via módulo nativo com evento de progresso em tempo real e abre o instalador do pacote Android via `FileProvider`.

### Como publicar uma nova versão
1. Incremente `versionCode` e `versionName` em `admin-app/android/app/build.gradle`.
2. Gere o APK (requer JDK 17):
   ```bash
   cd android && ./gradlew assembleRelease
   ```
3. Prepare o manifesto `version.json`:
   ```json
   {
     "app": "admin-app",
     "version_code": 2,
     "version_name": "1.1.0",
     "min_version_code": 1,
     "download_url": "/updates/download/admin-app",
     "changelog": "Novas ferramentas de campo para o administrador.",
     "apk_filename": "admin-app-release.apk"
   }
   ```
4. Envie o APK e o manifesto para a VPS:
   ```bash
   scp admin-app-release.apk version.json root@76.13.160.146:/opt/territory-map/releases/admin-app/
   ```

## Dois apps no mesmo aparelho

Este APK é o do **admin**: `applicationId` `com.territorymapadmin`, nome exibido "Territory Map
Admin". O do publicador é `com.territorymapapp`, em `app/`. Como os dois `applicationId` são
diferentes, **os dois convivem instalados no mesmo aparelho** sem um substituir o outro — o que é
justamente o caso de quem cuida dos territórios e também sai em campo.

São apps diferentes, com credenciais diferentes e poderes diferentes:

| | `com.territorymapapp` (publicador) | `com.territorymapadmin` (admin) |
|---|---|---|
| Como entra | código de acesso individual, descartável, de uso único | nome, cidade e senha da congregação, uma única vez |
| O que o servidor deixa fazer | ler o mapa e marcar quadra **do território designado a ele** | tudo que as rotas `/admin/*` desta spec cobrem, na congregação inteira |
| Onde guarda a credencial | token no `react-native-keychain` | nome, cidade e senha no `react-native-keychain` |

Instalar um não afeta o outro, e desinstalar um não apaga os dados do outro. **"Sair da
congregação"**, dentro do app admin, apaga nome, cidade e senha **deste aparelho** e devolve o app à
tela de configuração inicial — nada é tocado no servidor.

## O que este app **não** faz

De propósito. Para tudo abaixo, o caminho continua sendo o **admin do computador** (`admin/`, o app
Electron):

- **desenhar ou editar a demarcação** de um território e de uma quadra, e apagar qualquer uma das
  duas — desenho no celular seria pior que inútil, e apagar quadra leva o histórico de trabalho
  dela junto;
- **cadastrar, desativar ou apagar publicador**, e gerar código de acesso. O app admin **lê** a
  lista de publicadores, para poder escolher um dirigente ou o autor de uma marcação, mas não a
  gerencia;
- **forçar o status de uma quadra** (`status_override`) para "Vencida" ou "Nunca trabalhada", e
  voltá-la ao automático;
- a página de **Histórico** da congregação inteira e todo o **import/export S-13** (XLSX e DOCX).

**Apagar registro de trabalho saiu desta lista na spec 0013.** Estava aqui, e mudou de lado pelo
motivo mais simples: é a correção que acompanha o marcar. Quem lança trabalho errado em campo
precisa desfazer em campo, não esperar chegar ao computador. As outras exclusões continuam válidas —
desenhar pede tela grande, e gerir publicador ou forçar status é decisão de mesa.

O que ele faz: ver quem está com cada território (mapa + lista), abrir o cartão S-13 do território,
designar, marcar como concluído, apagar um registro da designação, lançar que uma quadra foi
trabalhada escolhendo o publicador e a data, e apagar um registro de trabalho equivocado.

## O mapa e o painel da quadra

O mapa (`src/presentation/map/AssignmentsMapView.tsx`) desenha as demarcações **e as quadras**. Cada
quadra sai como polígono pintado pelo status — as mesmas três cores dos outros dois clientes,
respeitando o `statusOverride` da quadra e o `rotationDays` do território **dono** dela — com o
número por cima. O número é um `Marker` com `<Text>` do React Native, e não um `symbol` layer com
`text-field`: o estilo é raster puro, sem `glyphs`, e um servidor de fontes é exatamente o que a
escolha por OpenStreetMap + MapLibre existe para evitar. Mesma solução do app do publicador.

**Os rótulos de território ficam sempre visíveis**, mesmo com as quadras à vista — revertido em
2026-08-26 depois de um relato de campo: a spec 0013 os escondia (`shouldShowTerritoryLabels`, hoje
removida de `src/domain/territoryMap.ts`) para o balão do dirigente não sentar em cima dos números.
Com uma congregação de dezenas de territórios, perder o rótulo custava mais do que a sobreposição
ocasional que ele evitava — sem ele o admin não sabia a qual território pertencia cada grupo de
quadras no mapa.

**No mapa principal, tocar num território (fora de uma quadra) abre a tela de Quadras** — a que
mostra o histórico de trabalho e as quadras de um território, não o cartão S-13. No mapa o admin já
está olhando as quadras, e ali a pergunta é o que foi trabalhado, não quem é o responsável. Designar
continua na lista: tocar na linha do território abre o cartão S-13 como sempre, e cada linha agora
também mostra **quantas quadras o território tem** e oferece **"Marcar como concluído"** direto
nela, quando há alguém designado.

Tocar numa quadra — no polígono inteiro, não só no número — abre o **painel combinado**
(`src/presentation/screens/BlockPanel.tsx`), que reúne num lugar só os dois níveis de ação entre os
quais aquela quadra está:

| Seção | O que oferece |
|-------|----------------|
| **A quadra** (em cima) | número e status por extenso, o histórico de trabalho dela com **apagar em cada registro**, e o formulário de marcar como trabalhada (publicador + data) |
| **O território que a contém** (embaixo) | dirigente atual, designar a alguém, marcar como concluído e apagar um registro da designação |

**A separação visual entre as duas não é decoração**, nem a frase que rotula a segunda: designar
troca o responsável pelo **território inteiro**, não pela quadra que o admin acabou de tocar — e ele
chegou ali dizendo "vou marcar esta quadra". O painel precisa dizer de quem é o escopo antes de
oferecer o botão.

Nada foi duplicado para montá-lo: a metade de cima é o `BlockWorkSection` que a `BlocksScreen` já
usa, agora com a capacidade de apagar que lá ele não recebe, e a de baixo é o próprio
`AssignmentPanel`, com o scroll dele desligado para o painel rolar uma vez só. Toda ação destrutiva
pede confirmação num `Alert` dizendo a consequência, e uma escrita bem-sucedida avisa a
`DesignationsScreen`, que recarrega os territórios — a cor da quadra e o dirigente do território
mudam no mapa sem sair e voltar da tela.

A **tela de Quadras** (`src/presentation/screens/BlocksScreen.tsx`) ganhou seu próprio mapa: um
`AssignmentsMapView` recebendo só o território em vista, o que já basta para desenhar a demarcação
dele e suas quadras numeradas e coloridas — nenhum código de mapa novo, o componente já sabia
desenhar o que recebesse. Tocar numa quadra ali abre a mesma seção que tocar na sua linha na lista
abre.

**A lista de territórios é ordenada pelo número do nome, não pelo alfabeto** —
`compareTerritoriesByNumber` em `src/domain/models.ts`, porta de
`admin/src/shared/models.ts`, a mesma regra que o admin desktop já aplica. Uma congregação nomeia
territórios como "Centro - N5"; ordenar pelo texto puro lia "Casarotto -N28" antes de "Centro - N5"
só porque "C" vem antes de "C" na direção errada. Nome sem número vai para o fim, alfabético entre
si.

## Limitações conhecidas

- `src/presentation/map/AssignmentsMapView.tsx` (o mapa MapLibre com as demarcações, as quadras e o
  nome do dirigente) depende de uma *view* nativa de terceiro e **não tem teste automatizado** —
  mesmo
  "risco assumido" já registrado no `AGENTS.md` da raiz para `TerritoryMapView.tsx` do app do
  publicador e para o Leaflet-Geoman do admin desktop. Todo cálculo que dava para separar
  (centroide, cor, texto do rótulo, quais quadras são desenháveis, se os rótulos de território
  aparecem) vive em `src/domain/territoryMap.ts`, com teste; o componente
  ficou só com o desenho. **Passo manual pendente:** rodar `npm run android` num emulador ou
  aparelho e confirmar que os tiles do OpenStreetMap carregam com a atribuição "© OpenStreetMap
  contributors", que as demarcações aparecem, que as quadras saem numeradas e coloridas pelo status,
  que os rótulos de território ficam visíveis o tempo todo, que tocar num território (fora de uma
  quadra) abre a tela de Quadras dele, e que tocar numa quadra abre o painel combinado dela — tanto
  no mapa principal quanto no mapa embutido da própria tela de Quadras.
  Depende do JDK 17 (acima), então ainda não foi feito.
- O `.env` só é lido em tempo de build (acima) — não há como apontar o app para outro servidor sem
  recompilar.
- Sem rede, o app não faz nada além de avisar: não há fila offline nem cache de leitura, por
  decisão registrada na spec 0012.
