# Territory Map — App

App Android (React Native, CLI puro, TypeScript — sem Expo) para o publicador em campo: abre e já
mostra a posição do usuário no mapa, com os territórios e quadras da congregação desenhados por
cima, e permite marcar uma quadra como trabalhada. Fala direto com o servidor da API. Veja o
`CLAUDE.md` na raiz do monorepo para a visão geral do projeto inteiro.

Alvo **Android apenas** — o projeto não tem pasta `ios/`.

## Instalar

```bash
npm install
```

## Configurar (`app/.env`)

O app lê duas variáveis em tempo de **build**, via `react-native-config` — o equivalente RN do
`dotenv` do admin: como o React Native empacota o JS dentro do APK, não existe um "processo
principal" para ler um `.env` em tempo de execução como no Electron; `react-native-config` injeta o
valor no build a partir do `.env`, sem hardcodar no código-fonte.

```bash
cp .env.example .env
```

Depois preencha `app/.env`:

| Variável | Para que serve |
|----------|-----------------|
| `API_BASE_URL` | URL base do servidor da Territory Map. No emulador Android, `localhost` do servidor é acessado como `http://10.0.2.2:8000`; num aparelho físico, o IP da máquina na rede local, ou o domínio de produção. |
| `APP_KEY` | O mesmo valor de `APP_SECRET` do servidor. Vai em toda requisição como o header `X-App-Key` — ver "Chave de aplicação" no `CLAUDE.md` da raiz. |

`.env` está no `.gitignore` da raiz do monorepo — nunca commitar as duas chaves preenchidas.

Depois de criar ou editar o `.env`, pare o Metro e o app em execução e rode `npm run android` de
novo — o `react-native-config` lê o arquivo no momento do build nativo (Gradle), não faz *hot
reload*.

## Estrutura

Três camadas, mesmo espírito do antigo alvo em Flutter documentado no `CLAUDE.md` (só a linguagem
mudou):

| Camada | Pasta | Responsabilidade |
|--------|-------|-------------------|
| Presentation | `src/presentation/` | Telas, navegação (React Navigation), o componente de mapa |
| Domain | `src/domain/` | Entidades e funções puras — sem depender de React Native, HTTP ou armazenamento |
| Data | `src/data/` | Cliente HTTP, `react-native-keychain` (token), `AsyncStorage` (cache do mapa) |

As três pastas existem vazias por enquanto — ver a spec 0005 (`.claude/specs/0005/`, Tasks 17 a 26)
para o que entra em cada uma.

## Rodar em desenvolvimento

Exige um emulador Android já em execução, ou um aparelho físico conectado com depuração USB
habilitada.

```bash
npm run android
```

Builda e instala o app de debug, e sobe o Metro (o bundler do React Native) automaticamente. Para
só iniciar o Metro sem reinstalar o app, use `npm start` numa aba separada.

## Testes, lint e tipos

```bash
npm test          # Jest, com @testing-library/react-native para componentes
npm run lint       # ESLint
npx tsc --noEmit   # checagem de tipos
```

`@testing-library/react-native` 14 roda sobre o pacote [`test-renderer`](https://github.com/mdjastrzebski/test-renderer)
(o substituto moderno do `react-test-renderer`, depreciado), já instalado como dependência de
desenvolvimento — nada a fazer. A partir da v14 as APIs são assíncronas por padrão: use `await
render(<Componente />)`, não `render(<Componente />)` sem `await` — sem o `await`, `screen` fica
sem o componente montado e toda query (`screen.getByText`, etc.) falha com "`render` function has
not been called".

## Gerar o instalável (`.apk`)

```bash
cd android && ./gradlew assembleRelease
```

Gera o `.apk` em `android/app/build/outputs/apk/release/`. Não há assinatura de código configurada
por enquanto — mesmo ponto já documentado para os binários do admin: o Android vai reclamar de
"fonte desconhecida" ao instalar esse `.apk` fora da Play Store, e isso é esperado; oriente quem for
instalar a permitir a instalação mesmo assim, em vez de tentar contornar o aviso.

## Mapa: verificação manual pendente

`src/presentation/map/TerritoryMapView.tsx` (o mapa com MapLibre Native, territórios/quadras
desenhados e a localização do publicador) e `src/presentation/screens/MapScreen.tsx` (a tela que o
compõe com o filtro e a confirmação de marcação) dependem de uma *view* nativa de terceiro — não são
razoavelmente testáveis com Jest (mesmo "risco assumido" já registrado para o Leaflet-Geoman do
admin no `CLAUDE.md` da raiz), então não têm teste automatizado. **Passo manual pendente:** depois
que a tela estiver ligada à navegação real (spec 0005, Task 26), rodar `npm run android` num
emulador ou aparelho Android e confirmar visualmente:

- os tiles do OpenStreetMap carregam e a atribuição "© OpenStreetMap contributors" aparece na tela;
- os territórios aparecem como contornos e as quadras coloridas (vermelho/laranja/verde, conforme
  `blockColorCategory`);
- o app pede a permissão de localização em runtime e o marcador acompanha a posição real do
  aparelho;
- tocar numa quadra dentro de um território designado abre a confirmação de marcação; tocar numa
  quadra fora de um território designado não marca nada.

O `User-Agent` das requisições de tile é identificado via
`TransformRequestManager.addHeader({ name: 'User-Agent', ... })`, o mecanismo que
`@maplibre/maplibre-react-native@11.3.6` oferece para isso (não há uma prop dedicada em
`RasterSource`) — ver o comentário em `TerritoryMapView.tsx`. Se uma atualização futura da lib
remover essa API, isso é uma regressão real a documentar aqui, não a contornar com patch nativo.

## Limitações conhecidas

- O template do React Native 0.87 já traz `react-native-safe-area-context` como dependência
  própria (usada pela tela inicial gerada automaticamente); as demais dependências de app
  (`@maplibre/maplibre-react-native`, `react-native-geolocation-service`, `react-native-keychain`,
  `@react-native-async-storage/async-storage`, `@react-navigation/native` +
  `@react-navigation/native-stack`, `react-native-screens`, `react-native-config`, `uuid`) foram
  adicionadas nesta task (spec 0005, Task 16) para as tasks seguintes usarem — nenhuma delas ainda
  tem código de integração real (tela, chamada de API ou lógica de domínio).
- A biblioteca `@react-native-async-storage/async-storage` emite um aviso do Gradle
  (`ksp-2.2.0-2.0.2 is too old for kotlin-2.2.10`) ao configurar o projeto Android nesta versão do
  React Native. É um aviso de compatibilidade da própria biblioteca, não um erro — o projeto builda
  normalmente (`./gradlew projects` roda com sucesso); se isso passar a quebrar o build depois de
  uma atualização de dependências, é o primeiro lugar a olhar.
