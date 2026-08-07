# Territory Map — Admin

Aplicativo de desktop do **responsável pelos territórios** da congregação. É por aqui que se
desenha a demarcação de um território, se marca e numera as quadras, se cadastram os publicadores e
se acompanha o que já foi trabalhado. Visão geral, modelo de dados e regras estão no
[`CLAUDE.md`](../CLAUDE.md) na raiz do repositório.

- Flutter desktop, entregue para **Windows e Linux**
- Riverpod para estado, `flutter_map` sobre OpenStreetMap, `flutter_secure_storage` para as
  credenciais
- Modelos, cliente da API e conversão de coordenadas vêm de [`packages/core`](../packages/core),
  compartilhado com o app Android

**Uma congregação por instalação, e sem tela de login no dia a dia.** Na primeira abertura o app
pede nome, cidade e senha **uma única vez**, guarda os três no keystore do sistema operacional
(DPAPI no Windows, libsecret no Linux) e autentica sozinho dali em diante. O JWT dura 12 horas; ao
receber um 401 o app refaz o login em silêncio e repete a requisição. Quem usa nunca mais vê a tela
de configuração — ela só reaparece se a credencial guardada for recusada pelo servidor, o que na
prática significa que a senha da congregação mudou.

---

## Desenvolvimento local

### 1. Dependências

```bash
cd admin
flutter pub get
```

### 2. Rodar

```bash
flutter run -d chrome
```

O alvo entregue é **Windows e Linux**, mas o desenvolvimento aqui roda no **Chrome**: a máquina de
desenvolvimento tem apenas as Command Line Tools, não o Xcode completo, então `-d macos` não
funcionaria. O Chrome dá verificação visual de verdade e os binários das plataformas alvo saem do
CI por tag. Em uma máquina com o SO alvo, troque por `-d windows` ou `-d linux`.

Sem nenhum `--dart-define`, o app aponta para a API de produção
(`https://territorymap.dalistor.com.br`) e sobe com o `X-App-Key` **vazio** — os dois valores vêm
de [`lib/config.dart`](lib/config.dart), que os lê com `String.fromEnvironment`.

### 3. Apontar para um servidor local

```bash
flutter run -d chrome --web-port=5000 \
  --dart-define=API_BASE_URL=http://localhost:8000 \
  --dart-define=APP_KEY=o-mesmo-valor-do-APP_SECRET
```

Duas observações:

- **`APP_KEY` só é necessário se o servidor tiver `APP_SECRET` preenchido.** `APP_SECRET` vazio
  desliga o gate do `X-App-Key`, que é o padrão do `server/.env.example` — nesse caso basta o
  `API_BASE_URL`. Se o servidor tiver a chave configurada e o app não, **todo** request toma 401.
- **Rodando no Chrome, o servidor precisa liberar CORS.** Defina `CORS_ORIGINS` no `server/.env`
  com a origem exata em que o Flutter web está servindo — daí o `--web-port` fixo acima, que evita
  a porta aleatória:

  ```
  CORS_ORIGINS=http://localhost:5000
  ```

  Rodando em `-d windows` ou `-d linux` isso não se aplica: não há navegador no caminho.

### 4. Comandos do dia a dia

Todos a partir de `admin/`.

| O quê | Comando |
|-------|---------|
| Instalar dependências | `flutter pub get` |
| Rodar em desenvolvimento | `flutter run -d chrome` |
| Rodar todos os testes | `flutter test` |
| Rodar um arquivo | `flutter test test/session_test.dart` |
| Cobertura | `flutter test --coverage` |
| Analisar | `flutter analyze` |
| Formatar | `dart format lib test` |
| Conferir formatação (o que a CI roda) | `dart format --output=none --set-exit-if-changed lib test` |

---

## Testes e CI

`flutter test` roda na Dart VM — não precisa de toolchain de desktop nem de emulador.

O workflow [`.github/workflows/core.yml`](../.github/workflows/core.yml) (job **`admin`**) roda a
cada push na `main` e a cada pull request que toque `admin/**`, `packages/core/**` ou o próprio
workflow. Ele executa, nesta ordem:

1. `flutter pub get`
2. `dart format --output=none --set-exit-if-changed lib test` — a CI é exigente com formatação;
   rode `dart format lib test` antes de commitar
3. `flutter analyze`
4. `flutter test`

Não há build de binário aí: produzir binário é assunto da release, e é isso que permite este job
rodar num runner Linux comum.

---

## Release

### Os dois valores que precisam estar cadastrados no GitHub

As duas constantes de [`lib/config.dart`](lib/config.dart) são `String.fromEnvironment`, ou seja,
são **compiladas para dentro do binário** — não dá para editá-las na máquina onde o app foi
instalado. O workflow de release as injeta por `--dart-define`, e para isso precisa de:

| Tipo | Nome | O que é | Valor |
|------|------|---------|-------|
| **Secret** | `APP_KEY` | o mesmo valor do `APP_SECRET` do servidor, enviado no header `X-App-Key` | o que estiver no `.env` de produção |
| **Variable** | `API_BASE_URL` | endereço público da API | `https://territorymap.dalistor.com.br` |

Cadastre no **nível do repositório** — o job de build não declara `environment:`, então valores
guardados dentro de um Environment não chegariam nele:

```bash
gh secret set APP_KEY -R Dalistor/Territory-Map
gh variable set API_BASE_URL -R Dalistor/Territory-Map \
  --body "https://territorymap.dalistor.com.br"
```

`gh secret set` pede o valor no terminal, sem ecoar — não passe a chave como argumento, que ficaria
no histórico do shell. Pela interface web o caminho é
*Settings → Secrets and variables → Actions*, abas **Secrets** e **Variables**.

**Sem os dois, o job de release falha de propósito**, antes de compilar, com a mensagem dizendo o
que cadastrar. É deliberado: publicar um binário que parece bom e toma 401 em todo request — ou que
fala com o servidor errado — é pior do que não publicar nada.

### Sair uma release

```bash
git tag v0.1.0
git push origin v0.1.0
```

A tag dispara [`.github/workflows/admin-release.yml`](../.github/workflows/admin-release.yml), que:

1. constrói em dois runners — Flutter não faz cross-compile, então Windows sai no `windows-latest`
   e Linux no `ubuntu-latest`;
2. roda `flutter analyze` e `flutter test` antes de compilar, e confere se `APP_KEY` e
   `API_BASE_URL` estão preenchidos;
3. compila com `flutter build <alvo> --release` e os dois `--dart-define`;
4. empacota cada build (`.zip` para Windows, `.tar.gz` para Linux) e cria a **GitHub Release** da
   tag com os dois arquivos anexados.

Os artefatos ficam com o nome `territory-map-admin-<tag>-windows.zip` e
`territory-map-admin-<tag>-linux.tar.gz`.

Um `workflow_dispatch` (Actions → `admin-release` → Run workflow) também constrói, mas **não** cria
Release: sem tag não há o que anexar. Os binários ficam como artefato de Actions, úteis para
conferir um build sem queimar um número de versão.

**macOS ficou de fora.** Não há Mac neste setup capaz de construir (só as Command Line Tools estão
instaladas), e o admin roda em Windows na prática. Voltar depois é uma entrada na matriz mais um
runner `macos-latest`.

### Instalar

- **Windows**: baixe o `.zip` da Release, extraia a **pasta inteira** e execute
  `territory_admin.exe` de dentro dela. O `.exe` sozinho não roda — ele depende das DLLs e da pasta
  `data/` que vêm ao lado.
- **Linux**: baixe o `.tar.gz`, extraia e execute `./territory_admin` de dentro da pasta. Se o
  arquivo não estiver executável, `chmod +x territory_admin`.

---

## O Windows vai avisar que o programa não é confiável

Na primeira execução o Windows exibe uma tela azul dizendo **"O Windows protegeu o seu
computador"** e oferece só um botão de "Não executar". O caminho é:

> **Mais informações** → **Executar assim mesmo**

Isso é esperado, e só acontece na primeira vez.

O motivo é que os binários **não são assinados**: um certificado de assinatura de código é pago e
emitido para uma entidade, e este é um projeto de uso pessoal. Sem assinatura, o SmartScreen não
tem como dizer quem publicou o programa e reage à falta de reputação, não a algo detectado no
arquivo — não é aviso de vírus. No Linux não existe alerta equivalente.

Contornar isso exigiria comprar o certificado; a decisão foi documentar o passo para quem instala,
que é uma pessoa só por congregação e recebe o link junto com a instrução.

---

## Estrutura

```
admin/lib/
├── main.dart          # roteamento: configuração inicial ou tela principal
├── config.dart        # API_BASE_URL e APP_KEY, injetados no build
├── data/              # credenciais, sessão com login silencioso, repositórios da API
└── presentation/      # telas, mapa editável e providers Riverpod
```

A regra de camadas está no [`CLAUDE.md`](../CLAUDE.md): nenhuma tela fala HTTP direto — ela chama um
repositório de `data/`, e só a `Session` sabe que existe token. A reautenticação no 401 vive ali,
justamente para que nenhuma tela precise saber que o token expira.
